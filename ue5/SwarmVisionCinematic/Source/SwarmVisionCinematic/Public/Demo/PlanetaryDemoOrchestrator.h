#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Intelligence/SwarmIntelligenceSubsystem.h"
#include "Platform/SwarmPixelStreamingBridge.h"
#include "PlanetaryDemoOrchestrator.generated.h"

// ─── Phase 10 Demo — Inter-Civilizational Networks + Planetary Operations ────
//
// Beat 1  (0s)      — Planetary boot: 4 civilizations registered across tiers
// Beat 2  (9s)      — Interoperability scan: pairwise compatibility matrix computed
// Beat 3  (18s)     — Diplomacy opens: treaty recommended, negotiation initiated
// Beat 4  (27s)     — Round 1 negotiation: Aethon ↔ Verdant — mutual_aid proposed
// Beat 5  (36s)     — Treaty ratified: first active planetary treaty recorded
// Beat 6  (45s)     — Planetary councils formed: security + economic + science seated
// Beat 7  (54s)     — Council resolution: planetary knowledge federation enacted
// Beat 8  (63s)     — Planetary digital twin: 7 domains modeled, cascade risks surfaced
// Beat 9  (72s)     — Risk assessment: governance divergence + resource collapse detected
// Beat 10 (81s)     — Resource orchestration: surplus reallocated across deficit civs
// Beat 11 (90s)     — Strategic alliance formed: Aethon ↔ Nexus — deep alignment
// Beat 12 (99s)     — Dispute mediation: Verdant ↔ Solaris resource conflict resolved
// Beat 13 (108s)    — Planetary consciousness computed: awareness_label = "federated"
// Beat 14 (117s)    — Constitutional union proposed: all 4 civs enter final negotiations
// Beat 15 (126s)    — Global strategic simulation: federated_evolution most likely
// Beat 16 (135s)    — Planetary mind threshold: consciousness reaches "unified" state
//                     Command center green — planetary civilization network operational
//
// Total: ~144s

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API APlanetaryDemoOrchestrator : public AActor
{
    GENERATED_BODY()

public:
    APlanetaryDemoOrchestrator();
    virtual void BeginPlay() override;

    UFUNCTION(BlueprintCallable, Category="Demo") void StartDemo();
    UFUNCTION(BlueprintCallable, Category="Demo") void StopDemo();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    float GlobalTimeScale = 1.0f;

    // Named civilizations
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Civilizations")
    FString CivAethonId = TEXT("civ-aethon");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Civilizations")
    FString CivVerdantId = TEXT("civ-verdant");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Civilizations")
    FString CivNexusId = TEXT("civ-nexus");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Civilizations")
    FString CivSolarisId = TEXT("civ-solaris");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    FString IntelligenceServiceUrl = TEXT("http://localhost:3004");

private:
    void ScheduleBeat(float DelayS, TFunction<void()> Fn);
    void PushToViewer(const FString& Type, const FString& PayloadJson);

    // Civilization lifecycle
    void RegisterCivilization(const FString& CivId, const FString& Name,
                               const FString& Tier, const FString& Ideology,
                               float Health, float Wisdom, float Trust,
                               const TArray<FString>& Specialization);

    // Planetary operations
    void RunInteropScan();
    void InitiateNegotiation(const FString& CivAId, const FString& CivBId,
                             const FString& PreferredKind);
    void RatifyTreaty(const FString& TreatyId, const TArray<FString>& CivIds);
    void FormCouncils();
    void ProposeResolution(const FString& CouncilId, const FString& Title,
                           const FString& Body, const FString& ProposedBy);
    void BuildPlanetaryTwin();
    void AssessPlanetaryRisk();
    void OrchestrateResources();
    void MediateDispute(const FString& PartyAId, const FString& PartyBId,
                        const FString& DisputeKind);
    void ComputePlanetaryConsciousness();
    void RunStrategicSimulation(int32 HorizonEpochs);
    void PollCommandCenter();

    void PostPlanetary(const FString& Endpoint, const FString& Body,
                       TFunction<void(const FString&)> OnResult);
    void GetPlanetary(const FString& Endpoint,
                      TFunction<void(const FString&)> OnResult);

    TArray<FTimerHandle> BeatTimers;
    bool bRunning = false;

    // State carried across beats
    FString ActiveTreatyId;
    FString ActiveCouncilId;
};
