#include "Demo/EvolutionaryDemoOrchestrator.h"
#include "Events/SwarmEventRouterSubsystem.h"
#include "Intelligence/SwarmIntelligenceSubsystem.h"
#include "Platform/SwarmPixelStreamingBridge.h"
#include "Engine/World.h"
#include "Engine/GameInstance.h"
#include "TimerManager.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonSerializer.h"

AEvolutionaryDemoOrchestrator::AEvolutionaryDemoOrchestrator()
{
    PrimaryActorTick.bCanEverTick = false;
}

void AEvolutionaryDemoOrchestrator::BeginPlay()
{
    Super::BeginPlay();
}

void AEvolutionaryDemoOrchestrator::StartDemo()
{
    if (bRunning) return;
    bRunning = true;

    if (USwarmIntelligenceSubsystem* Intel =
        GetGameInstance()->GetSubsystem<USwarmIntelligenceSubsystem>())
    {
        Intel->StartIntelligencePoll(SwarmAId, IntelligenceServiceUrl);
    }

    // ── Beat 1 — Ecosystem boot ───────────────────────────────────────────────
    ScheduleBeat(0.f, [this] {
        // Three specialized swarms boot simultaneously
        FireEvents({
            TEXT("SWARM_STARTED|meta-agent|swarm_id=swarm-alpha,zone=mezzanine"),
            TEXT("AGENT_INITIALIZED|agent_ingest_a|zone=intake"),
            TEXT("AGENT_INITIALIZED|agent_process_a|zone=transform"),
            TEXT("AGENT_INITIALIZED|agent_validate_a|zone=validation"),
        }, SwarmAId);

        FireEvents({
            TEXT("SWARM_STARTED|meta-agent-b|swarm_id=swarm-beta,zone=mezzanine"),
            TEXT("AGENT_INITIALIZED|agent_ingest_b|zone=intake"),
            TEXT("AGENT_INITIALIZED|agent_process_b|zone=transform"),
        }, SwarmBId);

        FireEvents({
            TEXT("SWARM_STARTED|meta-agent-c|swarm_id=swarm-gamma,zone=mezzanine"),
            TEXT("AGENT_INITIALIZED|agent_validate_c|zone=validation"),
            TEXT("AGENT_INITIALIZED|agent_output_c|zone=corridor"),
        }, SwarmCId);

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"ecosystem_boot\",\"label\":\"3 specialized swarms online — ingest/transform/output\"}"));
    });

    // ── Beat 2 — Nominal multi-swarm operation ────────────────────────────────
    ScheduleBeat(7.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("AGENT_STATE_CHANGED|agent_ingest_a|state=Working,zone=intake"),
            TEXT("TASK_COMPLETED|agent_ingest_a|task_id=t001,quality_score=0.91,zone=intake"),
            TEXT("TASK_HANDOFF|agent_ingest_a|target_agent_id=agent_process_a,zone=corridor"),
            TEXT("TASK_COMPLETED|agent_process_a|task_id=t002,quality_score=0.89,zone=transform"),
            // Cross-swarm handoff A → C
            TEXT("TASK_HANDOFF|agent_process_a|target_agent_id=agent_validate_c,zone=corridor"),
            TEXT("TASK_COMPLETED|agent_validate_c|task_id=t003,quality_score=0.93,zone=validation"),
        }, SwarmAId);

        FireEvents({
            TEXT("AGENT_STATE_CHANGED|agent_ingest_b|state=Working,zone=intake"),
            TEXT("TASK_COMPLETED|agent_ingest_b|task_id=t004,quality_score=0.88,zone=intake"),
        }, SwarmBId);

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"peak_operation\",\"label\":\"Multi-swarm peak — cross-swarm handoffs active\"}"));
    });

    // ── Beat 3 — Emergent behavior detection ──────────────────────────────────
    ScheduleBeat(15.f * GlobalTimeScale, [this] {
        RequestEmergenceAnalysis(SwarmAId);
        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"emergence_detection\",\"label\":\"Emergent behavior engine: classifying collaboration archetype\"}"));
    });

    // ── Beat 4 — Coherence modeling ───────────────────────────────────────────
    ScheduleBeat(22.f * GlobalTimeScale, [this] {
        // Push a static coherence snapshot for viewer
        PushToViewer(TEXT("coherence_model"), TEXT("{") +
            FString(TEXT("\"harmony\":0.74,")) +
            TEXT("\"collective_stress\":0.22,") +
            TEXT("\"coordination_entropy\":0.38,") +
            TEXT("\"synchronization_quality\":0.71,") +
            TEXT("\"operational_cohesion\":0.68,") +
            TEXT("\"systemic_resilience\":0.77,") +
            TEXT("\"coherence_label\":\"cohesive\"}"));

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"coherence_analysis\",\"label\":\"Swarm coherence: cohesive — harmony 74%, resilience 77%\"}"));
    });

    // ── Beat 5 — Collective stress spike: swarm-B retry storm ─────────────────
    ScheduleBeat(29.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("TASK_RETRY|agent_ingest_b|task_id=t005,retry_count=1,zone=intake"),
            TEXT("TASK_RETRY|agent_ingest_b|task_id=t005,retry_count=2,zone=intake"),
            TEXT("TASK_RETRY|agent_process_b|task_id=t006,retry_count=1,zone=transform"),
            TEXT("TASK_RETRY|agent_ingest_b|task_id=t007,retry_count=1,zone=intake"),
            TEXT("TASK_RETRY|agent_process_b|task_id=t006,retry_count=2,zone=transform"),
            TEXT("TASK_RETRY|agent_ingest_b|task_id=t007,retry_count=2,zone=intake"),
            TEXT("TASK_RETRY|agent_ingest_b|task_id=t007,retry_count=3,zone=intake"),
            TEXT("AGENT_TIMEOUT|agent_process_b|duration_ms=7200,zone=transform"),
        }, SwarmBId);

        PushToViewer(TEXT("emergent_retry_pattern"), TEXT("{") +
            FString(TEXT("\"kind\":\"storm\",")) +
            TEXT("\"participating_agents\":[\"agent_ingest_b\",\"agent_process_b\"],") +
            TEXT("\"propagation_coefficient\":0.72,") +
            TEXT("\"avg_retry_lag_ms\":420}"));

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"stress_spike\",\"label\":\"Swarm-Beta retry storm — propagation coefficient 0.72\"}"));
    });

    // ── Beat 6 — Ecosystem governor activates ─────────────────────────────────
    ScheduleBeat(37.f * GlobalTimeScale, [this] {
        RequestEcosystemDecision();

        PushToViewer(TEXT("ecosystem_action"), TEXT("{") +
            FString(TEXT("\"kind\":\"rebalance_load\",")) +
            TEXT("\"source_swarm\":\"swarm-beta\",") +
            TEXT("\"target_swarm\":\"swarm-alpha\",") +
            TEXT("\"urgency\":\"high\",") +
            TEXT("\"confidence\":0.81,") +
            TEXT("\"rationale\":\"swarm-beta overloaded 83% — offloading to swarm-alpha\"}"));

        FireEvents({
            TEXT("AGENT_STATE_CHANGED|agent_ingest_b|state=Idle,zone=intake"),
        }, SwarmBId);

        FireEvents({
            TEXT("AGENT_STATE_CHANGED|agent_ingest_a|state=Working,zone=intake"),
            TEXT("TASK_COMPLETED|agent_ingest_a|task_id=t008,quality_score=0.87,zone=intake"),
        }, SwarmAId);

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"ecosystem_governance\",\"label\":\"Ecosystem governor: load rebalanced across 3 swarms\"}"));
    });

    // ── Beat 7 — Cross-swarm anomaly propagation + containment ───────────────
    ScheduleBeat(44.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("ANOMALY_DETECTED|agent_process_b|severity=high,zone=transform"),
            TEXT("CIRCUIT_BREAKER_OPEN|agent_process_b|zone=transform"),
        }, SwarmBId);

        PushToViewer(TEXT("anomaly_propagation"), TEXT("{") +
            FString(TEXT("\"kind\":\"linear_spread\",")) +
            TEXT("\"origin_agent\":\"agent_process_b\",") +
            TEXT("\"affected_zones\":[\"transform\",\"corridor\"],") +
            TEXT("\"propagation_speed_ms\":1200,") +
            TEXT("\"blast_radius\":0.28}"));

        // Ecosystem governor isolates swarm-B
        PushToViewer(TEXT("ecosystem_action"), TEXT("{") +
            FString(TEXT("\"kind\":\"isolate_swarm\",")) +
            TEXT("\"source_swarm\":\"swarm-beta\",") +
            TEXT("\"urgency\":\"high\",") +
            TEXT("\"confidence\":0.85,") +
            TEXT("\"rationale\":\"Cross-swarm anomaly propagation detected — isolating swarm-beta\"}"));

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"anomaly_containment\",\"label\":\"Cross-swarm anomaly contained — swarm-beta isolated\"}"));
    });

    // ── Beat 8 — Evolutionary twin explores genomes ───────────────────────────
    ScheduleBeat(51.f * GlobalTimeScale, [this] {
        RequestEvolutionaryTwin(SwarmAId);

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"evolution_exploration\",\"label\":\"Evolutionary twin: exploring 8 orchestration genomes\"}"));
    });

    // ── Beat 9 — Best genome selected, mutation applied ───────────────────────
    ScheduleBeat(58.f * GlobalTimeScale, [this] {
        PushToViewer(TEXT("evolution_result"), TEXT("{") +
            FString(TEXT("\"best_genome\":{")) +
            TEXT("\"mutation_applied\":\"adjust_retry_policy\",") +
            TEXT("\"mutation_params\":{\"retry_max\":2,\"backoff_multiplier\":2},") +
            TEXT("\"fitness_score\":0.87,") +
            TEXT("\"generation\":4},") +
            TEXT("\"fitness_improvement\":0.18,") +
            TEXT("\"dominant_mutations\":[\"adjust_retry_policy\",\"shift_governance_threshold\"],") +
            TEXT("\"converged\":true,") +
            TEXT("\"convergence_generation\":4}"));

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"genome_selected\",\"label\":\"Best genome: retry_max=2, 2× backoff — fitness +18%\"}"));
    });

    // ── Beat 10 — Long-horizon strategic plan ─────────────────────────────────
    ScheduleBeat(65.f * GlobalTimeScale, [this] {
        RequestEvolutionPlan(SwarmAId);

        PushToViewer(TEXT("strategic_evolution_plan"), TEXT("{") +
            FString(TEXT("\"horizon_label\":\"medium\",")) +
            TEXT("\"topology_redesign\":{") +
            TEXT("\"current_archetype\":\"pipeline\",") +
            TEXT("\"recommended_archetype\":\"mesh\",") +
            TEXT("\"expected_health_gain\":0.12,") +
            TEXT("\"migration_complexity\":\"high\"},") +
            TEXT("\"risk_outlook\":{") +
            TEXT("\"short_term_risk\":\"medium\",") +
            TEXT("\"dominant_threat\":\"retry_storm_cascade\"},") +
            TEXT("\"priority_actions_count\":5}"));

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"strategic_planning\",\"label\":\"Long-horizon plan: topology migration + 5 priority actions\"}"));
    });

    // ── Beat 11 — Collective memory transfer ──────────────────────────────────
    ScheduleBeat(72.f * GlobalTimeScale, [this] {
        RequestCollectiveTransfer(SwarmAId, SwarmBId);

        PushToViewer(TEXT("memory_transfer"), TEXT("{") +
            FString(TEXT("\"from_swarm\":\"swarm-alpha\",")) +
            TEXT("\"to_swarm\":\"swarm-beta\",") +
            TEXT("\"patterns_transferred\":3,") +
            TEXT("\"top_pattern\":\"Session health: good (87%) — pipeline archetype\",") +
            TEXT("\"expected_gain\":0.14}"));

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"collective_transfer\",\"label\":\"Collective memory: alpha→beta knowledge transfer, +14% expected gain\"}"));
    });

    // ── Beat 12 — Evolutionary optimized re-run ───────────────────────────────
    ScheduleBeat(80.f * GlobalTimeScale, [this] {
        // All swarms apply learned genome
        FireEvents({
            TEXT("CIRCUIT_BREAKER_CLOSED|agent_process_b|zone=transform"),
            TEXT("AGENT_RECOVERED|agent_process_b|recovery_ms=6800,zone=transform"),
            TEXT("AGENT_STATE_CHANGED|agent_process_b|state=Working,zone=transform"),
            TEXT("TASK_COMPLETED|agent_process_b|task_id=t009,quality_score=0.91,zone=transform"),
        }, SwarmBId);

        FireEvents({
            TEXT("TASK_COMPLETED|agent_ingest_a|task_id=t010,quality_score=0.94,zone=intake"),
            TEXT("TASK_HANDOFF|agent_ingest_a|target_agent_id=agent_process_a,zone=corridor"),
            TEXT("TASK_COMPLETED|agent_process_a|task_id=t011,quality_score=0.95,zone=transform"),
            TEXT("TASK_COMPLETED|agent_validate_c|task_id=t012,quality_score=0.93,zone=validation"),
            TEXT("TASK_COMPLETED|agent_output_c|task_id=t013,quality_score=0.96,zone=corridor"),
        }, SwarmAId);

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"evolved_operation\",\"label\":\"Re-run with evolved genome — all swarms 91-96% quality\"}"));
    });

    // ── Beat 13 — Collective consciousness signal ─────────────────────────────
    ScheduleBeat(89.f * GlobalTimeScale, [this] {
        PushToViewer(TEXT("consciousness_signal"), TEXT("{") +
            FString(TEXT("\"global_swarm_confidence\":0.88,")) +
            TEXT("\"organizational_tension\":0.18,") +
            TEXT("\"collective_stability\":0.84,") +
            TEXT("\"orchestration_harmony\":0.82,") +
            TEXT("\"evolutionary_readiness\":0.73,") +
            TEXT("\"emergence_index\":0.61,") +
            TEXT("\"consciousness_label\":\"evolving\"}"));

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"consciousness_peak\",\"label\":\"Collective consciousness: EVOLVING — emergence index 0.61\"}"));
    });

    // ── Beat 14 — Ecosystem complete ──────────────────────────────────────────
    ScheduleBeat(96.f * GlobalTimeScale, [this] {
        FireEvents({
            TEXT("SWARM_COMPLETED|meta-agent|quality_score=0.94,duration_ms=96000,zone=mezzanine"),
        }, SwarmAId);
        FireEvents({
            TEXT("SWARM_COMPLETED|meta-agent-b|quality_score=0.91,duration_ms=96000,zone=mezzanine"),
        }, SwarmBId);
        FireEvents({
            TEXT("SWARM_COMPLETED|meta-agent-c|quality_score=0.95,duration_ms=96000,zone=mezzanine"),
        }, SwarmCId);

        PushToViewer(TEXT("demo_phase"),
            TEXT("{\"phase\":\"ecosystem_complete\",\"label\":\"Ecosystem complete — 3 swarms evolved, collective memory committed\"}"));

        if (USwarmPixelStreamingBridge* Bridge =
            GetGameInstance()->GetSubsystem<USwarmPixelStreamingBridge>())
        {
            Bridge->BroadcastQualityScore(0.94f, SwarmAId);
        }

        bRunning = false;
    });
}

