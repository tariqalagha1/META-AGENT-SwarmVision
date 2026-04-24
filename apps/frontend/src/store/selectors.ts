import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WebSocketEvent } from '../types/observability'
import type { GraphFilters, ObservabilityEvent, ReplayState } from './useObservabilityStore'
import { useObservabilityStore } from './useObservabilityStore'
import {
  applyAgentSnapshot,
  applyNodePosition,
  applyNormalizedEvents,
  createGraphState,
  GRAPH_EVENT_TYPES,
  graphStateToGraphData,
  type GraphData,
  type GraphEvent,
  type GraphState,
} from './graphEngine'
export type { GraphData, GraphEdge, GraphNode } from './graphEngine'

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

const DEFAULT_SAFE_MODE_LIMIT = 500
const GRAPH_UPDATE_DEBOUNCE_MS = 200
const MAX_TRACKED_EVENT_IDS = 20000

export type GraphViewData = GraphData & {
  setNodePosition: (agentId: string, position: { x: number; y: number }) => void
}

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

const getEventId = (event: Pick<ObservabilityEvent, 'event_id' | 'id'>) =>
  String(event.event_id ?? event.id ?? '')

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

const graphDataIsSame = (left: GraphData, right: GraphData) =>
  left.nodes === right.nodes && left.edges === right.edges

const filtersEqual = (left: GraphFilters, right: GraphFilters) =>
  left.query === right.query &&
  left.eventTypes === right.eventTypes &&
  left.agentIds === right.agentIds &&
  left.traceIds === right.traceIds &&
  left.severity === right.severity &&
  left.timeRange?.from === right.timeRange?.from &&
  left.timeRange?.to === right.timeRange?.to

const replayEqual = (left: ReplayState, right: ReplayState) =>
  left.enabled === right.enabled &&
  left.cursorTs === right.cursorTs &&
  left.speed === right.speed &&
  left.isPlaying === right.isPlaying

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
    const graphRelevant = resolveIndexedEvents(eventOrder, events, {})
      .filter((event) => GRAPH_EVENT_TYPES.has(String(event.event_type ?? '')))
    const scoped = graphRelevant.filter((event) => matchesScope(event, scope))

    if (
      import.meta.env.DEV &&
      graphRelevant.length > 0 &&
      scoped.length === 0 &&
      (Boolean(scope.tenantId) || Boolean(scope.appId))
    ) {
      console.warn('GRAPH_EVENTS_FILTERED_BY_SCOPE', {
        tenantId: scope.tenantId,
        appId: scope.appId,
        graphRelevant: graphRelevant.length,
      })
    }

    const next = limitForSafeMode(scoped, safeMode, DEFAULT_SAFE_MODE_LIMIT)
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
  const graphRef = useRef<GraphState>(createGraphState())
  const cacheRef = useRef<GraphData>({
    nodes: [],
    edges: [],
  })
  const pendingEventsRef = useRef<ObservabilityEvent[]>([])
  const pendingEventIdsRef = useRef<Set<string>>(new Set())
  const seenEventIdsRef = useRef<Set<string>>(new Set())
  const seenEventOrderRef = useRef<string[]>([])
  const flushTimerRef = useRef<number | null>(null)
  const indexedAgentsRef = useRef(indexedAgents)
  const [graphData, setGraphData] = useState<GraphData>(cacheRef.current)

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null

      const pendingEvents = pendingEventsRef.current
      pendingEventsRef.current = []
      pendingEventIdsRef.current = new Set()

      console.log('EVENTS RECEIVED:', pendingEvents.length)

      const previousGraphState = graphRef.current
      let nextGraphState = graphRef.current
      if (pendingEvents.length > 0) {
        nextGraphState = applyNormalizedEvents(nextGraphState, pendingEvents as GraphEvent[])

        for (const event of pendingEvents) {
          const eventId = getEventId(event)
          if (!eventId) continue
          if (!seenEventIdsRef.current.has(eventId)) {
            seenEventIdsRef.current.add(eventId)
            seenEventOrderRef.current.push(eventId)
          }
        }

        while (seenEventOrderRef.current.length > MAX_TRACKED_EVENT_IDS) {
          const removed = seenEventOrderRef.current.shift()
          if (removed) {
            seenEventIdsRef.current.delete(removed)
          }
        }
      } else if (previousGraphState.nodes.size > 0 || previousGraphState.edges.size > 0) {
        graphRef.current = previousGraphState
        return
      }

      nextGraphState = applyAgentSnapshot(nextGraphState, indexedAgentsRef.current)

      const nextGraphData = graphStateToGraphData(nextGraphState)
      const previousGraphData = cacheRef.current
      const hadGraph = previousGraphData.nodes.length > 0 || previousGraphData.edges.length > 0
      const nextIsEmpty = nextGraphData.nodes.length === 0 && nextGraphData.edges.length === 0

      if (hadGraph && nextIsEmpty) {
        console.log('GRAPH STATE:', {
          nodes: previousGraphData.nodes.length,
          edges: previousGraphData.edges.length,
        })
        return
      }

      graphRef.current = nextGraphState
      console.log('GRAPH STATE:', {
        nodes: graphRef.current.nodes.size,
        edges: graphRef.current.edges.size,
      })

      if (nextGraphData === previousGraphData) {
        return
      }

      cacheRef.current = nextGraphData
      setGraphData(nextGraphData)
    }, GRAPH_UPDATE_DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    indexedAgentsRef.current = indexedAgents
    scheduleFlush()
  }, [indexedAgents, scheduleFlush])

  useEffect(() => {
    for (const event of topologyEvents) {
      const eventId = getEventId(event)
      if (!eventId) continue
      if (seenEventIdsRef.current.has(eventId)) continue
      if (pendingEventIdsRef.current.has(eventId)) continue
      pendingEventIdsRef.current.add(eventId)
      pendingEventsRef.current.push(event)
    }

    scheduleFlush()
  }, [scheduleFlush, topologyEvents])

  useEffect(
    () => () => {
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
    },
    []
  )

  const setNodePosition = useCallback((agentId: string, position: { x: number; y: number }) => {
    const nextState = applyNodePosition(graphRef.current, agentId, position)
    if (nextState === graphRef.current) return

    graphRef.current = nextState
    const nextGraphData = graphStateToGraphData(nextState)
    if (nextGraphData === cacheRef.current) return

    cacheRef.current = nextGraphData
    setGraphData(nextGraphData)
  }, [])

  return useMemo<GraphViewData>(
    () => ({
      ...graphData,
      setNodePosition,
    }),
    [graphData, setNodePosition]
  )
}

