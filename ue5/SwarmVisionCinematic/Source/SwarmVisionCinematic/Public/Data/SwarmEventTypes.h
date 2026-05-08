#pragma once

#include "CoreMinimal.h"
#include "SwarmEventTypes.generated.h"

// ─── Event type discriminator ────────────────────────────────────────────────
// Maps 1:1 to Ue5Message.ue5_type strings from the event-relay service.

UENUM(BlueprintType)
enum class ESwarmEventType : uint8
{
    Unknown                 UMETA(DisplayName="Unknown"),

    // Swarm lifecycle
    SwarmStarted            UMETA(DisplayName="SWARM_STARTED"),
    SwarmCompleted          UMETA(DisplayName="SWARM_COMPLETED"),
    SwarmFailed             UMETA(DisplayName="SWARM_FAILED"),
    SwarmResult             UMETA(DisplayName="SWARM_RESULT"),

    // Planner
    PlannerDecision         UMETA(DisplayName="PLANNER_DECISION"),

    // Agent step lifecycle
    AgentStepStarted        UMETA(DisplayName="AGENT_STEP_STARTED"),
    AgentStepCompleted      UMETA(DisplayName="AGENT_STEP_COMPLETED"),
    AgentStepFailed         UMETA(DisplayName="AGENT_STEP_FAILED"),
    AgentStepRetry          UMETA(DisplayName="AGENT_STEP_RETRY"),
    Retry                   UMETA(DisplayName="RETRY"),

    // Metrics / state
    MetricsSnapshot         UMETA(DisplayName="METRICS_SNAPSHOT"),
    AgentStateSnapshot      UMETA(DisplayName="AGENT_STATE_SNAPSHOT"),

    // Intelligence
    MetaInsight             UMETA(DisplayName="META_INSIGHT"),
    Anomaly                 UMETA(DisplayName="ANOMALY"),
    Decision                UMETA(DisplayName="DECISION"),

    // Legacy / additional
    TaskHandoff             UMETA(DisplayName="TASK_HANDOFF"),
    TaskSuccess             UMETA(DisplayName="TASK_SUCCESS"),
    TaskFail                UMETA(DisplayName="TASK_FAIL"),
    AgentSpawn              UMETA(DisplayName="AGENT_SPAWN"),
    PipelineUpdate          UMETA(DisplayName="PIPELINE_UPDATE"),
};

// ─── Source channel ──────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class ERelayChannel : uint8
{
    Events  UMETA(DisplayName="events"),
    Metrics UMETA(DisplayName="metrics"),
    Alerts  UMETA(DisplayName="alerts"),
    Agents  UMETA(DisplayName="agents"),
    Unknown UMETA(DisplayName="unknown"),
};

// ─── Agent visual state driven by events ─────────────────────────────────────

UENUM(BlueprintType)
enum class EAgentVisualState : uint8
{
    Idle            UMETA(DisplayName="Idle"),
    Active          UMETA(DisplayName="Active"),
    Working         UMETA(DisplayName="Working"),
    HandoffSource   UMETA(DisplayName="Handoff Source"),
    HandoffTarget   UMETA(DisplayName="Handoff Target"),
    Failed          UMETA(DisplayName="Failed"),
    Retry           UMETA(DisplayName="Retry"),
    Complete        UMETA(DisplayName="Complete"),
    Observing       UMETA(DisplayName="Observing"),
};

// ─── Event priority ───────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EEventPriority : uint8
{
    Critical    UMETA(DisplayName="P0 Critical"),   // ANOMALY, SWARM_FAILED, STEP_FAILED
    High        UMETA(DisplayName="P1 High"),        // SWARM_STARTED, SWARM_COMPLETED, PLANNER_DECISION
    Normal      UMETA(DisplayName="P2 Normal"),      // STEP_STARTED, STEP_COMPLETED, TASK_HANDOFF
    Low         UMETA(DisplayName="P3 Low"),         // METRICS_SNAPSHOT, AGENT_STATE_SNAPSHOT
    Ambient     UMETA(DisplayName="P4 Ambient"),     // META_INSIGHT, PIPELINE_UPDATE
};
