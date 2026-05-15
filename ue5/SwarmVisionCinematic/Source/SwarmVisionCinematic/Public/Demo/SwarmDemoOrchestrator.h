#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Data/SwarmEvent.h"
#include "SwarmDemoOrchestrator.generated.h"

// One beat in the cinematic demo timeline
USTRUCT(BlueprintType)
struct FDemoBeat
{
    GENERATED_BODY()

    // Beat label for logging / UI
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString BeatName;

    // Events to inject at the start of this beat (EventType|AgentId|key=val)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    TArray<FString> Events;

    // How long to hold this beat before advancing (seconds)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Duration = 4.0f;

    // Optional: additional delay before advancing (cinematic pause)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float PauseAfter = 0.f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnDemoBeatStarted, const FString&, BeatName);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnDemoComplete);

// ─── ASwarmDemoOrchestrator ───────────────────────────────────────────────────
//
// The final AAA demo sequence coordinator.
// Plays the full 12-beat cinematic narrative:
//   1. Operations Floor Idle
//   2. SWARM_STARTED
//   3. fetch_agent Activates
//   4. Task Flow Transfer (Handoff)
//   5. normalize_agent Processing
//   6. Quality Validation
//   7. Failure Detected
//   8. Retry Loop
//   9. Success
//  10. META_INSIGHT
//  11. SWARM_COMPLETED
//  12. Idle Return
//
// Designed to be triggered from CallInEditor in the editor or from a
// Blueprint/Level Sequence in a final packaged build.

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API ASwarmDemoOrchestrator : public AActor
{
    GENERATED_BODY()

public:
    ASwarmDemoOrchestrator();

    // ── Run controls ─────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, CallInEditor, Category="Demo")
    void StartCinematicDemo();

    UFUNCTION(BlueprintCallable, CallInEditor, Category="Demo")
    void StopDemo();

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Demo")
    bool IsRunning() const { return bRunning; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Demo")
    int32 GetCurrentBeatIndex() const { return CurrentBeatIndex; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Demo")
    FString GetCurrentBeatName() const;

    // ── Config ────────────────────────────────────────────────────────────────

    // If false, use the built-in 12-beat sequence; if true, use CustomBeats
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    bool bUseCustomBeats = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo",
              meta=(EditCondition="bUseCustomBeats"))
    TArray<FDemoBeat> CustomBeats;

    // Global pacing multiplier (1.0 = designed timing, 0.5 = double speed)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    float TimingMultiplier = 1.0f;

    // ── Delegates ─────────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category="Demo")
    FOnDemoBeatStarted OnBeatStarted;

    UPROPERTY(BlueprintAssignable, Category="Demo")
    FOnDemoComplete OnDemoComplete;

    // ── BP hooks ──────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintImplementableEvent, Category="Demo")
    void BP_OnBeatStarted(const FString& BeatName, int32 BeatIndex, int32 TotalBeats);

    UFUNCTION(BlueprintImplementableEvent, Category="Demo")
    void BP_OnDemoComplete();

    UFUNCTION(BlueprintImplementableEvent, Category="Demo")
    void BP_OnDemoStopped();

private:
    void BuildDefaultBeats();
    void ExecuteBeat(int32 BeatIndex);
    void AdvanceToNextBeat();
    void FireBeatEvents(const FDemoBeat& Beat);

    static FString BuildEventJson(const FString& EventSpec, const FString& TraceId);

    TArray<FDemoBeat> DefaultBeats;
    int32             CurrentBeatIndex = 0;
    bool              bRunning         = false;
    FString           DemoTraceId;
    FTimerHandle      BeatTimer;
    FTimerHandle      PauseTimer;
};
