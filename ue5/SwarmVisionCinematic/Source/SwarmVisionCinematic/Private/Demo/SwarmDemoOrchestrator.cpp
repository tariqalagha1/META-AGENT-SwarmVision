#include "Demo/SwarmDemoOrchestrator.h"
#include "Subsystems/SwarmEventRouterSubsystem.h"
#include "Misc/Guid.h"
#include "TimerManager.h"
#include "Engine/World.h"

DEFINE_LOG_CATEGORY_STATIC(LogDemoOrchestrator, Log, All);

ASwarmDemoOrchestrator::ASwarmDemoOrchestrator()
{
    PrimaryActorTick.bCanEverTick = false;
    BuildDefaultBeats();
}

// ─── 12-Beat Sequence ─────────────────────────────────────────────────────────

void ASwarmDemoOrchestrator::BuildDefaultBeats()
{
    DefaultBeats.Empty();

    // ── Beat 1: Operations Floor Idle ─────────────────────────────────────────
    {
        FDemoBeat B;
        B.BeatName = TEXT("Operations Floor — Idle");
        B.Events.Add(TEXT("AGENT_SPAWN|fetch_agent|zone=Intake"));
        B.Events.Add(TEXT("AGENT_SPAWN|normalize_agent|zone=Transform"));
        B.Events.Add(TEXT("AGENT_SPAWN|quality_agent|zone=Validation"));
        B.Duration   = 6.0f;
        B.PauseAfter = 1.0f;
        DefaultBeats.Add(B);
    }

    // ── Beat 2: SWARM_STARTED ────────────────────────────────────────────────
    {
        FDemoBeat B;
        B.BeatName = TEXT("Swarm Initiated");
        B.Events.Add(TEXT("SWARM_STARTED||task=Cinematic Demo,priority=high"));
        B.Events.Add(TEXT("PLANNER_DECISION||decision=use_default_steps,confidence=0.94"));
        B.Duration   = 7.0f;
        B.PauseAfter = 0.5f;
        DefaultBeats.Add(B);
    }

    // ── Beat 3: fetch_agent Activates ─────────────────────────────────────────
    {
        FDemoBeat B;
        B.BeatName = TEXT("fetch_agent — Activating");
        B.Events.Add(TEXT("AGENT_STEP_STARTED|fetch_agent|step_name=fetch,zone=Intake"));
        B.Duration   = 5.0f;
        B.PauseAfter = 0.0f;
        DefaultBeats.Add(B);
    }

    // ── Beat 4: Task Flow Transfer ────────────────────────────────────────────
    {
        FDemoBeat B;
        B.BeatName = TEXT("Task Flow — Handoff");
        B.Events.Add(TEXT("AGENT_STEP_COMPLETED|fetch_agent|step_name=fetch,raw_items_count=18"));
        B.Events.Add(TEXT("TASK_HANDOFF||from_agent=fetch_agent,to_agent=normalize_agent"));
        B.Duration   = 8.0f;
        B.PauseAfter = 0.5f;
        DefaultBeats.Add(B);
    }

    // ── Beat 5: normalize_agent Processing ───────────────────────────────────
    {
        FDemoBeat B;
        B.BeatName = TEXT("normalize_agent — Processing");
        B.Events.Add(TEXT("AGENT_STEP_STARTED|normalize_agent|step_name=normalize"));
        B.Duration   = 5.0f;
        B.PauseAfter = 0.0f;
        DefaultBeats.Add(B);
    }

    // ── Beat 6: Quality Validation ────────────────────────────────────────────
    {
        FDemoBeat B;
        B.BeatName = TEXT("Quality Validation");
        B.Events.Add(TEXT("AGENT_STEP_COMPLETED|normalize_agent|step_name=normalize"));
        B.Events.Add(TEXT("TASK_HANDOFF||from_agent=normalize_agent,to_agent=quality_agent"));
        B.Events.Add(TEXT("AGENT_STEP_STARTED|quality_agent|step_name=quality"));
        B.Duration   = 6.0f;
        B.PauseAfter = 0.5f;
        DefaultBeats.Add(B);
    }

    // ── Beat 7: Failure Detected ──────────────────────────────────────────────
    {
        FDemoBeat B;
        B.BeatName = TEXT("Failure Detected");
        B.Events.Add(TEXT("AGENT_STEP_COMPLETED|quality_agent|step_name=quality,quality_score=41.0"));
        B.Events.Add(TEXT("ANOMALY||source=quality_agent,severity=medium,description=score_below_threshold"));
        B.Events.Add(TEXT("PLANNER_DECISION||decision=insert_retry_path,quality_score=41.0,threshold=60.0"));
        B.Duration   = 6.0f;
        B.PauseAfter = 1.0f;
        DefaultBeats.Add(B);
    }

    // ── Beat 8: Retry Loop ────────────────────────────────────────────────────
    {
        FDemoBeat B;
        B.BeatName = TEXT("Retry Loop");
        B.Events.Add(TEXT("AGENT_STEP_RETRY|quality_agent|attempt=1,step_name=quality"));
        B.Events.Add(TEXT("RETRY|quality_agent|attempt=1"));
        B.Events.Add(TEXT("AGENT_STEP_STARTED|fetch_agent|step_name=fetch-retry"));
        B.Events.Add(TEXT("AGENT_STEP_COMPLETED|fetch_agent|step_name=fetch-retry"));
        B.Events.Add(TEXT("AGENT_STEP_STARTED|normalize_agent|step_name=normalize-retry"));
        B.Events.Add(TEXT("AGENT_STEP_COMPLETED|normalize_agent|step_name=normalize-retry"));
        B.Events.Add(TEXT("AGENT_STEP_STARTED|quality_agent|step_name=quality-retry"));
        B.Duration   = 10.0f;
        B.PauseAfter = 0.5f;
        DefaultBeats.Add(B);
    }

    // ── Beat 9: Success ───────────────────────────────────────────────────────
    {
        FDemoBeat B;
        B.BeatName = TEXT("Success");
        B.Events.Add(TEXT("AGENT_STEP_COMPLETED|quality_agent|step_name=quality-retry,quality_score=89.0"));
        B.Events.Add(TEXT("TASK_SUCCESS|quality_agent|quality_score=89.0,retries=1"));
        B.Duration   = 6.0f;
        B.PauseAfter = 0.5f;
        DefaultBeats.Add(B);
    }

    // ── Beat 10: META_INSIGHT ────────────────────────────────────────────────
    {
        FDemoBeat B;
        B.BeatName = TEXT("Meta Insight");
        B.Events.Add(TEXT("META_INSIGHT||insight=retry_loop_reduced_by_15pct_vs_baseline,confidence=0.91"));
        B.Events.Add(TEXT("PIPELINE_UPDATE||stage=complete,efficiency=0.87,quality_score=89.0"));
        B.Duration   = 5.0f;
        B.PauseAfter = 0.5f;
        DefaultBeats.Add(B);
    }

    // ── Beat 11: SWARM_COMPLETED ─────────────────────────────────────────────
    {
        FDemoBeat B;
        B.BeatName = TEXT("Swarm Completed");
        B.Events.Add(TEXT("SWARM_COMPLETED||status=completed,quality_score=89.0,degraded=true"));
        B.Events.Add(TEXT("SWARM_RESULT||status=completed,quality_score=89.0,total_steps=9"));
        B.Events.Add(TEXT("METRICS_SNAPSHOT||total_events=42,avg_step_duration=3.2,retry_count=1"));
        B.Duration   = 10.0f;
        B.PauseAfter = 1.0f;
        DefaultBeats.Add(B);
    }

    // ── Beat 12: Idle Return ──────────────────────────────────────────────────
    {
        FDemoBeat B;
        B.BeatName = TEXT("Operations Floor — Return to Idle");
        B.Events.Add(TEXT("AGENT_STATE_SNAPSHOT||"));
        B.Duration   = 8.0f;
        B.PauseAfter = 0.0f;
        DefaultBeats.Add(B);
    }
}