void AEvolutionaryDemoOrchestrator::StopDemo()
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

void AEvolutionaryDemoOrchestrator::ScheduleBeat(float DelayS, TFunction<void()> Fn)
{
    FTimerHandle H;
    FTimerDelegate D;
    D.BindLambda(MoveTemp(Fn));
    GetWorld()->GetTimerManager().SetTimer(H, D, FMath::Max(DelayS, 0.01f), false);
    BeatTimers.Add(H);
}

void AEvolutionaryDemoOrchestrator::FireEvents(
    const TArray<FString>& Specs, const FString& SwarmOverride)
{
    for (int32 i = 0; i < Specs.Num(); i++)
    {
        const FString Spec  = Specs[i];
        const float Delay   = i * 0.08f;
        FTimerHandle H;
        FTimerDelegate D;
        D.BindLambda([this, Spec, SwarmOverride] { InjectEvent(Spec, SwarmOverride); });
        GetWorld()->GetTimerManager().SetTimer(H, D, FMath::Max(Delay, 0.001f), false);
        BeatTimers.Add(H);
    }
}

void AEvolutionaryDemoOrchestrator::InjectEvent(
    const FString& Spec, const FString& SwarmOverride)
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
    Evt.SwarmId     = SwarmOverride.IsEmpty() ? SwarmAId : SwarmOverride;
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

