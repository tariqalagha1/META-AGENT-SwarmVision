#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "Data/SwarmEvent.h"
#include "Data/SwarmEventTypes.h"
#include "Components/SkeletalMeshComponent.h"
#include "NiagaraComponent.h"
#include "SwarmAgentPawn.generated.h"

// 6 animation states — drives AnimBP anim graph
UENUM(BlueprintType)
enum class EAgentAnimState : uint8
{
    Idle       UMETA(DisplayName="Idle"),
    Working    UMETA(DisplayName="Working"),
    Handoff    UMETA(DisplayName="Handoff"),
    Failed     UMETA(DisplayName="Failed"),
    Retry      UMETA(DisplayName="Retry"),
    Complete   UMETA(DisplayName="Complete"),
};

// Broadcast when animation state changes (for AnimBP polling)
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(
    FOnAgentAnimStateChanged,
    EAgentAnimState, NewState,
    EAgentAnimState, PrevState
);

// ─── ASwarmAgentPawn ──────────────────────────────────────────────────────────
//
// Placeholder agent actor — place one per agent in the level.
// Set AgentId to match the backend agent ID (e.g. "fetch_agent").
// Listens to SwarmEventRouterSubsystem events, drives its own anim state.
// Replace SkeletalMesh with MetaHuman in Phase 3.
//
// AnimBP can poll GetAnimState() or bind OnAgentAnimStateChanged.

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API ASwarmAgentPawn : public APawn
{
    GENERATED_BODY()

public:
    ASwarmAgentPawn();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
    virtual void Tick(float DeltaTime) override;

    // ── Config ────────────────────────────────────────────────────────────────

    // Must match backend agent_id exactly
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Agent")
    FString AgentId;

    // Zone this agent inhabits (for light integration)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Agent")
    EZoneId HomeZone = EZoneId::Intake;

    // How long to hold non-Idle states before reverting (0 = hold forever)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Agent")
    float StateHoldDuration = 0.f;

    // ── Components ────────────────────────────────────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Components")
    USkeletalMeshComponent* Mesh;

    // Status indicator light above agent
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Components")
    class UPointLightComponent* StatusLight;

    // FX for active work state
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Components")
    UNiagaraComponent* WorkFX;

    // ── State API ─────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Agent")
    EAgentAnimState GetAnimState() const { return AnimState; }

    UFUNCTION(BlueprintCallable, Category="Agent")
    void SetAnimState(EAgentAnimState NewState);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Agent")
    FString GetAgentId() const { return AgentId; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Agent")
    float GetWorkProgress() const { return WorkProgress; }

    // ── Delegate ─────────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category="Agent")
    FOnAgentAnimStateChanged OnAgentAnimStateChanged;

    // ── BP hooks ──────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintImplementableEvent, Category="Agent")
    void BP_OnAnimStateChanged(EAgentAnimState NewState, EAgentAnimState PrevState);

    UFUNCTION(BlueprintImplementableEvent, Category="Agent")
    void BP_OnEventReceived(const FSwarmEvent& Event);

private:
    UFUNCTION()
    void OnSwarmEventReceived(const FSwarmEvent& Event);

    UFUNCTION()
    void OnAgentVisualStateChanged(const FString& InAgentId, EAgentVisualState VisualState);

    void ApplyStateToStatusLight(EAgentAnimState State);
    EAgentAnimState VisualStateToAnimState(EAgentVisualState VisualState) const;

    EAgentAnimState AnimState     = EAgentAnimState::Idle;
    EAgentAnimState PrevAnimState = EAgentAnimState::Idle;

    // Simulated work progress (0..1) driven by Working state tick
    float WorkProgress      = 0.f;
    float WorkProgressSpeed = 0.08f; // units/sec — reaches 1.0 over ~12s

    float StateHoldTimer = 0.f;
    bool  bHoldingState  = false;
};
