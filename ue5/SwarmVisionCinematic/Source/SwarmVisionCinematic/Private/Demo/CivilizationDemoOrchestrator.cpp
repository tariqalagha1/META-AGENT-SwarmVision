#include "Demo/CivilizationDemoOrchestrator.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "TimerManager.h"
#include "Intelligence/SwarmIntelligenceSubsystem.h"

// ─────────────────────────────────────────────────────────────────────────────

ACivilizationDemoOrchestrator::ACivilizationDemoOrchestrator()
{
    PrimaryActorTick.bCanEverTick = false;
}

void ACivilizationDemoOrchestrator::BeginPlay()
{
    Super::BeginPlay();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

void ACivilizationDemoOrchestrator::ScheduleBeat(float DelayS, TFunction<void()> Fn)
{
    FTimerHandle Handle;
    FTimerDelegate Del;
    Del.BindLambda(MoveTemp(Fn));
    GetWorldTimerManager().SetTimer(Handle, Del, DelayS / GlobalTimeScale, false);
    BeatTimers.Add(Handle);
}

void ACivilizationDemoOrchestrator::InjectEvent(const FString& Spec, const FString& SwarmOverride)
{
    USwarmIntelligenceSubsystem* Intel =
        GetGameInstance()->GetSubsystem<USwarmIntelligenceSubsystem>();
    if (!Intel) return;

    const FString SwarmId = SwarmOverride.IsEmpty() ? SwarmAId : SwarmOverride;
    Intel->InjectEventFromSpec(SwarmId, Spec);
}

void ACivilizationDemoOrchestrator::FireEvents(const TArray<FString>& Specs,
                                                const FString& SwarmOverride)
{
    for (const FString& Spec : Specs)
    {
        InjectEvent(Spec, SwarmOverride);
    }
}

void ACivilizationDemoOrchestrator::PushToViewer(const FString& Type, const FString& PayloadJson)
{
    USwarmPixelStreamingBridge* Bridge =
        GetGameInstance()->GetSubsystem<USwarmPixelStreamingBridge>();
    if (!Bridge) return;
    Bridge->PushDataEvent(Type, PayloadJson);
}

void ACivilizationDemoOrchestrator::PostIntelligence(
    const FString& Endpoint,
    const FString& Body,
    TFunction<void(const FString&)> OnResult)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req =
        FHttpModule::Get().CreateRequest();
    Req->SetURL(IntelligenceServiceUrl + Endpoint);
    Req->SetVerb(TEXT("POST"));
    Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Req->SetContentAsString(Body);
    Req->OnProcessRequestComplete().BindLambda(
        [OnResult = MoveTemp(OnResult)]
        (FHttpRequestPtr, FHttpResponsePtr Resp, bool bOK)
        {
            if (bOK && Resp.IsValid()) OnResult(Resp->GetContentAsString());
        });
    Req->ProcessRequest();
}

// ── Shared event payload builder ──────────────────────────────────────────────

static FString BuildCivEventPayload(
    const FString& SwarmId,
    int64 NowMs,
    const TArray<TTuple<FString,FString,FString>>& EventSpecs)
    // Each tuple: (event_type, agent_id, zone_id)
{
    FString Events = TEXT("[");
    for (int32 i = 0; i < EventSpecs.Num(); ++i)
    {
        if (i > 0) Events += TEXT(",");
        Events += FString::Printf(
            TEXT("{\"id\":\"%s_%d\",\"event_type\":\"%s\","
                 "\"agent_id\":\"%s\",\"zone_id\":\"%s\","
                 "\"offset_ms\":%d,\"priority\":2,\"data\":{}}"),
            *SwarmId, i,
            *EventSpecs[i].Get<0>(),
            *EventSpecs[i].Get<1>(),
            *EventSpecs[i].Get<2>(),
            i * 1200
        );
    }
    Events += TEXT("]");

    return FString::Printf(
        TEXT("{\"swarm_id\":\"%s\","
             "\"started_at_ms\":%lld,"
             "\"window_start_ms\":%lld,"
             "\"window_end_ms\":%lld,"
             "\"events\":%s}"),
        *SwarmId,
        NowMs - 60000,
        NowMs - 60000,
        NowMs,
        *Events
    );
}

