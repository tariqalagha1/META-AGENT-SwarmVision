#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Intelligence/SwarmIntelligenceSubsystem.h"
#include "IntelligentDemoOrchestrator.generated.h"

// ─── Phase 5 demo scenario beats ─────────────────────────────────────────────
//
// Beat 1  (0s)     — Swarm activated: 3 agents initialize
// Beat 2  (8s)     — Ramp: agents transition to Working
// Beat 3  (18s)    — Peak: all zones active, high throughput
// Beat 4  (32s)    — Retry storm seeds: agent_fetch begins retrying
// Beat 5  (38s)    — Anomaly cascade: 3 anomalies in 8s across 2 zones
// Beat 6  (45s)    — Bottleneck alert: Transform zone stalled
// Beat 7  (52s)    — Intelligence detects degradation → tension spike
//                    IntelligentCinematicDirector recuts to crisis framing
// Beat 8  (58s)    — Intervention: isolate_agent command issued via Command Layer
// Beat 9  (65s)    — Recovery: anomalies clear, retry rate drops
// Beat 10 (72s)    — Swarm stabilizes → health score recovers to 0.82
// Beat 11 (78s)    — Executive summary generated, displayed on HUD
// Beat 12 (84s)    — Swarm completes — epilogue camera, quality score: 0.87

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API AIntelligentDemoOrchestrator : public AActor
{
    GENERATED_BODY()

public:
    AIntelligentDemoOrchestrator();

    virtual void BeginPlay() override;

    UFUNCTION(BlueprintCallable, Category="Demo")
    void StartDemo();

    UFUNCTION(BlueprintCallable, Category="Demo")
    void StopDemo();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    float GlobalTimeScale = 1.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    FString DemoSwarmId = TEXT("demo-swarm-phase5");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    FString IntelligenceServiceUrl = TEXT("http://localhost:3004");

private:
    void ScheduleBeat(float DelayS, TFunction<void()> Fn);
    void FireEvents(const TArray<FString>& EventStrings);
    void InjectEvent(const FString& Spec);  // "EVENT_TYPE|agent_id|key=val,..."

    TArray<FTimerHandle> BeatTimers;
    bool bRunning = false;

    static constexpr int32 STAGGER_MS = 80;
};
