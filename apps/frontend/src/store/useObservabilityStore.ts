import { useSyncExternalStore } from 'react'
import type { WebSocketEvent } from '../types/observability'
import type { NormalizedEvent } from '../lib/normalizeEvent'

export type ConnectionState = 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING'
export type StreamMode = 'LIVE' | 'PAUSED'
export type GraphMode = 'OBSERVABILITY' | 'PIPELINE' | 'CINEMATIC'
export type GraphFilters = {
  query?: string
  eventTypes?: string[]
  agentIds?: string[]
  traceIds?: string[]
  severity?: Array<'LOW' | 'MEDIUM' | 'HIGH'>
  timeRange?: { from?: number; to?: number }
}

export type ReplayState = {
  enabled: boolean
  cursorTs?: number
  speed: 0.5 | 1 | 2 | 4
  isPlaying: boolean
}

export type ExportOptions = {
  format: 'PNG' | 'JSON'
}

export type MetricsSnapshot = {
  timestamp?: string
  agents?: Array<Record<string, unknown>>
  traces?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export type Alert = {
  event_id: string
  event_type: string
  timestamp: string
  agent_id?: string | null
  trace_id?: string | null
  payload?: Record<string, unknown>
}

export type AgentState = {
  agent_id: string
  state: 'ACTIVE' | 'DEGRADED' | 'FAILED'
  last_seen: string
  latency_avg: number
  error_rate: number
  throughput: number
}

export type ObservabilityEvent = WebSocketEvent & {
  event_id: string
  trace_id: string
  step_index: number
}

export type RunHistoryStep = {
  agent_id: string | null
  step_name: string
  status: 'completed' | 'failed' | 'retry' | 'started'
  timestamp: string
  error?: string | null
}

export type RunHistoryEntry = {
  trace_id: string
  task: string
  status: 'running' | 'completed' | 'failed'
  started_at: string
  completed_at: string | null
  steps: RunHistoryStep[]
  final_output: unknown
  degraded: boolean
  errors: string[]
}

type IngressEvent = WebSocketEvent | NormalizedEvent

const MAX_EVENTS = 5000
const MAX_ALERTS = 100
const MAX_TRACES = 500
const MAX_INDEX_SIZE = 1000
const MAX_INSIGHT_INDEX_SIZE = 500
const EVENT_TTL_MS = 5 * 60 * 1000

type ObservabilityState = {
  events: Record<string, ObservabilityEvent>
  eventOrder: string[]
  metrics: MetricsSnapshot | null
  alerts: Alert[]
  agents: Record<string, AgentState>
  traces: Record<string, string[]>
  traceOrder: string[]
  decisionEvents: string[]
  anomalyEvents: string[]
  insightEvents: string[]
  selectedTraceId: string | null
  selectedRequestId: string | null
  selectedAgentId: string | null
  selectedEventId: string | null
  mode: StreamMode
  connection: ConnectionState
  lastMessageTimestamp: number
  safeMode: boolean
  graphMode: GraphMode
  filters: GraphFilters
  replay: ReplayState
  exportOptions: ExportOptions
  runHistory: Record<string, RunHistoryEntry>
}

type ObservabilityActions = {
  addEvent: (event: IngressEvent) => void
  addBatchEvents: (events: IngressEvent[]) => void
  setMetrics: (metrics: MetricsSnapshot) => void
  setAlerts: (alerts: Alert[] | ((prev: Alert[]) => Alert[])) => void
  setAgents: (agents: AgentState[]) => void
  selectTrace: (id: string | null) => void
  selectRequest: (id: string | null) => void
  selectAgent: (id: string | null) => void
  selectEvent: (id: string | null) => void
  clearSelectedEvent: () => void
  toggleMode: () => void
  setConnection: (connection: ConnectionState) => void
  markMessageReceived: (timestamp?: number) => void
  checkHeartbeat: (staleMs?: number) => void
  cleanupStaleEvents: (now?: number) => void
  setSafeMode: (enabled: boolean) => void
  setGraphMode: (mode: GraphMode) => void
  setFilters: (partial: Partial<GraphFilters>) => void
  clearFilters: () => void
  setReplay: (partial: Partial<ReplayState>) => void
  resetReplay: () => void
  setExportOptions: (opts: ExportOptions) => void
  upsertRunHistoryFromApiResponse: (payload: {
    trace_id: string
    task: string
    status: 'completed' | 'failed'
    steps?: Array<Record<string, unknown>>
    final_output?: unknown
  }) => void
}

export type ObservabilityStore = ObservabilityState & ObservabilityActions

type Updater = (state: ObservabilityStore) => ObservabilityStore
type Selector<T> = (state: ObservabilityStore) => T

const normalizeEvent = (input: IngressEvent): ObservabilityEvent | null => {
  const timestampRaw = (input as { timestamp?: string | number }).timestamp
  const normalizedTimestamp =
    typeof timestampRaw === 'number'
      ? new Date(timestampRaw).toISOString()
      : String(timestampRaw ?? '')
  const eventId = String(input.event_id ?? input.id ?? '')
  const eventType = String((input as { event_type?: string }).event_type ?? (input as { type?: string }).type ?? '')
  const timestamp = normalizedTimestamp
  if (!eventId || !eventType || !timestamp) return null

  const context = {
    ...((input as { context?: WebSocketEvent['context'] }).context ?? {}),
  }
  const topLevelTenantId = (input as { tenant_id?: string }).tenant_id
  const topLevelAppId = (input as { app_id?: string }).app_id
  if (topLevelTenantId && !context.tenant_id) {
    context.tenant_id = topLevelTenantId
  }
  if (topLevelAppId && !context.app_id) {
    context.app_id = topLevelAppId
  }

  const payload =
    input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? input.payload
      : {}

  return {
    ...input,
    event_id: eventId,
    id: input.id ?? eventId,
    event_type: eventType,
    type: (input as { type?: string }).type ?? eventType,
    trace_id: String(input.trace_id ?? 'unscoped-trace'),
    step_index: Number.isFinite(input.step_index) ? Number(input.step_index) : 0,
    timestamp,
    source: String((input as { source?: string }).source ?? 'unknown'),
    payload,
    context,
  }
}

const sortTraceEventIds = (
  traceIds: string[],
  events: Record<string, ObservabilityEvent>,
  normalized: ObservabilityEvent
) => {
  traceIds.sort((a, b) => {
    const eventA = events[a] ?? (a === normalized.event_id ? normalized : undefined)
    const eventB = events[b] ?? (b === normalized.event_id ? normalized : undefined)
    const stepA = Number.isFinite(eventA?.step_index) ? Number(eventA?.step_index) : 0
    const stepB = Number.isFinite(eventB?.step_index) ? Number(eventB?.step_index) : 0
    if (stepA !== stepB) return stepA - stepB
    const tsA = Date.parse(String(eventA?.timestamp ?? '')) || 0
    const tsB = Date.parse(String(eventB?.timestamp ?? '')) || 0
    return tsA - tsB
  })
}

const evictOldestEvents = (state: ObservabilityStore): ObservabilityStore => {
  if (state.eventOrder.length <= MAX_EVENTS) return state
  const toRemove = state.eventOrder.length - MAX_EVENTS
  const removeIds = state.eventOrder.slice(0, toRemove)
  const removeSet = new Set(removeIds)

  const nextEvents = { ...state.events }
  for (const id of removeIds) {
    delete nextEvents[id]
  }

  const nextTraces: Record<string, string[]> = {}
  for (const [traceId, ids] of Object.entries(state.traces)) {
    const filtered = ids.filter((id) => !removeSet.has(id))
    if (filtered.length > 0) {
      nextTraces[traceId] = filtered
    }
  }

  const nextSelectedEventId =
    state.selectedEventId && removeSet.has(state.selectedEventId)
      ? null
      : state.selectedEventId

  const nextDecisionEvents = state.decisionEvents.filter((id) => !removeSet.has(id))
  const nextAnomalyEvents = state.anomalyEvents.filter((id) => !removeSet.has(id))
  const nextInsightEvents = state.insightEvents.filter((id) => !removeSet.has(id))

  return {
    ...state,
    events: nextEvents,
    traces: nextTraces,
    eventOrder: state.eventOrder.slice(toRemove),
    decisionEvents: nextDecisionEvents,
    anomalyEvents: nextAnomalyEvents,
    insightEvents: nextInsightEvents,
    selectedEventId: nextSelectedEventId,
  }
}

const evictOldestTraces = (state: ObservabilityStore): ObservabilityStore => {
  if (state.traceOrder.length <= MAX_TRACES) return state
  const toRemoveCount = state.traceOrder.length - MAX_TRACES
  const removeTraceIds = state.traceOrder.slice(0, toRemoveCount)
  const removeTraceSet = new Set(removeTraceIds)

  const nextTraces: Record<string, string[]> = {}
  for (const [traceId, ids] of Object.entries(state.traces)) {
    if (!removeTraceSet.has(traceId)) {
      nextTraces[traceId] = ids
    }
  }

  const remainingEventIdSet = new Set<string>()
  for (const ids of Object.values(nextTraces)) {
    for (const id of ids) remainingEventIdSet.add(id)
  }

  const nextEvents: Record<string, ObservabilityEvent> = {}
  for (const [eventId, event] of Object.entries(state.events)) {
    if (remainingEventIdSet.has(eventId)) {
      nextEvents[eventId] = event
    }
  }

  const nextEventOrder = state.eventOrder.filter((id) => remainingEventIdSet.has(id))
  const nextDecisionEvents = state.decisionEvents
    .filter((id) => remainingEventIdSet.has(id))
    .slice(-MAX_INDEX_SIZE)
  const nextAnomalyEvents = state.anomalyEvents
    .filter((id) => remainingEventIdSet.has(id))
    .slice(-MAX_INDEX_SIZE)
  const nextInsightEvents = state.insightEvents
    .filter((id) => remainingEventIdSet.has(id))
    .slice(-MAX_INSIGHT_INDEX_SIZE)

  return {
    ...state,
    traces: nextTraces,
    traceOrder: state.traceOrder.slice(toRemoveCount),
    events: nextEvents,
    eventOrder: nextEventOrder,
    decisionEvents: nextDecisionEvents,
    anomalyEvents: nextAnomalyEvents,
    insightEvents: nextInsightEvents,
    selectedTraceId:
      state.selectedTraceId && removeTraceSet.has(state.selectedTraceId)
        ? null
        : state.selectedTraceId,
    selectedEventId:
      state.selectedEventId && !remainingEventIdSet.has(state.selectedEventId)
        ? null
        : state.selectedEventId,
  }
}

const cleanupStaleEventsInternal = (state: ObservabilityStore, now: number): ObservabilityStore => {
  const staleIds: string[] = []
  for (const id of state.eventOrder) {
    const ts = Date.parse(String(state.events[id]?.timestamp ?? ''))
    if (!Number.isFinite(ts) || now - ts > EVENT_TTL_MS) {
      staleIds.push(id)
    }
  }
  if (staleIds.length === 0) return state
  const staleSet = new Set(staleIds)

  const nextEvents = { ...state.events }
  for (const id of staleIds) delete nextEvents[id]

  const nextTraces: Record<string, string[]> = {}
  const nextTraceOrder: string[] = []
  for (const traceId of state.traceOrder) {
    const ids = (state.traces[traceId] ?? []).filter((id) => !staleSet.has(id))
    if (ids.length > 0) {
      nextTraces[traceId] = ids
      nextTraceOrder.push(traceId)
    }
  }

  return {
    ...state,
    events: nextEvents,
    traces: nextTraces,
    traceOrder: nextTraceOrder,
    eventOrder: state.eventOrder.filter((id) => !staleSet.has(id)),
    decisionEvents: state.decisionEvents.filter((id) => !staleSet.has(id)),
    anomalyEvents: state.anomalyEvents.filter((id) => !staleSet.has(id)),
    insightEvents: state.insightEvents.filter((id) => !staleSet.has(id)),
    selectedEventId:
      state.selectedEventId && staleSet.has(state.selectedEventId) ? null : state.selectedEventId,
    selectedTraceId:
      state.selectedTraceId && !(state.selectedTraceId in nextTraces)
        ? null
        : state.selectedTraceId,
  }
}

let storeState: ObservabilityStore
const listeners = new Set<() => void>()

const setState = (updater: Updater) => {
  storeState = updater(storeState)
  listeners.forEach((listener) => listener())
}

const getState = () => storeState

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const baseState: ObservabilityState = {
  events: {},
  eventOrder: [],
  metrics: null,
  alerts: [],
  agents: {},
  traces: {},
  traceOrder: [],
  decisionEvents: [],
  anomalyEvents: [],
  insightEvents: [],
  selectedTraceId: null,
  selectedRequestId: null,
  selectedAgentId: null,
  selectedEventId: null,
  mode: 'LIVE',
  connection: 'DISCONNECTED',
  lastMessageTimestamp: 0,
  safeMode: false,
  graphMode: 'OBSERVABILITY',
  filters: {},
  replay: {
    enabled: false,
    speed: 1,
    isPlaying: false,
  },
  exportOptions: {
    format: 'PNG',
  },
  runHistory: {},
}

const toStepStatus = (eventType: string): RunHistoryStep['status'] | null => {
  if (eventType === 'AGENT_STEP_STARTED') return 'started'
  if (eventType === 'AGENT_STEP_COMPLETED') return 'completed'
  if (eventType === 'AGENT_STEP_FAILED') return 'failed'
  if (eventType === 'AGENT_STEP_RETRY') return 'retry'
  return null
}

const upsertRunHistoryFromEvent = (
  runHistory: Record<string, RunHistoryEntry>,
  normalized: ObservabilityEvent
): Record<string, RunHistoryEntry> => {
  const traceId = normalized.trace_id
  const nowIso = String(normalized.timestamp)
  const payload = normalized.payload as Record<string, unknown>
  const eventType = normalized.event_type
  const current = runHistory[traceId]
  const nextEntry: RunHistoryEntry =
    current ?? {
      trace_id: traceId,
      task: String(payload.task ?? ''),
      status: 'running',
      started_at: nowIso,
      completed_at: null,
      steps: [],
      final_output: null,
      degraded: false,
      errors: [],
    }

  if (eventType === 'SWARM_STARTED') {
    return {
      ...runHistory,
      [traceId]: {
        ...nextEntry,
        task: String(payload.task ?? nextEntry.task ?? ''),
        status: 'running',
        started_at: nextEntry.started_at || nowIso,
      } as RunHistoryEntry,
    }
  }

  if (eventType === 'SWARM_RESULT') {
    const failedSteps = Number(payload.failed_steps ?? 0)
    const status: RunHistoryEntry['status'] =
      String(payload.status ?? '').toLowerCase() === 'failed' || failedSteps > 0
        ? 'failed'
        : 'completed'
    return {
      ...runHistory,
      [traceId]: {
        ...nextEntry,
        status,
        completed_at: nowIso,
        degraded: Boolean(payload.degraded),
        final_output: payload.output ?? nextEntry.final_output,
        errors:
          status === 'failed' && failedSteps > 0 && nextEntry.errors.length === 0
            ? ['one_or_more_steps_failed']
            : nextEntry.errors,
        steps: nextEntry.steps,
      } as RunHistoryEntry,
    }
  }

  const stepStatus = toStepStatus(String(eventType))
  if (stepStatus) {
    const stepName = String(payload.step_name ?? '')
    const errorText = typeof payload.error === 'string' ? payload.error : null
    const step: RunHistoryStep = {
      agent_id: normalized.agent_id ?? null,
      step_name: stepName,
      status: stepStatus,
      timestamp: nowIso,
      error: errorText,
    }
    return {
      ...runHistory,
      [traceId]: {
        ...nextEntry,
        steps: [...nextEntry.steps, step],
        degraded: nextEntry.degraded || stepStatus === 'retry',
        errors: errorText ? [...nextEntry.errors, errorText] : nextEntry.errors,
      } as RunHistoryEntry,
    }
  }

  if (eventType === 'SWARM_FAILED') {
    return {
      ...runHistory,
      [traceId]: {
        ...nextEntry,
        status: 'failed',
        completed_at: nowIso,
      } as RunHistoryEntry,
    }
  }

  if (eventType === 'SWARM_COMPLETED') {
    return {
      ...runHistory,
      [traceId]: {
        ...nextEntry,
        status: nextEntry.status === 'failed' ? 'failed' : 'completed',
        completed_at: nowIso,
      } as RunHistoryEntry,
    }
  }

  return runHistory
}

storeState = {
  ...baseState,
  addEvent: (event) => {
    setState((current) => {
      if (current.mode === 'PAUSED') return current
      const normalized = normalizeEvent(event)
      if (!normalized) return current

      const currentTrace = current.traces[normalized.trace_id] ?? []
      const traceIds = currentTrace.includes(normalized.event_id)
        ? currentTrace
        : [...currentTrace, normalized.event_id]
      sortTraceEventIds(traceIds, current.events, normalized)

      const decisionEvents =
        normalized.event_type === 'DECISION' || normalized.event_type === 'DECISION_EVENT'
          ? [...current.decisionEvents, normalized.event_id].slice(-MAX_INDEX_SIZE)
          : current.decisionEvents
      const anomalyEvents =
        normalized.event_type === 'ANOMALY'
          ? [...current.anomalyEvents, normalized.event_id].slice(-MAX_INDEX_SIZE)
          : current.anomalyEvents
      const insightEvents =
        normalized.event_type === 'META_INSIGHT'
          ? [...current.insightEvents, normalized.event_id].slice(-MAX_INSIGHT_INDEX_SIZE)
          : current.insightEvents

      const traceOrder = current.traces[normalized.trace_id]
        ? current.traceOrder
        : [...current.traceOrder, normalized.trace_id]

      const nextState: ObservabilityStore = {
        ...current,
        events: {
          ...current.events,
          [normalized.event_id]: normalized,
        },
        eventOrder: current.eventOrder.includes(normalized.event_id)
          ? current.eventOrder
          : [...current.eventOrder, normalized.event_id],
        traces: {
          ...current.traces,
          [normalized.trace_id]: traceIds,
        },
        traceOrder,
        decisionEvents,
        anomalyEvents,
        insightEvents,
        runHistory: upsertRunHistoryFromEvent(current.runHistory, normalized),
      }

      return evictOldestTraces(evictOldestEvents(nextState))
    })
  },
  addBatchEvents: (events) => {
    setState((current) => {
      if (current.mode === 'PAUSED') return current
      if (events.length === 0) return current

      let next: ObservabilityStore = current
      for (const event of events) {
        const normalized = normalizeEvent(event)
        if (!normalized) continue

        const existingTrace = next.traces[normalized.trace_id] ?? []
        const nextTrace = existingTrace.includes(normalized.event_id)
          ? existingTrace
          : [...existingTrace, normalized.event_id]
        sortTraceEventIds(nextTrace, next.events, normalized)

        const decisionEvents =
          normalized.event_type === 'DECISION' || normalized.event_type === 'DECISION_EVENT'
            ? [...next.decisionEvents, normalized.event_id].slice(-MAX_INDEX_SIZE)
            : next.decisionEvents
        const anomalyEvents =
          normalized.event_type === 'ANOMALY'
            ? [...next.anomalyEvents, normalized.event_id].slice(-MAX_INDEX_SIZE)
            : next.anomalyEvents
        const insightEvents =
          normalized.event_type === 'META_INSIGHT'
            ? [...next.insightEvents, normalized.event_id].slice(-MAX_INSIGHT_INDEX_SIZE)
            : next.insightEvents

        next = {
          ...next,
          events: {
            ...next.events,
            [normalized.event_id]: normalized,
          },
          eventOrder: next.eventOrder.includes(normalized.event_id)
            ? next.eventOrder
            : [...next.eventOrder, normalized.event_id],
          traces: {
            ...next.traces,
            [normalized.trace_id]: nextTrace,
          },
          traceOrder: next.traces[normalized.trace_id]
            ? next.traceOrder
            : [...next.traceOrder, normalized.trace_id],
          decisionEvents,
          anomalyEvents,
          insightEvents,
          runHistory: upsertRunHistoryFromEvent(next.runHistory, normalized),
        }
      }

      return evictOldestTraces(evictOldestEvents(next))
    })
  },
  setMetrics: (metrics) => {
    setState((current) => ({ ...current, metrics }))
  },
  setAlerts: (alerts) => {
    setState((current) => {
      const nextAlerts = typeof alerts === 'function' ? alerts(current.alerts) : alerts
      return {
        ...current,
        alerts: nextAlerts.slice(0, MAX_ALERTS),
      }
    })
  },
  setAgents: (agents) => {
    setState((current) => {
      const indexed: Record<string, AgentState> = {}
      for (const agent of agents) {
        if (agent?.agent_id) {
          indexed[agent.agent_id] = agent
        }
      }
      return {
        ...current,
        agents: indexed,
      }
    })
  },
  selectTrace: (id) => {
    setState((current) => ({ ...current, selectedTraceId: id }))
  },
  selectRequest: (id) => {
    setState((current) => ({ ...current, selectedRequestId: id }))
  },
  selectAgent: (id) => {
    setState((current) => ({ ...current, selectedAgentId: id }))
  },
  selectEvent: (id) => {
    setState((current) => ({ ...current, selectedEventId: id }))
  },
  clearSelectedEvent: () => {
    setState((current) => ({ ...current, selectedEventId: null }))
  },
  toggleMode: () => {
    setState((current) => ({
      ...current,
      mode: current.mode === 'LIVE' ? 'PAUSED' : 'LIVE',
    }))
  },
  setConnection: (connection) => {
    setState((current) => ({ ...current, connection }))
  },
  markMessageReceived: (timestamp) => {
    setState((current) => ({
      ...current,
      lastMessageTimestamp: timestamp ?? Date.now(),
    }))
  },
  checkHeartbeat: (staleMs = 5000) => {
    setState((current) => {
      if (!current.lastMessageTimestamp) return current
      if (current.connection !== 'CONNECTED') return current
      if (Date.now() - current.lastMessageTimestamp <= staleMs) return current
      return {
        ...current,
        connection: 'RECONNECTING',
      }
    })
  },
  cleanupStaleEvents: (now) => {
    setState((current) => cleanupStaleEventsInternal(current, now ?? Date.now()))
  },
  setSafeMode: (enabled) => {
    setState((current) => ({ ...current, safeMode: enabled }))
  },
  setGraphMode: (mode) => {
    setState((current) => (current.graphMode === mode ? current : { ...current, graphMode: mode }))
  },
  setFilters: (partial) => {
    setState((current) => ({
      ...current,
      filters: {
        ...current.filters,
        ...partial,
      },
    }))
  },
  clearFilters: () => {
    setState((current) => ({
      ...current,
      filters: {},
    }))
  },
  setReplay: (partial) => {
    setState((current) => ({
      ...current,
      replay: {
        ...current.replay,
        ...partial,
      },
    }))
  },
  resetReplay: () => {
    setState((current) => ({
      ...current,
      replay: {
        enabled: false,
        speed: 1,
        isPlaying: false,
      },
    }))
  },
  setExportOptions: (opts) => {
    setState((current) => ({
      ...current,
      exportOptions: opts,
    }))
  },
  upsertRunHistoryFromApiResponse: (payload) => {
    setState((current) => {
      const traceId = String(payload.trace_id ?? '')
      if (!traceId) return current
      const nowIso = new Date().toISOString()
      const existing = current.runHistory[traceId]
      const steps = Array.isArray(payload.steps)
        ? payload.steps.map((step) => ({
            agent_id: String(step.agent_id ?? ''),
            step_name: String(step.step_name ?? ''),
            status:
              String(step.status ?? '').toLowerCase() === 'failed'
                ? ('failed' as const)
                : ('completed' as const),
            timestamp: String(step.completed_at ?? step.started_at ?? nowIso),
            error: typeof step.error === 'string' ? step.error : null,
          }))
        : existing?.steps ?? []
      return {
        ...current,
        runHistory: {
          ...current.runHistory,
          [traceId]: {
            trace_id: traceId,
            task: payload.task,
            status: payload.status === 'failed' ? 'failed' : 'completed',
            started_at: existing?.started_at ?? nowIso,
            completed_at: nowIso,
            steps,
            final_output: payload.final_output ?? existing?.final_output ?? null,
            degraded: existing?.degraded ?? false,
            errors: existing?.errors ?? [],
          },
        },
      }
    })
  },
}

export const useObservabilityStore = <T,>(selector: Selector<T>) =>
  useSyncExternalStore(subscribe, () => selector(getState()), () => selector(getState()))

export const observabilityStore = {
  getState,
}
