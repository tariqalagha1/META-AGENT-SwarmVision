#include "Demo/DigitalTwinDemoOrchestrator.h"
#include "Events/SwarmEventRouterSubsystem.h"
#include "Intelligence/SwarmIntelligenceSubsystem.h"
#include "Platform/SwarmPixelStreamingBridge.h"
#include "Engine/World.h"
#include "Engine/GameInstance.h"
#include "TimerManager.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"

ADigitalTwinDemoOrchestrator::ADigitalTwinDemoOrchestrator()
{
    PrimaryActorTick.bCanEverTick = false;
}

void ADigitalTwinDemoOrchestrator::BeginPlay()
{
    Super::BeginPlay();
}

void ADigitalTwinDemoOrchestrator::StartDemo()
{
    if (bRunning) return;
    bRunning = true;

    if (USwarmIntelligenceSubsystem* Intel =
        GetGameInstance()->GetSubsystem<USwarmIntelligenceSubsystem>())
    {
        Intel->StartIntelligencePoll(DemoSwarmId, IntelligenceServiceUrl);
    }

    // ── Beat 1 — Swarm activated ──────────────────────────────────────────────
    ScheduleBeat(0.f, [this] {
        FireEvents({
            TEXT("SWARM_STARTED|meta-agent|swarm_id=demo-swarm-phase6,zone=mezzanine"),
            TEXT("AGENT_INITIALIZED|agent_ingest|zone=intake"),
            TEXT("AGENT_INITIALIZED|agent_process|zone=transform"),
            TEXT("AGENT_INITIALIZED|agent_validate|zone=validation"),
            TEXT("AGENT_INITIALIZED|agent_output|zone=corridor"),
        });
        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"activation\",\"label\":\"Swarm initialized — 4 agents online\"}"));
    });

    // ── Beat 2 — Nominal operation ────────────────────────────────────────────
    ScheduleBeat(6.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("AGENT_STATE_CHANGED|agent_ingest|state=Working,zone=intake"),
            TEXT("AGENT_STATE_CHANGED|agent_process|state=Working,zone=transform"),
            TEXT("AGENT_STATE_CHANGED|agent_validate|state=Working,zone=validation"),
            TEXT("TASK_COMPLETED|agent_ingest|task_id=t001,quality_score=0.92,zone=intake"),
            TEXT("TASK_HANDOFF|agent_ingest|target_agent_id=agent_process,zone=corridor"),
            TEXT("TASK_COMPLETED|agent_process|task_id=t002,quality_score=0.90,zone=transform"),
            TEXT("TASK_COMPLETED|agent_validate|task_id=t003,quality_score=0.91,zone=validation"),
        });
        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"peak_operation\",\"label\":\"Peak efficiency — 91% average quality\"}"));
    });

    // ── Beat 3 — Temperament profiling ────────────────────────────────────────
    ScheduleBeat(14.f * GlobalTimeScale, [this] {
        // Request temperament model from intelligence service
        const FString Url = IntelligenceServiceUrl + TEXT("/simulate/temperament/demo-swarm");
        auto Req = FHttpModule::Get().CreateRequest();
        Req->SetURL(Url);
        Req->SetVerb(TEXT("GET"));
        Req->OnProcessRequestComplete().BindLambda(
            [this](FHttpRequestPtr, FHttpResponsePtr Resp, bool bOk) {
            if (bOk && Resp.IsValid() && Resp->GetResponseCode() == 200) {
                PushToViewer(TEXT("temperament_profile"), Resp->GetContentAsString());
            }
        });
        Req->ProcessRequest();

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"analysis\",\"label\":\"Swarm temperament profiling underway\"}"));
    });

    // ── Beat 4 — Efficiency drift ─────────────────────────────────────────────
    ScheduleBeat(22.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("TASK_RETRY|agent_ingest|task_id=t004,retry_count=1,zone=intake"),
            TEXT("TASK_RETRY|agent_ingest|task_id=t004,retry_count=2,zone=intake"),
            TEXT("AGENT_TIMEOUT|agent_process|duration_ms=6500,zone=transform"),
            TEXT("TASK_RETRY|agent_process|task_id=t005,retry_count=1,zone=transform"),
            TEXT("TASK_RETRY|agent_process|task_id=t005,retry_count=2,zone=transform"),
            TEXT("TASK_RETRY|agent_process|task_id=t005,retry_count=3,zone=transform"),
        });
        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"degrading\",\"label\":\"Efficiency drift detected — governance seeding\"}"));
        RequestGovernanceDecision();
    });

    // ── Beat 5 — Governance auto-fires ────────────────────────────────────────
    ScheduleBeat(30.f * GlobalTimeScale, [this] {
        // Governance decision was computed — visualize the action
        PushToViewer(TEXT("governance_action"), TEXT("{") +
            FString(TEXT("\"kind\":\"suppress_retries\",")) +
            TEXT("\"target\":\"agent_process\",") +
            TEXT("\"confidence\":0.84,") +
            TEXT("\"urgency\":\"high\",") +
            TEXT("\"rationale\":\"Retry pressure 0.28 — suppressing with 2× backoff\"}"));

        FireEvents({
            TEXT("AGENT_STATE_CHANGED|agent_process|state=Working,zone=transform"),
            TEXT("TASK_COMPLETED|agent_process|task_id=t005,quality_score=0.78,zone=transform"),
        });
    });

    // ── Beat 6 — Digital twin simulation ──────────────────────────────────────
    ScheduleBeat(36.f * GlobalTimeScale, [this] {
        // Simulate "what if we add capacity to transform zone"
        PushToViewer(TEXT("simulation_branch"), TEXT("{") +
            FString(TEXT("\"label\":\"Add capacity — transform zone\",")) +
            TEXT("\"mutation\":\"add_capacity\",") +
            TEXT("\"baseline_health\":0.62,") +
            TEXT("\"predicted_health\":0.81,") +
            TEXT("\"efficiency_gain\":0.19,") +
            TEXT("\"risk_level\":\"low\",") +
            TEXT("\"recommendation\":\"Adding capacity improves predicted health by 19%\"}"));

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"simulation\",\"label\":\"Digital twin: evaluating reroute strategy\"}"));
    });

    // ── Beat 7 — Predictive intervention ──────────────────────────────────────
    ScheduleBeat(42.f * GlobalTimeScale, [this] {
        // Pre-failure reroute: before the imminent failure escalates
        FireEvents({
            TEXT("INTERVENTION_REROUTE_TASK|meta-agent|target=agent_process,to=agent_output,zone=corridor"),
            TEXT("AGENT_STATE_CHANGED|agent_output|state=Working,zone=corridor"),
        });
        PushToViewer(TEXT("predictive_intervention"), TEXT("{") +
            FString(TEXT("\"kind\":\"reroute_task\",")) +
            TEXT("\"confidence\":0.79,") +
            TEXT("\"trigger\":\"predictive\",") +
            TEXT("\"description\":\"Pre-failure reroute — 73% probability of failure in 8s prevented\"}"));
    });

    // ── Beat 8 — Anomaly quarantine ────────────────────────────────────────────
    ScheduleBeat(50.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("ANOMALY_DETECTED|agent_ingest|severity=high,zone=intake"),
            TEXT("CIRCUIT_BREAKER_OPEN|agent_ingest|zone=intake"),
            TEXT("INTERVENTION_QUARANTINE_ANOMALY|meta-agent|target=agent_ingest,zone=intake"),
            TEXT("AGENT_STATE_CHANGED|agent_ingest|state=Idle,zone=intake"),
        });
        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"incident\",\"label\":\"Anomaly quarantine — auto-isolating intake zone\"}"));
    });

    // ── Beat 9 — Self-healing ─────────────────────────────────────────────────
    ScheduleBeat(57.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("CIRCUIT_BREAKER_CLOSED|agent_ingest|zone=intake"),
            TEXT("AGENT_RECOVERED|agent_ingest|recovery_ms=7200,zone=intake"),
            TEXT("AGENT_STATE_CHANGED|agent_ingest|state=Working,zone=intake"),
            TEXT("TASK_COMPLETED|agent_ingest|task_id=t006,quality_score=0.85,zone=intake"),
            TEXT("CIRCUIT_BREAKER_CLOSED|agent_process|zone=transform"),
            TEXT("AGENT_RECOVERED|agent_process|zone=transform"),
        });
        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"recovery\",\"label\":\"Self-healing initiated — governed retry policy active\"}"));
    });

    // ── Beat 10 — Strategic advisor pushes recommendations ────────────────────
    ScheduleBeat(64.f * GlobalTimeScale, [this] {
        PushToViewer(TEXT("strategic_recommendations"), TEXT("{") +
            FString(TEXT("\"count\":3,")) +
            TEXT("\"top\":[") +
            TEXT("{\"priority\":\"high\",\"headline\":\"Implement adaptive exponential backoff with jitter\",") +
            TEXT(" \"expected_gain\":0.18},") +
            TEXT("{\"priority\":\"high\",\"headline\":\"Deploy redundant agent alongside agent_process\",") +
            TEXT(" \"expected_gain\":0.14},") +
            TEXT("{\"priority\":\"medium\",\"headline\":\"Introduce event ingestion smoothing\",") +
            TEXT(" \"expected_gain\":0.11}") +
            TEXT("]}"));

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"advisory\",\"label\":\"Strategic advisor: 3 high-impact recommendations published\"}"));
    });

    // ── Beat 11 — Copilot query ────────────────────────────────────────────────
    ScheduleBeat(71.f * GlobalTimeScale, [this] {
        RequestCopilotAnswer(
            TEXT("What happened and what should we do next?"),
            TEXT("{\"current_phase\":\"recovery\"}")
        );
        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"copilot\",\"label\":\"Executive copilot query: analyzing operational state\"}"));
    });

    // ── Beat 12 — Optimized re-run with learned parameters ────────────────────
    ScheduleBeat(79.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("TASK_COMPLETED|agent_ingest|task_id=t007,quality_score=0.93,zone=intake"),
            TEXT("TASK_HANDOFF|agent_ingest|target_agent_id=agent_process,zone=corridor"),
            TEXT("TASK_COMPLETED|agent_process|task_id=t008,quality_score=0.95,zone=transform"),
            TEXT("TASK_HANDOFF|agent_process|target_agent_id=agent_validate,zone=corridor"),
            TEXT("TASK_COMPLETED|agent_validate|task_id=t009,quality_score=0.94,zone=validation"),
            TEXT("TASK_COMPLETED|agent_output|task_id=t010,quality_score=0.96,zone=corridor"),
        });
        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"optimized\",\"label\":\"Re-run with learned parameters — 94%+ quality\"}"));
    });

    // ── Beat 13 — Swarm complete ──────────────────────────────────────────────
    ScheduleBeat(88.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("SWARM_COMPLETED|meta-agent|quality_score=0.94,duration_ms=88000,zone=mezzanine"),
        });

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"epilogue\",\"label\":\"Digital twin evolution complete — quality 0.94 recorded\"}"));

        if (USwarmPixelStreamingBridge* Bridge =
            GetGameInstance()->GetSubsystem<USwarmPixelStreamingBridge>())
        {
            Bridge->BroadcastQualityScore(0.94f, DemoSwarmId);
        }

        bRunning = false;
    });
}

