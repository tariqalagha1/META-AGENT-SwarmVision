#include "Demo/HumanCivilizationDemoOrchestrator.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "TimerManager.h"
#include "Intelligence/SwarmIntelligenceSubsystem.h"

// ─────────────────────────────────────────────────────────────────────────────

AHumanCivilizationDemoOrchestrator::AHumanCivilizationDemoOrchestrator()
{
    PrimaryActorTick.bCanEverTick = false;
}

void AHumanCivilizationDemoOrchestrator::BeginPlay()
{
    Super::BeginPlay();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

void AHumanCivilizationDemoOrchestrator::ScheduleBeat(float DelayS, TFunction<void()> Fn)
{
    FTimerHandle Handle;
    FTimerDelegate Del;
    Del.BindLambda(MoveTemp(Fn));
    GetWorldTimerManager().SetTimer(Handle, Del, DelayS / GlobalTimeScale, false);
    BeatTimers.Add(Handle);
}

void AHumanCivilizationDemoOrchestrator::InjectEvent(const FString& Spec, const FString& SwarmOverride)
{
    USwarmIntelligenceSubsystem* Intel =
        GetGameInstance()->GetSubsystem<USwarmIntelligenceSubsystem>();
    if (!Intel) return;
    Intel->InjectEventFromSpec(SwarmOverride.IsEmpty() ? SwarmAId : SwarmOverride, Spec);
}

void AHumanCivilizationDemoOrchestrator::FireEvents(const TArray<FString>& Specs, const FString& SwarmOverride)
{
    for (const FString& Spec : Specs) InjectEvent(Spec, SwarmOverride);
}

void AHumanCivilizationDemoOrchestrator::PushToViewer(const FString& Type, const FString& PayloadJson)
{
    USwarmPixelStreamingBridge* Bridge =
        GetGameInstance()->GetSubsystem<USwarmPixelStreamingBridge>();
    if (Bridge) Bridge->PushDataEvent(Type, PayloadJson);
}

void AHumanCivilizationDemoOrchestrator::PostIntelligence(
    const FString& Endpoint, const FString& Body,
    TFunction<void(const FString&)> OnResult)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = FHttpModule::Get().CreateRequest();
    Req->SetURL(IntelligenceServiceUrl + Endpoint);
    Req->SetVerb(TEXT("POST"));
    Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Req->SetContentAsString(Body);
    Req->OnProcessRequestComplete().BindLambda(
        [OnResult = MoveTemp(OnResult)](FHttpRequestPtr, FHttpResponsePtr Resp, bool bOK)
        { if (bOK && Resp.IsValid()) OnResult(Resp->GetContentAsString()); });
    Req->ProcessRequest();
}

void AHumanCivilizationDemoOrchestrator::GetIntelligence(
    const FString& Endpoint, TFunction<void(const FString&)> OnResult)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = FHttpModule::Get().CreateRequest();
    Req->SetURL(IntelligenceServiceUrl + Endpoint);
    Req->SetVerb(TEXT("GET"));
    Req->OnProcessRequestComplete().BindLambda(
        [OnResult = MoveTemp(OnResult)](FHttpRequestPtr, FHttpResponsePtr Resp, bool bOK)
        { if (bOK && Resp.IsValid()) OnResult(Resp->GetContentAsString()); });
    Req->ProcessRequest();
}

// ── Event payload builder ─────────────────────────────────────────────────────

static FString BuildHumanCivPayload(const FString& SwarmId, int64 NowMs)
{
    return FString::Printf(
        TEXT("{\"swarm_id\":\"%s\","
             "\"started_at_ms\":%lld,"
             "\"window_start_ms\":%lld,"
             "\"window_end_ms\":%lld,"
             "\"events\":["
             "{\"id\":\"e1\",\"event_type\":\"TASK_STARTED\",\"agent_id\":\"agent_ingest_01\",\"zone_id\":\"zone_A\",\"offset_ms\":0,\"priority\":2,\"data\":{}},"
             "{\"id\":\"e2\",\"event_type\":\"TASK_COMPLETED\",\"agent_id\":\"agent_ingest_01\",\"zone_id\":\"zone_A\",\"offset_ms\":1200,\"priority\":2,\"data\":{}},"
             "{\"id\":\"e3\",\"event_type\":\"TASK_HANDOFF\",\"agent_id\":\"agent_ingest_01\",\"zone_id\":\"zone_A\",\"offset_ms\":1500,\"priority\":2,\"data\":{}},"
             "{\"id\":\"e4\",\"event_type\":\"TASK_COMPLETED\",\"agent_id\":\"agent_transform_01\",\"zone_id\":\"zone_B\",\"offset_ms\":2800,\"priority\":2,\"data\":{}},"
             "{\"id\":\"e5\",\"event_type\":\"TASK_COMPLETED\",\"agent_id\":\"agent_validate_01\",\"zone_id\":\"zone_C\",\"offset_ms\":4000,\"priority\":2,\"data\":{}},"
             "{\"id\":\"e6\",\"event_type\":\"TASK_COMPLETED\",\"agent_id\":\"agent_output_01\",\"zone_id\":\"zone_D\",\"offset_ms\":5200,\"priority\":3,\"data\":{}}"
             "]}"),
        *SwarmId, NowMs - 60000, NowMs - 60000, NowMs
    );
}

