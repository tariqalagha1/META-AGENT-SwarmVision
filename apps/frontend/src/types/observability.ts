export type SourceType = 'runtime' | 'persisted' | 'replay' | 'derived' | 'synthetic' | 'mock'
export type TrustLevel = 'verified' | 'derived' | 'synthetic' | 'mock' | 'unknown'
export type PersistenceStatus = 'persisted' | 'live_unpersisted' | 'persistence_failed'

export interface EventProvenance {
  event_id: string
  trace_id: string
  sequence_no: number
  source_type: SourceType
  source_component: string
  trust_level: TrustLevel
  persistence_status: PersistenceStatus
  timestamp: string
}

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
  provenance?: EventProvenance
  context?: {
    tenant_id?: string
    app_id?: string
    app_name?: string
    environment?: string
    version?: string
  }
}

export type ProvenanceEvent = WebSocketEvent & {
  event_id: string
  trace_id: string
  provenance: EventProvenance
}

const FALLBACK_SEQUENCE = 1

const inferSourceType = (source: unknown): SourceType => {
  const value = String(source ?? '').toLowerCase()
  if (value === 'meta-agent' || value === 'system') return 'derived'
  if (value.includes('synthetic')) return 'synthetic'
  if (value === 'viz-mock' || value === 'mock' || value === 'demo') return 'mock'
  if (value.startsWith('backend') || value.startsWith('swarm') || value.startsWith('runtime')) {
    return 'runtime'
  }
  return 'derived'
}

const inferTrustLevel = (sourceType: SourceType): TrustLevel => {
  if (sourceType === 'mock' || sourceType === 'synthetic') return sourceType
  if (sourceType === 'derived') return 'derived'
  if (sourceType === 'runtime' || sourceType === 'persisted' || sourceType === 'replay') {
    return 'verified'
  }
  return 'unknown'
}

export function normalizeProvenanceEvent<T extends WebSocketEvent>(event: T): T & { provenance: EventProvenance } {
  const eventId = String(event.event_id ?? event.id ?? '')
  const traceId = String(event.trace_id ?? event.context?.tenant_id ?? 'unscoped-trace')
  const timestamp = String(event.timestamp ?? new Date().toISOString())
  const sourceType = inferSourceType(event.source)
  const stepIndex = Number.isFinite(event.step_index) ? Number(event.step_index) : 0
  const fallbackSequence = Math.max(FALLBACK_SEQUENCE, stepIndex + 1)

  const provenance: EventProvenance = event.provenance
    ? {
        event_id: event.provenance.event_id || eventId,
        trace_id: event.provenance.trace_id || traceId,
        sequence_no:
          Number.isFinite(event.provenance.sequence_no) && Number(event.provenance.sequence_no) > 0
            ? Number(event.provenance.sequence_no)
            : fallbackSequence,
        source_type: event.provenance.source_type ?? sourceType,
        source_component: event.provenance.source_component || 'frontend.compat',
        trust_level: event.provenance.trust_level ?? inferTrustLevel(event.provenance.source_type ?? sourceType),
        persistence_status: event.provenance.persistence_status ?? 'live_unpersisted',
        timestamp: event.provenance.timestamp || timestamp,
      }
    : {
        event_id: eventId,
        trace_id: traceId,
        sequence_no: fallbackSequence,
        source_type: sourceType,
        source_component: String(event.source ?? 'frontend.compat'),
        trust_level: inferTrustLevel(sourceType),
        persistence_status: 'live_unpersisted',
        timestamp,
      }

  return {
    ...event,
    event_id: eventId || event.id,
    trace_id: traceId,
    provenance,
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
