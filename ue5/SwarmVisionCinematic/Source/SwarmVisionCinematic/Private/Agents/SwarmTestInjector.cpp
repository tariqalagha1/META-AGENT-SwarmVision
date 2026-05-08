#include "Agents/SwarmTestInjector.h"

#include "Subsystems/SwarmEventRouterSubsystem.h"
#include "Engine/Engine.h"
#include "TimerManager.h"
#include "Misc/Guid.h"

DEFINE_LOG_CATEGORY_STATIC(LogSwarmTest, Log, All);

// ─── Screen colour per event priority ────────────────────────────────────────

static FColor PriorityColor(EEventPriority P)
{
    switch (P)
    {
    case EEventPriority::Critical: return FColor::Red;
    case EEventPriority::High:     return FColor::Yellow;
    case EEventPriority::Normal:   return FColor::Cyan;
    case EEventPriority::Low:      return FColor::Silver;
    default:                       return FColor::White;
    }
}

// ─── ASwarmTestInjector ───────────────────────────────────────────────────────

ASwarmTestInjector::ASwarmTestInjector()
{
    PrimaryActorTick.bCanEverTick = false;
}

void ASwarmTestInjector::BeginPlay()
{
    Super::BeginPlay();

    UGameInstance* GI = GetGameInstance();
    if (!GI) return;

    USwarmEventRouterSubsystem* Router =
        GI->GetSubsystem<USwarmEventRouterSubsystem>();
    if (!Router) return;

    Router->OnSwarmEventReceived.AddDynamic(
        this, &ASwarmTestInjector::OnSwarmEventReceived);
    Router->OnAgentStateChanged.AddDynamic(
        this, &ASwarmTestInjector::OnAgentStateChanged);

    UE_LOG(LogSwarmTest, Log, TEXT("ASwarmTestInjector ready — subscribed to router"));
}

void ASwarmTestInjector::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    GetWorldTimerManager().ClearTimer(DemoTimerHandle);

    UGameInstance* GI = GetGameInstance();
    if (GI)
    {
        if (USwarmEventRouterSubsystem* Router =
                GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.RemoveDynamic(
                this, &ASwarmTestInjector::OnSwarmEventReceived);
            Router->OnAgentStateChanged.RemoveDynamic(
                this, &ASwarmTestInjector::OnAgentStateChanged);
        }
    }

    Super::EndPlay(EndPlayReason);
}

// ─── Event receiver ───────────────────────────────────────────────────────────

void ASwarmTestInjector::OnSwarmEventReceived(const FSwarmEvent& Event)
{
    const FString TypeStr  = UEnum::GetValueAsString(Event.EventType);
    const FString AgentStr = Event.AgentId.IsEmpty() ? TEXT("—") : Event.AgentId;
    const FString TraceStr = Event.TraceId.IsEmpty() ? TEXT("—") : Event.TraceId.Left(8);

    UE_LOG(LogSwarmTest, Log,
           TEXT("EVENT ▶ %s | agent=%s | trace=%s"),
           *TypeStr, *AgentStr, *TraceStr);

    if (bPrintEventsToScreen && GEngine)
    {
        const FString Msg = FString::Printf(
            TEXT("▶ %s%s  agent:%s"),
            Event.bIsReplay ? TEXT("[REPLAY] ") : TEXT(""),
            *TypeStr,
            *AgentStr
        );
        GEngine->AddOnScreenDebugMessage(
            DemoScreenKey++,
            ScreenMessageDuration,
            PriorityColor(Event.Priority),
            Msg
        );
    }
}

void ASwarmTestInjector::OnAgentStateChanged(
    const FString& AgentId, EAgentVisualState NewState)
{
    const FString StateStr = UEnum::GetValueAsString(NewState);
    UE_LOG(LogSwarmTest, Log, TEXT("STATE ▶ %s → %s"), *AgentId, *StateStr);

    if (bPrintEventsToScreen && GEngine)
    {
        GEngine->AddOnScreenDebugMessage(
            DemoScreenKey++,
            ScreenMessageDuration,
            FColor::Green,
            FString::Printf(TEXT("STATE: %s → %s"), *AgentId, *StateStr)
        );
    }
}

// ─── JSON builder ─────────────────────────────────────────────────────────────

