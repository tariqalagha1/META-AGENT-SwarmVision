#pragma once

#include "CoreMinimal.h"
#include "HUD/SwarmHUDBase.h"
#include "Data/SwarmEvent.h"
#include "PipelineStatusPanel.generated.h"

// One entry per agent in the pipeline status panel
USTRUCT(BlueprintType)
struct FAgentStatusEntry
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly)
    FString AgentId;

    UPROPERTY(BlueprintReadOnly)
    EAgentVisualState State = EAgentVisualState::Idle;

    UPROPERTY(BlueprintReadOnly)
    FString CurrentStep;

    UPROPERTY(BlueprintReadOnly)
    float QualityScore = 0.f;

    UPROPERTY(BlueprintReadOnly)
    int32 RetryCount = 0;

    UPROPERTY(BlueprintReadOnly)
    FString LastEventTimestamp;
};

// ─── UPipelineStatusPanel ─────────────────────────────────────────────────────
//
// Displays the 3-agent pipeline status row: fetch → normalize → quality.
// BP subclass (WBP_PipelineStatusPanel) implements the visual layout.
// C++ provides the data model via GetAgentStatus / GetAllAgentStatuses.

UCLASS(Abstract, Blueprintable)
class SWARMVISIONCINEMATIC_API UPipelineStatusPanel : public USwarmHUDBase
{
    GENERATED_BODY()

public:
    // Get current status for a specific agent
    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Pipeline")
    bool GetAgentStatus(const FString& AgentId, FAgentStatusEntry& OutStatus) const;

    // Get all agent statuses
    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Pipeline")
    TArray<FAgentStatusEntry> GetAllAgentStatuses() const;

    // BP hook — called whenever any agent status changes
    UFUNCTION(BlueprintImplementableEvent, Category="HUD|Pipeline")
    void BP_OnAgentStatusUpdated(const FAgentStatusEntry& Entry);

    // BP hook — called when overall pipeline progression changes (0.0..1.0)
    UFUNCTION(BlueprintImplementableEvent, Category="HUD|Pipeline")
    void BP_OnPipelineProgressChanged(float Progress);

protected:
    virtual void NativeConstruct() override;

    // Override from SwarmHUDBase
    virtual void BP_OnSwarmEvent_Implementation(const FSwarmEvent& Event) {}

private:
    UFUNCTION()
    void OnSwarmEventForPanel(const FSwarmEvent& Event);

    UFUNCTION()
    void OnAgentStateForPanel(const FString& AgentId, EAgentVisualState NewState);

    TMap<FString, FAgentStatusEntry> AgentStatuses;
    float PipelineProgress = 0.f;

    void UpdatePipelineProgress();
};
