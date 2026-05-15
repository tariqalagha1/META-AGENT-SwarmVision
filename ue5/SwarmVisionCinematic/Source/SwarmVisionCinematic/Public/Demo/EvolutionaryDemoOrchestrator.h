#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Intelligence/SwarmIntelligenceSubsystem.h"
#include "Platform/SwarmPixelStreamingBridge.h"
#include "EvolutionaryDemoOrchestrator.generated.h"

// ─── Phase 7 Demo — Collective Swarm Cognition + Evolutionary Operations ───────
//
// Beat 1  (0s)     — Ecosystem boot: 3 swarms initialized with distinct specializations
// Beat 2  (7s)     — Nominal multi-swarm operation, cross-swarm handoffs flowing
// Beat 3  (15s)    — Emergent behavior detected: collaboration archetype classified
// Beat 4  (22s)    — Coherence modeling: harmony, stress, entropy computed live
// Beat 5  (29s)    — Collective stress spike: swarm-B enters retry storm
// Beat 6  (37s)    — Ecosystem governor activates: load rebalanced across swarms
// Beat 7  (44s)    — Cross-swarm anomaly propagation detected, containment fired
// Beat 8  (51s)    — Evolutionary twin explores 8 orchestration genomes
// Beat 9  (58s)    — Best genome selected: retry policy mutated, fitness +18%
// Beat 10 (65s)    — Long-horizon strategic plan published: topology redesign + specialization
// Beat 11 (72s)    — Collective memory transfer: swarm-A patterns transferred to swarm-B
// Beat 12 (80s)    — Evolutionary optimized re-run: all swarms apply learned genome
// Beat 13 (89s)    — Collective consciousness signal: system reaches "evolving" state
// Beat 14 (96s)    — Ecosystem complete: all swarms at 94%+ quality, knowledge committed
//
// Total: ~96s

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API AEvolutionaryDemoOrchestrator : public AActor
{
    GENERATED_BODY()

public:
    AEvolutionaryDemoOrchestrator();
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
    void RequestEmergenceAnalysis(const FString& SwarmId);
    void RequestEcosystemDecision();
    void RequestEvolutionaryTwin(const FString& SwarmId);
    void RequestEvolutionPlan(const FString& SwarmId);
    void RequestCollectiveTransfer(const FString& FromSwarm, const FString& ToSwarm);
    void PostIntelligence(const FString& Endpoint, const FString& Body,
                          TFunction<void(const FString&)> OnResult);

    TArray<FTimerHandle> BeatTimers;
    bool bRunning = false;
};