FString ASwarmTestInjector::BuildTestMessage(
    const FString& EventType,
    const FString& AgentId,
    const FString& TraceId,
    const TMap<FString, FString>& ExtraData)
{
    // Build the "data" object
    FString DataFields;
    for (const auto& Pair : ExtraData)
    {
        if (!DataFields.IsEmpty()) DataFields += TEXT(",");
        DataFields += FString::Printf(TEXT("\"%s\":\"%s\""), *Pair.Key, *Pair.Value);
    }

    // Derive channel from event type
    FString Channel = TEXT("events");
    if (EventType == TEXT("METRICS_SNAPSHOT") || EventType == TEXT("AGENT_STATE_SNAPSHOT"))
        Channel = TEXT("metrics");
    else if (EventType == TEXT("ANOMALY"))
        Channel = TEXT("alerts");

    return FString::Printf(
        TEXT("{\"ue5_type\":\"%s\",\"timestamp\":\"%s\",\"channel\":\"%s\","
             "\"trace_id\":\"%s\",\"agent_id\":\"%s\","
             "\"parent_event_id\":\"\",\"data\":{%s}}"),
        *EventType,
        *FDateTime::UtcNow().ToIso8601(),
        *Channel,
        *TraceId,
        *AgentId,
        *DataFields
    );
}

// ─── Blueprint inject helpers ─────────────────────────────────────────────────

void ASwarmTestInjector::InjectEvent(
    const FString& EventType, const FString& AgentId)
{
    UGameInstance* GI = GetGameInstance();
    if (!GI) return;
    USwarmEventRouterSubsystem* Router =
        GI->GetSubsystem<USwarmEventRouterSubsystem>();
    if (!Router) return;

    FString TraceId = DemoTraceId.IsEmpty()
        ? FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphens)
        : DemoTraceId;

    FString Json = BuildTestMessage(EventType, AgentId, TraceId);
    Router->InjectRawJson(Json, false);
}

void ASwarmTestInjector::InjectRawJson(const FString& Json)
{
    UGameInstance* GI = GetGameInstance();
    if (!GI) return;
    if (USwarmEventRouterSubsystem* Router =
            GI->GetSubsystem<USwarmEventRouterSubsystem>())
        Router->InjectRawJson(Json, false);
}

void ASwarmTestInjector::PrintAgentStates()
{
    UGameInstance* GI = GetGameInstance();
    if (!GI) return;
    USwarmEventRouterSubsystem* Router =
        GI->GetSubsystem<USwarmEventRouterSubsystem>();
    if (!Router) return;

    TArray<FAgentStateRecord> States = Router->GetAllAgentStates();
    UE_LOG(LogSwarmTest, Log, TEXT("=== Agent States (%d) ==="), States.Num());
    for (const FAgentStateRecord& Record : States)
    {
        UE_LOG(LogSwarmTest, Log,
               TEXT("  %s  state=%s  step=%s  trace=%s  retries=%d  score=%.1f"),
               *Record.AgentId,
               *UEnum::GetValueAsString(Record.VisualState),
               *Record.CurrentStepName,
               *Record.CurrentTraceId.Left(8),
               Record.RetryCount,
               Record.LastQualityScore);
    }

    if (States.Num() == 0)
        UE_LOG(LogSwarmTest, Log, TEXT("  (no agents tracked yet)"));
}

// ─── Demo sequence ────────────────────────────────────────────────────────────
//
// Fires a compressed version of the 60-second demo from the pre-production doc.
// Each entry is: EventType|AgentId|ExtraDataKey=Value,...

