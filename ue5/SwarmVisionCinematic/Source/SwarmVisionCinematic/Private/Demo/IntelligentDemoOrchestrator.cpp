#include "Demo/IntelligentDemoOrchestrator.h"
#include "Events/SwarmEventRouterSubsystem.h"
#include "Intelligence/SwarmIntelligenceSubsystem.h"
#include "Platform/SwarmPixelStreamingBridge.h"
#include "Engine/World.h"
#include "Engine/GameInstance.h"
#include "TimerManager.h"

AIntelligentDemoOrchestrator::AIntelligentDemoOrchestrator()
{
    PrimaryActorTick.bCanEverTick = false;
}

void AIntelligentDemoOrchestrator::BeginPlay()
{
    Super::BeginPlay();
}

// ─── Start ────────────────────────────────────────────────────────────────────

void AIntelligentDemoOrchestrator::StartDemo()
{
    if (bRunning) return;
    bRunning = true;

    // Start intelligence polling
    if (USwarmIntelligenceSubsystem* Intel =
        GetGameInstance()->GetSubsystem<USwarmIntelligenceSubsystem>())
    {
        Intel->StartIntelligencePoll(DemoSwarmId, IntelligenceServiceUrl);
    }

    // ── Beat 1 — Swarm activated ──────────────────────────────────────────────
    ScheduleBeat(0.f, [this] {
        FireEvents({
            TEXT("SWARM_STARTED|meta-agent|swarm_id=demo-swarm-phase5"),
            TEXT("AGENT_INITIALIZED|agent_fetch|zone=intake"),
            TEXT("AGENT_INITIALIZED|agent_transform|zone=transform"),
            TEXT("AGENT_INITIALIZED|agent_validate|zone=validation"),
        });
    });

    // ── Beat 2 — Ramp ─────────────────────────────────────────────────────────
    ScheduleBeat(8.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("AGENT_STATE_CHANGED|agent_fetch|state=Working,zone=intake"),
            TEXT("AGENT_STATE_CHANGED|agent_transform|state=Working,zone=transform"),
            TEXT("AGENT_STATE_CHANGED|agent_validate|state=Working,zone=validation"),
            TEXT("TASK_STARTED|agent_fetch|task_id=t001,zone=intake"),
        });
    });

    // ── Beat 3 — Peak operation ───────────────────────────────────────────────
    ScheduleBeat(18.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("TASK_COMPLETED|agent_fetch|task_id=t001,quality_score=0.91,zone=intake"),
            TEXT("TASK_HANDOFF|agent_fetch|target_agent_id=agent_transform,zone=corridor"),
            TEXT("TASK_STARTED|agent_transform|task_id=t002,zone=transform"),
            TEXT("AGENT_STEP_STARTED|agent_validate|step=quality_check,zone=validation"),
            TEXT("TASK_COMPLETED|agent_transform|task_id=t002,quality_score=0.88,zone=transform"),
        });
    });

    // ── Beat 4 — Retry storm seeds ────────────────────────────────────────────
    ScheduleBeat(32.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("TASK_RETRY|agent_fetch|task_id=t003,retry_count=1,zone=intake"),
            TEXT("TASK_RETRY|agent_fetch|task_id=t003,retry_count=2,zone=intake"),
            TEXT("TASK_RETRY|agent_fetch|task_id=t003,retry_count=3,zone=intake"),
            TEXT("AGENT_TIMEOUT|agent_fetch|duration_ms=8200,zone=intake"),
        });
    });

    // ── Beat 5 — Anomaly cascade ──────────────────────────────────────────────
    ScheduleBeat(38.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("ANOMALY_DETECTED|agent_fetch|severity=high,zone=intake"),
            TEXT("CIRCUIT_BREAKER_OPEN|agent_transform|zone=transform"),
            TEXT("ANOMALY_DETECTED|agent_transform|severity=medium,zone=transform"),
            TEXT("QUEUE_OVERFLOW|meta-agent|queue_depth=42,zone=corridor"),
            TEXT("ANOMALY_DETECTED|agent_validate|severity=medium,zone=validation"),
        });
    });

    // ── Beat 6 — Bottleneck stall ─────────────────────────────────────────────
    ScheduleBeat(45.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("TASK_FAILED|agent_fetch|task_id=t003,reason=timeout,zone=intake"),
            TEXT("AGENT_STATE_CHANGED|agent_transform|state=Retry,zone=transform"),
            TEXT("TASK_RETRY|agent_transform|task_id=t004,retry_count=1,zone=transform"),
            TEXT("TASK_RETRY|agent_transform|task_id=t004,retry_count=2,zone=transform"),
        });
    });

    // ── Beat 7 — Intelligence tension spike (auto-detected by subsystem) ──────
    // No explicit events needed — the intelligence service detects the pattern
    // from beats 4-6 and raises tension. IntelligentCinematicDirector recuts.
    // We reinforce with a high-priority anomaly.
    ScheduleBeat(52.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("CIRCUIT_BREAKER_OPEN|agent_validate|zone=validation"),
            TEXT("TASK_RETRY|agent_validate|task_id=t005,retry_count=1,zone=validation"),
            TEXT("TASK_RETRY|agent_validate|task_id=t005,retry_count=2,zone=validation"),
            TEXT("TASK_RETRY|agent_validate|task_id=t005,retry_count=3,zone=validation"),
        });
    });

    // ── Beat 8 — Intervention issued ─────────────────────────────────────────
    ScheduleBeat(58.f * GlobalTimeScale, [this] {
        // Broadcast intervention via PS bridge — simulates operator action
        if (USwarmPixelStreamingBridge* Bridge =
            GetGameInstance()->GetSubsystem<USwarmPixelStreamingBridge>())
        {
            const FString Payload =
                TEXT("{\"kind\":\"isolate_agent\",\"target_id\":\"agent_fetch\",")
                TEXT("\"reason\":\"retry storm — isolating for recovery\"}");
            Bridge->SendToViewer(TEXT("intervention_issued"), Payload);
        }

        FireEvents({
            TEXT("INTERVENTION_ISOLATE_AGENT|meta-agent|target=agent_fetch,zone=intake"),
            TEXT("AGENT_STATE_CHANGED|agent_fetch|state=Idle,zone=intake"),
        });
    });

    // ── Beat 9 — Recovery sequence ────────────────────────────────────────────
    ScheduleBeat(65.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("CIRCUIT_BREAKER_HALF_OPEN|agent_transform|zone=transform"),
            TEXT("CIRCUIT_BREAKER_CLOSED|agent_transform|zone=transform"),
            TEXT("CIRCUIT_BREAKER_CLOSED|agent_validate|zone=validation"),
            TEXT("AGENT_RECOVERED|agent_transform|zone=transform"),
            TEXT("TASK_STARTED|agent_transform|task_id=t006,zone=transform"),
        });
    });

    // ── Beat 10 — Stabilization ───────────────────────────────────────────────
    ScheduleBeat(72.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("TASK_COMPLETED|agent_transform|task_id=t006,quality_score=0.84,zone=transform"),
            TEXT("AGENT_RECOVERED|agent_fetch|zone=intake"),
            TEXT("AGENT_STATE_CHANGED|agent_fetch|state=Working,zone=intake"),
            TEXT("TASK_HANDOFF|agent_transform|target_agent_id=agent_validate,zone=corridor"),
            TEXT("TASK_COMPLETED|agent_validate|task_id=t007,quality_score=0.86,zone=validation"),
        });
    });

    // ── Beat 11 — Executive summary generated ─────────────────────────────────
    ScheduleBeat(78.f * GlobalTimeScale, [this] {
        // Signal HUD to request and display executive summary
        if (USwarmPixelStreamingBridge* Bridge =
            GetGameInstance()->GetSubsystem<USwarmPixelStreamingBridge>())
        {
            Bridge->BroadcastSwarmState(
                DemoSwarmId,
                TEXT("{\"event\":\"executive_summary_ready\",\"health\":0.82}"));
        }

        FireEvents({
            TEXT("TASK_COMPLETED|agent_fetch|task_id=t008,quality_score=0.89,zone=intake"),
            TEXT("AGENT_STEP_COMPLETED|meta-agent|step=orchestration_review,zone=mezzanine"),
        });
    });

    // ── Beat 12 — Swarm complete ──────────────────────────────────────────────
    ScheduleBeat(84.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("SWARM_COMPLETED|meta-agent|quality_score=0.87,duration_ms=84000,zone=mezzanine"),
        });

        if (USwarmPixelStreamingBridge* Bridge =
            GetGameInstance()->GetSubsystem<USwarmPixelStreamingBridge>())
        {
            Bridge->BroadcastQualityScore(0.87f, DemoSwarmId);
        }

        bRunning = false;
    });
}

