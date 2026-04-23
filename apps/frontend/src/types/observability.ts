export interface WebSocketEvent {
  event_id?: string
  id: string
  event_type?: string
  type: string
  timestamp: string
  source: string
  agent_id?: string | null
  trace_id?: string | null
  session_id?: string | null
  step_id?: string | null
  parent_step?: string | null
  parent_event_id?: string | null
  step_index?: number
  latency_ms?: number
  input_ref?: string | null
  output_ref?: string | null
  confidence_score?: number | null
  decision_flag?: string | null
  payload: Record<string, unknown>
  context?: {
    tenant_id?: string
    app_id?: string
    app_name?: string
    environment?: string
    version?: string
  }
}

export interface SystemGraphPayload {
  nodes: Array<{
    id: string
    name: string
    state: string
    latency_avg?: number
    error_rate?: number
    throughput?: number
  }>
  edges: Array<{
    source: string
    target: string
    count?: number
  }>
}

export interface TimelineEventPayload {
  trace_id: string
  events: Array<{
    event_id: string
    event_type: string
    timestamp: string
    step_index: number
    parent_event_id?: string | null
    payload: Record<string, unknown>
  }>
}

export interface AlertPanelPayload {
  anomalies: Array<{
    event_id: string
    type: string
    severity: string
    agent_id?: string | null
    timestamp: string
    details?: Record<string, unknown>
  }>
}

export interface MetaInsightEvent {
  event_id: string
  event_type: 'META_INSIGHT'
  trace_id: string
  timestamp: string
  step_index: number
  payload: {
    category: string
    summary: string
    affected_agents?: string[]
    severity?: string
    [key: string]: unknown
  }
}

export interface AgentPanelPayload {
  agents: Array<{
    agent_id: string
    state: 'ACTIVE' | 'DEGRADED' | 'FAILED'
    last_seen: string
    latency_avg: number
    error_rate: number
    throughput: number
  }>
}
