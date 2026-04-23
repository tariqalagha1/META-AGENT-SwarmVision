import { useEffect, useMemo, useRef } from 'react'
import type { WebSocketEvent } from '../hooks/useWebSocket'
import type { ObservabilityEvent } from './useObservabilityStore'
import { useObservabilityStore } from './useObservabilityStore'

type EventScope = {
  tenantId?: string
  appId?: string
}

type EventListFilters = {
  eventType?: string
  errorsOnly?: boolean
}

type FilteredEventsOptions = EventScope & {
  filters?: EventListFilters
  safeModeLimit?: number
  providedEvents?: ReadonlyArray<WebSocketEvent>
}

export type GraphNode = {
  id: string
  state: 'ACTIVE' | 'DEGRADED' | 'FAILED'
  lastEventTimestamp: number
}

export type GraphEdge = {
  key: string
  source: string
  target: string
  interactionType: string
  count: number
  terminalEventId?: string
  lastEventTimestamp: number
}

export type GraphData = {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const DEFAULT_SAFE_MODE_LIMIT = 500
const TOPOLOGY_EVENT_TYPES = new Set([
  'AGENT_SPAWN',
  'TASK_START',
  'TASK_HANDOFF',
  'TASK_SUCCESS',
  'TASK_FAIL',
  'AGENT_MOVE',
  'AGENT_TERMINATION',
])

const shallowEqualObjectArray = <T extends object>(a: ReadonlyArray<T>, b: ReadonlyArray<T>) => {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (left === right) continue
    const leftRecord = left as Record<string, unknown>
    const rightRecord = right as Record<string, unknown>
    const leftKeys = Object.keys(leftRecord)
    const rightKeys = Object.keys(rightRecord)
    if (leftKeys.length !== rightKeys.length) return false
    for (const key of leftKeys) {
      if (leftRecord[key] !== rightRecord[key]) return false
    }
  }
  return true
}

const matchesScope = (event: Pick<WebSocketEvent, 'context'>, { tenantId, appId }: EventScope) => {
  if (tenantId && event.context?.tenant_id !== tenantId) return false
  if (appId && event.context?.app_id !== appId) return false
  return true
}

const matchesEventFilters = (
  event: Pick<WebSocketEvent, 'event_type' | 'type'>,
  filters?: EventListFilters
) => {
  if (!filters) return true
  const eventType = event.type ?? event.event_type ?? ''
  if (filters.eventType && eventType !== filters.eventType) return false
  if (filters.errorsOnly && eventType !== 'TASK_FAIL') return false
  return true
}

const stabilizeObjectArray = <T extends object>(cacheRef: { current: T[] }, next: T[]) => {
  if (shallowEqualObjectArray(cacheRef.current, next)) {
    return cacheRef.current
  }
  cacheRef.current = next
  return next
}

const limitForSafeMode = <T,>(items: T[], safeMode: boolean, safeModeLimit?: number) => {
  if (!safeMode || !safeModeLimit || items.length <= safeModeLimit) return items
  return items.slice(-safeModeLimit)
}

const resolveIndexedEvents = (
  ids: string[],
  events: Record<string, ObservabilityEvent>,
  scope: EventScope,
  filters?: EventListFilters
) =>
  ids
    .map((id) => events[id])
    .filter((event): event is ObservabilityEvent => Boolean(event))
    .filter((event) => matchesScope(event, scope))
    .filter((event) => matchesEventFilters(event, filters))

