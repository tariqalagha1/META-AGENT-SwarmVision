#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Data/SwarmEvent.h"
#include "Data/SwarmEventTypes.h"
#include "SwarmHUDBase.generated.h"

// ─── USwarmHUDBase ────────────────────────────────────────────────────────────
//
// Base class for all SwarmVision HUD widgets.
// Subscribes to SwarmEventRouterSubsystem on Init.
// BP subclasses override BP_OnSwarmEvent to react to events.
// BP subclasses override BP_OnAgentStateChanged for per-agent panels.

UCLASS(Abstract, Blueprintable)
class SWARMVISIONCINEMATIC_API USwarmHUDBase : public UUserWidget
{
    GENERATED_BODY()

public:
    virtual void NativeConstruct() override;
    virtual void NativeDestruct() override;

    // ── BP hooks ──────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintImplementableEvent, Category="HUD")
    void BP_OnSwarmEvent(const FSwarmEvent& Event);

    UFUNCTION(BlueprintImplementableEvent, Category="HUD")
    void BP_OnAgentStateChanged(const FString& AgentId, EAgentVisualState NewState);

    UFUNCTION(BlueprintImplementableEvent, Category="HUD")
    void BP_OnConnectionChanged(bool bConnected);

    // ── Utility BP functions ──────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD")
    FLinearColor AgentStateToColor(EAgentVisualState State) const;

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD")
    FText AgentStateToLabel(EAgentVisualState State) const;

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD")
    FLinearColor EventTypeToColor(ESwarmEventType EventType) const;

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD")
    FText EventTypeToLabel(ESwarmEventType EventType) const;

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD")
    bool IsRelayConnected() const;

private:
    UFUNCTION()
    void OnSwarmEvent(const FSwarmEvent& Event);

    UFUNCTION()
    void OnAgentStateChanged(const FString& AgentId, EAgentVisualState NewState);

    UFUNCTION()
    void OnConnectionChanged(bool bConnected);
};