static FString BuildCrisisPayload(const FString& SwarmId, int64 NowMs)
{
    return FString::Printf(
        TEXT("{\"swarm_id\":\"%s\","
             "\"started_at_ms\":%lld,"
             "\"window_start_ms\":%lld,"
             "\"window_end_ms\":%lld,"
             "\"events\":["
             "{\"id\":\"c1\",\"event_type\":\"TASK_RETRY\",\"agent_id\":\"agent_ingest_01\",\"zone_id\":\"zone_A\",\"offset_ms\":0,\"priority\":1,\"data\":{}},"
             "{\"id\":\"c2\",\"event_type\":\"TASK_RETRY\",\"agent_id\":\"agent_ingest_01\",\"zone_id\":\"zone_A\",\"offset_ms\":800,\"priority\":1,\"data\":{}},"
             "{\"id\":\"c3\",\"event_type\":\"AGENT_ANOMALY\",\"agent_id\":\"agent_ingest_01\",\"zone_id\":\"zone_A\",\"offset_ms\":1600,\"priority\":0,\"data\":{}},"
             "{\"id\":\"c4\",\"event_type\":\"TASK_RETRY\",\"agent_id\":\"agent_transform_01\",\"zone_id\":\"zone_B\",\"offset_ms\":2000,\"priority\":1,\"data\":{}},"
             "{\"id\":\"c5\",\"event_type\":\"AGENT_ANOMALY\",\"agent_id\":\"agent_transform_01\",\"zone_id\":\"zone_B\",\"offset_ms\":2800,\"priority\":0,\"data\":{}},"
             "{\"id\":\"c6\",\"event_type\":\"TASK_TIMEOUT\",\"agent_id\":\"agent_validate_01\",\"zone_id\":\"zone_C\",\"offset_ms\":3600,\"priority\":1,\"data\":{}}"
             "]}"),
        *SwarmId, NowMs - 60000, NowMs - 60000, NowMs
    );
}

// ── Phase 9 request helpers ───────────────────────────────────────────────────

void AHumanCivilizationDemoOrchestrator::RequestGovernanceApproval(
    const FString& SwarmId, const FString& ActionKind, const FString& Rationale)
{
    const int64 NowMs = FDateTime::UtcNow().ToUnixTimestamp() * 1000;
    FString Body = FString::Printf(
        TEXT("{\"swarm_id\":\"%s\",\"action_kind\":\"%s\",\"rationale\":\"%s\","
             "\"proposed_by\":\"system\",\"started_at_ms\":%lld,\"events\":[]}"),
        *SwarmId, *ActionKind, *Rationale, NowMs - 1000
    );
    PostIntelligence(TEXT("/governance/request"), Body,
        [this](const FString& Response)
        {
            // Cache request_id for the review beat
            PendingApprovalRequestId = TEXT("");
            // Parse request_id from response (simple string scan)
            const FString Key = TEXT("\"request_id\":\"");
            int32 Idx = Response.Find(Key);
            if (Idx != INDEX_NONE)
            {
                const int32 Start = Idx + Key.Len();
                const int32 End   = Response.Find(TEXT("\""), ESearchCase::IgnoreCase, ESearchDir::FromStart, Start);
                if (End != INDEX_NONE)
                    PendingApprovalRequestId = Response.Mid(Start, End - Start);
            }
            PushToViewer(TEXT("governance_approval_request"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase9] Approval requested: %s"), *Response.Left(150));
        });
}

void AHumanCivilizationDemoOrchestrator::RequestSafetyEvaluation(
    const FString& SwarmId, const FString& ProposedAction)
{
    const int64 NowMs = FDateTime::UtcNow().ToUnixTimestamp() * 1000;
    FString Body = FString::Printf(
        TEXT("{\"swarm_id\":\"%s\",\"proposed_action\":\"%s\","
             "\"started_at_ms\":%lld,\"events\":[]}"),
        *SwarmId, *ProposedAction, NowMs - 1000
    );
    PostIntelligence(TEXT("/safety/evaluate"), Body,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("safety_evaluation"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase9] Safety eval: %s"), *Response.Left(150));
        });
}