void ADigitalTwinDemoOrchestrator::StopDemo()
{
    UWorld* World = GetWorld();
    if (World)
    {
        for (FTimerHandle& H : BeatTimers) World->GetTimerManager().ClearTimer(H);
    }
    BeatTimers.Empty();
    bRunning = false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

void ADigitalTwinDemoOrchestrator::ScheduleBeat(float DelayS, TFunction<void()> Fn)
{
    FTimerHandle H;
    FTimerDelegate D;
    D.BindLambda(MoveTemp(Fn));
    GetWorld()->GetTimerManager().SetTimer(H, D, FMath::Max(DelayS, 0.01f), false);
    BeatTimers.Add(H);
}

void ADigitalTwinDemoOrchestrator::FireEvents(const TArray<FString>& Specs)
{
    for (int32 i = 0; i < Specs.Num(); i++)
    {
        const FString Spec  = Specs[i];
        const float Delay   = i * 0.08f;
        FTimerHandle H;
        FTimerDelegate D;
        D.BindLambda([this, Spec] { InjectEvent(Spec); });
        GetWorld()->GetTimerManager().SetTimer(H, D, FMath::Max(Delay, 0.001f), false);
        BeatTimers.Add(H);
    }
}

void ADigitalTwinDemoOrchestrator::InjectEvent(const FString& Spec)
{
    USwarmEventRouterSubsystem* Router =
        GetGameInstance()->GetSubsystem<USwarmEventRouterSubsystem>();
    if (!Router) return;

    TArray<FString> Parts;
    Spec.ParseIntoArray(Parts, TEXT("|"), false);
    if (Parts.Num() < 2) return;

    FSwarmEvent Evt;
    Evt.EventId     = FGuid::NewGuid().ToString();
    Evt.EventType   = Parts[0].TrimStartAndEnd();
    Evt.AgentId     = Parts[1].TrimStartAndEnd();
    Evt.SwarmId     = DemoSwarmId;
    Evt.Priority    = EEventPriority::Normal;
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

void ADigitalTwinDemoOrchestrator::PushToViewer(
    const FString& Type, const FString& PayloadJson)
{
    if (USwarmPixelStreamingBridge* Bridge =
        GetGameInstance()->GetSubsystem<USwarmPixelStreamingBridge>())
    {
        Bridge->SendToViewer(Type, PayloadJson);
    }
}

void ADigitalTwinDemoOrchestrator::RequestGovernanceDecision()
{
    // Fire-and-forget POST to /governance/decide — result pushed via PS bridge
    // In production this is called by the relay service automatically.
    const FString Url = IntelligenceServiceUrl + TEXT("/governance/decide");
    auto Req = FHttpModule::Get().CreateRequest();
    Req->SetURL(Url);
    Req->SetVerb(TEXT("POST"));
    Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Req->SetContentAsString(TEXT("{\"swarm_id\":\"") + DemoSwarmId + TEXT("\",\"started_at_ms\":0,\"events\":[]}"));
    Req->OnProcessRequestComplete().BindLambda(
        [this](FHttpRequestPtr, FHttpResponsePtr Resp, bool bOk) {
        if (bOk && Resp.IsValid()) {
            PushToViewer(TEXT("governance_decision"), Resp->GetContentAsString());
        }
    });
    Req->ProcessRequest();
}

void ADigitalTwinDemoOrchestrator::RequestCopilotAnswer(
    const FString& Question, const FString& Context)
{
    const FString Body = FString::Printf(
        TEXT("{\"text\":\"%s\",\"swarm_id\":\"%s\",\"context\":%s}"),
        *Question, *DemoSwarmId, *Context);

    const FString Url = IntelligenceServiceUrl + TEXT("/copilot/query");
    auto Req = FHttpModule::Get().CreateRequest();
    Req->SetURL(Url);
    Req->SetVerb(TEXT("POST"));
    Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Req->SetContentAsString(Body);
    Req->OnProcessRequestComplete().BindLambda(
        [this](FHttpRequestPtr, FHttpResponsePtr Resp, bool bOk) {
        if (bOk && Resp.IsValid()) {
            PushToViewer(TEXT("copilot_response"), Resp->GetContentAsString());
        }
    });
    Req->ProcessRequest();
}
