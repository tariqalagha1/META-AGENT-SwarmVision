#pragma once

#include "CoreMinimal.h"
#include "Camera/CinematicDirector.h"
#include "Intelligence/SwarmIntelligenceSubsystem.h"
#include "IntelligentCinematicDirector.generated.h"

// ─── AIntelligentCinematicDirector ────────────────────────────────────────────
//
// Extends ACinematicDirector with narrative intelligence.
//
// Phase 3 director: event → shot table lookup (reactive).
// Phase 5 director: tension × narrative phase × recommended shots → cinematically
//                   paced, semantically coherent shot selection (proactive).
//
// The intelligence subsystem provides NarrativeState every 2s.
// This director blends the recommended shots into its existing shot queue,
// overriding the event-reactive shot when narrative tension justifies it.

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API AIntelligentCinematicDirector : public ACinematicDirector
{
    GENERATED_BODY()

public:
    AIntelligentCinematicDirector();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;

    // ── Narrative mode ─────────────────────────────────────────────────────────

    // When true: narrative intelligence overrides event-reactive shot selection
    // when tension delta or phase change warrants it.
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Intelligence")
    bool bNarrativeModeEnabled = true;

    // Minimum tension threshold to override current shot with narrative suggestion
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Intelligence")
    float TensionOverrideThreshold = 0.55f;

    // How quickly tension-driven parameters (lighting, pacing) interpolate
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Intelligence")
    float TensionBlendSpeed = 1.5f;

    // ── Atmosphere response ────────────────────────────────────────────────────

    // When true: forward tension to AAtmosphereController for real-time response
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Intelligence")
    bool bDrivesAtmosphere = true;

    // ── BP hooks ──────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintImplementableEvent, Category="Intelligence")
    void BP_OnNarrativePhaseChanged(ENarrativePhase NewPhase, float Tension);

    UFUNCTION(BlueprintImplementableEvent, Category="Intelligence")
    void BP_OnStoryBeatChanged(const FString& Beat);

    UFUNCTION(BlueprintImplementableEvent, Category="Intelligence")
    void BP_OnTensionChanged(float OldTension, float NewTension);

protected:
    // Called when intelligence subsystem delivers a new NarrativeState
    UFUNCTION()
    void OnNarrativeStateUpdated(const FNarrativeState& NewState);

    UFUNCTION()
    void OnIncidentDetected(const FString& Kind, const FString& Description);

private:
    void ApplyNarrativeShot(const FRecommendedShot& Shot);
    void SyncAtmosphere(float Tension, ENarrativePhase Phase);
    AActor* ResolveTargetActor(const FString& ActorId) const;

    ENarrativePhase PreviousPhase    = ENarrativePhase::Dormant;
    float           SmoothedTension  = 0.f;
    float           LastTension      = 0.f;

    // Cooldown: don't override shot more than once per N seconds
    float           NarrativeOverrideCooldown = 0.f;
    static constexpr float OVERRIDE_COOLDOWN_S = 4.0f;
};