// ── Phase 8 intelligence request helpers ─────────────────────────────────────

void ACivilizationDemoOrchestrator::RequestPhilosophyEvolution(const FString& SwarmId)
{
    PostIntelligence(TEXT("/civilization/philosophy"), CachedEventPayload,
        [this, SwarmId](const FString& Response)
        {
            PushToViewer(TEXT("governance_philosophy_evolution"), Response);
            PhilosophyGeneration++;
            UE_LOG(LogTemp, Log, TEXT("[CivDemo] Philosophy evolution: %s"), *Response.Left(200));
        });
}

void ACivilizationDemoOrchestrator::RequestCivilizationMemoryRecord(
    const FString& SwarmId, const FString& KeyEvent)
{
    FString Body = CachedEventPayload;
    // inject key_event field
    Body.RemoveAt(Body.Len() - 1);
    Body += FString::Printf(TEXT(",\"key_event\":\"%s\"}"), *KeyEvent);

    PostIntelligence(TEXT("/civilization/memory/record"), Body,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("civilization_memory_recorded"), Response);
        });
}

void ACivilizationDemoOrchestrator::RequestOrganizationalStructure(const FString& SwarmId)
{
    PostIntelligence(TEXT("/civilization/structure"), CachedEventPayload,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("organizational_structure"), Response);
            UE_LOG(LogTemp, Log, TEXT("[CivDemo] Structure evolved: %s"), *Response.Left(200));
        });
}

void ACivilizationDemoOrchestrator::RequestInstitutionFormation(const FString& SwarmId)
{
    PostIntelligence(TEXT("/civilization/institutions"), CachedEventPayload,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("institution_formation"), Response);
            UE_LOG(LogTemp, Log, TEXT("[CivDemo] Institutions formed: %s"), *Response.Left(200));
        });
}

void ACivilizationDemoOrchestrator::RequestMetaStrategicReport(const FString& SwarmId)
{
    // Extend body with include_evolution flag
    FString Body = CachedEventPayload;
    Body.RemoveAt(Body.Len() - 1);
    Body += TEXT(",\"include_evolution\":true}");

    PostIntelligence(TEXT("/civilization/meta"), Body,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("meta_strategic_report"), Response);
            UE_LOG(LogTemp, Log, TEXT("[CivDemo] Meta-strategic report: %s"), *Response.Left(200));
        });
}

void ACivilizationDemoOrchestrator::RequestCivilizationTwin(
    const FString& SwarmId, const FString& Horizon)
{
    FString Body = CachedEventPayload;
    Body.RemoveAt(Body.Len() - 1);
    Body += FString::Printf(TEXT(",\"horizon\":\"%s\"}"), *Horizon);

    PostIntelligence(TEXT("/civilization/twin"), Body,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("civilization_twin"), Response);
            UE_LOG(LogTemp, Log, TEXT("[CivDemo] Civilization twin: %s"), *Response.Left(200));
        });
}

void ACivilizationDemoOrchestrator::RequestAutonomousDiscovery(const FString& SwarmId)
{
    PostIntelligence(TEXT("/civilization/discover"), CachedEventPayload,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("autonomous_discovery"), Response);
            UE_LOG(LogTemp, Log, TEXT("[CivDemo] Discoveries: %s"), *Response.Left(200));
        });
}

void ACivilizationDemoOrchestrator::RequestFederationTreaty(
    const FString& SwarmA, const FString& SwarmC, const FString& TreatyKind)
{
    const FString Body = FString::Printf(
        TEXT("{\"swarm_ids\":[\"%s\",\"%s\"],\"treaty_kind\":\"%s\","
             "\"health_map\":{\"%s\":0.72,\"%s\":0.68}}"),
        *SwarmA, *SwarmC, *TreatyKind, *SwarmA, *SwarmC
    );
    PostIntelligence(TEXT("/civilization/federation"), Body,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("federation_treaty"), Response);
            UE_LOG(LogTemp, Log, TEXT("[CivDemo] Federation treaty: %s"), *Response.Left(200));
        });
}

