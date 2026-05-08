#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Data/SwarmEvent.h"
#include "Components/PointLightComponent.h"
#include "Components/TextRenderComponent.h"
#include "SwarmEventVisualizer.generated.h"

// ─── ASwarmEventVisualizer ────────────────────────────────────────────────────
//
// Minimal visual proof actor for Phase 1.
// Place one in the level per agent zone (or one globally).
// Reacts to live events from the subsystem:
//   - Tints an attached PointLight per zone/event colour
//   - Updates a TextRenderComponent with the latest event type
//
// This is the fastest possible visual confirmation that the pipeline works.
// Replace with BP_ZoneController in Phase 2.

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API ASwarmEventVisualizer : public AActor
{
    GENERATED_BODY()

public:
    ASwarmEventVisualizer();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

    // Which agent this visualizer tracks ("" = all events)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="SwarmViz")
    FString WatchAgentId;

    // If true, responds to all events regardless of agent_id
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="SwarmViz")
    bool bGlobalMode = false;

    // How long to hold the event colour before fading back to idle
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="SwarmViz")
    float ColorHoldSeconds = 2.0f;

protected:
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Components")
    UPointLightComponent* EventLight;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Components")
    UTextRenderComponent* EventLabel;

private:
    UFUNCTION()
    void OnSwarmEventReceived(const FSwarmEvent& Event);

    UFUNCTION()
    void OnAgentStateChanged(const FString& AgentId, EAgentVisualState NewState);

    void ApplyEventColor(ESwarmEventType EventType);
    void ApplyStateColor(EAgentVisualState State);

    FTimerHandle ColorResetTimer;
    void ResetToIdleColor();

    static FLinearColor EventTypeColor(ESwarmEventType EventType);
    static FLinearColor AgentStateColor(EAgentVisualState State);
};
