#include "Intelligence/SwarmIntelligenceSubsystem.h"
#include "Events/SwarmEventRouterSubsystem.h"
#include "Engine/GameInstance.h"
#include "TimerManager.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void USwarmIntelligenceSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
}

void USwarmIntelligenceSubsystem::Deinitialize()
{
    StopIntelligencePoll();
    Super::Deinitialize();
}

void USwarmIntelligenceSubsystem::StartIntelligencePoll(
    const FString& SwarmId, const FString& ServiceUrl)
{
    StopIntelligencePoll();

    ActiveSwarmId           = SwarmId;
    IntelligenceServiceUrl  = ServiceUrl;

    UWorld* World = GetGameInstance()->GetWorld();
    if (!World) return;

    World->GetTimerManager().SetTimer(
        PollTimer,
        this, &USwarmIntelligenceSubsystem::PollIntelligenceService,
        PollIntervalSeconds, true, 0.5f);
}

void USwarmIntelligenceSubsystem::StopIntelligencePoll()
{
    UWorld* World = GetGameInstance() ? GetGameInstance()->GetWorld() : nullptr;
    if (World) World->GetTimerManager().ClearTimer(PollTimer);
}

// ─── Poll ─────────────────────────────────────────────────────────────────────

void USwarmIntelligenceSubsystem::PollIntelligenceService()
{
    if (ActiveSwarmId.IsEmpty() || IntelligenceServiceUrl.IsEmpty()) return;

    // Build snapshot from USwarmEventRouterSubsystem's recent event buffer
    USwarmEventRouterSubsystem* Router =
        GetGameInstance()->GetSubsystem<USwarmEventRouterSubsystem>();
    if (!Router) return;

    const TArray<FSwarmEvent>& RecentEvents = Router->GetRecentEvents();

    // Build JSON payload
    TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
    Root->SetStringField(TEXT("swarm_id"),       ActiveSwarmId);
    Root->SetNumberField(TEXT("started_at_ms"),  Router->GetSwarmStartMs(ActiveSwarmId));
    Root->SetNumberField(TEXT("window_end_ms"),  FDateTime::UtcNow().GetTicks() / 10000 -
                                                  621355968000000LL / 10000);  // Unix ms

    TArray<TSharedPtr<FJsonValue>> EventsArray;
    for (const FSwarmEvent& E : RecentEvents)
    {
        if (E.SwarmId != ActiveSwarmId) continue;

        TSharedPtr<FJsonObject> EvtObj = MakeShared<FJsonObject>();
        EvtObj->SetStringField(TEXT("id"),         E.EventId);
        EvtObj->SetStringField(TEXT("event_type"), E.EventType);
        EvtObj->SetStringField(TEXT("agent_id"),   E.AgentId);
        EvtObj->SetStringField(TEXT("zone_id"),    E.Channel);
        EvtObj->SetNumberField(TEXT("offset_ms"),  static_cast<double>(E.TimestampMs));
        EvtObj->SetNumberField(TEXT("priority"),   static_cast<double>(static_cast<int32>(E.Priority)));

        TSharedPtr<FJsonObject> DataObj = MakeShared<FJsonObject>();
        EvtObj->SetObjectField(TEXT("data"), DataObj);

        EventsArray.Add(MakeShared<FJsonValueObject>(EvtObj));
    }
    Root->SetArrayField(TEXT("events"), EventsArray);

    FString BodyStr;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&BodyStr);
    FJsonSerializer::Serialize(Root.ToSharedRef(), Writer);

    // POST /analyze/narrative (lightweight — no full graph)
    const FString Url = IntelligenceServiceUrl + TEXT("/analyze/narrative");

    ActiveRequest = FHttpModule::Get().CreateRequest();
    ActiveRequest->SetURL(Url);
    ActiveRequest->SetVerb(TEXT("POST"));
    ActiveRequest->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    ActiveRequest->SetContentAsString(BodyStr);

    ActiveRequest->OnProcessRequestComplete().BindLambda(
        [this](FHttpRequestPtr /*Req*/, FHttpResponsePtr Response, bool bSuccess)
    {
        if (!bSuccess || !Response.IsValid()) return;
        if (Response->GetResponseCode() != 200)  return;
        ParseNarrativeResponse(Response->GetContentAsString());
    });

    ActiveRequest->ProcessRequest();
}

