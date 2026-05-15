#pragma once

#include "CoreMinimal.h"
#include "Agents/SwarmAgentPawn.h"
#include "Agents/AgentAnimDataProvider.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/PoseableMeshComponent.h"
#include "NiagaraComponent.h"
#include "SwarmMetaHumanAgent.generated.h"

// Micro-expression state — subtle facial/postural cues, no lip sync
UENUM(BlueprintType)
enum class EAgentExpression : uint8
{
    Neutral        UMETA(DisplayName="Neutral"),
    Focused        UMETA(DisplayName="Focused"),        // brow slightly down, eyes forward
    Processing     UMETA(DisplayName="Processing"),     // slight head tilt, eyes moving
    Anticipating   UMETA(DisplayName="Anticipating"),   // slight lean forward
    Acknowledging  UMETA(DisplayName="Acknowledging"),  // micro nod
    Concerned      UMETA(DisplayName="Concerned"),      // brow raise, tension
    Resolved       UMETA(DisplayName="Resolved"),       // small exhale posture release
    Observing      UMETA(DisplayName="Observing"),      // relaxed, scanning
};

// Gaze target type
UENUM(BlueprintType)
enum class EGazeTarget : uint8
{
    Workstation    UMETA(DisplayName="Workstation"),
    DataStream     UMETA(DisplayName="DataStream"),
    Corridor       UMETA(DisplayName="Corridor"),
    OtherAgent     UMETA(DisplayName="OtherAgent"),
    HoloDisplay    UMETA(DisplayName="HoloDisplay"),
    Ambient        UMETA(DisplayName="Ambient"),        // slow idle scan
};

