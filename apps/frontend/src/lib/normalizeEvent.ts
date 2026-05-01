export type NormalizedEvent = {
  event_id: string
  id: string
  event_type: string
  type: string
  timestamp: number
  trace_id: string
  agent_id?: string
  source_agent_id?: string
  target_agent_id?: string
  tenant_id?: string
  app_id?: string
  step_index?: number
  decision_flag?: string
  source?: string
  payload: Record<string, any>
  _meta: {
    normalized: true
    degraded?: boolean
    source_event_type: string
  }
}

const typeMap: Record<string, string> = {
  SWARM_STARTED: 'SWARM_STARTED',
  PLANNER_DECISION: 'PLANNER_DECISION',
  AGENT_STEP_STARTED: 'AGENT_STEP_STARTED',
  AGENT_STEP_COMPLETED: 'AGENT_STEP_COMPLETED',
  AGENT_STEP_FAILED: 'AGENT_STEP_FAILED',
  AGENT_STEP_RETRY: 'AGENT_STEP_RETRY',
  SWARM_COMPLETED: 'SWARM_COMPLETED',
  SWARM_FAILED: 'SWARM_FAILED',
  SWARM_RESULT: 'SWARM_RESULT',
  PIPELINE_UPDATE: 'FLOW_EVENT',
  DECISION_POINT: 'DECISION_EVENT',
  TASK_HANDOFF: 'TASK_HANDOFF',
  TASK_START: 'TASK_START',
  TASK_SUCCESS: 'TASK_SUCCESS',
  TASK_FAIL: 'TASK_FAIL',
  AGENT_SPAWN: 'AGENT_SPAWN',
  AGENT_MOVE: 'AGENT_MOVE',
  AGENT_TERMINATION: 'AGENT_TERMINATION',
  DECISION: 'DECISION',
  ANOMALY: 'ANOMALY',
  META_INSIGHT: 'META_INSIGHT',
  DIAGNOSTIC_RESULT: 'DIAGNOSTIC_RESULT',
  METRICS_SNAPSHOT: 'METRICS_SNAPSHOT',
  AGENT_STATE_SNAPSHOT: 'AGENT_STATE_SNAPSHOT',
}

const toRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}

const generateEventId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const toTimestampMs = (rawTs: unknown) => {
  if (typeof rawTs === 'number' && Number.isFinite(rawTs)) return rawTs
  if (typeof rawTs === 'string') {
    const parsed = Date.parse(rawTs)
    if (Number.isFinite(parsed)) return parsed
    const numeric = Number(rawTs)
    if (Number.isFinite(numeric)) return numeric
  }
  return Date.now()
}

export function normalizeEvent(raw: any): NormalizedEvent {
  const input = toRecord(raw)
  const payload = toRecord(input.payload)

  const sourceEventType = String(input.event_type ?? input.type ?? 'UNKNOWN_EVENT')
  const mappedType = typeMap[sourceEventType] || 'OBSERVABILITY_EVENT'

  const source_agent_id =
    payload.source_agent_id || payload.from_agent || input.from_agent || input.source_agent_id

  const target_agent_id =
    payload.target_agent_id || payload.to_agent || input.to_agent || input.target_agent_id

  const event_id = String(input.event_id ?? input.id ?? generateEventId())
  const trace_id = String(input.trace_id ?? input.context?.trace_id ?? '__unknown_trace__')
  const timestamp = toTimestampMs(input.timestamp ?? input.created_at ?? Date.now())

  const agent_id = String(
    input.agent_id ?? payload.agent_id ?? source_agent_id ?? target_agent_id ?? ''
  )

  const tenant_id = input.tenant_id ?? input.context?.tenant_id
  const app_id = input.app_id ?? input.context?.app_id
  const step_index = Number.isFinite(input.step_index) ? Number(input.step_index) : undefined
  const decision_flag =
    input.decision_flag ?? payload.decision_flag ?? input.context?.decision_flag

  let degraded = false
  if (trace_id === '__unknown_trace__') degraded = true
  if (
    (mappedType === 'TASK_HANDOFF' || mappedType === 'FLOW_EVENT') &&
    (!source_agent_id || !target_agent_id)
  ) {
    degraded = true
  }

  const normalizedPayload: Record<string, any> = {
    ...payload,
  }
  if (source_agent_id) normalizedPayload.source_agent_id = source_agent_id
  if (target_agent_id) normalizedPayload.target_agent_id = target_agent_id
  if (agent_id) normalizedPayload.agent_id = agent_id

  return {
    event_id,
    id: event_id,
    event_type: mappedType,
    type: mappedType,
    timestamp,
    trace_id,
    agent_id: agent_id || undefined,
    source_agent_id: source_agent_id || undefined,
    target_agent_id: target_agent_id || undefined,
    tenant_id: tenant_id ? String(tenant_id) : undefined,
    app_id: app_id ? String(app_id) : undefined,
    step_index,
    decision_flag: decision_flag ? String(decision_flag) : undefined,
    source: input.source ? String(input.source) : 'normalized-ingress',
    payload: normalizedPayload,
    _meta: {
      normalized: true,
      degraded: degraded || undefined,
      source_event_type: sourceEventType,
    },
  }
}