export const useReplayGraphData = (scope: EventScope = {}): GraphViewData => {
  const liveGraph = useGraphData(scope)
  const replay = useObservabilityStore((s) => s.replay)
  const topologyEvents = useTopologyEvents(scope)
  const cacheRef = useRef<{ replay: ReplayState; view: GraphViewData } | null>(null)

  return useMemo(() => {
    if (!replay.enabled || !replay.cursorTs) return liveGraph

    const previous = cacheRef.current
    if (
      previous &&
      replayEqual(previous.replay, replay) &&
      graphDataIsSame(previous.view, liveGraph)
    ) {
      return previous.view
    }

    const replayEvents = topologyEvents.filter((event) => getEventTimestamp(event) <= replay.cursorTs!)
    let state = createGraphState()
    if (replayEvents.length > 0) {
      state = applyNormalizedEvents(state, replayEvents as GraphEvent[])
    }
    const replayData = graphStateToGraphData(state)
    const view: GraphViewData = {
      ...replayData,
      setNodePosition: liveGraph.setNodePosition,
    }

    cacheRef.current = {
      replay: { ...replay },
      view,
    }
    return view
  }, [liveGraph, replay, topologyEvents])
}

export const useFilteredGraphData = (scope: EventScope = {}): GraphViewData => {
  const baseGraph = useReplayGraphData(scope)
  const filters = useObservabilityStore((s) => s.filters)
  const cacheRef = useRef<{ base: GraphViewData; filters: GraphFilters; view: GraphViewData } | null>(
    null
  )

  return useMemo(() => {
    const previous = cacheRef.current
    if (previous && previous.base === baseGraph && filtersEqual(previous.filters, filters)) {
      return previous.view
    }

    const query = (filters.query ?? '').trim().toLowerCase()
    const eventTypes = filters.eventTypes && filters.eventTypes.length > 0 ? new Set(filters.eventTypes) : null
    const agentIds = filters.agentIds && filters.agentIds.length > 0 ? new Set(filters.agentIds) : null
    const traceIds = filters.traceIds && filters.traceIds.length > 0 ? new Set(filters.traceIds) : null
    const fromTs = filters.timeRange?.from
    const toTs = filters.timeRange?.to

    if (!query && !eventTypes && !agentIds && !traceIds && !fromTs && !toTs) {
      return baseGraph
    }

    const visibleEdges = baseGraph.edges.filter((edge) => {
      if (eventTypes && !eventTypes.has(edge.interactionType)) return false
      if (agentIds && !agentIds.has(edge.source) && !agentIds.has(edge.target)) return false
      if (query && !edge.source.toLowerCase().includes(query) && !edge.target.toLowerCase().includes(query)) {
        return false
      }
      if (fromTs && edge.lastEventTimestamp < fromTs) return false
      if (toTs && edge.lastEventTimestamp > toTs) return false
      return true
    })

    const neighborNodeIds = new Set<string>()
    for (const edge of visibleEdges) {
      neighborNodeIds.add(edge.source)
      neighborNodeIds.add(edge.target)
    }

    const visibleNodes = baseGraph.nodes.filter((node) => {
      const idMatch = query
        ? node.id.toLowerCase().includes(query) ||
          (traceIds ? Array.from(traceIds).some((traceId) => traceId.toLowerCase().includes(query)) : false)
        : true
      const agentMatch = agentIds ? agentIds.has(node.id) : true
      const traceMatch = traceIds ? true : true
      const timeMatch = (!fromTs || node.lastEventTimestamp >= fromTs) && (!toTs || node.lastEventTimestamp <= toTs)
      if (neighborNodeIds.has(node.id)) return true
      return idMatch && agentMatch && traceMatch && timeMatch
    })

    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
    const connectedEdges = visibleEdges.filter(
      (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    )

    const view: GraphViewData = {
      nodes: visibleNodes,
      edges: connectedEdges,
      setNodePosition: baseGraph.setNodePosition,
    }

    cacheRef.current = {
      base: baseGraph,
      filters: { ...filters },
      view,
    }
    return view
  }, [baseGraph, filters])
}
