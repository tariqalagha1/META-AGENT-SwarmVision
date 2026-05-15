#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Intelligence/SwarmIntelligenceSubsystem.h"
#include "Platform/SwarmPixelStreamingBridge.h"
#include "DigitalTwinDemoOrchestrator.generated.h"

// ─── Phase 6 Demo — Digital Twin Evolution ────────────────────────────────────
//
// Beat 1  (0s)     — Swarm activated: meta-agent + 4 specialized agents online
// Beat 2  (6s)     — Nominal operation: all agents working at capacity
// Beat 3  (14s)    — Temperament profiling: system characterizes swarm behavior
// Beat 4  (22s)    — Efficiency drift: subtle degradation begins (governance seeds)
// Beat 5  (30s)    — Governance engine fires: retry suppression auto-applied
// Beat 6  (36s)    — Digital twin branch created: "Alt-routing simulation" runs
// Beat 7  (42s)    — Predictive intervention: pre-failure reroute issued
//                    before incident escalates
// Beat 8  (50s)    — Anomaly quarantine: zone isolation auto-triggered
// Beat 9  (57s)    — Self-healing: agents self-recover via governed retry policy
// Beat 10 (64s)    — Strategic advisor publishes: top 3 recommendations
//                    pushed to executive HUD via PS data channel
// Beat 11 (71s)    — Copilot query: "What should we do?" → response displayed
// Beat 12 (79s)    — Optimized re-run begins with learned parameters
// Beat 13 (88s)    — Swarm completes: quality 0.94 — memory system records
//                    temperament + learnings for next run

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API ADigitalTwinDemoOrchestrator : public AActor
{
    GENERATED_BODY()

public:
    ADigitalTwinDemoOrchestrator();
    virtual void BeginPlay() override;

    UFUNCTION(BlueprintCallable, Category="Demo") void StartDemo();
    UFUNCTION(BlueprintCallable, Category="Demo") void StopDemo();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    float GlobalTimeScale = 1.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    FString DemoSwarmId = TEXT("demo-swarm-phase6");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    FString IntelligenceServiceUrl = TEXT("http://localhost:3004");

private:
    void ScheduleBeat(float DelayS, TFunction<void()> Fn);
    void FireEvents(const TArray<FString>& Specs);
    void InjectEvent(const FString& Spec);
    void PushToViewer(const FString& Type, const FString& PayloadJson);
    void RequestGovernanceDecision();
    void RequestCopilotAnswer(const FString& Question, const FString& Context);

    TArray<FTimerHandle> BeatTimers;
    bool bRunning = false;
};
