import { useSyncExternalStore } from 'react'
import type { WebSocketEvent } from '../hooks/useWebSocket'

export type ConnectionState = 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING'
export type StreamMode = 'LIVE' | 'PAUSED'

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
  selectedAgentId: string | null
  selectedEventId: string | null
  mode: StreamMode
  connection: ConnectionState
  lastMessageTimestamp: number
  safeMode: boolean
}

type ObservabilityActions = {
  addEvent: (event: WebSocketEvent) => void
  addBatchEvents: (events: WebSocketEvent[]) => void
  setMetrics: (metrics: MetricsSnapshot) => void
  setAlerts: (alerts: Alert[] | ((prev: Alert[]) => Alert[])) => void
  setAgents: (agents: AgentState[]) => void
  selectTrace: (id: string | null) => void
  selectAgent: (id: string | null) => void
  selectEvent: (id: string | null) => void
  clearSelectedEvent: () => void
  toggleMode: () => void
  setConnection: (connection: ConnectionState) => void
  markMessageReceived: (timestamp?: number) => void
  checkHeartbeat: (staleMs?: number) => void
  cleanupStaleEvents: (now?: number) => void
  setSafeMode: (enabled: boolean) => void
}

export type ObservabilityStore = ObservabilityState & ObservabilityActions

type Updater = (state: ObservabilityStore) => ObservabilityStore
type Selector<T> = (state: ObservabilityStore) => T

const normalizeEvent = (input: WebSocketEvent): ObservabilityEvent | null => {
  const eventId = String(input.event_id ?? input.id ?? '')
  const eventType = String(input.event_type ?? input.type ?? '')
  const timestamp = String(input.timestamp ?? '')
  if (!eventId || !eventType || !timestamp) return null

  return {
    ...input,
    event_id: eventId,
    id: input.id ?? eventId,
    event_type: eventType,
    type: input.type ?? eventType,
    trace_id: String(input.trace_id ?? 'unscoped-trace'),
    step_index: Number.isFinite(input.step_index) ? Number(input.step_index) : 0,
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
  selectedAgentId: null,
  selectedEventId: null,
  mode: 'LIVE',
  connection: 'DISCONNECTED',
  lastMessageTimestamp: 0,
  safeMode: false,
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
        normalized.event_type === 'DECISION'
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
          normalized.event_type === 'DECISION'
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
}

export const useObservabilityStore = <T,>(selector: Selector<T>) =>
  useSyncExternalStore(subscribe, () => selector(getState()), () => selector(getState()))

export const observabilityStore = {
  getState,
}