void ASwarmTestInjector::RunDemoSequence()
{
    GetWorldTimerManager().ClearTimer(DemoTimerHandle);
    DemoTraceId = FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphens);

    // Format: "EVENT_TYPE|agent_id|key=value,key=value"
    // Empty agent_id field = swarm-level event
    DemoEventQueue = {
        TEXT("SWARM_STARTED||task=Test Demo Task,step_count=3"),
        TEXT("PLANNER_DECISION||decision=use_default_steps"),
        TEXT("AGENT_STEP_STARTED|fetch_agent|step_name=fetch"),
        TEXT("AGENT_STEP_COMPLETED|fetch_agent|step_name=fetch,raw_items_count=12"),
        TEXT("TASK_HANDOFF||from_agent=fetch_agent,to_agent=normalize_agent"),
        TEXT("AGENT_STEP_STARTED|normalize_agent|step_name=normalize"),
        TEXT("AGENT_STEP_COMPLETED|normalize_agent|step_name=normalize"),
        TEXT("TASK_HANDOFF||from_agent=normalize_agent,to_agent=quality_agent"),
        TEXT("AGENT_STEP_STARTED|quality_agent|step_name=quality"),
        // Simulate a quality FAIL → retry
        TEXT("AGENT_STEP_COMPLETED|quality_agent|step_name=quality,quality_score=45.0"),
        TEXT("PLANNER_DECISION||decision=insert_retry_path,reason=quality_below_threshold,quality_score=45.0,threshold=60.0"),
        TEXT("AGENT_STEP_RETRY|quality_agent|attempt=1,step_name=quality"),
        TEXT("RETRY|quality_agent|attempt=1"),
        // Re-run fetch and normalize
        TEXT("AGENT_STEP_STARTED|fetch_agent|step_name=fetch-retry"),
        TEXT("AGENT_STEP_COMPLETED|fetch_agent|step_name=fetch-retry"),
        TEXT("AGENT_STEP_STARTED|normalize_agent|step_name=normalize-retry"),
        TEXT("AGENT_STEP_COMPLETED|normalize_agent|step_name=normalize-retry"),
        TEXT("AGENT_STEP_STARTED|quality_agent|step_name=quality-retry"),
        // This time quality passes
        TEXT("AGENT_STEP_COMPLETED|quality_agent|step_name=quality-retry,quality_score=87.0"),
        TEXT("TASK_SUCCESS|quality_agent|quality_score=87.0"),
        TEXT("SWARM_COMPLETED||step_count=6,status=completed"),
        TEXT("SWARM_RESULT||status=completed,quality_score=87.0,degraded=true"),
        TEXT("METRICS_SNAPSHOT||"),
    };

    UE_LOG(LogSwarmTest, Log,
           TEXT("Demo sequence started — %d events, interval=%.1fs, trace=%s"),
           DemoEventQueue.Num(), DemoEventIntervalSeconds, *DemoTraceId.Left(8));

    GetWorldTimerManager().SetTimer(
        DemoTimerHandle,
        this,
        &ASwarmTestInjector::FireNextDemoEvent,
        DemoEventIntervalSeconds,
        true,
        0.1f  // first event fires after 100ms
    );
}

void ASwarmTestInjector::FireNextDemoEvent()
{
    if (DemoEventQueue.Num() == 0)
    {
        GetWorldTimerManager().ClearTimer(DemoTimerHandle);
        UE_LOG(LogSwarmTest, Log, TEXT("Demo sequence complete"));
        PrintAgentStates();
        return;
    }

    FString Entry = DemoEventQueue[0];
    DemoEventQueue.RemoveAt(0, 1, false);

    // Parse "EVENT_TYPE|agent_id|key=val,key=val"
    TArray<FString> Parts;
    Entry.ParseIntoArray(Parts, TEXT("|"), false);

    FString EventType = Parts.IsValidIndex(0) ? Parts[0] : TEXT("UNKNOWN");
    FString AgentId   = Parts.IsValidIndex(1) ? Parts[1] : TEXT("");
    FString DataPart  = Parts.IsValidIndex(2) ? Parts[2] : TEXT("");

    TMap<FString, FString> ExtraData;
    if (!DataPart.IsEmpty())
    {
        TArray<FString> Pairs;
        DataPart.ParseIntoArray(Pairs, TEXT(","), true);
        for (const FString& Pair : Pairs)
        {
            FString Key, Value;
            if (Pair.Split(TEXT("="), &Key, &Value))
                ExtraData.Add(Key, Value);
        }
    }

    UGameInstance* GI = GetGameInstance();
    if (!GI) return;
    USwarmEventRouterSubsystem* Router =
        GI->GetSubsystem<USwarmEventRouterSubsystem>();
    if (!Router) return;

    FString Json = BuildTestMessage(EventType, AgentId, DemoTraceId, ExtraData);
    Router->InjectRawJson(Json, false);
}