void AIntelligentDemoOrchestrator::StopDemo()
{
    UWorld* World = GetWorld();
    if (World)
    {
        for (FTimerHandle& H : BeatTimers) World->GetTimerManager().ClearTimer(H);
    }
    BeatTimers.Empty();
    bRunning = false;
}

// ─── Scheduling helpers ───────────────────────────────────────────────────────

void AIntelligentDemoOrchestrator::ScheduleBeat(float DelayS, TFunction<void()> Fn)
{
    FTimerHandle Handle;
    FTimerDelegate Delegate;
    Delegate.BindLambda(MoveTemp(Fn));
    GetWorld()->GetTimerManager().SetTimer(Handle, Delegate, FMath::Max(DelayS, 0.01f), false);
    BeatTimers.Add(Handle);
}

void AIntelligentDemoOrchestrator::FireEvents(const TArray<FString>& EventStrings)
{
    for (int32 i = 0; i < EventStrings.Num(); i++)
    {
        FTimerHandle H;
        const FString Spec = EventStrings[i];
        const float Delay  = i * (STAGGER_MS / 1000.f);

        FTimerDelegate D;
        D.BindLambda([this, Spec] { InjectEvent(Spec); });
        GetWorld()->GetTimerManager().SetTimer(H, D, FMath::Max(Delay, 0.001f), false);
        BeatTimers.Add(H);
    }
}

