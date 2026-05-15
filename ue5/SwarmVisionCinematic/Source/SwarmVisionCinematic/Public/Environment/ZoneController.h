#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Environment/ZoneTypes.h"
#include "Data/SwarmEvent.h"
#include "Components/PointLightComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "NiagaraComponent.h"
#include "ZoneController.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(
    FOnZoneStateChanged,
    EZoneId, ZoneId,
    EZoneState, NewState
);

// ─── AZoneController ──────────────────────────────────────────────────────────
//
// One placed per physical zone on the operations floor.
// Owns the zone's:
//   - Key light (RectLight/SpotLight above work surface)
//   - Ambient fill (local SkyLight equivalent via PointLight fill)
//   - Floor channel emissive (via MPC_ZoneEmissives parameter write)
//   - Niagara ambient FX system
//   - State machine driven by USwarmEventRouterSubsystem events
//
// Place in level and set ZoneId in Details panel.
// The zone auto-subscribes to the event router at BeginPlay.

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API AZoneController : public AActor
{
    GENERATED_BODY()

public:
    AZoneController();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
    virtual void Tick(float DeltaTime) override;

    // ── Configuration ────────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Zone")
    EZoneId ZoneId = EZoneId::Intake;

    // Agent ID this zone responds to (blank = respond to swarm-level events only)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Zone")
    FString AgentId;

    // Override zone colors (default comes from FZoneColors::ForZone)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Zone")
    bool bOverrideColors = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Zone",
              meta=(EditCondition="bOverrideColors"))
    FZoneColors ColorOverride;

    // MPC parameter names this zone drives
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Zone|MPC")
    FName MPC_IntensityParam;   // e.g. "Fetch_ChannelIntensity"

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Zone|MPC")
    FName MPC_ColorParam;       // e.g. "Fetch_EmissiveColor"

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Zone|MPC")
    FName MPC_AmbientParam;     // e.g. "Fetch_ZoneAmbientIntensity"

    // Reference to the global MPC_ZoneEmissives asset
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Zone|MPC")
    class UMaterialParameterCollection* ZoneMPC = nullptr;

    // Transition timing configs per state
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Zone|Transitions")
    TMap<EZoneState, FZoneTransitionParams> TransitionParams;

    // ── State API ────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category="Zone")
    void SetZoneState(EZoneState NewState);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Zone")
    EZoneState GetZoneState() const { return CurrentState; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Zone")
    FZoneColors GetZoneColors() const { return Colors; }

    // ── Delegate ─────────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category="Zone")
    FOnZoneStateChanged OnZoneStateChanged;

    // ── Light components (assignable from level or via Blueprint) ─────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Components")
    UPointLightComponent* KeyLight;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Components")
    UPointLightComponent* FillLight;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Components")
    UNiagaraComponent* AmbientFX;

    // Optional floor mesh that gets a dynamic material driven by zone state
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Components")
    UStaticMeshComponent* FloorIndicator;

    // ── Blueprint hooks ──────────────────────────────────────────────────────

    UFUNCTION(BlueprintImplementableEvent, Category="Zone")
    void BP_OnZoneStateEntered(EZoneState NewState, EZoneState PreviousState);

    UFUNCTION(BlueprintImplementableEvent, Category="Zone")
    void BP_OnEventReceived(const FSwarmEvent& Event);

private:
    UFUNCTION()
    void OnSwarmEventReceived(const FSwarmEvent& Event);

    void ApplyStateToLights(EZoneState State);
    void ApplyStateToMPC(EZoneState State, float Intensity);
    void ApplyStateToDynamicMaterial(EZoneState State);

    // Per-tick light interpolation toward target
    void TickLightInterpolation(float DeltaTime);

    // Pulse sub-system (used in Success / Retry states)
    void TickPulse(float DeltaTime);
    void StartPulse(float Frequency, int32 Count, FLinearColor PulseColor);
    void StopPulse();

    EZoneState CurrentState = EZoneState::Dark;
    EZoneState PreviousState = EZoneState::Dark;

    FZoneColors Colors;

    // Light interpolation state
    FLinearColor CurrentLightColor;
    FLinearColor TargetLightColor;
    float CurrentKeyIntensity  = 0.f;
    float TargetKeyIntensity   = 0.f;
    float CurrentFillIntensity = 0.f;
    float TargetFillIntensity  = 0.f;
    float LerpAlpha            = 1.f; // 1 = reached target
    float LerpDuration         = 0.5f;

    // Pulse state
    bool  bPulsing          = false;
    float PulsePhase        = 0.f;
    float PulseFreq         = 1.f;
    int32 PulseBeatsLeft    = -1;
    FLinearColor PulseColor;
    float PulseBaseIntensity = 0.f;

    // Dynamic floor material instance
    UMaterialInstanceDynamic* FloorMID = nullptr;

    static float IntensityForState(EZoneState State);
    static FLinearColor ColorForState(EZoneState State, const FZoneColors& ZoneColors);
};
