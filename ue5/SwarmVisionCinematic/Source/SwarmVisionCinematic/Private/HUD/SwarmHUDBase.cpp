#include "HUD/SwarmHUDBase.h"
#include "Subsystems/SwarmEventRouterSubsystem.h"

void USwarmHUDBase::NativeConstruct()
{
    Super::NativeConstruct();

    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.AddDynamic(this, &USwarmHUDBase::OnSwarmEvent);
            Router->OnAgentStateChanged.AddDynamic(this, &USwarmHUDBase::OnAgentStateChanged);
            Router->OnRelayConnectionChanged.AddDynamic(this, &USwarmHUDBase::OnConnectionChanged);
        }
    }
}

void USwarmHUDBase::NativeDestruct()
{
    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.RemoveDynamic(this, &USwarmHUDBase::OnSwarmEvent);
            Router->OnAgentStateChanged.RemoveDynamic(this, &USwarmHUDBase::OnAgentStateChanged);
            Router->OnRelayConnectionChanged.RemoveDynamic(this, &USwarmHUDBase::OnConnectionChanged);
        }
    }
    Super::NativeDestruct();
}

void USwarmHUDBase::OnSwarmEvent(const FSwarmEvent& Event)
{
    BP_OnSwarmEvent(Event);
}

void USwarmHUDBase::OnAgentStateChanged(const FString& AgentId, EAgentVisualState NewState)
{
    BP_OnAgentStateChanged(AgentId, NewState);
}

void USwarmHUDBase::OnConnectionChanged(bool bConnected)
{
    BP_OnConnectionChanged(bConnected);
}

// ─── Utility functions ────────────────────────────────────────────────────────

FLinearColor USwarmHUDBase::AgentStateToColor(EAgentVisualState State) const
{
    switch (State)
    {
    case EAgentVisualState::Idle:           return FLinearColor(0.3f, 0.3f, 1.0f);
    case EAgentVisualState::Active:         return FLinearColor(0.1f, 0.6f, 1.0f);
    case EAgentVisualState::Working:        return FLinearColor(0.0f, 0.8f, 1.0f);
    case EAgentVisualState::HandoffSource:  return FLinearColor(0.0f, 1.0f, 0.9f);
    case EAgentVisualState::HandoffTarget:  return FLinearColor(0.0f, 0.9f, 0.7f);
    case EAgentVisualState::Failed:         return FLinearColor(1.0f, 0.05f, 0.05f);
    case EAgentVisualState::Retry:          return FLinearColor(1.0f, 0.55f, 0.0f);
    case EAgentVisualState::Complete:       return FLinearColor(0.1f, 1.0f, 0.3f);
    case EAgentVisualState::Observing:      return FLinearColor(0.5f, 0.5f, 0.5f);
    default:                                return FLinearColor::White;
    }
}

FText USwarmHUDBase::AgentStateToLabel(EAgentVisualState State) const
{
    switch (State)
    {
    case EAgentVisualState::Idle:           return FText::FromString(TEXT("IDLE"));
    case EAgentVisualState::Active:         return FText::FromString(TEXT("ACTIVE"));
    case EAgentVisualState::Working:        return FText::FromString(TEXT("WORKING"));
    case EAgentVisualState::HandoffSource:  return FText::FromString(TEXT("HANDOFF ▶"));
    case EAgentVisualState::HandoffTarget:  return FText::FromString(TEXT("◀ HANDOFF"));
    case EAgentVisualState::Failed:         return FText::FromString(TEXT("FAILED"));
    case EAgentVisualState::Retry:          return FText::FromString(TEXT("RETRY"));
    case EAgentVisualState::Complete:       return FText::FromString(TEXT("COMPLETE"));
    case EAgentVisualState::Observing:      return FText::FromString(TEXT("OBSERVING"));
    default:                                return FText::FromString(TEXT("UNKNOWN"));
    }
}

FLinearColor USwarmHUDBase::EventTypeToColor(ESwarmEventType EventType) const
{
    switch (EventType)
    {
    case ESwarmEventType::SwarmStarted:
    case ESwarmEventType::SwarmCompleted:   return FLinearColor(0.1f, 1.0f, 0.3f);
    case ESwarmEventType::SwarmFailed:
    case ESwarmEventType::AgentStepFailed:
    case ESwarmEventType::TaskFail:
    case ESwarmEventType::Anomaly:          return FLinearColor(1.0f, 0.05f, 0.05f);
    case ESwarmEventType::AgentStepRetry:
    case ESwarmEventType::Retry:            return FLinearColor(1.0f, 0.55f, 0.0f);
    case ESwarmEventType::TaskHandoff:
    case ESwarmEventType::TaskSuccess:      return FLinearColor(0.0f, 0.9f, 0.9f);
    case ESwarmEventType::AgentStepStarted:
    case ESwarmEventType::AgentStepCompleted: return FLinearColor(0.2f, 0.5f, 1.0f);
    case ESwarmEventType::MetricsSnapshot:
    case ESwarmEventType::AgentStateSnapshot: return FLinearColor(0.6f, 0.6f, 0.6f);
    default:                                   return FLinearColor(0.4f, 0.4f, 0.4f);
    }
}

FText USwarmHUDBase::EventTypeToLabel(ESwarmEventType EventType) const
{
    switch (EventType)
    {
    case ESwarmEventType::SwarmStarted:       return FText::FromString(TEXT("SWARM STARTED"));
    case ESwarmEventType::SwarmCompleted:     return FText::FromString(TEXT("SWARM COMPLETED"));
    case ESwarmEventType::SwarmFailed:        return FText::FromString(TEXT("SWARM FAILED"));
    case ESwarmEventType::SwarmResult:        return FText::FromString(TEXT("RESULT"));
    case ESwarmEventType::PlannerDecision:    return FText::FromString(TEXT("PLANNER"));
    case ESwarmEventType::AgentStepStarted:   return FText::FromString(TEXT("STEP STARTED"));
    case ESwarmEventType::AgentStepCompleted: return FText::FromString(TEXT("STEP DONE"));
    case ESwarmEventType::AgentStepFailed:    return FText::FromString(TEXT("STEP FAILED"));
    case ESwarmEventType::AgentStepRetry:     return FText::FromString(TEXT("RETRY"));
    case ESwarmEventType::TaskHandoff:        return FText::FromString(TEXT("HANDOFF"));
    case ESwarmEventType::TaskSuccess:        return FText::FromString(TEXT("SUCCESS"));
    case ESwarmEventType::TaskFail:           return FText::FromString(TEXT("FAIL"));
    case ESwarmEventType::Anomaly:            return FText::FromString(TEXT("ANOMALY"));
    case ESwarmEventType::MetricsSnapshot:    return FText::FromString(TEXT("METRICS"));
    case ESwarmEventType::AgentStateSnapshot: return FText::FromString(TEXT("STATE SYNC"));
    case ESwarmEventType::AgentSpawn:         return FText::FromString(TEXT("AGENT SPAWN"));
    case ESwarmEventType::MetaInsight:        return FText::FromString(TEXT("META INSIGHT"));
    default:                                   return FText::FromString(TEXT("EVENT"));
    }
}

bool USwarmHUDBase::IsRelayConnected() const
{
    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            return Router->IsConnected();
        }
    }
    return false;
}
