/**
 * SwarmVision Graph - Shared Type Definitions
 *
 * These types are shared across the SDK, frontend, and backend.
 */

export enum EventType {
  AGENT_SPAWN = 'AGENT_SPAWN',
  AGENT_MOVE = 'AGENT_MOVE',
  AGENT_TERMINATION = 'AGENT_TERMINATION',
  TASK_START = 'TASK_START',
  TASK_HANDOFF = 'TASK_HANDOFF',
  TASK_SUCCESS = 'TASK_SUCCESS',
  TASK_FAIL = 'TASK_FAIL',
  PIPELINE_UPDATE = 'PIPELINE_UPDATE',
  HEALTH_CHECK = 'HEALTH_CHECK',
}

export enum AgentState {
  IDLE = 'IDLE',
  ACTIVE = 'ACTIVE',
  WORKING = 'WORKING',
  WAITING = 'WAITING',
  ERROR = 'ERROR',
  TERMINATED = 'TERMINATED',
}

export enum TaskState {
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  ABANDONED = 'ABANDONED',
}

export interface AppContext {
  app_id: string
  app_name: string
  environment: string
  version: string
}

export interface EventContext extends AppContext {
  tenant_id?: string
}

export interface Agent {
  id: string
  name: string
  type: string
  state: AgentState
  metadata?: Record<string, unknown>
}

export interface Task {
  id: string
  name: string
  state: TaskState
  assigned_to?: string
  metadata?: Record<string, unknown>
}

export interface BaseEvent {
  id: string
  type: EventType | string
  timestamp: string
  source: string
  payload: Record<string, unknown>
  context?: Partial<EventContext>
}

export interface EventInput {
  id?: string
  type: EventType | string
  payload?: Record<string, unknown>
  source?: string
  timestamp?: string
  context?: Partial<EventContext>
}

export interface SwarmVisionClientConfig {
  apiBaseUrl: string
  wsUrl?: string
  reconnectAttempts?: number
  reconnectDelay?: number
  pingInterval?: number
  tenantId?: string
  appContext?: AppContext
}

export interface SwarmVisionWidgetConfig {
  baseUrl: string
  tenantId?: string
  appId?: string
  appName?: string
  environment?: string
  version?: string
  mode?: 'live' | 'replay'
  width?: number | string
  height?: number | string
  theme?: 'dark' | 'light'
}

export interface SDKConnectionState {
  connected: boolean
  tenantId?: string
  appContext?: AppContext
}

export interface TenantQuery {
  tenant_id?: string
  app_id?: string
}

export interface WSMessage {
  type: 'event' | 'ping' | 'acknowledge'
  payload: unknown
  timestamp?: string
}

export type Event = BaseEvent
