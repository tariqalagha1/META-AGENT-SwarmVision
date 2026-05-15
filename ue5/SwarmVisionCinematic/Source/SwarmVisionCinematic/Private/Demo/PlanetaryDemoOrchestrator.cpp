#include "Demo/PlanetaryDemoOrchestrator.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "TimerManager.h"
#include "Intelligence/SwarmIntelligenceSubsystem.h"

// ─────────────────────────────────────────────────────────────────────────────

APlanetaryDemoOrchestrator::APlanetaryDemoOrchestrator()
{
    PrimaryActorTick.bCanEverTick = false;
}

void APlanetaryDemoOrchestrator::BeginPlay()
{
    Super::BeginPlay();
}

// ── Core helpers ──────────────────────────────────────────────────────────────

void APlanetaryDemoOrchestrator::ScheduleBeat(float DelayS, TFunction<void()> Fn)
{
    FTimerHandle Handle;
    FTimerDelegate Del;
    Del.BindLambda(MoveTemp(Fn));
    GetWorldTimerManager().SetTimer(Handle, Del, DelayS / GlobalTimeScale, false);
    BeatTimers.Add(Handle);
}

void APlanetaryDemoOrchestrator::PushToViewer(const FString& Type, const FString& PayloadJson)
{
    USwarmPixelStreamingBridge* Bridge =
        GetGameInstance()->GetSubsystem<USwarmPixelStreamingBridge>();
    if (Bridge) Bridge->PushDataEvent(Type, PayloadJson);
}

