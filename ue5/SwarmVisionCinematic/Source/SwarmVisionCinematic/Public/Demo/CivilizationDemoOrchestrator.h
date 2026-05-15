#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Intelligence/SwarmIntelligenceSubsystem.h"
#include "Platform/SwarmPixelStreamingBridge.h"
#include "CivilizationDemoOrchestrator.generated.h"

// ─── Phase 8 Demo — Synthetic Civilization + Meta-Strategic Intelligence ───────
//
// Beat 1  (0s)     — Civilization boot: 3 founding swarms declared, governance philosophy seeded
// Beat 2  (8s)     — Founding era: expansion phase, institutional structure forms organically
// Beat 3  (17s)    — Philosophy evolution: first ideology competition — federated vs. hierarchical
// Beat 4  (26s)    — Strategic assembly formed: first long-horizon planning institution
// Beat 5  (35s)    — Crisis era triggered: swarm-beta enters governance failure cascade
// Beat 6  (44s)    — Meta-strategic analysis: drift detected — governance ossification diagnosed
// Beat 7  (53s)    — Ideology shift: evolutionary_meritocracy overtakes hierarchical_mandate
// Beat 8  (62s)    — Autonomous discovery: resonance coordination + Phoenix Doctrine found
// Beat 9  (70s)    — Civilizational twin: 6 ideology branches simulated — "generation" horizon
// Beat 10 (79s)    — Federation treaty formed: swarm-alpha + swarm-gamma mutual_defense pact
// Beat 11 (88s)    — Renaissance era: health recovery, wisdom compounds across civilization
// Beat 12 (97s)    — Institution surge: oversight council + evolutionary board simultaneously formed
// Beat 13 (106s)   — Civilizational consciousness computed: system reaches "meta_strategic"
// Beat 14 (115s)   — Transcendence signal: all dimensions aligned — "transcendent" label achieved
// Beat 15 (122s)   — Constitutional moment: dominant philosophy encoded as civilization doctrine
// Beat 16 (130s)   — Civilization complete: all swarms at 96%+ quality, wisdom at 0.78
//
// Total: ~130s

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API ACivilizationDemoOrchestrator : public AActor
{
    GENERATED_BODY()

public:
    ACivilizationDemoOrchestrator();
    virtual void BeginPlay() override;

    UFUNCTION(BlueprintCallable, Category="Demo") void StartDemo();
    UFUNCTION(BlueprintCallable, Category="Demo") void StopDemo();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    float GlobalTimeScale = 1.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    FString SwarmAId = TEXT("swarm-alpha");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    FString SwarmBId = TEXT("swarm-beta");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    FString SwarmCId = TEXT("swarm-gamma");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    FString IntelligenceServiceUrl = TEXT("http://localhost:3004");

private:
    void ScheduleBeat(float DelayS, TFunction<void()> Fn);
    void FireEvents(const TArray<FString>& Specs, const FString& SwarmOverride = TEXT(""));
    void InjectEvent(const FString& Spec, const FString& SwarmOverride);
    void PushToViewer(const FString& Type, const FString& PayloadJson);

    // Phase 8 intelligence calls
    void RequestPhilosophyEvolution(const FString& SwarmId);
    void RequestCivilizationMemoryRecord(const FString& SwarmId, const FString& KeyEvent);
    void RequestOrganizationalStructure(const FString& SwarmId);
    void RequestInstitutionFormation(const FString& SwarmId);
    void RequestMetaStrategicReport(const FString& SwarmId);
    void RequestCivilizationTwin(const FString& SwarmId, const FString& Horizon);
    void RequestAutonomousDiscovery(const FString& SwarmId);
    void RequestFederationTreaty(const FString& SwarmA, const FString& SwarmC, const FString& TreatyKind);
    void RequestCivilizationalConsciousness(const FString& SwarmId, int32 EvolutionGeneration);

    void PostIntelligence(const FString& Endpoint, const FString& Body,
                          TFunction<void(const FString&)> OnResult);

    TArray<FTimerHandle> BeatTimers;
    bool bRunning = false;

    // Shared event payload — reused across beats for full context
    FString CachedEventPayload;
    int32   PhilosophyGeneration = 0;
};
