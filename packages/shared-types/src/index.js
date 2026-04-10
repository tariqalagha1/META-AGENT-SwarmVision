/**
 * SwarmVision Graph - Shared Type Definitions
 *
 * These types are shared between frontend and backend for type safety
 * and consistency across the full-stack application.
 */
// Event Types
export var EventType;
(function (EventType) {
    EventType["AGENT_SPAWN"] = "AGENT_SPAWN";
    EventType["AGENT_MOVE"] = "AGENT_MOVE";
    EventType["AGENT_TERMINATION"] = "AGENT_TERMINATION";
    EventType["TASK_START"] = "TASK_START";
    EventType["TASK_HANDOFF"] = "TASK_HANDOFF";
    EventType["TASK_SUCCESS"] = "TASK_SUCCESS";
    EventType["TASK_FAIL"] = "TASK_FAIL";
    EventType["PIPELINE_UPDATE"] = "PIPELINE_UPDATE";
    EventType["HEALTH_CHECK"] = "HEALTH_CHECK";
})(EventType || (EventType = {}));
// Agent States
export var AgentState;
(function (AgentState) {
    AgentState["IDLE"] = "IDLE";
    AgentState["ACTIVE"] = "ACTIVE";
    AgentState["WORKING"] = "WORKING";
    AgentState["WAITING"] = "WAITING";
    AgentState["ERROR"] = "ERROR";
    AgentState["TERMINATED"] = "TERMINATED";
})(AgentState || (AgentState = {}));
// Task States
export var TaskState;
(function (TaskState) {
    TaskState["PENDING"] = "PENDING";
    TaskState["ASSIGNED"] = "ASSIGNED";
    TaskState["IN_PROGRESS"] = "IN_PROGRESS";
    TaskState["COMPLETED"] = "COMPLETED";
    TaskState["FAILED"] = "FAILED";
    TaskState["ABANDONED"] = "ABANDONED";
})(TaskState || (TaskState = {}));