void APlanetaryDemoOrchestrator::PostPlanetary(
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

void APlanetaryDemoOrchestrator::GetPlanetary(
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

// ── Civilization registration ─────────────────────────────────────────────────

void APlanetaryDemoOrchestrator::RegisterCivilization(
    const FString& CivId, const FString& Name,
    const FString& Tier, const FString& Ideology,
    float Health, float Wisdom, float Trust,
    const TArray<FString>& Specialization)
{
    FString SpecArray = TEXT("[");
    for (int32 i = 0; i < Specialization.Num(); i++)
    {
        if (i > 0) SpecArray += TEXT(",");
        SpecArray += FString::Printf(TEXT("\"%s\""), *Specialization[i]);
    }
    SpecArray += TEXT("]");

    const FString Body = FString::Printf(
        TEXT("{\"civ_id\":\"%s\",\"name\":\"%s\",\"tier\":\"%s\","
             "\"dominant_ideology\":\"%s\","
             "\"health_index\":%.2f,\"wisdom_score\":%.2f,\"trust_score\":%.2f,"
             "\"specialization\":%s}"),
        *CivId, *Name, *Tier, *Ideology,
        Health, Wisdom, Trust, *SpecArray
    );

    PostPlanetary(TEXT("/planetary/civilizations"), Body,
        [this, Name](const FString& Response)
        {
            PushToViewer(TEXT("planetary_civ_registered"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat1] Civilization registered: %s"), *Name);
        });
}

// ── Planetary operations ──────────────────────────────────────────────────────

void APlanetaryDemoOrchestrator::RunInteropScan()
{
    PostPlanetary(TEXT("/planetary/interop"), TEXT("{}"),
        [this](const FString& Response)
        {
            PushToViewer(TEXT("planetary_interop_report"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat2] Interop scan: %s"), *Response.Left(200));
        });
}

void APlanetaryDemoOrchestrator::InitiateNegotiation(
    const FString& CivAId, const FString& CivBId, const FString& PreferredKind)
{
    const FString Body = FString::Printf(
        TEXT("{\"civ_a_id\":\"%s\",\"civ_b_id\":\"%s\",\"preferred_kind\":\"%s\"}"),
        *CivAId, *CivBId, *PreferredKind
    );
    PostPlanetary(TEXT("/planetary/diplomacy/negotiate"), Body,
        [this, CivAId, CivBId](const FString& Response)
        {
            // Cache treaty_id if ratified
            const FString Key = TEXT("\"treaty_id\":\"");
            int32 Idx = Response.Find(Key);
            if (Idx != INDEX_NONE)
            {
                const int32 Start = Idx + Key.Len();
                const int32 End   = Response.Find(TEXT("\""), ESearchCase::IgnoreCase,
                                                  ESearchDir::FromStart, Start);
                if (End != INDEX_NONE)
                    ActiveTreatyId = Response.Mid(Start, End - Start);
            }
            PushToViewer(TEXT("planetary_negotiation_result"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat3-5] Negotiation %s<>%s: %s"),
                   *CivAId, *CivBId, *Response.Left(200));
        });
}

void APlanetaryDemoOrchestrator::FormCouncils()
{
    PostPlanetary(TEXT("/planetary/governance/councils"), TEXT("{}"),
        [this](const FString& Response)
        {
            // Cache first council_id
            const FString Key = TEXT("\"council_id\":\"");
            int32 Idx = Response.Find(Key);
            if (Idx != INDEX_NONE)
            {
                const int32 Start = Idx + Key.Len();
                const int32 End   = Response.Find(TEXT("\""), ESearchCase::IgnoreCase,
                                                  ESearchDir::FromStart, Start);
                if (End != INDEX_NONE)
                    ActiveCouncilId = Response.Mid(Start, End - Start);
            }
            PushToViewer(TEXT("planetary_councils_formed"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat6] Councils: %s"), *Response.Left(200));
        });
}

void APlanetaryDemoOrchestrator::ProposeResolution(
    const FString& CouncilId, const FString& Title,
    const FString& Body, const FString& ProposedBy)
{
    const FString Payload = FString::Printf(
        TEXT("{\"council_id\":\"%s\",\"title\":\"%s\",\"body\":\"%s\",\"proposed_by\":\"%s\"}"),
        *CouncilId, *Title, *Body, *ProposedBy
    );
    PostPlanetary(TEXT("/planetary/governance/resolve"), Payload,
        [this, Title](const FString& Response)
        {
            PushToViewer(TEXT("planetary_resolution"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat7] Resolution '%s': %s"),
                   *Title, *Response.Left(150));
        });
}

void APlanetaryDemoOrchestrator::BuildPlanetaryTwin()
{
    PostPlanetary(TEXT("/planetary/twin"), TEXT("{}"),
        [this](const FString& Response)
        {
            PushToViewer(TEXT("planetary_twin_state"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat8] Planetary twin: %s"), *Response.Left(200));
        });
}

void APlanetaryDemoOrchestrator::AssessPlanetaryRisk()
{
    PostPlanetary(TEXT("/planetary/risk"), TEXT("{}"),
        [this](const FString& Response)
        {
            PushToViewer(TEXT("planetary_risk_report"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat9] Risk: %s"), *Response.Left(200));
        });
}

void APlanetaryDemoOrchestrator::OrchestrateResources()
{
    PostPlanetary(TEXT("/planetary/resources"), TEXT("{}"),
        [this](const FString& Response)
        {
            PushToViewer(TEXT("planetary_resource_decision"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat10] Resources: %s"), *Response.Left(200));
        });
}

void APlanetaryDemoOrchestrator::MediateDispute(
    const FString& PartyAId, const FString& PartyBId, const FString& DisputeKind)
{
    const FString Body = FString::Printf(
        TEXT("{\"party_ids\":[\"%s\",\"%s\"],\"dispute_kind\":\"%s\"}"),
        *PartyAId, *PartyBId, *DisputeKind
    );
    PostPlanetary(TEXT("/planetary/diplomacy/mediate"), Body,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("planetary_dispute_resolution"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat12] Mediation: %s"), *Response.Left(150));
        });
}

void APlanetaryDemoOrchestrator::ComputePlanetaryConsciousness()
{
    PostPlanetary(TEXT("/planetary/consciousness"), TEXT("{}"),
        [this](const FString& Response)
        {
            PushToViewer(TEXT("planetary_consciousness_signal"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat13/16] Consciousness: %s"), *Response.Left(200));
        });
}

void APlanetaryDemoOrchestrator::RunStrategicSimulation(int32 HorizonEpochs)
{
    const FString Body = FString::Printf(
        TEXT("{\"horizon_epochs\":%d}"), HorizonEpochs
    );
    PostPlanetary(TEXT("/planetary/simulate"), Body,
        [this](const FString& Response)
        {
            PushToViewer(TEXT("planetary_strategic_simulation"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat15] Simulation: %s"), *Response.Left(200));
        });
}

void APlanetaryDemoOrchestrator::PollCommandCenter()
{
    GetPlanetary(TEXT("/planetary/command"),
        [this](const FString& Response)
        {
            PushToViewer(TEXT("planetary_command_center"), Response);
            UE_LOG(LogTemp, Log, TEXT("[Phase10|Final] Command center: %s"), *Response.Left(250));
        });
}

// ── Demo lifecycle ────────────────────────────────────────────────────────────

void APlanetaryDemoOrchestrator::StartDemo()
{
    if (bRunning) return;
    bRunning = true;

    UE_LOG(LogTemp, Log, TEXT("[Phase10] Planetary demo starting — 16 beats, ~144s"));

    // ── Beat 1 (0s) — Planetary boot: 4 civilizations registered ─────────────
    ScheduleBeat(0.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat1] Registering civilizations..."));

        RegisterCivilization(CivAethonId, TEXT("Aethon Collective"),
            TEXT("advanced"), TEXT("federated_republic"),
            0.82f, 0.78f, 0.75f,
            { TEXT("compute"), TEXT("governance"), TEXT("ai_capacity") });

        RegisterCivilization(CivVerdantId, TEXT("Verdant Federation"),
            TEXT("established"), TEXT("consensus_democracy"),
            0.68f, 0.65f, 0.72f,
            { TEXT("energy"), TEXT("human_expertise"), TEXT("logistics") });

        RegisterCivilization(CivNexusId, TEXT("Nexus Sovereignty"),
            TEXT("transcendent"), TEXT("evolutionary_meritocracy"),
            0.91f, 0.92f, 0.80f,
            { TEXT("compute"), TEXT("ai_capacity"), TEXT("storage") });

        RegisterCivilization(CivSolarisId, TEXT("Solaris Compact"),
            TEXT("nascent"), TEXT("decentralized_autonomy"),
            0.48f, 0.42f, 0.55f,
            { TEXT("energy"), TEXT("bandwidth"), TEXT("storage") });
    });

    // ── Beat 2 (9s) — Interoperability scan ───────────────────────────────────
    ScheduleBeat(9.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat2] Running interoperability scan..."));
        RunInteropScan();
    });

    // ── Beat 3 (18s) — Diplomacy opens: treaty recommended ───────────────────
    ScheduleBeat(18.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat3] Initiating Aethon <> Verdant negotiation..."));
        InitiateNegotiation(CivAethonId, CivVerdantId, TEXT("mutual_aid"));
    });

    // ── Beat 4 (27s) — Nexus <> Solaris negotiation: strategic_alliance ──────
    ScheduleBeat(27.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat4] Initiating Nexus <> Solaris negotiation..."));
        InitiateNegotiation(CivNexusId, CivSolarisId, TEXT("free_exchange"));
    });

    // ── Beat 5 (36s) — Aethon <> Nexus: strategic_alliance ───────────────────
    ScheduleBeat(36.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat5] Initiating Aethon <> Nexus strategic alliance..."));
        InitiateNegotiation(CivAethonId, CivNexusId, TEXT("strategic_alliance"));
    });

    // ── Beat 6 (45s) — Planetary councils formed ──────────────────────────────
    ScheduleBeat(45.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat6] Forming planetary councils..."));
        FormCouncils();
    });

    // ── Beat 7 (54s) — Council resolution: knowledge federation ──────────────
    ScheduleBeat(54.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat7] Proposing knowledge federation resolution..."));
        if (!ActiveCouncilId.IsEmpty())
        {
            ProposeResolution(
                ActiveCouncilId,
                TEXT("Planetary Knowledge Federation Act"),
                TEXT("All civilizations commit to open pattern sharing and cross-civ wisdom transfer within 7 operational cycles"),
                CivNexusId
            );
        }
        else
        {
            UE_LOG(LogTemp, Warning, TEXT("[Phase10|Beat7] No council formed yet — proposing via governance state"));
            GetPlanetary(TEXT("/planetary/governance/state"),
                [this](const FString& Response)
                { PushToViewer(TEXT("planetary_governance_state"), Response); });
        }
    });

    // ── Beat 8 (63s) — Planetary digital twin ────────────────────────────────
    ScheduleBeat(63.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat8] Building planetary digital twin..."));
        BuildPlanetaryTwin();
    });

    // ── Beat 9 (72s) — Planetary risk assessment ──────────────────────────────
    ScheduleBeat(72.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat9] Assessing planetary risk..."));
        AssessPlanetaryRisk();
    });

    // ── Beat 10 (81s) — Resource orchestration ───────────────────────────────
    ScheduleBeat(81.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat10] Orchestrating global resources..."));
        OrchestrateResources();
    });

    // ── Beat 11 (90s) — Verdant <> Aethon: resource_compact upgrade ──────────
    ScheduleBeat(90.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat11] Forming resource compact: Verdant <> Solaris..."));
        InitiateNegotiation(CivVerdantId, CivSolarisId, TEXT("resource_compact"));
    });

    // ── Beat 12 (99s) — Dispute mediation: Verdant <> Solaris ────────────────
    ScheduleBeat(99.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat12] Mediating Verdant <> Solaris resource conflict..."));
        MediateDispute(CivVerdantId, CivSolarisId, TEXT("resource_conflict"));
    });

    // ── Beat 13 (108s) — Planetary consciousness ──────────────────────────────
    ScheduleBeat(108.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat13] Computing planetary consciousness..."));
        ComputePlanetaryConsciousness();
    });

    // ── Beat 14 (117s) — Constitutional union proposed ────────────────────────
    ScheduleBeat(117.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat14] Initiating constitutional union: Aethon <> Nexus..."));
        InitiateNegotiation(CivAethonId, CivNexusId, TEXT("constitutional_union"));
    });

    // ── Beat 15 (126s) — Global strategic simulation ─────────────────────────
    ScheduleBeat(126.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat15] Running 10-epoch planetary simulation..."));
        RunStrategicSimulation(10);
    });

    // ── Beat 16 (135s) — Final consciousness + command center poll ───────────
    ScheduleBeat(135.0f, [this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[Phase10|Beat16] Final consciousness signal + command center..."));
        ComputePlanetaryConsciousness();
        ScheduleBeat(3.0f, [this]()
        {
            PollCommandCenter();
            UE_LOG(LogTemp, Log, TEXT("[Phase10] PLANETARY CIVILIZATION NETWORK OPERATIONAL."));
        });
    });
}

void APlanetaryDemoOrchestrator::StopDemo()
{
    for (FTimerHandle& Handle : BeatTimers)
        GetWorldTimerManager().ClearTimer(Handle);
    BeatTimers.Empty();
    bRunning = false;
    UE_LOG(LogTemp, Log, TEXT("[Phase10] Demo stopped."));
}
