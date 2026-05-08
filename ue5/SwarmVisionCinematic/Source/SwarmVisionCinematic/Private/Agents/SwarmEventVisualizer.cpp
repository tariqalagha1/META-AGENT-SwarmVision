#include "Agents/SwarmEventVisualizer.h"

#include "Subsystems/SwarmEventRouterSubsystem.h"
#include "Engine/GameInstance.h"
#include "TimerManager.h"

DEFINE_LOG_CATEGORY_STATIC(LogSwarmViz, Log, All);

// ─── Color tables ─────────────────────────────────────────────────────────────

FLinearColor ASwarmEventVisualizer::EventTypeColor(ESwarmEventType EventType)
{
    switch (EventType)
    {
    // Swarm lifecycle — system-level white/silver
    case ESwarmEventType::SwarmStarted:     return FLinearColor(0.8f, 0.9f, 1.0f);
    case ESwarmEventType::SwarmCompleted:   return FLinearColor(0.0f, 1.0f, 0.4f);
    case ESwarmEventType::SwarmFailed:      return FLinearColor(1.0f, 0.1f, 0.0f);
    case ESwarmEventType::SwarmResult:      return FLinearColor(0.6f, 0.8f, 0.6f);

    // Planner — soft purple
    case ESwarmEventType::PlannerDecision:  return FLinearColor(0.6f, 0.3f, 1.0f);

    // Fetch agent — electric blue
    case ESwarmEventType::AgentStepStarted:
    case ESwarmEventType::AgentStepCompleted:
        return FLinearColor(0.1f, 0.4f, 1.0f);

    // Failure — red
    case ESwarmEventType::AgentStepFailed:
    case ESwarmEventType::TaskFail:
        return FLinearColor(1.0f, 0.0f, 0.0f);

    // Retry — amber
    case ESwarmEventType::AgentStepRetry:
    case ESwarmEventType::Retry:
        return FLinearColor(1.0f, 0.55f, 0.0f);

    // Success — green
    case ESwarmEventType::TaskSuccess:      return FLinearColor(0.0f, 0.9f, 0.3f);

    // Handoff — cyan
    case ESwarmEventType::TaskHandoff:      return FLinearColor(0.0f, 0.8f, 0.8f);

    // Anomaly — hot red flash
    case ESwarmEventType::Anomaly:          return FLinearColor(1.0f, 0.0f, 0.2f);

    // Meta-insight — pale blue-white
    case ESwarmEventType::MetaInsight:      return FLinearColor(0.5f, 0.8f, 1.0f);

    // Metrics — dim grey
    case ESwarmEventType::MetricsSnapshot:
    case ESwarmEventType::AgentStateSnapshot:
        return FLinearColor(0.3f, 0.3f, 0.3f);

    default:
        return FLinearColor(0.2f, 0.2f, 0.2f);
    }
}

FLinearColor ASwarmEventVisualizer::AgentStateColor(EAgentVisualState State)
{
    switch (State)
    {
    case EAgentVisualState::Idle:           return FLinearColor(0.05f, 0.05f, 0.08f);
    case EAgentVisualState::Active:         return FLinearColor(0.1f,  0.4f,  1.0f);
    case EAgentVisualState::Working:        return FLinearColor(0.1f,  0.4f,  1.0f);
    case EAgentVisualState::HandoffSource:  return FLinearColor(0.0f,  0.8f,  0.8f);
    case EAgentVisualState::HandoffTarget:  return FLinearColor(0.0f,  0.8f,  0.8f);
    case EAgentVisualState::Failed:         return FLinearColor(1.0f,  0.0f,  0.0f);
    case EAgentVisualState::Retry:          return FLinearColor(1.0f,  0.55f, 0.0f);
    case EAgentVisualState::Complete:       return FLinearColor(0.0f,  0.9f,  0.3f);
    case EAgentVisualState::Observing:      return FLinearColor(0.4f,  0.4f,  0.6f);
    default:                                return FLinearColor(0.1f,  0.1f,  0.1f);
    }
}

// ─── ASwarmEventVisualizer ────────────────────────────────────────────────────

ASwarmEventVisualizer::ASwarmEventVisualizer()
{
    PrimaryActorTick.bCanEverTick = false;

    // Root
    USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);

    // Point light — colour driven by events
    EventLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("EventLight"));
    EventLight->SetupAttachment(Root);
    EventLight->SetIntensity(2000.f);
    EventLight->SetAttenuationRadius(600.f);
    EventLight->SetLightColor(FLinearColor(0.05f, 0.05f, 0.1f));
    EventLight->SetCastShadows(false);  // no shadow cost on this debug light

    // Text label above the light
    EventLabel = CreateDefaultSubobject<UTextRenderComponent>(TEXT("EventLabel"));
    EventLabel->SetupAttachment(Root);
    EventLabel->SetRelativeLocation(FVector(0.f, 0.f, 80.f));
    EventLabel->SetRelativeRotation(FRotator(0.f, 0.f, 0.f));
    EventLabel->SetText(FText::FromString(TEXT("IDLE")));
    EventLabel->SetTextRenderColor(FColor::White);
    EventLabel->SetWorldSize(24.f);
    EventLabel->SetHorizTextAlignment(EHorizTextAligment::EHTA_Center);
}

