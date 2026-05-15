#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Data/SwarmEvent.h"
#include "NiagaraComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/PostProcessComponent.h"
#include "Materials/MaterialParameterCollection.h"
#include "AtmosphereController.generated.h"

// ─── FAtmosphereState ──────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FAtmosphereState
{
    GENERATED_BODY()

    // Volumetric fog density
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float FogDensity = 0.02f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FLinearColor FogInscatteringColor = FLinearColor(0.02f, 0.03f, 0.06f);

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float FogStartDistance = 50.f;

    // Post-process bloom
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float BloomIntensity = 0.8f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float BloomThreshold = 1.2f;

    // Vignette
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float VignetteIntensity = 0.5f;

    // Chromatic aberration (subtle lens distortion)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float ChromaticAberration = 0.05f;

    // Screen flicker amplitude (driven via MPC)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float FlickerAmplitude = 0.f;

    // Grain
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float GrainIntensity = 0.1f;

    // Transition duration to reach this state
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float TransitionDuration = 2.0f;
};

// ─── AAtmosphereController ────────────────────────────────────────────────────
//
// One placed in the level.
// Controls: volumetric fog, post-process bloom/vignette/grain,
//           ambient Niagara dust/haze, screen flicker (via MPC),
//           emissive drift animation (via MPC).
// Reacts to swarm events to shift the room's emotional atmosphere.

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API AAtmosphereController : public AActor
{
    GENERATED_BODY()

public:
    AAtmosphereController();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
    virtual void Tick(float DeltaTime) override;

    // ── Scene component refs ──────────────────────────────────────────────────

    // Drag the level's ExponentialHeightFog actor here
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Atmosphere|Scene")
    class AExponentialHeightFog* SceneHeightFog = nullptr;

    // Post-process volume (or use built-in PostProcessComponent)
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Atmosphere|Scene")
    UPostProcessComponent* PostProcess;

    // ── Niagara atmosphere FX ─────────────────────────────────────────────────

    // Ambient dust particles
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Atmosphere|FX")
    UNiagaraComponent* AmbientDust;

    // Volumetric haze wisps
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Atmosphere|FX")
    UNiagaraComponent* VolumetricHaze;

    // ── MPC ───────────────────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Atmosphere|MPC")
    UMaterialParameterCollection* AtmosphereMPC = nullptr;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Atmosphere|MPC")
    FName MPC_FlickerParam        = TEXT("Screen_FlickerIntensity");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Atmosphere|MPC")
    FName MPC_EmissiveDriftParam  = TEXT("Emissive_DriftSpeed");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Atmosphere|MPC")
    FName MPC_HazeIntensityParam  = TEXT("Room_HazeIntensity");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Atmosphere|MPC")
    FName MPC_AirDensityParam     = TEXT("Room_AirDensity");

    // ── Pre-configured states ────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Atmosphere|States")
    FAtmosphereState State_Dormant;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Atmosphere|States")
    FAtmosphereState State_Active;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Atmosphere|States")
    FAtmosphereState State_Anomaly;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Atmosphere|States")
    FAtmosphereState State_Failed;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Atmosphere|States")
    FAtmosphereState State_Complete;

    // ── API ───────────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category="Atmosphere")
    void TransitionToAtmosphereState(const FAtmosphereState& Target);

    UFUNCTION(BlueprintCallable, Category="Atmosphere")
    void TriggerFlicker(float Duration, float Intensity);

    // ── BP hooks ──────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintImplementableEvent, Category="Atmosphere")
    void BP_OnAtmosphereStateChanged(const FAtmosphereState& NewState);

private:
    UFUNCTION()
    void OnSwarmEventReceived(const FSwarmEvent& Event);

    void TickAtmosphereInterp(float DeltaTime);
    void TickFlicker(float DeltaTime);
    void TickEmissiveDrift(float DeltaTime);
    void ApplyAtmosphereStateDirect(const FAtmosphereState& State);

    FAtmosphereState CurrentState;
    FAtmosphereState TargetState;
    float AtmosphereAlpha    = 1.f;
    float AtmosphereDuration = 2.f;

    // Flicker
    bool  bFlickering       = false;
    float FlickerTimer      = 0.f;
    float FlickerDuration   = 0.f;
    float FlickerIntensity  = 0.f;
    float FlickerPhase      = 0.f;

    // Emissive drift animation
    float EmissiveDriftTime  = 0.f;
    float EmissiveDriftSpeed = 1.0f;
};