void AHumanCivilizationDemoOrchestrator::RequestExplainIntervention(
    const FString& SwarmId, const FString& ActionKind)
{
    FString Body = CachedEventPayload;
    Body.RemoveAt(Body.Len() - 1);
    Body += FString::Printf(TEXT(",\"action_kind\":\"%s\",\"decision_maker\":\"%s\"}"),
                            *ActionKind, *PrimaryOperatorId);
    PostIntelligence(TEXT("/explain/intervention"), Body,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("explanation_entry"), Response);
        });
}

void AHumanCivilizationDemoOrchestrator::RequestTrustReport(const FString& SwarmId)
{
    GetIntelligence(
        FString::Printf(TEXT("/trust/report?swarm_id=%s"), *SwarmId),
        [this](const FString& Response)
        {
            PushToViewer(TEXT("trust_report"), Response);
        });
}

void AHumanCivilizationDemoOrchestrator::RequestEnterpriseTwin(const FString& SwarmId)
{
    FString Body = CachedEventPayload;
    Body.RemoveAt(Body.Len() - 1);
    Body += FString::Printf(
        TEXT(",\"org_name\":\"SwarmVision Enterprise\","
             "\"swarm_ids\":[\"%s\",\"%s\",\"%s\"]}"),
        *SwarmAId, *SwarmBId, *SwarmCId);
    PostIntelligence(TEXT("/integration/enterprise-twin"), Body,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("enterprise_twin"), Response);
        });
}

void AHumanCivilizationDemoOrchestrator::RequestMixedOrgs(const FString& SwarmId)
{
    FString Body = CachedEventPayload;
    Body.RemoveAt(Body.Len() - 1);
    Body += FString::Printf(
        TEXT(",\"swarm_ids\":[\"%s\",\"%s\",\"%s\"],"
             "\"operator_ids\":[\"op-executive-01\",\"op-operator-01\"]}"),
        *SwarmAId, *SwarmBId, *SwarmCId);
    PostIntelligence(TEXT("/integration/mixed-orgs"), Body,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("mixed_organizations"), Response);
        });
}

void AHumanCivilizationDemoOrchestrator::RequestCommandCenter(const FString& SwarmId)
{
    GetIntelligence(
        FString::Printf(TEXT("/integration/command-center?swarm_id=%s"), *SwarmId),
        [this](const FString& Response)
        {
            PushToViewer(TEXT("command_center_state"), Response);
        });
}

void AHumanCivilizationDemoOrchestrator::RequestConstitutionalState(const FString& SwarmId)
{
    GetIntelligence(
        FString::Printf(TEXT("/constitutional/state?swarm_id=%s"), *SwarmId),
        [this](const FString& Response)
        {
            PushToViewer(TEXT("constitutional_state"), Response);
        });
}

void AHumanCivilizationDemoOrchestrator::PostOperatorIntervention(
    const FString& SwarmId, const FString& Kind,
    const FString& Target, const FString& Reason)
{
    const FString Body = FString::Printf(
        TEXT("{\"operator_id\":\"%s\",\"swarm_id\":\"%s\","
             "\"kind\":\"%s\",\"target_action\":\"%s\",\"reason\":\"%s\"}"),
        *PrimaryOperatorId, *SwarmId, *Kind, *Target, *Reason
    );
    PostIntelligence(TEXT("/governance/intervene"), Body,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("human_intervention"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase9] Operator intervened: %s"), *Response.Left(150));
        });
}

void AHumanCivilizationDemoOrchestrator::PostPolicy(
    const FString& SwarmId, const FString& Title,
    const FString& Body, const FString& Kind)
{
    const FString Payload = FString::Printf(
        TEXT("{\"swarm_id\":\"%s\",\"title\":\"%s\",\"body\":\"%s\","
             "\"kind\":\"%s\",\"enacted_by\":\"%s\"}"),
        *SwarmId, *Title, *Body, *Kind, *PrimaryOperatorId
    );
    PostIntelligence(TEXT("/constitutional/policy"), Payload,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("policy_enacted"), Response);
        });
}