// ─── ASwarmMetaHumanAgent ─────────────────────────────────────────────────────
//
// Phase 3 agent — replaces ASwarmAgentPawn.
// Drives a full MetaHuman rig:
//   - Body: AnimBP driven by EAgentAnimState (inherited from SwarmAgentPawn)
//   - Face: separate facial mesh driven by EAgentExpression morphs
//   - Gaze: Control Rig IK target updated per frame toward EGazeTarget
//   - Procedural: breathing, idle shifts, hand micro-movement (AnimBP curves)
//
// NO talking. NO lip sync. ALL expression is postural + facial micro-cue.
// The face mesh uses the MetaHuman LOD0 face component naming convention.

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API ASwarmMetaHumanAgent : public ASwarmAgentPawn,
                                                       public IAgentAnimDataProvider
{
    GENERATED_BODY()

public:
    ASwarmMetaHumanAgent();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;

    // ── MetaHuman components ─────────────────────────────────────────────────

    // Body mesh — assign MH_Body skeletal mesh in Blueprint subclass
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="MetaHuman")
    USkeletalMeshComponent* BodyMesh;

    // Face mesh — assign MH_Face skeletal mesh (separate LOD0 component)
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="MetaHuman")
    USkeletalMeshComponent* FaceMesh;

    // Hair — Groom component (assigned in BP)
    // Declared as USceneComponent so C++ doesn't require the Groom plugin header;
    // BP subclass casts to UGroomComponent and assigns the asset.
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="MetaHuman")
    USceneComponent* HairComponent;

    // ── Expression system ────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaHuman|Expression")
    EAgentExpression CurrentExpression = EAgentExpression::Neutral;

    // How fast expressions blend (morph target lerp speed)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaHuman|Expression")
    float ExpressionBlendSpeed = 3.5f;

    // Time between autonomous expression micro-shifts during idle
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaHuman|Expression")
    float IdleExpressionShiftInterval = 6.0f;

    UFUNCTION(BlueprintCallable, Category="MetaHuman|Expression")
    void SetExpression(EAgentExpression NewExpression, float BlendOverride = -1.f);

    // ── Gaze system ──────────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaHuman|Gaze")
    EGazeTarget CurrentGazeTarget = EGazeTarget::Workstation;

    // World-space gaze target (updated by SetGazeTarget or by Control Rig)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaHuman|Gaze")
    FVector GazeWorldPosition = FVector::ZeroVector;

    // How fast gaze tracks (degrees/sec)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaHuman|Gaze")
    float GazeLerpSpeed = 8.0f;

    // Saccade frequency during idle (small involuntary eye movements, Hz)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaHuman|Gaze")
    float SaccadeFrequency = 0.4f;

    UFUNCTION(BlueprintCallable, Category="MetaHuman|Gaze")
    void SetGazeTarget(EGazeTarget Target, AActor* OptionalActor = nullptr);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="MetaHuman|Gaze")
    FVector GetCurrentGazeWorldPosition() const { return SmoothedGazePosition; }

    // ── Workstation interaction ──────────────────────────────────────────────

    // Socket name on the workstation for hand IK (matched to Control Rig)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaHuman|IK")
    FName WorkstationSocketName = TEXT("Socket_HandInteract");

    // Reference to this agent's workstation actor
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaHuman|IK")
    AActor* WorkstationActor = nullptr;

    // IK alpha — 0=off, 1=full IK (driven by anim state)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaHuman|IK")
    float WorkstationIKAlpha = 0.f;

    // ── Holographic status beacon ────────────────────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="MetaHuman|FX")
    UNiagaraComponent* StatusBeacon;

    // ── BP hooks ──────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintImplementableEvent, Category="MetaHuman")
    void BP_OnExpressionChanged(EAgentExpression NewExpression);

    UFUNCTION(BlueprintImplementableEvent, Category="MetaHuman")
    void BP_OnGazeTargetChanged(EGazeTarget NewTarget, FVector WorldPosition);

    // Called from AnimBP to query current breathing amplitude (0..1)
    UFUNCTION(BlueprintCallable, BlueprintPure, Category="MetaHuman|Procedural")
    float GetBreathingAmplitude() const { return BreathingAmplitude; }

    // Called from AnimBP to query idle shift weight (0..1)
    UFUNCTION(BlueprintCallable, BlueprintPure, Category="MetaHuman|Procedural")
    float GetIdleShiftWeight() const { return IdleShiftWeight; }

    // Called from AnimBP to query IK alpha for workstation hands
    UFUNCTION(BlueprintCallable, BlueprintPure, Category="MetaHuman|Procedural")
    float GetWorkstationIKAlpha() const { return WorkstationIKAlpha; }

    // ── IAgentAnimDataProvider ────────────────────────────────────────────────

    virtual EAgentAnimState GetCurrentAnimState_Implementation() const override
        { return GetAnimState(); }
    virtual float GetAnimStateBlendAlpha_Implementation() const override { return 1.f; }
    virtual float GetBreathingValue_Implementation() const override
        { return 0.5f + 0.5f * FMath::Sin(BreathingPhase); }
    virtual float GetIdleShiftWeight_Implementation() const override { return IdleShiftWeight; }
    virtual float GetWorkstationIKAlpha_Implementation() const override { return WorkstationIKAlpha; }
    virtual float GetWorkProgress_Implementation() const override { return GetWorkProgress(); }
    virtual FVector GetGazeWorldPosition_Implementation() const override { return SmoothedGazePosition; }
    virtual float GetGazeLookWeight_Implementation() const override { return 1.f; }
    virtual float GetBrowConcernWeight_Implementation() const override;
    virtual float GetBrowFocusWeight_Implementation() const override;
    virtual float GetLipPressWeight_Implementation() const override;
    virtual float GetJawRelaxWeight_Implementation() const override;
    virtual FString GetAgentDisplayId_Implementation() const override { return GetAgentId(); }

protected:
    // Maps EAgentAnimState → preferred EAgentExpression
    virtual EAgentExpression ExpressionForAnimState(EAgentAnimState State) const;
    virtual EGazeTarget GazeForAnimState(EAgentAnimState State) const;

private:
    void TickBreathing(float DeltaTime);
    void TickGaze(float DeltaTime);
    void TickIdleShift(float DeltaTime);
    void TickExpressionBlend(float DeltaTime);
    void TickWorkstationIK(float DeltaTime);

    // Breathing
    float BreathingPhase     = 0.f;
    float BreathingFrequency = 0.22f; // ~13 breaths/min — calm professional
    float BreathingAmplitude = 0.f;
    float TargetBreathingAmplitude = 0.6f;

    // Idle shift — posture micro-variation
    float IdleShiftPhase   = 0.f;
    float IdleShiftWeight  = 0.f;
    float IdleShiftTimer   = 0.f;
    float NextShiftInterval = 0.f;

    // Gaze smoothing
    FVector SmoothedGazePosition   = FVector::ZeroVector;
    FVector TargetGazePosition     = FVector::ZeroVector;
    float SaccadePhase             = 0.f;
    float SaccadeAmplitude         = 4.f; // cm offset

    // Expression blend
    EAgentExpression TargetExpression = EAgentExpression::Neutral;
    float ExpressionAlpha          = 0.f;
    float IdleExpressionTimer      = 0.f;

    // IK
    float TargetIKAlpha            = 0.f;
    float IKBlendSpeed             = 3.f;
};
