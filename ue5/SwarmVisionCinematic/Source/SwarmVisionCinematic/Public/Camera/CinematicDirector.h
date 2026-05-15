#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Camera/CameraActor.h"
#include "CineCameraActor.h"
#include "CineCameraComponent.h"
#include "Components/SplineComponent.h"
#include "Data/SwarmEvent.h"
#include "CinematicDirector.generated.h"

// ─── ECameraMotionType ────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class ECameraMotionType : uint8
{
    Cut             UMETA(DisplayName="Cut"),
    Blend           UMETA(DisplayName="Blend"),         // SetViewTargetWithBlend
    DollySpline     UMETA(DisplayName="DollySpline"),   // travel along USplineComponent
    OrbitSubject    UMETA(DisplayName="OrbitSubject"),  // circle around actor
    PushIn          UMETA(DisplayName="PushIn"),        // move toward subject
    PullBack        UMETA(DisplayName="PullBack"),      // move away from subject
};

// ─── FDollyShot ───────────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FDollyShot
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FName SplineName; // Name of USplineComponent in level (on this actor or another)

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float TravelDuration = 4.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float EaseInFraction = 0.2f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float EaseOutFraction = 0.25f;

    // If set, camera looks at this actor while traveling
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FName LookAtActorName;

    // Focus pull from this distance to target distance (cm), -1 = auto
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float FocusDistanceStart = -1.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float FocusDistanceEnd = -1.f;
};

// ─── FCinematicShotConfig ─────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FCinematicShotConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FName CameraName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    ECameraMotionType MotionType = ECameraMotionType::Blend;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float BlendTime = 0.8f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float HoldDuration = 5.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bCanBeInterrupted = true;

    // Priority — higher = harder to interrupt (0-10)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Priority = 5;

    // Dolly config (only used if MotionType == DollySpline)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FDollyShot DollyConfig;

    // Focal length override (mm), 0 = no change
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float FocalLengthMM = 0.f;

    // Target aperture (f-stop), 0 = no change
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Aperture = 0.f;

    // Subject to track focus (actor name or agent ID)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FName FocusSubjectName;
};

// ─── ACinematicDirector ───────────────────────────────────────────────────────
//
// Phase 3 camera director. Replaces ASwarmCameraDirector.
// Adds:
//   - Spline dolly motion (USplineComponent path travel)
//   - Per-shot focal length + aperture control on ACineCameraActor
//   - Auto focus pull toward tracked subject
//   - Orbital composition (orbit around agent)
//   - Push in / pull back moves
//   - Shot priority queue — prevents low-priority events interrupting key shots
//   - Idle behavior: slow environmental sweeps + random reframe
//   - Compound shot sequences (SWARM_COMPLETED = 3-shot cascade)

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API ACinematicDirector : public AActor
{
    GENERATED_BODY()

public:
    ACinematicDirector();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
    virtual void Tick(float DeltaTime) override;

    // ── Shot config ──────────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Cinematic")
    TMap<FString, FCinematicShotConfig> ShotMap;

    // Idle camera splines — played in sequence during inactivity
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Cinematic|Idle")
    TArray<FName> IdleDollySplineNames;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Cinematic|Idle")
    float IdleReturnDelay = 6.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Cinematic|Idle")
    float IdleSweepDuration = 8.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Cinematic|Idle")
    FName IdleCameraName = TEXT("Camera_Mezzanine");

    // Compound shot sequence for SWARM_COMPLETED
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Cinematic|Sequences")
    TArray<FCinematicShotConfig> SwarmCompleteSequence;

    // ── Runtime API ──────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category="Cinematic")
    void ActivateShotConfig(const FCinematicShotConfig& Config, const FSwarmEvent& TriggerEvent);

    UFUNCTION(BlueprintCallable, Category="Cinematic")
    void PlayShotSequence(const TArray<FCinematicShotConfig>& Sequence);

    UFUNCTION(BlueprintCallable, Category="Cinematic")
    void StartDollyMove(USplineComponent* Spline, float Duration,
                        float EaseIn, float EaseOut, AActor* LookAtActor);

    UFUNCTION(BlueprintCallable, Category="Cinematic")
    void ReturnToIdle();

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Cinematic")
    bool IsDollying() const { return bDollying; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Cinematic")
    float GetDollyProgress() const { return DollyProgress; }

    // ── BP hooks ─────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintImplementableEvent, Category="Cinematic")
    void BP_OnShotActivated(const FCinematicShotConfig& Config, const FSwarmEvent& Event);

    UFUNCTION(BlueprintImplementableEvent, Category="Cinematic")
    void BP_OnDollyComplete(FName SplineName);

    UFUNCTION(BlueprintImplementableEvent, Category="Cinematic")
    void BP_OnSequenceComplete();

private:
    UFUNCTION()
    void OnSwarmEventReceived(const FSwarmEvent& Event);

    void TickDolly(float DeltaTime);
    void TickFocusPull(float DeltaTime);
    void TickIdleSweep(float DeltaTime);
    void AdvanceShotQueue();

    void ApplyCineCameraSettings(ACineCameraActor* CineCamera,
                                  const FCinematicShotConfig& Config);
    void SetFocusTarget(ACineCameraActor* CineCamera, const FName& SubjectName);

    ACameraActor* FindCameraByName(const FName& Name) const;
    USplineComponent* FindSplineByName(const FName& Name) const;
    AActor* FindActorByName(const FName& Name) const;

    void PopulateDefaultShotMap();
    void PopulateSwarmCompleteSequence();

    // Active shot tracking
    FCinematicShotConfig ActiveShot;
    int32 ActiveShotPriority = 0;
    FTimerHandle HoldTimer;
    FTimerHandle IdleTimer;

    // Dolly state
    bool              bDollying      = false;
    float             DollyProgress  = 0.f;
    float             DollyDuration  = 4.f;
    float             DollyEaseIn    = 0.2f;
    float             DollyEaseOut   = 0.25f;
    USplineComponent* ActiveDollySpline = nullptr;
    AActor*           DollyLookAtActor  = nullptr;
    ACineCameraActor* ActiveCineCamera  = nullptr;

    // Focus pull state
    float CurrentFocusDist = 200.f;
    float TargetFocusDist  = 200.f;
    float FocusPullSpeed   = 80.f; // cm/sec

    // Shot queue (for compound sequences)
    TArray<FCinematicShotConfig> ShotQueue;
    int32 ShotQueueIndex = 0;
    bool  bPlayingSequence = false;

    // Idle sweep
    int32 IdleSweepIndex = 0;
};
