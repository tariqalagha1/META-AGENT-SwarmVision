#include "HUD/PipelineStatusPanel.h"
#include "Subsystems/SwarmEventRouterSubsystem.h"

void UPipelineStatusPanel::NativeConstruct()
{
    Super::NativeConstruct();

    // Pre-populate known agents
    for (const FString& Aid : { FString(TEXT("fetch_agent")),
                                  FString(TEXT("normalize_agent")),
                                  FString(TEXT("quality_agent")) })
    {
        FAgentStatusEntry Entry;
        Entry.AgentId = Aid;
        AgentStatuses.Add(Aid, Entry);
    }

    // Direct subscriptions so we can update the data model
    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.AddDynamic(this, &UPipelineStatusPanel::OnSwarmEventForPanel);
            Router->OnAgentStateChanged.AddDynamic(this, &UPipelineStatusPanel::OnAgentStateForPanel);
        }
    }
}

// ─── Data access ─────────────────────────────────────────────────────────────

bool UPipelineStatusPanel::GetAgentStatus(const FString& AgentId,
                                            FAgentStatusEntry& OutStatus) const
{
    if (const FAgentStatusEntry* Found = AgentStatuses.Find(AgentId))
    {
        OutStatus = *Found;
        return true;
    }
    return false;
}

TArray<FAgentStatusEntry> UPipelineStatusPanel::GetAllAgentStatuses() const
{
    TArray<FAgentStatusEntry> Result;
    AgentStatuses.GenerateValueArray(Result);
    return Result;
}

// ─── Private event handlers ───────────────────────────────────────────────────

void UPipelineStatusPanel::OnSwarmEventForPanel(const FSwarmEvent& Event)
{
    if (Event.AgentId.IsEmpty())
    {
        return;
    }

    FAgentStatusEntry& Entry = AgentStatuses.FindOrAdd(Event.AgentId);
    Entry.AgentId           = Event.AgentId;
    Entry.LastEventTimestamp = Event.Timestamp;
    Entry.CurrentStep       = Event.GetDataField(TEXT("step_name"));

    const FString QStr = Event.GetDataField(TEXT("quality_score"));
    if (!QStr.IsEmpty())
    {
        Entry.QualityScore = FCString::Atof(*QStr);
    }

    if (Event.EventType == ESwarmEventType::AgentStepRetry ||
        Event.EventType == ESwarmEventType::Retry)
    {
        Entry.RetryCount++;
    }

    BP_OnAgentStatusUpdated(Entry);
    UpdatePipelineProgress();
}

void UPipelineStatusPanel::OnAgentStateForPanel(const FString& AgentId,
                                                  EAgentVisualState NewState)
{
    FAgentStatusEntry& Entry = AgentStatuses.FindOrAdd(AgentId);
    Entry.AgentId = AgentId;
    Entry.State   = NewState;
    BP_OnAgentStatusUpdated(Entry);
}

void UPipelineStatusPanel::UpdatePipelineProgress()
{
    int32 CompletedCount = 0;
    for (auto& Pair : AgentStatuses)
    {
        if (Pair.Value.State == EAgentVisualState::Complete)
        {
            ++CompletedCount;
        }
    }

    const int32 TotalAgents = FMath::Max(AgentStatuses.Num(), 1);
    PipelineProgress = FMath::Clamp((float)CompletedCount / TotalAgents, 0.f, 1.f);
    BP_OnPipelineProgressChanged(PipelineProgress);
}