void AEvolutionaryDemoOrchestrator::PushToViewer(
    const FString& Type, const FString& PayloadJson)
{
    if (USwarmPixelStreamingBridge* Bridge =
        GetGameInstance()->GetSubsystem<USwarmPixelStreamingBridge>())
    {
        Bridge->SendToViewer(Type, PayloadJson);
    }
}

void AEvolutionaryDemoOrchestrator::PostIntelligence(
    const FString& Endpoint,
    const FString& Body,
    TFunction<void(const FString&)> OnResult)
{
    const FString Url = IntelligenceServiceUrl + Endpoint;
    auto Req = FHttpModule::Get().CreateRequest();
    Req->SetURL(Url);
    Req->SetVerb(TEXT("POST"));
    Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Req->SetContentAsString(Body);
    Req->OnProcessRequestComplete().BindLambda(
        [this, OnResult = MoveTemp(OnResult)](FHttpRequestPtr, FHttpResponsePtr Resp, bool bOk) {
        if (bOk && Resp.IsValid() && Resp->GetResponseCode() == 200) {
            OnResult(Resp->GetContentAsString());
        }
    });
    Req->ProcessRequest();
}

void AEvolutionaryDemoOrchestrator::RequestEmergenceAnalysis(const FString& SwarmId)
{
    const FString Body = FString::Printf(
        TEXT("{\"swarm_id\":\"%s\",\"started_at_ms\":0,\"events\":[]}"), *SwarmId);

    PostIntelligence(TEXT("/emergence/analyze"), Body,
        [this](const FString& Json) {
            PushToViewer(TEXT("emergent_behavior"), Json);
        });
}

