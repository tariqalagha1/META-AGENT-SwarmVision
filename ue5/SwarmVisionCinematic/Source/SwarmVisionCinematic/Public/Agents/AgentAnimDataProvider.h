#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "Agents/SwarmAgentPawn.h"
#include "AgentAnimDataProvider.generated.h"

// ─── IAgentAnimDataProvider ───────────────────────────────────────────────────
//
// Interface implemented by ASwarmMetaHumanAgent (and ASwarmAgentPawn for fallback).
// Animation Blueprints call these via GetOwner()->TryGetInterface<IAgentAnimDataProvider>()
// to retrieve all procedural animation values in one place.
//
// Blueprint AnimBP usage:
//   1. In the Event Graph: cast Owner to IAgentAnimDataProvider
//   2. In the Anim Graph: drive curves from the interface getters each update

UINTERFACE(BlueprintType, Blueprintable)
class SWARMVISIONCINEMATIC_API UAgentAnimDataProvider : public UInterface
{
    GENERATED_BODY()
};

class SWARMVISIONCINEMATIC_API IAgentAnimDataProvider
{
    GENERATED_BODY()

public:
    // ── Core state ────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category="AgentAnim")
    EAgentAnimState GetCurrentAnimState() const;

    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category="AgentAnim")
    float GetAnimStateBlendAlpha() const; // 0=prev, 1=current, used for transition blending

    // ── Procedural values ─────────────────────────────────────────────────────

    // 0..1 breathing sinusoid amplitude — drives spine additive
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category="AgentAnim")
    float GetBreathingValue() const;

    // 0..1 idle shift blend weight — blends between idle pose variants
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category="AgentAnim")
    float GetIdleShiftWeight() const;

    // 0..1 workstation hand IK alpha — blends IK rig on/off
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category="AgentAnim")
    float GetWorkstationIKAlpha() const;

    // 0..1 work progress — drives procedural typing / interaction blend
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category="AgentAnim")
    float GetWorkProgress() const;

    // ── Gaze ─────────────────────────────────────────────────────────────────

    // World-space position to look at — drives head/eye IK in Control Rig
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category="AgentAnim")
    FVector GetGazeWorldPosition() const;

    // 0..1 gaze weight — blends head look IK contribution
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category="AgentAnim")
    float GetGazeLookWeight() const;

    // ── Expression ────────────────────────────────────────────────────────────

    // Morph target weight for "brow_concern" (0..1)
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category="AgentAnim")
    float GetBrowConcernWeight() const;

    // Morph target weight for "brow_focus" (0..1)
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category="AgentAnim")
    float GetBrowFocusWeight() const;

    // Morph target weight for "lip_press" — subtle tension
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category="AgentAnim")
    float GetLipPressWeight() const;

    // Morph target weight for "jaw_relax" — post-success ease
    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category="AgentAnim")
    float GetJawRelaxWeight() const;

    // ── Status ────────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category="AgentAnim")
    FString GetAgentDisplayId() const;
};
