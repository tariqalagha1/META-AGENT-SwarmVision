#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Data/SwarmEvent.h"
#include "NiagaraComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "MetaAgentEntity.generated.h"

// Presence state of the holographic meta-agent
UENUM(BlueprintType)
enum class EMetaAgentPresence : uint8
{
    Dormant         UMETA(DisplayName="Dormant"),       // invisible, pre-swarm
    Materializing   UMETA(DisplayName="Materializing"), // appearing FX
    Observing       UMETA(DisplayName="Observing"),     // idle holographic form
    Directing       UMETA(DisplayName="Directing"),     // reacting to planner events
    AlertState      UMETA(DisplayName="AlertState"),    // anomaly response
    Dissolving      UMETA(DisplayName="Dissolving"),    // swarm complete, fading
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(
    FOnMetaAgentPresenceChanged,
    EMetaAgentPresence, NewPresence,
    EMetaAgentPresence, PrevPresence
);

// ─── AMetaAgentEntity ─────────────────────────────────────────────────────────
//
// Holographic meta-agent / orchestrator observer.
// Exists in the Mezzanine zone as a floating holographic form.
// Not a MetaHuman — purely particle / emissive mesh based.
// Reacts to swarm-level events: SwarmStarted, PlannerDecision, Anomaly, MetaInsight.
//
// The visual form is entirely Blueprint-driven via BP_MetaAgentEntity.
// C++ owns: presence state machine, Niagara systems, ambient light, event routing.

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API AMetaAgentEntity : public AActor
{
    GENERATED_BODY()

public:
    AMetaAgentEntity();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
    virtual void Tick(float DeltaTime) override;

    // ── Components ────────────────────────────────────────────────────────────

    // Core holographic form mesh (emissive hologram material)
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="MetaAgent")
    UStaticMeshComponent* HologramMesh;

    // Orbit ring Niagara system
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="MetaAgent")
    UNiagaraComponent* OrbitFX;

    // Data stream connections (tendrils to zones)
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="MetaAgent")
    UNiagaraComponent* DataStreamFX;

    // Pulse aura during active events
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="MetaAgent")
    UNiagaraComponent* PulseFX;

    // Ambient light — dim cyan tint on surroundings
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="MetaAgent")
    UPointLightComponent* AmbientLight;

    // ── Config ────────────────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaAgent")
    FLinearColor BaseColor = FLinearColor(0.1f, 0.8f, 1.0f);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaAgent")
    FLinearColor AlertColor = FLinearColor(1.0f, 0.1f, 0.1f);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaAgent")
    FLinearColor InsightColor = FLinearColor(0.8f, 1.0f, 0.4f);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaAgent")
    float MaterializeTime = 2.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaAgent")
    float DissolveTime = 3.5f;

    // Hover oscillation amplitude (cm)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaAgent")
    float HoverAmplitude = 8.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MetaAgent")
    float HoverFrequency = 0.4f;

    // ── State API ─────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category="MetaAgent")
    void SetPresence(EMetaAgentPresence NewPresence);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="MetaAgent")
    EMetaAgentPresence GetPresence() const { return CurrentPresence; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="MetaAgent")
    float GetMaterializeAlpha() const { return MaterializeAlpha; }

    // ── Delegate ─────────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category="MetaAgent")
    FOnMetaAgentPresenceChanged OnPresenceChanged;

    // ── BP hooks ──────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintImplementableEvent, Category="MetaAgent")
    void BP_OnPresenceChanged(EMetaAgentPresence NewPresence);

    UFUNCTION(BlueprintImplementableEvent, Category="MetaAgent")
    void BP_OnMetaInsight(const FSwarmEvent& Event);

    UFUNCTION(BlueprintImplementableEvent, Category="MetaAgent")
    void BP_OnPlannerDecision(const FSwarmEvent& Event);

    UFUNCTION(BlueprintImplementableEvent, Category="MetaAgent")
    void BP_OnAnomalyDetected(const FSwarmEvent& Event);

private:
    UFUNCTION()
    void OnSwarmEventReceived(const FSwarmEvent& Event);

    void TickMaterialize(float DeltaTime);
    void TickHover(float DeltaTime);
    void TickColorPulse(float DeltaTime);
    void ApplyPresenceToFX(EMetaAgentPresence Presence);

    EMetaAgentPresence CurrentPresence = EMetaAgentPresence::Dormant;
    EMetaAgentPresence PrevPresence    = EMetaAgentPresence::Dormant;

    float MaterializeAlpha = 0.f;   // 0=invisible, 1=fully materialized
    float MaterializeDir   = 0.f;   // +1=materializing, -1=dissolving
    float HoverPhase       = 0.f;
    FVector BaseLocation   = FVector::ZeroVector;

    // Color pulse for event reactions
    FLinearColor CurrentEmissiveColor;
    FLinearColor TargetEmissiveColor;
    float ColorPulseAlpha = 1.f;

    UMaterialInstanceDynamic* HologramMID = nullptr;
};
