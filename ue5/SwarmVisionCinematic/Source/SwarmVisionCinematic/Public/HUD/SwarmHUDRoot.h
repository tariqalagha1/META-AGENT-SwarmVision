#pragma once

#include "CoreMinimal.h"
#include "HUD/SwarmHUDBase.h"
#include "SwarmHUDRoot.generated.h"

// ─── USwarmHUDRoot ────────────────────────────────────────────────────────────
//
// Root widget — WBP_HUDRoot in Blueprint.
// Manages lifecycle of all sub-panels.
// Added to viewport by ASwarmGameMode or ASwarmCameraDirector.
//
// Sub-panel widgets should be BindWidget variables in the Blueprint subclass:
//   - WBP_PipelineStatusPanel  (UPipelineStatusPanel)
//   - WBP_EventLog             (UEventLogPanel)
//   - WBP_ActiveTaskPanel      (UActiveTaskPanel)
//   - WBP_QualityScoreDisplay  (UQualityScoreDisplay)
//   - WBP_AlertPanel           (UAlertPanel)

UCLASS(Abstract, Blueprintable)
class SWARMVISIONCINEMATIC_API USwarmHUDRoot : public USwarmHUDBase
{
    GENERATED_BODY()

public:
    virtual void NativeConstruct() override;

    // Called when connection status changes — updates connection indicator
    UFUNCTION(BlueprintImplementableEvent, Category="HUD|Root")
    void BP_UpdateConnectionIndicator(bool bConnected);

    // Fade all panels in/out (e.g. on swarm start/end)
    UFUNCTION(BlueprintCallable, BlueprintImplementableEvent, Category="HUD|Root")
    void BP_FadeHUD(bool bVisible, float Duration);

    // Override visibility per context (Cinematic = hidden, Monitoring = full)
    UFUNCTION(BlueprintCallable, Category="HUD|Root")
    void SetCinematicMode(bool bCinematic);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Root")
    bool IsCinematicMode() const { return bCinematicMode; }

private:
    bool bCinematicMode = false;
};