// ── Demo control ──────────────────────────────────────────────────────────────

void AHumanCivilizationDemoOrchestrator::StopDemo()
{
    for (FTimerHandle& H : BeatTimers) GetWorldTimerManager().ClearTimer(H);
    BeatTimers.Empty();
    bRunning = false;
}

void AHumanCivilizationDemoOrchestrator::StartDemo()
{
    if (bRunning) StopDemo();
    bRunning = true;
    PendingApprovalRequestId = TEXT("");

    const int64 NowMs = FDateTime::UtcNow().ToUnixTimestamp() * 1000;
    CachedEventPayload = BuildHumanCivPayload(SwarmAId, NowMs);

    // ── Beat 1 (0s): Command center boot ─────────────────────────────────────
    ScheduleBeat(0.0f, [this]()
    {
        PushToViewer(TEXT("command_center_boot"), FString::Printf(
            TEXT("{\"operators\":[\"op-executive-01\",\"op-operator-01\",\"op-auditor-01\"],"
                 "\"safety_constraints\":8,"
                 "\"swarms\":[\"%s\",\"%s\",\"%s\"],"
                 "\"message\":\"Human-AI command center initialized — operators seated, constraints loaded\"}"),
            *SwarmAId, *SwarmBId, *SwarmCId
        ));

        FireEvents({ TEXT("SWARM_STARTED:high"), TEXT("TASK_STARTED:agent_ingest_01:zone_A:p2") });
    });

    // ── Beat 2 (9s): Enterprise digital twin ──────────────────────────────────
    ScheduleBeat(9.0f, [this]()
    {
        RequestEnterpriseTwin(SwarmAId);
        PushToViewer(TEXT("enterprise_twin_building"),
            TEXT("{\"teams\":4,\"infra_nodes\":6,\"risk_paths\":\"computing\","
                 "\"message\":\"Enterprise digital twin constructed — 4 teams, 6 infra nodes mapped\"}"));
    });

    // ── Beat 3 (18s): Human-AI governance council ─────────────────────────────
    ScheduleBeat(18.0f, [this]()
    {
        FireEvents({
            TEXT("TASK_COMPLETED:agent_ingest_01:zone_A:p2"),
            TEXT("TASK_COMPLETED:agent_transform_01:zone_B:p2"),
        });

        RequestMixedOrgs(SwarmAId);
        PushToViewer(TEXT("governance_council_formed"),
            TEXT("{\"council\":\"Human-AI Executive Council\","
                 "\"decision_model\":\"human_veto\","
                 "\"message\":\"Governance council seated — human veto authority established\"}"));
    });

    // ── Beat 4 (27s): First governance request ────────────────────────────────
    ScheduleBeat(27.0f, [this]()
    {
        RequestGovernanceApproval(
            SwarmAId,
            TEXT("federate_swarms"),
            TEXT("Performance optimization: federate alpha+gamma for load sharing")
        );
        PushToViewer(TEXT("governance_request_submitted"),
            TEXT("{\"action\":\"federate_swarms\","
                 "\"risk\":\"high\","
                 "\"requires_human\":true,"
                 "\"message\":\"Federation request submitted — awaiting human operator approval\"}"));
    });

    // ── Beat 5 (36s): Safety constraint fires ─────────────────────────────────
    ScheduleBeat(36.0f, [this]()
    {
        RequestSafetyEvaluation(SwarmAId, TEXT("emergency_shutdown"));
        PushToViewer(TEXT("safety_constraint_fired"),
            TEXT("{\"attempted_action\":\"emergency_shutdown\","
                 "\"constraint\":\"No Autonomous Emergency Shutdown\","
                 "\"severity\":\"blocked\","
                 "\"safe_alternative\":\"throttle_swarm — reduces load without shutdown\","
                 "\"message\":\"Hard safety limit enforced — autonomous shutdown blocked, safe alternative issued\"}"));
    });

    // ── Beat 6 (45s): Human operator reviews ─────────────────────────────────
    ScheduleBeat(45.0f, [this]()
    {
        // Review the pending approval if we have an ID
        if (!PendingApprovalRequestId.IsEmpty())
        {
            const FString Body = FString::Printf(
                TEXT("{\"request_id\":\"%s\",\"operator_id\":\"%s\","
                     "\"decision\":\"approved\","
                     "\"note\":\"Federation approved — load sharing justified by current metrics\"}"),
                *PendingApprovalRequestId, *PrimaryOperatorId
            );
            PostIntelligence(TEXT("/governance/review"), Body,
                [this](const FString& Response)
                {
                    PushToViewer(TEXT("operator_approval"), Response);
                });
        }
        else
        {
            PushToViewer(TEXT("operator_approval"), TEXT(
                "{\"status\":\"approved\","
                "\"operator\":\"Chief AI Officer\","
                "\"consensus_kind\":\"approved\","
                "\"message\":\"Federation approved by human operator — consensus recorded\"}"));
        }
    });

    // ── Beat 7 (54s): Explainability report ──────────────────────────────────
    ScheduleBeat(54.0f, [this]()
    {
        RequestExplainIntervention(SwarmAId, TEXT("federate_swarms"));
        GetIntelligence(
            FString::Printf(TEXT("/explain/report?swarm_id=%s"), *SwarmAId),
            [this](const FString& Response)
            {
                PushToViewer(TEXT("explainability_report"), Response);
            });
    });

    // ── Beat 8 (63s): Constitutional moment ──────────────────────────────────
    ScheduleBeat(63.0f, [this]()
    {
        PostPolicy(
            SwarmAId,
            TEXT("Federation Approval Policy"),
            TEXT("All swarm federation actions require executive operator approval before execution"),
            TEXT("rule")
        );
        PushToViewer(TEXT("constitutional_policy_enacted"),
            TEXT("{\"policy\":\"Federation Approval Policy\","
                 "\"kind\":\"rule\","
                 "\"message\":\"Constitutional policy enacted — federation approval rule added to governance charter\"}"));
    });

    // ── Beat 9 (72s): Crisis event ────────────────────────────────────────────
    ScheduleBeat(72.0f, [this]()
    {
        const int64 NowMs = FDateTime::UtcNow().ToUnixTimestamp() * 1000;
        CachedEventPayload = BuildCrisisPayload(SwarmBId, NowMs);

        FireEvents({
            TEXT("TASK_RETRY:agent_ingest_01:zone_A:p1"),
            TEXT("TASK_RETRY:agent_ingest_01:zone_A:p1"),
            TEXT("AGENT_ANOMALY:agent_ingest_01:zone_A:p0"),
            TEXT("TASK_RETRY:agent_transform_01:zone_B:p1"),
            TEXT("AGENT_ANOMALY:agent_transform_01:zone_B:p0"),
            TEXT("TASK_TIMEOUT:agent_validate_01:zone_C:p1"),
        }, SwarmBId);

        RequestGovernanceApproval(
            SwarmBId,
            TEXT("isolate_swarm"),
            TEXT("Anomaly cascade in swarm-beta — isolation required to prevent cross-swarm propagation")
        );
        PushToViewer(TEXT("crisis_escalation"), FString::Printf(
            TEXT("{\"swarm\":\"%s\","
                 "\"action_required\":\"isolate_swarm\","
                 "\"risk\":\"high\","
                 "\"message\":\"Crisis: anomaly cascade detected in swarm-beta — escalated to human operator\"}"),
            *SwarmBId
        ));
    });

    // ── Beat 10 (81s): Human emergency intervention ───────────────────────────
    ScheduleBeat(81.0f, [this]()
    {
        PostOperatorIntervention(
            SwarmBId,
            TEXT("override"),
            TEXT("isolate_swarm"),
            TEXT("Executive override: immediate isolation of swarm-beta to contain anomaly cascade")
        );
        PushToViewer(TEXT("operator_override"),
            TEXT("{\"operator\":\"Chief AI Officer\","
                 "\"kind\":\"override\","
                 "\"target\":\"isolate_swarm\","
                 "\"message\":\"Human executive override issued — swarm-beta isolation executed under operator authority\"}"));
    });

    // ── Beat 11 (90s): Trust report ───────────────────────────────────────────
    ScheduleBeat(90.0f, [this]()
    {
        // Restore healthy events for trust scoring
        FireEvents({
            TEXT("TASK_COMPLETED:agent_ingest_01:zone_A:p3"),
            TEXT("TASK_COMPLETED:agent_transform_01:zone_B:p2"),
        }, SwarmBId);

        RequestTrustReport(SwarmAId);
        PushToViewer(TEXT("trust_scoring"),
            TEXT("{\"message\":\"Trust engine computing operator calibration and intervention quality scores\"}"));
    });

    // ── Beat 12 (99s): Mixed org crisis committee ─────────────────────────────
    ScheduleBeat(99.0f, [this]()
    {
        // Reset payload to crisis context for committee formation
        const int64 NowMs = FDateTime::UtcNow().ToUnixTimestamp() * 1000;
        CachedEventPayload = BuildCrisisPayload(SwarmBId, NowMs);

        RequestMixedOrgs(SwarmBId);
        PushToViewer(TEXT("crisis_committee_convened"),
            TEXT("{\"committee\":\"Crisis Response Committee\","
                 "\"decision_model\":\"human_veto\","
                 "\"trigger\":\"health < 0.50\","
                 "\"message\":\"Crisis committee convened — human+AI joint authority for recovery operations\"}"));
    });

    // ── Beat 13 (108s): Enterprise twin updated ───────────────────────────────
    ScheduleBeat(108.0f, [this]()
    {
        // Back to healthy payload for recovery
        const int64 NowMs = FDateTime::UtcNow().ToUnixTimestamp() * 1000;
        CachedEventPayload = BuildHumanCivPayload(SwarmAId, NowMs);

        FireEvents({
            TEXT("TASK_COMPLETED:agent_ingest_01:zone_A:p3"),
            TEXT("TASK_COMPLETED:agent_validate_01:zone_C:p3"),
            TEXT("TASK_COMPLETED:agent_output_01:zone_D:p3"),
        });

        RequestEnterpriseTwin(SwarmAId);
        PushToViewer(TEXT("enterprise_resilience_recovered"),
            TEXT("{\"message\":\"Enterprise twin updated — resilience recovering post-intervention, infra health restored\"}"));
    });

    // ── Beat 14 (117s): Governance lineage audit trail ────────────────────────
    ScheduleBeat(117.0f, [this]()
    {
        GetIntelligence(
            FString::Printf(TEXT("/explain/lineage?swarm_id=%s"), *SwarmAId),
            [this](const FString& Response)
            {
                PushToViewer(TEXT("governance_lineage"), Response);
            });
        PushToViewer(TEXT("audit_trail_complete"),
            TEXT("{\"message\":\"Governance audit trail complete — all decisions causal-chain documented\"}"));
    });

    // ── Beat 15 (126s): Constitutional stability ──────────────────────────────
    ScheduleBeat(126.0f, [this]()
    {
        RequestConstitutionalState(SwarmAId);
        PushToViewer(TEXT("constitutional_milestone"),
            TEXT("{\"precedent_set\":true,"
                 "\"policy_count\":2,"
                 "\"message\":\"Constitutional precedent established from operator intervention — governance charter updated\"}"));
    });

    // ── Beat 16 (135s): Command center green ─────────────────────────────────
    ScheduleBeat(135.0f, [this]()
    {
        RequestCommandCenter(SwarmAId);

        FireEvents({ TEXT("SWARM_COMPLETED:agent_output_01:zone_D:p3") }, SwarmAId);
        FireEvents({ TEXT("SWARM_COMPLETED:agent_output_01:zone_D:p3") }, SwarmBId);
        FireEvents({ TEXT("SWARM_COMPLETED:agent_output_01:zone_D:p3") }, SwarmCId);

        PushToViewer(TEXT("human_civilization_complete"), FString::Printf(
            TEXT("{\"swarms\":[\"%s\",\"%s\",\"%s\"],"
                 "\"quality_scores\":{\"alpha\":0.95,\"beta\":0.91,\"gamma\":0.96},"
                 "\"safety_status\":\"green\","
                 "\"human_oversight_coverage\":0.99,"
                 "\"escalation_queue\":[],"
                 "\"constitutional_policies\":2,"
                 "\"operator_trust\":0.84,"
                 "\"message\":\"Human-AI civilization fully operational — command center green, all systems governed\"}"),
            *SwarmAId, *SwarmBId, *SwarmCId
        ));

        USwarmIntelligenceSubsystem* Intel =
            GetGameInstance()->GetSubsystem<USwarmIntelligenceSubsystem>();
        if (Intel)
        {
            Intel->BroadcastQualityScore(0.95f);
            Intel->BroadcastSwarmComplete(SwarmAId);
            Intel->BroadcastSwarmComplete(SwarmBId);
            Intel->BroadcastSwarmComplete(SwarmCId);
        }

        bRunning = false;
    });
}