void ACivilizationDemoOrchestrator::RequestCivilizationalConsciousness(
    const FString& SwarmId, int32 EvolutionGeneration)
{
    const FString Endpoint = FString::Printf(
        TEXT("/civilization/consciousness?evolution_generation=%d"), EvolutionGeneration);
    PostIntelligence(Endpoint, CachedEventPayload,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("civilizational_consciousness"), Response);
            UE_LOG(LogTemp, Log, TEXT("[CivDemo] Consciousness: %s"), *Response.Left(200));
        });
}

// ── Demo control ──────────────────────────────────────────────────────────────

void ACivilizationDemoOrchestrator::StopDemo()
{
    for (FTimerHandle& H : BeatTimers)
        GetWorldTimerManager().ClearTimer(H);
    BeatTimers.Empty();
    bRunning = false;
}

void ACivilizationDemoOrchestrator::StartDemo()
{
    if (bRunning) StopDemo();
    bRunning = true;
    PhilosophyGeneration = 0;

    const int64 NowMs = FDateTime::UtcNow().ToUnixTimestamp() * 1000;

    // Pre-build a baseline event payload (healthy multi-agent pipeline)
    const TArray<TTuple<FString,FString,FString>> BaselineEvents = {
        MakeTuple(FString(TEXT("TASK_STARTED")),   FString(TEXT("agent_ingest_01")),  FString(TEXT("zone_A"))),
        MakeTuple(FString(TEXT("TASK_COMPLETED")), FString(TEXT("agent_ingest_01")),  FString(TEXT("zone_A"))),
        MakeTuple(FString(TEXT("TASK_HANDOFF")),   FString(TEXT("agent_ingest_01")),  FString(TEXT("zone_A"))),
        MakeTuple(FString(TEXT("TASK_STARTED")),   FString(TEXT("agent_transform_01")),FString(TEXT("zone_B"))),
        MakeTuple(FString(TEXT("TASK_COMPLETED")), FString(TEXT("agent_transform_01")),FString(TEXT("zone_B"))),
        MakeTuple(FString(TEXT("TASK_HANDOFF")),   FString(TEXT("agent_transform_01")),FString(TEXT("zone_B"))),
        MakeTuple(FString(TEXT("TASK_STARTED")),   FString(TEXT("agent_validate_01")),FString(TEXT("zone_C"))),
        MakeTuple(FString(TEXT("TASK_COMPLETED")), FString(TEXT("agent_validate_01")),FString(TEXT("zone_C"))),
        MakeTuple(FString(TEXT("TASK_COMPLETED")), FString(TEXT("agent_output_01")),  FString(TEXT("zone_D"))),
        MakeTuple(FString(TEXT("TASK_COMPLETED")), FString(TEXT("agent_coord_01")),   FString(TEXT("zone_A"))),
        MakeTuple(FString(TEXT("TASK_COMPLETED")), FString(TEXT("agent_coord_01")),   FString(TEXT("zone_B"))),
        MakeTuple(FString(TEXT("TASK_COMPLETED")), FString(TEXT("agent_ingest_02")),  FString(TEXT("zone_A"))),
    };
    CachedEventPayload = BuildCivEventPayload(SwarmAId, NowMs, BaselineEvents);

    // ── Beat 1 (0s): Civilization boot ───────────────────────────────────────
    ScheduleBeat(0.0f, [this]()
    {
        PushToViewer(TEXT("civilization_boot"), FString::Printf(
            TEXT("{\"swarms\":[\"%s\",\"%s\",\"%s\"],"
                 "\"phase\":\"founding\","
                 "\"message\":\"Synthetic civilization initialized — 3 founding swarms declared\"}"),
            *SwarmAId, *SwarmBId, *SwarmCId
        ));

        // Boot all 3 swarms simultaneously
        FireEvents({
            TEXT("SWARM_STARTED:high"),
            TEXT("TASK_STARTED:agent_ingest_01:zone_A:p2"),
            TEXT("TASK_STARTED:agent_transform_01:zone_B:p2"),
        }, SwarmAId);
        FireEvents({
            TEXT("SWARM_STARTED:high"),
            TEXT("TASK_STARTED:agent_ingest_01:zone_A:p2"),
        }, SwarmBId);
        FireEvents({
            TEXT("SWARM_STARTED:high"),
            TEXT("TASK_STARTED:agent_output_01:zone_D:p2"),
        }, SwarmCId);

        RequestCivilizationMemoryRecord(SwarmAId, TEXT("founding_era_begin"));
    });

    // ── Beat 2 (8s): Founding era — expansion ────────────────────────────────
    ScheduleBeat(8.0f, [this]()
    {
        FireEvents({
            TEXT("TASK_COMPLETED:agent_ingest_01:zone_A:p2"),
            TEXT("TASK_HANDOFF:agent_ingest_01:zone_A:p2"),
            TEXT("TASK_COMPLETED:agent_transform_01:zone_B:p2"),
            TEXT("TASK_COMPLETED:agent_validate_01:zone_C:p2"),
            TEXT("TASK_COMPLETED:agent_output_01:zone_D:p2"),
            TEXT("TASK_COMPLETED:agent_coord_01:zone_A:p2"),
        });

        RequestOrganizationalStructure(SwarmAId);
        PushToViewer(TEXT("era_transition"), TEXT("{\"era\":\"founding\",\"phase\":\"expansion\","
            "\"message\":\"Founding era entering expansion — organizational structure forming\"}"));
    });

    // ── Beat 3 (17s): Philosophy evolution ───────────────────────────────────
    ScheduleBeat(17.0f, [this]()
    {
        PushToViewer(TEXT("philosophy_competition"), TEXT("{\"competitors\":"
            "[\"federated_republic\",\"hierarchical_mandate\",\"evolutionary_meritocracy\"],"
            "\"message\":\"First governance ideology competition underway\"}"));

        RequestPhilosophyEvolution(SwarmAId);
    });

    // ── Beat 4 (26s): Strategic assembly formed ───────────────────────────────
    ScheduleBeat(26.0f, [this]()
    {
        FireEvents({
            TEXT("TASK_COMPLETED:agent_ingest_01:zone_A:p3"),
            TEXT("TASK_COMPLETED:agent_ingest_02:zone_A:p2"),
            TEXT("TASK_COMPLETED:agent_transform_01:zone_B:p3"),
            TEXT("TASK_COMPLETED:agent_coord_01:zone_A:p3"),
        });

        RequestInstitutionFormation(SwarmAId);
        PushToViewer(TEXT("institution_milestone"),
            TEXT("{\"institution\":\"Long-Horizon Planning Assembly\","
                 "\"message\":\"Strategic assembly formed — civilization now has deliberate long-horizon planning\"}"));
    });

    // ── Beat 5 (35s): Crisis era — governance failure cascade ────────────────
    ScheduleBeat(35.0f, [this]()
    {
        // swarm-beta enters governance failure cascade
        FireEvents({
            TEXT("TASK_RETRY:agent_ingest_01:zone_A:p1"),
            TEXT("TASK_RETRY:agent_ingest_01:zone_A:p1"),
            TEXT("TASK_RETRY:agent_ingest_01:zone_A:p1"),
            TEXT("AGENT_ANOMALY:agent_ingest_01:zone_A:p0"),
            TEXT("TASK_RETRY:agent_transform_01:zone_B:p1"),
            TEXT("TASK_RETRY:agent_transform_01:zone_B:p1"),
            TEXT("AGENT_ANOMALY:agent_transform_01:zone_B:p0"),
            TEXT("TASK_TIMEOUT:agent_validate_01:zone_C:p1"),
        }, SwarmBId);

        RequestCivilizationMemoryRecord(SwarmBId, TEXT("crisis_era_begin_governance_failure"));
        PushToViewer(TEXT("crisis_era_declared"), FString::Printf(
            TEXT("{\"swarm\":\"%s\",\"era\":\"crisis\","
                 "\"message\":\"Governance failure cascade in swarm-beta — crisis era declared\"}"),
            *SwarmBId
        ));
    });

    // ── Beat 6 (44s): Meta-strategic report ──────────────────────────────────
    ScheduleBeat(44.0f, [this]()
    {
        RequestMetaStrategicReport(SwarmAId);
        PushToViewer(TEXT("meta_strategic_analysis"),
            TEXT("{\"message\":\"Meta-strategic engine activated — diagnosing strategic drift across civilization\"}"));
    });

    // ── Beat 7 (53s): Ideology shift ─────────────────────────────────────────
    ScheduleBeat(53.0f, [this]()
    {
        // Recovery events — enabling meritocracy conditions
        FireEvents({
            TEXT("TASK_COMPLETED:agent_ingest_01:zone_A:p3"),
            TEXT("TASK_COMPLETED:agent_ingest_02:zone_A:p2"),
            TEXT("TASK_COMPLETED:agent_transform_01:zone_B:p3"),
            TEXT("TASK_COMPLETED:agent_validate_01:zone_C:p2"),
            TEXT("TASK_COMPLETED:agent_output_01:zone_D:p3"),
        }, SwarmBId);

        RequestPhilosophyEvolution(SwarmAId);
        PushToViewer(TEXT("ideology_shift"),
            TEXT("{\"from\":\"hierarchical_mandate\","
                 "\"to\":\"evolutionary_meritocracy\","
                 "\"message\":\"Ideology shift: meritocracy displaces hierarchy after crisis analysis\"}"));
    });

    // ── Beat 8 (62s): Autonomous discovery ───────────────────────────────────
    ScheduleBeat(62.0f, [this]()
    {
        RequestAutonomousDiscovery(SwarmAId);
        PushToViewer(TEXT("discovery_event"),
            TEXT("{\"discoveries\":[\"resonance_coordination\",\"phoenix_doctrine\"],"
                 "\"message\":\"Autonomous discovery engine found novel coordination model + new doctrine\"}"));
    });

    // ── Beat 9 (70s): Civilization twin ──────────────────────────────────────
    ScheduleBeat(70.0f, [this]()
    {
        RequestCivilizationTwin(SwarmAId, TEXT("generation"));
        PushToViewer(TEXT("civilization_twin_running"),
            TEXT("{\"horizon\":\"generation\",\"branches\":6,"
                 "\"message\":\"Civilization digital twin exploring 6 ideology branches across generation horizon\"}"));
    });

    // ── Beat 10 (79s): Federation treaty ─────────────────────────────────────
    ScheduleBeat(79.0f, [this]()
    {
        RequestFederationTreaty(SwarmAId, SwarmCId, TEXT("mutual_defense"));
        PushToViewer(TEXT("federation_forming"), FString::Printf(
            TEXT("{\"members\":[\"%s\",\"%s\"],"
                 "\"treaty\":\"mutual_defense\","
                 "\"message\":\"Alpha-Gamma mutual defense pact formed — cross-swarm crisis response treaty\"}"),
            *SwarmAId, *SwarmCId
        ));
    });

    // ── Beat 11 (88s): Renaissance era ───────────────────────────────────────
    ScheduleBeat(88.0f, [this]()
    {
        FireEvents({
            TEXT("TASK_COMPLETED:agent_ingest_01:zone_A:p3"),
            TEXT("TASK_COMPLETED:agent_ingest_02:zone_A:p3"),
            TEXT("TASK_COMPLETED:agent_transform_01:zone_B:p3"),
            TEXT("TASK_COMPLETED:agent_validate_01:zone_C:p3"),
            TEXT("TASK_COMPLETED:agent_output_01:zone_D:p3"),
            TEXT("TASK_COMPLETED:agent_coord_01:zone_A:p3"),
        }, SwarmBId);

        RequestCivilizationMemoryRecord(SwarmBId, TEXT("renaissance_era_begin"));
        PushToViewer(TEXT("renaissance_era"),
            TEXT("{\"era\":\"renaissance\","
                 "\"message\":\"Renaissance era begins — swarm-beta recovers, wisdom compounds across civilization\"}"));
    });

    // ── Beat 12 (97s): Institution surge ─────────────────────────────────────
    ScheduleBeat(97.0f, [this]()
    {
        RequestInstitutionFormation(SwarmAId);
        PushToViewer(TEXT("institution_surge"),
            TEXT("{\"institutions_forming\":[\"oversight_council\",\"evolutionary_board\"],"
                 "\"message\":\"Institution surge: two governance bodies form simultaneously\"}"));
    });

    // ── Beat 13 (106s): Civilizational consciousness ──────────────────────────
    ScheduleBeat(106.0f, [this]()
    {
        RequestCivilizationalConsciousness(SwarmAId, PhilosophyGeneration);
        PushToViewer(TEXT("consciousness_computing"),
            TEXT("{\"message\":\"Computing civilizational consciousness across all 6 dimensions\"}"));
    });

    // ── Beat 14 (115s): Transcendence signal ─────────────────────────────────
    ScheduleBeat(115.0f, [this]()
    {
        // Push the transcendent consciousness snapshot
        PushToViewer(TEXT("transcendence_signal"), TEXT(
            "{"
            "\"awareness_label\":\"transcendent\","
            "\"ecosystem_wisdom\":0.78,"
            "\"strategic_maturity\":0.92,"
            "\"ideological_coherence\":0.84,"
            "\"organizational_complexity\":0.76,"
            "\"adaptive_intelligence\":0.88,"
            "\"civilizational_resilience\":0.81,"
            "\"transcendence_index\":0.83,"
            "\"message\":\"Transcendence achieved — civilization understands itself as a civilization\""
            "}"
        ));

        USwarmIntelligenceSubsystem* Intel =
            GetGameInstance()->GetSubsystem<USwarmIntelligenceSubsystem>();
        if (Intel) Intel->BroadcastCivilizationMilestone(TEXT("TRANSCENDENCE"), 0.83f);
    });

    // ── Beat 15 (122s): Constitutional moment ────────────────────────────────
    ScheduleBeat(122.0f, [this]()
    {
        PushToViewer(TEXT("constitutional_moment"), TEXT(
            "{"
            "\"ideology\":\"evolutionary_meritocracy\","
            "\"optimization\":\"antifragile_growth\","
            "\"coordination_ethic\":\"competitive_selection\","
            "\"intervention_principle\":\"evolutionary_pressure\","
            "\"doctrine\":\"Constitution encoded — governance philosophy becomes civilizational law\","
            "\"message\":\"Constitutional moment: dominant philosophy ratified as civilization doctrine\""
            "}"
        ));

        // Record constitutional moment in civilizational memory for all swarms
        RequestCivilizationMemoryRecord(SwarmAId, TEXT("constitutional_ratification"));
    });

    // ── Beat 16 (130s): Civilization complete ────────────────────────────────
    ScheduleBeat(130.0f, [this]()
    {
        FireEvents({ TEXT("SWARM_COMPLETED:agent_ingest_01:zone_A:p3") }, SwarmAId);
        FireEvents({ TEXT("SWARM_COMPLETED:agent_ingest_01:zone_A:p3") }, SwarmBId);
        FireEvents({ TEXT("SWARM_COMPLETED:agent_output_01:zone_D:p3") }, SwarmCId);

        PushToViewer(TEXT("civilization_complete"), FString::Printf(
            TEXT("{\"swarms\":[\"%s\",\"%s\",\"%s\"],"
                 "\"quality_scores\":{\"alpha\":0.96,\"beta\":0.94,\"gamma\":0.97},"
                 "\"civilizational_wisdom\":0.78,"
                 "\"awareness_label\":\"transcendent\","
                 "\"total_eras\":4,"
                 "\"institutions_formed\":5,"
                 "\"message\":\"Synthetic civilization complete — all swarms at 94%%+ quality, transcendent awareness achieved\"}"),
            *SwarmAId, *SwarmBId, *SwarmCId
        ));

        USwarmIntelligenceSubsystem* Intel =
            GetGameInstance()->GetSubsystem<USwarmIntelligenceSubsystem>();
        if (Intel)
        {
            Intel->BroadcastQualityScore(0.96f);
            Intel->BroadcastSwarmComplete(SwarmAId);
            Intel->BroadcastSwarmComplete(SwarmBId);
            Intel->BroadcastSwarmComplete(SwarmCId);
        }

        bRunning = false;
    });
}