// ─── StartCinematicDemo ───────────────────────────────────────────────────────

void ASwarmDemoOrchestrator::StartCinematicDemo()
{
    if (bRunning)
    {
        UE_LOG(LogDemoOrchestrator, Warning, TEXT("Demo already running — stop first"));
        return;
    }

    DemoTraceId      = FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphens);
    CurrentBeatIndex = 0;
    bRunning         = true;

    const TArray<FDemoBeat>& Beats = bUseCustomBeats ? CustomBeats : DefaultBeats;
    UE_LOG(LogDemoOrchestrator, Log,
           TEXT("=== CINEMATIC DEMO START === %d beats | trace=%s"),
           Beats.Num(), *DemoTraceId.Left(8));

    ExecuteBeat(0);
}

// ─── StopDemo ─────────────────────────────────────────────────────────────────

void ASwarmDemoOrchestrator::StopDemo()
{
    bRunning = false;
    GetWorldTimerManager().ClearTimer(BeatTimer);
    GetWorldTimerManager().ClearTimer(PauseTimer);
    UE_LOG(LogDemoOrchestrator, Log, TEXT("Demo stopped at beat %d"), CurrentBeatIndex);
    BP_OnDemoStopped();
}

// ─── ExecuteBeat ─────────────────────────────────────────────────────────────

