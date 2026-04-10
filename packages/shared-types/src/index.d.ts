/**
 * SwarmVision Graph - Shared Type Definitions
 *
 * These types are shared between frontend and backend for type safety
 * and consistency across the full-stack application.
 */
export declare enum EventType {
    AGENT_SPAWN = "AGENT_SPAWN",
    AGENT_MOVE = "AGENT_MOVE",
    AGENT_TERMINATION = "AGENT_TERMINATION",
    TASK_START = "TASK_START",
    TASK_HANDOFF = "TASK_HANDOFF",
    TASK_SUCCESS = "TASK_SUCCESS",
    TASK_FAIL = "TASK_FAIL",
    PIPELINE_UPDATE = "PIPELINE_UPDATE",
    HEALTH_CHECK = "HEALTH_CHECK"
}
export declare enum AgentState {
    IDLE = "IDLE",
    ACTIVE = "ACTIVE",
    WORKING = "WORKING",
    WAITING = "WAITING",
    ERROR = "ERROR",
    TERMINATED = "TERMINATED"
}
export declare enum TaskState {
    PENDING = "PENDING",
    ASSIGNED = "ASSIGNED",
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    ABANDONED = "ABANDONED"
}
export interface Agent {
    id: string;
    name: string;
    type: string;
    state: AgentState;
    metadata?: Record<string, unknown>;
}
export interface Task {
    id: string;
    name: string;
    state: TaskState;
    assigned_to?: string;
    metadata?: Record<string, unknown>;
}
export interface BaseEvent {
    id: string;
    type: EventType;
    timestamp: string;
    source: string;
    payload: Record<string, unknown>;
}
export interface AgentSpawnEvent extends BaseEvent {
    type: EventType.AGENT_SPAWN;
    agent: Agent;
}
export interface AgentMoveEvent extends BaseEvent {
    type: EventType.AGENT_MOVE;
    agent: Agent;
    from_node: string;
    to_node: string;
}
export interface TaskStartEvent extends BaseEvent {
    type: EventType.TASK_START;
    task: Task;
    agent_id: string;
}
export interface TaskHandoffEvent extends BaseEvent {
    type: EventType.TASK_HANDOFF;
    task: Task;
    from_agent: string;
    to_agent: string;
}
export interface TaskSuccessEvent extends BaseEvent {
    type: EventType.TASK_SUCCESS;
    task: Task;
    result?: Record<string, unknown>;
}
export interface TaskFailEvent extends BaseEvent {
    type: EventType.TASK_FAIL;
    task: Task;
    error: string;
    error_details?: Record<string, unknown>;
}
export interface PipelineUpdateEvent extends BaseEvent {
    type: EventType.PIPELINE_UPDATE;
    pipeline_state: Record<string, unknown>;
}
export interface HealthCheckEvent extends BaseEvent {
    type: EventType.HEALTH_CHECK;
    system_health: Record<string, unknown>;
}
export type Event = AgentSpawnEvent | AgentMoveEvent | TaskStartEvent | TaskHandoffEvent | TaskSuccessEvent | TaskFailEvent | PipelineUpdateEvent | HealthCheckEvent;
export interface WSMessage {
    type: "event" | "ping" | "acknowledge";
    payload: unknown;
    timestamp?: string;
}
//# sourceMappingURL=index.d.ts.map