// ─── Parse ────────────────────────────────────────────────────────────────────

void USwarmIntelligenceSubsystem::ParseNarrativeResponse(const FString& JsonBody)
{
    TSharedPtr<FJsonObject> Root;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonBody);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    FNarrativeState NewNarrative;

    FString PhaseStr, PacingStr;
    Root->TryGetStringField(TEXT("phase"),       PhaseStr);
    Root->TryGetStringField(TEXT("pacing"),      PacingStr);
    Root->TryGetStringField(TEXT("focus_agent"), NewNarrative.FocusAgent);
    Root->TryGetStringField(TEXT("focus_zone"),  NewNarrative.FocusZone);
    Root->TryGetStringField(TEXT("story_beat"),  NewNarrative.StoryBeat);

    double Tension = 0.0;
    Root->TryGetNumberField(TEXT("tension"), Tension);
    NewNarrative.Tension = static_cast<float>(Tension);
    NewNarrative.Phase   = PhaseFromString(PhaseStr);
    NewNarrative.Pacing  = PacingFromString(PacingStr);

    // Parse recommended shots
    const TArray<TSharedPtr<FJsonValue>>* ShotsArray;
    if (Root->TryGetArrayField(TEXT("recommended_shots"), ShotsArray))
    {
        for (const auto& ShotVal : *ShotsArray)
        {
            const TSharedPtr<FJsonObject>* ShotObj;
            if (!ShotVal->TryGetObject(ShotObj)) continue;

            FRecommendedShot Shot;
            double Focal = 50.0, Aperture = 2.0, Duration = 5.0;
            int32  Priority = 0;

            (*ShotObj)->TryGetStringField(TEXT("shot_label"),    Shot.ShotLabel);
            (*ShotObj)->TryGetStringField(TEXT("target_actor"),  Shot.TargetActorId);
            (*ShotObj)->TryGetNumberField(TEXT("focal_mm"),      Focal);
            (*ShotObj)->TryGetNumberField(TEXT("aperture"),      Aperture);
            (*ShotObj)->TryGetNumberField(TEXT("duration_s"),    Duration);
            (*ShotObj)->TryGetNumberField(TEXT("priority"),      Priority);

            Shot.FocalMM   = static_cast<float>(Focal);
            Shot.Aperture  = static_cast<float>(Aperture);
            Shot.DurationS = static_cast<float>(Duration);
            Shot.Priority  = Priority;
            NewNarrative.RecommendedShots.Add(Shot);
        }
        NewNarrative.RecommendedShots.Sort(
            [](const FRecommendedShot& A, const FRecommendedShot& B) { return A.Priority < B.Priority; });
    }

    // Detect tension jump (new incident)
    if (NewNarrative.Tension - CurrentNarrative.Tension > 0.25f)
    {
        OnIncidentDetected.Broadcast(
            PhaseStr,
            NewNarrative.StoryBeat.IsEmpty() ? TEXT("Operational stress detected") : NewNarrative.StoryBeat);
    }

    CurrentNarrative = NewNarrative;
    OnNarrativeStateUpdated.Broadcast(CurrentNarrative);
}

// ─── Enum helpers ─────────────────────────────────────────────────────────────

ENarrativePhase USwarmIntelligenceSubsystem::PhaseFromString(const FString& S) const
{
    if (S == TEXT("activation"))     return ENarrativePhase::Activation;
    if (S == TEXT("ramp"))           return ENarrativePhase::Ramp;
    if (S == TEXT("peak_operation")) return ENarrativePhase::PeakOperation;
    if (S == TEXT("incident"))       return ENarrativePhase::Incident;
    if (S == TEXT("recovery"))       return ENarrativePhase::Recovery;
    if (S == TEXT("resolution"))     return ENarrativePhase::Resolution;
    if (S == TEXT("epilogue"))       return ENarrativePhase::Epilogue;
    return ENarrativePhase::Dormant;
}

ENarrativePacing USwarmIntelligenceSubsystem::PacingFromString(const FString& S) const
{
    if (S == TEXT("slow"))   return ENarrativePacing::Slow;
    if (S == TEXT("fast"))   return ENarrativePacing::Fast;
    if (S == TEXT("urgent")) return ENarrativePacing::Urgent;
    return ENarrativePacing::Medium;
}