void AIntelligentDemoOrchestrator::InjectEvent(const FString& Spec)
{
    USwarmEventRouterSubsystem* Router =
        GetGameInstance()->GetSubsystem<USwarmEventRouterSubsystem>();
    if (!Router) return;

    // Parse "EVENT_TYPE|agent_id|key=val,key=val"
    TArray<FString> Parts;
    Spec.ParseIntoArray(Parts, TEXT("|"), false);
    if (Parts.Num() < 2) return;

    FSwarmEvent Evt;
    Evt.EventId    = FGuid::NewGuid().ToString();
    Evt.EventType  = Parts[0].TrimStartAndEnd();
    Evt.AgentId    = Parts[1].TrimStartAndEnd();
    Evt.SwarmId    = DemoSwarmId;
    Evt.Priority   = EEventPriority::Normal;
    Evt.TimestampMs = static_cast<int64>(FPlatformTime::Seconds() * 1000.0);

    if (Parts.Num() >= 3)
    {
        TArray<FString> KVs;
        Parts[2].ParseIntoArray(KVs, TEXT(","), true);
        TSharedPtr<FJsonObject> DataObj = MakeShared<FJsonObject>();
        for (const FString& KV : KVs)
        {
            FString K, V;
            if (KV.Split(TEXT("="), &K, &V))
            {
                if (K == TEXT("zone")) Evt.Channel = V;
                else DataObj->SetStringField(K, V);
            }
        }
        FString DataStr;
        const TSharedRef<TJsonWriter<>> W = TJsonWriterFactory<>::Create(&DataStr);
        FJsonSerializer::Serialize(DataObj.ToSharedRef(), W);
        Evt.DataJson = DataStr;
    }

    Router->EnqueueEvent(Evt);
}