void AEvolutionaryDemoOrchestrator::RequestEcosystemDecision()
{
    const FString Body = FString::Printf(
        TEXT("{\"swarms\":[")
        TEXT("{\"swarm_id\":\"%s\",\"health\":0.83,\"load\":0.55,\"anomaly_rate\":0.04,\"specialization\":\"ingest\",\"is_overloaded\":false,\"is_degraded\":false},")
        TEXT("{\"swarm_id\":\"%s\",\"health\":0.47,\"load\":0.83,\"anomaly_rate\":0.22,\"specialization\":\"transform\",\"is_overloaded\":true,\"is_degraded\":true},")
        TEXT("{\"swarm_id\":\"%s\",\"health\":0.79,\"load\":0.42,\"anomaly_rate\":0.03,\"specialization\":\"output\",\"is_overloaded\":false,\"is_degraded\":false}")
        TEXT("]}"),
        *SwarmAId, *SwarmBId, *SwarmCId);

    PostIntelligence(TEXT("/ecosystem/decide"), Body,
        [this](const FString& Json) {
            PushToViewer(TEXT("ecosystem_governance"), Json);
        });
}

void AEvolutionaryDemoOrchestrator::RequestEvolutionaryTwin(const FString& SwarmId)
{
    const FString Body = FString::Printf(
        TEXT("{\"swarm_id\":\"%s\",\"started_at_ms\":0,\"horizon_ms\":90000,\"events\":[]}"),
        *SwarmId);

    PostIntelligence(TEXT("/evolution/twin"), Body,
        [this](const FString& Json) {
            PushToViewer(TEXT("evolutionary_twin"), Json);
        });
}

void AEvolutionaryDemoOrchestrator::RequestEvolutionPlan(const FString& SwarmId)
{
    const FString Body = FString::Printf(
        TEXT("{\"swarm_id\":\"%s\",\"started_at_ms\":0,\"events\":[]}"), *SwarmId);

    PostIntelligence(TEXT("/evolution/plan"), Body,
        [this](const FString& Json) {
            PushToViewer(TEXT("evolution_plan"), Json);
        });
}

void AEvolutionaryDemoOrchestrator::RequestCollectiveTransfer(
    const FString& FromSwarm, const FString& ToSwarm)
{
    const FString Body = FString::Printf(
        TEXT("{\"from_swarm\":\"%s\",\"to_swarm\":\"%s\"}"), *FromSwarm, *ToSwarm);

    PostIntelligence(TEXT("/collective/transfer"), Body,
        [this](const FString& Json) {
            PushToViewer(TEXT("collective_memory_transfer"), Json);
        });
}