const getEventTimestamp = (event: Pick<WebSocketEvent, 'timestamp'>) => {
  const parsed = Date.parse(event.timestamp)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeGraphState = (state?: string) => {
  if (state === 'FAILED') return 'FAILED'
  if (state === 'DEGRADED') return 'DEGRADED'
  return 'ACTIVE'
}

export const usePausedSnapshot = <T,>(liveValue: T, isPaused: boolean) => {
  const snapshotRef = useRef(liveValue)
  const wasPausedRef = useRef(isPaused)

  if (!isPaused) {
    snapshotRef.current = liveValue
  } else if (!wasPausedRef.current) {
    snapshotRef.current = liveValue
  }

  useEffect(() => {
    wasPausedRef.current = isPaused
  }, [isPaused])

  return isPaused ? snapshotRef.current : liveValue
}

export const useFilteredEvents = (options: FilteredEventsOptions = {}) => {
  const { tenantId, appId, filters, safeModeLimit, providedEvents } = options
  const events = useObservabilityStore((s) => s.events)
  const eventOrder = useObservabilityStore((s) => s.eventOrder)
  const safeMode = useObservabilityStore((s) => s.safeMode)
  const cacheRef = useRef<WebSocketEvent[]>([])

  return useMemo(() => {
    const next = providedEvents
      ? limitForSafeMode(
          providedEvents
            .filter((event) => matchesScope(event, { tenantId, appId }))
            .filter((event) => matchesEventFilters(event, filters)),
          safeMode,
          safeModeLimit
        )
      : limitForSafeMode(
          resolveIndexedEvents(eventOrder, events, { tenantId, appId }, filters),
          safeMode,
          safeModeLimit
        )
    return stabilizeObjectArray(cacheRef, next)
  }, [appId, eventOrder, events, filters, providedEvents, safeMode, safeModeLimit, tenantId])
}

export const useTopologyEvents = (scope: EventScope = {}) => {
  const events = useObservabilityStore((s) => s.events)
  const eventOrder = useObservabilityStore((s) => s.eventOrder)
  const safeMode = useObservabilityStore((s) => s.safeMode)
  const cacheRef = useRef<ObservabilityEvent[]>([])

  return useMemo(() => {
    const next = limitForSafeMode(
      resolveIndexedEvents(eventOrder, events, scope)
        .filter((event) => TOPOLOGY_EVENT_TYPES.has(event.type ?? event.event_type ?? '')),
      safeMode,
      DEFAULT_SAFE_MODE_LIMIT
    )
    return stabilizeObjectArray(cacheRef, next)
  }, [eventOrder, events, safeMode, scope])
}

export const useTimelineEvents = (traceId?: string | null) => {
  const events = useObservabilityStore((s) => s.events)
  const traces = useObservabilityStore((s) => s.traces)
  const cacheRef = useRef<ObservabilityEvent[]>([])

  return useMemo(() => {
    if (!traceId) return []
    const trace = traces[traceId]
    if (!trace) return []
    const next = resolveIndexedEvents(trace, events, {})
    return stabilizeObjectArray(cacheRef, next)
  }, [events, traceId, traces])
}

export const useSelectedTraceEvents = () => {
  const selectedTraceId = useObservabilityStore((s) => s.selectedTraceId)
  return useTimelineEvents(selectedTraceId)
}

export const useSelectedEvent = () => {
  const selectedEventId = useObservabilityStore((s) => s.selectedEventId)
  const events = useObservabilityStore((s) => s.events)

  return useMemo(() => {
    if (!selectedEventId) return null
    return events[selectedEventId] ?? null
  }, [events, selectedEventId])
}

export const useSelectedAgentLatestTrace = () => {
  const selectedAgentId = useObservabilityStore((s) => s.selectedAgentId)
  const traces = useObservabilityStore((s) => s.traces)
  const events = useObservabilityStore((s) => s.events)

  return useMemo(() => {
    if (!selectedAgentId) return null

    let latestTraceId: string | null = null
    let latestTimestamp = 0

    for (const [traceId, traceEventIds] of Object.entries(traces)) {
      for (const id of traceEventIds) {
        const event = events[id]
        if (!event) continue
        const payload = event.payload ?? {}
        const touchesAgent =
          event.agent_id === selectedAgentId ||
          String(payload.source_agent_id ?? '') === selectedAgentId ||
          String(payload.target_agent_id ?? '') === selectedAgentId

        if (!touchesAgent) continue

        const ts = getEventTimestamp(event)
        if (ts >= latestTimestamp) {
          latestTimestamp = ts
          latestTraceId = traceId
        }
      }
    }

    return latestTraceId
  }, [events, selectedAgentId, traces])
}

export const useDecisionEvents = (options: FilteredEventsOptions = {}) => {
  const { tenantId, appId, filters, safeModeLimit = DEFAULT_SAFE_MODE_LIMIT } = options
  const events = useObservabilityStore((s) => s.events)
  const decisionEvents = useObservabilityStore((s) => s.decisionEvents)
  const safeMode = useObservabilityStore((s) => s.safeMode)
  const cacheRef = useRef<ObservabilityEvent[]>([])

  return useMemo(() => {
    const next = limitForSafeMode(
      resolveIndexedEvents(decisionEvents, events, { tenantId, appId }, filters),
      safeMode,
      safeModeLimit
    )
    return stabilizeObjectArray(cacheRef, next)
  }, [appId, decisionEvents, events, filters, safeMode, safeModeLimit, tenantId])
}

export const useAnomalyEvents = (options: FilteredEventsOptions = {}) => {
  const { tenantId, appId, filters, safeModeLimit = DEFAULT_SAFE_MODE_LIMIT } = options
  const events = useObservabilityStore((s) => s.events)
  const anomalyEvents = useObservabilityStore((s) => s.anomalyEvents)
  const safeMode = useObservabilityStore((s) => s.safeMode)
  const cacheRef = useRef<ObservabilityEvent[]>([])

  return useMemo(() => {
    const next = limitForSafeMode(
      resolveIndexedEvents(anomalyEvents, events, { tenantId, appId }, filters),
      safeMode,
      safeModeLimit
    )
    return stabilizeObjectArray(cacheRef, next)
  }, [anomalyEvents, appId, events, filters, safeMode, safeModeLimit, tenantId])
}

export const useMetaInsightEvents = (options: FilteredEventsOptions = {}) => {
  const { tenantId, appId, filters, safeModeLimit = DEFAULT_SAFE_MODE_LIMIT } = options
  const events = useObservabilityStore((s) => s.events)
  const insightEvents = useObservabilityStore((s) => s.insightEvents)
  const safeMode = useObservabilityStore((s) => s.safeMode)
  const cacheRef = useRef<ObservabilityEvent[]>([])

  return useMemo(() => {
    const next = limitForSafeMode(
      resolveIndexedEvents(insightEvents, events, { tenantId, appId }, filters),
      safeMode,
      safeModeLimit
    )
    return stabilizeObjectArray(cacheRef, next)
  }, [appId, events, filters, insightEvents, safeMode, safeModeLimit, tenantId])
}

export const useGraphData = (scope: EventScope = {}) => {
  const topologyEvents = useTopologyEvents(scope)
  const indexedAgents = useObservabilityStore((s) => s.agents)
  const nodeMapRef = useRef<Map<string, GraphNode>>(new Map())
  const edgeMapRef = useRef<Map<string, GraphEdge>>(new Map())
  const eventIdOrderRef = useRef<string[]>([])
  const cacheRef = useRef<GraphData>({
    nodes: [],
    edges: [],
  })

  return useMemo(() => {
    const nextEventIdOrder = topologyEvents.map((event) => event.event_id)
    const previousEventIdOrder = eventIdOrderRef.current

    const canAppendIncrementally =
      previousEventIdOrder.length > 0 &&
      nextEventIdOrder.length >= previousEventIdOrder.length &&
      previousEventIdOrder.every((id, index) => nextEventIdOrder[index] === id)

    const startIndex = canAppendIncrementally ? previousEventIdOrder.length : 0
    const nodeMap = canAppendIncrementally
      ? new Map(nodeMapRef.current)
      : new Map<string, GraphNode>()
    const edgeMap = canAppendIncrementally
      ? new Map(edgeMapRef.current)
      : new Map<string, GraphEdge>()

    for (const [agentId, agent] of Object.entries(indexedAgents)) {
      const parsedSeen = Date.parse(agent.last_seen)
      const lastSeen = Number.isFinite(parsedSeen) ? parsedSeen : 0
      const previous = nodeMap.get(agentId)
      nodeMap.set(agentId, {
        id: agentId,
        state: normalizeGraphState(agent.state),
        lastEventTimestamp: Math.max(previous?.lastEventTimestamp ?? 0, lastSeen),
      })
    }

    for (let index = startIndex; index < topologyEvents.length; index += 1) {
      const event = topologyEvents[index]
      const timestamp = getEventTimestamp(event)
      const eventType = event.type ?? event.event_type ?? ''

      if (event.agent_id) {
        const previous = nodeMap.get(event.agent_id)
        const stateFromEvent =
          eventType === 'TASK_FAIL'
            ? 'FAILED'
            : eventType === 'ANOMALY'
              ? 'DEGRADED'
              : previous?.state ?? 'ACTIVE'

        nodeMap.set(event.agent_id, {
          id: event.agent_id,
          state: stateFromEvent,
          lastEventTimestamp: Math.max(previous?.lastEventTimestamp ?? 0, timestamp),
        })
      }

      if (eventType !== 'TASK_HANDOFF') continue
      const payload = event.payload ?? {}
      const source = String(payload.source_agent_id ?? '')
      const target = String(payload.target_agent_id ?? '')
      if (!source || !target) continue

      if (!nodeMap.has(source)) {
        nodeMap.set(source, {
          id: source,
          state: 'ACTIVE',
          lastEventTimestamp: timestamp,
        })
      }
      if (!nodeMap.has(target)) {
        nodeMap.set(target, {
          id: target,
          state: 'ACTIVE',
          lastEventTimestamp: timestamp,
        })
      }

      const interactionType = String(payload.interaction_type ?? 'TASK_HANDOFF')
      const key = `${source}::${target}::${interactionType}`
      const previousEdge = edgeMap.get(key)
      edgeMap.set(key, {
        key,
        source,
        target,
        interactionType,
        count: (previousEdge?.count ?? 0) + 1,
        terminalEventId: event.event_id,
        lastEventTimestamp: timestamp,
      })
    }

    const next: GraphData = {
      nodes: Array.from(nodeMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
      edges: Array.from(edgeMap.values()).sort((a, b) => a.key.localeCompare(b.key)),
    }

    nodeMapRef.current = nodeMap
    edgeMapRef.current = edgeMap
    eventIdOrderRef.current = nextEventIdOrder

    if (
      shallowEqualObjectArray(cacheRef.current.nodes, next.nodes) &&
      shallowEqualObjectArray(cacheRef.current.edges, next.edges)
    ) {
      return cacheRef.current
    }
    cacheRef.current = next
    return next
  }, [indexedAgents, topologyEvents])
}