void ASwarmDemoOrchestrator::ExecuteBeat(int32 BeatIndex)
{
    if (!bRunning) return;

    const TArray<FDemoBeat>& Beats = bUseCustomBeats ? CustomBeats : DefaultBeats;
    if (!Beats.IsValidIndex(BeatIndex))
    {
        // All beats done
        bRunning = false;
        UE_LOG(LogDemoOrchestrator, Log, TEXT("=== CINEMATIC DEMO COMPLETE ==="));
        OnDemoComplete.Broadcast();
        BP_OnDemoComplete();
        return;
    }

    CurrentBeatIndex = BeatIndex;
    const FDemoBeat& Beat = Beats[BeatIndex];

    UE_LOG(LogDemoOrchestrator, Log,
           TEXT("  [Beat %d/%d] %s (%.1fs)"),
           BeatIndex + 1, Beats.Num(), *Beat.BeatName, Beat.Duration);

    OnBeatStarted.Broadcast(Beat.BeatName);
    BP_OnBeatStarted(Beat.BeatName, BeatIndex, Beats.Num());

    FireBeatEvents(Beat);

    const float HoldSec = Beat.Duration * TimingMultiplier;
    GetWorldTimerManager().SetTimer(
        BeatTimer,
        [this, BeatIndex, PauseAfter = Beat.PauseAfter]()
        {
            if (!bRunning) return;
            if (PauseAfter > 0.f)
            {
                GetWorldTimerManager().SetTimer(
                    PauseTimer,
                    [this, BeatIndex]() { AdvanceToNextBeat(); },
                    PauseAfter * TimingMultiplier, false);
            }
            else
            {
                AdvanceToNextBeat();
            }
        },
        HoldSec, false);
}

void ASwarmDemoOrchestrator::AdvanceToNextBeat()
{
    ExecuteBeat(CurrentBeatIndex + 1);
}

// ─── FireBeatEvents ───────────────────────────────────────────────────────────

void ASwarmDemoOrchestrator::FireBeatEvents(const FDemoBeat& Beat)
{
    UGameInstance* GI = GetGameInstance();
    if (!GI) return;
    USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>();
    if (!Router) return;

    // Fire events with a tiny stagger so simultaneous events still get distinct sequence numbers
    float Stagger = 0.f;
    for (const FString& EventSpec : Beat.Events)
    {
        const FString Json = BuildEventJson(EventSpec, DemoTraceId);

        if (Stagger < 0.001f)
        {
            Router->InjectRawJson(Json, false);
        }
        else
        {
            FTimerHandle StaggerHandle;
            GetWorldTimerManager().SetTimer(
                StaggerHandle,
                [Router, Json]() { Router->InjectRawJson(Json, false); },
                Stagger, false);
        }
        Stagger += 0.08f;
    }
}

// ─── BuildEventJson ───────────────────────────────────────────────────────────
// Parses "EVENT_TYPE|agent_id|key=val,key=val" → Ue5Message JSON

FString ASwarmDemoOrchestrator::BuildEventJson(const FString& EventSpec,
                                                 const FString& TraceId)
{
    TArray<FString> Parts;
    EventSpec.ParseIntoArray(Parts, TEXT("|"), false);

    const FString EventType = Parts.IsValidIndex(0) ? Parts[0] : TEXT("UNKNOWN");
    const FString AgentId   = Parts.IsValidIndex(1) ? Parts[1] : TEXT("");
    const FString DataPart  = Parts.IsValidIndex(2) ? Parts[2] : TEXT("");

    FString DataFields;
    if (!DataPart.IsEmpty())
    {
        TArray<FString> Pairs;
        DataPart.ParseIntoArray(Pairs, TEXT(","), true);
        for (const FString& Pair : Pairs)
        {
            FString Key, Value;
            if (Pair.Split(TEXT("="), &Key, &Value))
            {
                if (!DataFields.IsEmpty()) DataFields += TEXT(",");
                DataFields += FString::Printf(TEXT("\"%s\":\"%s\""), *Key, *Value);
            }
        }
    }

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

// ─── GetCurrentBeatName ───────────────────────────────────────────────────────

FString ASwarmDemoOrchestrator::GetCurrentBeatName() const
{
    const TArray<FDemoBeat>& Beats = bUseCustomBeats ? CustomBeats : DefaultBeats;
    if (Beats.IsValidIndex(CurrentBeatIndex))
    {
        return Beats[CurrentBeatIndex].BeatName;
    }
    return TEXT("—");
}