void ASwarmEventVisualizer::BeginPlay()
{
    Super::BeginPlay();

    UGameInstance* GI = GetGameInstance();
    if (!GI) return;

    USwarmEventRouterSubsystem* Router =
        GI->GetSubsystem<USwarmEventRouterSubsystem>();
    if (!Router) return;

    Router->OnSwarmEventReceived.AddDynamic(
        this, &ASwarmEventVisualizer::OnSwarmEventReceived);
    Router->OnAgentStateChanged.AddDynamic(
        this, &ASwarmEventVisualizer::OnAgentStateChanged);

    UE_LOG(LogSwarmViz, Log,
           TEXT("SwarmEventVisualizer ready — watching agent: %s"),
           WatchAgentId.IsEmpty() ? TEXT("(global)") : *WatchAgentId);
}

void ASwarmEventVisualizer::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    GetWorldTimerManager().ClearTimer(ColorResetTimer);

    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router =
                GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.RemoveDynamic(
                this, &ASwarmEventVisualizer::OnSwarmEventReceived);
            Router->OnAgentStateChanged.RemoveDynamic(
                this, &ASwarmEventVisualizer::OnAgentStateChanged);
        }
    }

    Super::EndPlay(EndPlayReason);
}

// ─── Event handlers ───────────────────────────────────────────────────────────

void ASwarmEventVisualizer::OnSwarmEventReceived(const FSwarmEvent& Event)
{
    bool bRespond = bGlobalMode
        || WatchAgentId.IsEmpty()
        || Event.AgentId == WatchAgentId
        || Event.EventType == ESwarmEventType::SwarmStarted
        || Event.EventType == ESwarmEventType::SwarmCompleted
        || Event.EventType == ESwarmEventType::SwarmFailed
        || Event.EventType == ESwarmEventType::Anomaly;

    if (!bRespond) return;

    ApplyEventColor(Event.EventType);

    // Update label text
    FString LabelText = UEnum::GetValueAsString(Event.EventType);
    // Strip namespace prefix ("ESwarmEventType::")
    int32 ColonIdx;
    if (LabelText.FindLastChar(TEXT(':'), ColonIdx))
        LabelText = LabelText.RightChop(ColonIdx + 1);

    if (!Event.AgentId.IsEmpty())
        LabelText = Event.AgentId + TEXT("\n") + LabelText;

    EventLabel->SetText(FText::FromString(LabelText));

    // Schedule color reset
    GetWorldTimerManager().ClearTimer(ColorResetTimer);
    GetWorldTimerManager().SetTimer(
        ColorResetTimer,
        this,
        &ASwarmEventVisualizer::ResetToIdleColor,
        ColorHoldSeconds,
        false
    );
}

void ASwarmEventVisualizer::OnAgentStateChanged(
    const FString& AgentId, EAgentVisualState NewState)
{
    if (!bGlobalMode && !WatchAgentId.IsEmpty() && AgentId != WatchAgentId)
        return;

    ApplyStateColor(NewState);
}

// ─── Color application ────────────────────────────────────────────────────────

void ASwarmEventVisualizer::ApplyEventColor(ESwarmEventType EventType)
{
    FLinearColor Color = EventTypeColor(EventType);
    EventLight->SetLightColor(Color);

    // Boost intensity for high-priority events
    float Intensity = 2000.f;
    if (EventType == ESwarmEventType::Anomaly || EventType == ESwarmEventType::SwarmFailed)
        Intensity = 5000.f;
    else if (EventType == ESwarmEventType::TaskSuccess || EventType == ESwarmEventType::SwarmCompleted)
        Intensity = 4000.f;

    EventLight->SetIntensity(Intensity);
    EventLabel->SetTextRenderColor(Color.ToFColor(true));
}

void ASwarmEventVisualizer::ApplyStateColor(EAgentVisualState State)
{
    FLinearColor Color = AgentStateColor(State);
    EventLight->SetLightColor(Color);
    EventLabel->SetTextRenderColor(Color.ToFColor(true));
}

void ASwarmEventVisualizer::ResetToIdleColor()
{
    EventLight->SetLightColor(FLinearColor(0.02f, 0.02f, 0.04f));
    EventLight->SetIntensity(500.f);
    EventLabel->SetTextRenderColor(FColor(80, 80, 100));
}
