#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Data/SwarmEvent.h"
#include "Environment/ZoneTypes.h"
#include "Lighting/CinematicLightingState.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/PostProcessComponent.h"
#include "LightOrchestrator.generated.h"

// ─── FGlobalLightState ────────────────────────────────────────────────────────
// Snapshot of desired global lighting for interpolation.

USTRUCT(BlueprintType)
struct FGlobalLightState
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FLinearColor AmbientColor = FLinearColor(0.02f, 0.02f, 0.04f);

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float SkyLightIntensity = 0.3f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float DirectionalIntensity = 0.5f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float PostProcessExposure = 1.0f;

    // Duration to reach this state (seconds)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float TransitionDuration = 1.0f;
};

// ─── ALightOrchestrator ───────────────────────────────────────────────────────
//
// One placed per level — listens to swarm events and drives:
//   1. Global ambient (sky light intensity + color temperature)
//   2. All AZoneController actors via direct SetZoneState calls
//   3. MPC_GlobalEmissives (corridor strips, ceiling panels, data channels)
//   4. Alert-level global pulses (anomaly, swarm fail)
//
// Zone → zone routing is handled here when events carry no agent ID
// (e.g. SWARM_STARTED wakes ALL zones; SWARM_COMPLETED triggers cascade).

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API ALightOrchestrator : public AActor
{
    GENERATED_BODY()

public:
    ALightOrchestrator();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
    virtual void Tick(float DeltaTime) override;

    // ── Scene light refs ──────────────────────────────────────────────────────

    // Drag the level's SkyLight here in Details panel
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|Scene")
    class ASkyLight* SceneSkyLight = nullptr;

    // Drag the level's DirectionalLight here
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|Scene")
    class ADirectionalLight* SceneDirectionalLight = nullptr;

    // ── Global MPC ────────────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|MPC")
    class UMaterialParameterCollection* GlobalMPC = nullptr;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|MPC")
    FName MPC_GlobalAmbientParam = TEXT("Global_AmbientIntensity");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|MPC")
    FName MPC_AlertColorParam = TEXT("Global_AlertColor");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|MPC")
    FName MPC_AlertIntensityParam = TEXT("Global_AlertIntensity");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|MPC")
    FName MPC_CorridorFlowParam = TEXT("Corridor_FlowIntensity");

    // ── Pre-configured global states ─────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|States")
    FGlobalLightState State_PreSwarm;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|States")
    FGlobalLightState State_SwarmActive;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|States")
    FGlobalLightState State_SwarmComplete;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|States")
    FGlobalLightState State_Anomaly;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|States")
    FGlobalLightState State_SwarmFailed;

    // Alert pulse config
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|Alert")
    float AlertPulseFrequency = 2.5f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|Alert")
    int32 AlertPulseCount = 6;

    // ── API ──────────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category="Lighting")
    void TransitionToGlobalState(const FGlobalLightState& TargetState);

    UFUNCTION(BlueprintCallable, Category="Lighting")
    void TriggerGlobalAlert(FLinearColor AlertColor, float Frequency, int32 Count);

    UFUNCTION(BlueprintCallable, Category="Lighting")
    void SetCorridorFlowIntensity(float Intensity);

    UFUNCTION(BlueprintCallable, Category="Lighting")
    void BroadcastZoneState(EZoneState State); // Set all zones to same state

    // ── Phase 3: Cinematic post-process component ────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Lighting|Cinematic")
    UPostProcessComponent* CinematicPP;

    // ── Phase 3: Per-event cinematic lighting states ──────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|Cinematic")
    FCinematicLightingState Cinematic_Dormant;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|Cinematic")
    FCinematicLightingState Cinematic_Active;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|Cinematic")
    FCinematicLightingState Cinematic_Handoff;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|Cinematic")
    FCinematicLightingState Cinematic_Success;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|Cinematic")
    FCinematicLightingState Cinematic_Failed;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|Cinematic")
    FCinematicLightingState Cinematic_Retry;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|Cinematic")
    FCinematicLightingState Cinematic_Anomaly;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|Cinematic")
    FCinematicLightingState Cinematic_Complete;

    // MPC params for corridor color/flow
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lighting|MPC")
    FName MPC_CorridorColorParam = TEXT("Corridor_FlowColor");

    // ── Phase 3: Cinematic API ────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category="Lighting|Cinematic")
    void TransitionToCinematicState(const FCinematicLightingState& State);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Lighting|Cinematic")
    float GetCinematicLerpAlpha() const { return CinematicLerpAlpha; }

    // ── BP hooks ──────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintImplementableEvent, Category="Lighting")
    void BP_OnGlobalStateChanged(FGlobalLightState NewState);

    UFUNCTION(BlueprintImplementableEvent, Category="Lighting")
    void BP_OnAlertTriggered(FLinearColor AlertColor);

    UFUNCTION(BlueprintImplementableEvent, Category="Lighting")
    void BP_OnCinematicStateChanged(const FCinematicLightingState& NewState);

private:
    UFUNCTION()
    void OnSwarmEventReceived(const FSwarmEvent& Event);

    void TickGlobalInterpolation(float DeltaTime);
    void TickAlertPulse(float DeltaTime);
    void TickCinematicInterpolation(float DeltaTime);
    void ApplyGlobalStateDirect(const FGlobalLightState& State);
    void ApplyCinematicStateDirect(const FCinematicLightingState& State);
    void BuildDefaultCinematicStates();

    // Find all AZoneController actors in the level
    TArray<class AZoneController*> GetAllZoneControllers() const;

    // Current interpolation
    FGlobalLightState CurrentGlobalState;
    FGlobalLightState TargetGlobalState;
    float GlobalLerpAlpha    = 1.f;
    float GlobalLerpDuration = 1.f;

    // Alert pulse state
    bool  bAlerting        = false;
    float AlertPhase       = 0.f;
    float AlertFreq        = 2.5f;
    int32 AlertBeatsLeft   = -1;
    FLinearColor AlertColor;
    float CorridorFlowTarget    = 0.f;
    float CorridorFlowCurrent   = 0.f;

    // Cinematic state interpolation
    FCinematicLightingState CurrentCinematicState;
    FCinematicLightingState TargetCinematicState;
    float CinematicLerpAlpha    = 1.f;
    float CinematicLerpDuration = 1.5f;
};
