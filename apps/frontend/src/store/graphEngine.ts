export type GraphNode = {
  id: string
  state: 'ACTIVE' | 'DEGRADED' | 'FAILED'
  lastEventTimestamp: number
  position?: GraphPosition
  decisionCount?: number
  anomalyCount?: number
  insightCount?: number
}

export type GraphEdge = {
  id: string
  key: string
  source: string
  target: string
  interactionType: string
  count: number
  terminalEventId?: string
  lastEventTimestamp: number
  decisionCount?: number
  anomalyCount?: number
  insightCount?: number
  riskState?: 'NORMAL' | 'ELEVATED'
}

export type GraphData = {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export type GraphPosition = {
  x: number
  y: number
}

export type GraphEvent = {
  event_id?: string
  event_type?: string
  timestamp?: string | number
  trace_id?: string
  agent_id?: string | null
  source_agent_id?: string | null
  target_agent_id?: string | null
  decision_flag?: string | null
  _meta?: {
    normalized?: boolean
    degraded?: boolean
    source_event_type?: string
  }
}

export type GraphState = {
  nodes: Map<string, GraphNode>
  edges: Map<string, GraphEdge>
  unresolvedEdges: Map<string, GraphEvent>
  lastAgentByTrace: Map<string, string>
}

type AgentSnapshot = Record<
  string,
  {
    state: string
    last_seen: string
  }
>

export const GRAPH_EVENT_TYPES = new Set([
  'SWARM_STARTED',
  'PLANNER_DECISION',
  'AGENT_STEP_STARTED',
  'AGENT_STEP_COMPLETED',
  'AGENT_STEP_FAILED',
  'AGENT_STEP_RETRY',
  'SWARM_COMPLETED',
  'SWARM_FAILED',
  'AGENT_SPAWN',
  'TASK_START',
  'TASK_HANDOFF',
  'FLOW_EVENT',
  'TASK_SUCCESS',
  'TASK_FAIL',
  'AGENT_MOVE',
  'AGENT_TERMINATION',
  'DECISION_EVENT',
  'DECISION',
  'ANOMALY',
  'META_INSIGHT',
])

const EDGE_EVENT_TYPES = new Set(['TASK_HANDOFF', 'FLOW_EVENT'])
const DECISION_EVENT_TYPES = new Set(['DECISION_EVENT', 'DECISION'])
const ANOMALY_EVENT_TYPES = new Set(['ANOMALY'])
const META_INSIGHT_EVENT_TYPES = new Set(['META_INSIGHT'])

const persistedNodePositions = new Map<string, GraphPosition>()
const graphDataCache = new WeakMap<GraphState, GraphData>()

const toFiniteNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

const parseTimestamp = (value: unknown) => {
  const asNumber = toFiniteNumber(value)
  if (asNumber !== null) return asNumber
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return 0
}

const readString = (value: unknown) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed
}

const getEventId = (event: GraphEvent) => readString(event.event_id)

const getEventType = (event: GraphEvent) => readString(event.event_type)

const getEventTimestamp = (event: GraphEvent) => parseTimestamp(event.timestamp)

const getEventAgentId = (event: GraphEvent) => readString(event.agent_id)

const getSourceAgentId = (event: GraphEvent) => readString(event.source_agent_id)

const getTargetAgentId = (event: GraphEvent) => readString(event.target_agent_id)

const normalizeGraphState = (state?: string) => {
  if (state === 'FAILED') return 'FAILED'
  if (state === 'DEGRADED') return 'DEGRADED'
  return 'ACTIVE'
}

const getEdgeId = (source: string, target: string, type: string) => `${source}|${target}|${type}`

export const createGraphState = (): GraphState => ({
  nodes: new Map<string, GraphNode>(),
  edges: new Map<string, GraphEdge>(),
  unresolvedEdges: new Map<string, GraphEvent>(),
  lastAgentByTrace: new Map<string, string>(),
})

export const setPersistedNodePosition = (agentId: string, position: GraphPosition) => {
  if (!agentId) return
  persistedNodePositions.set(agentId, position)
}

export const getPersistedNodePosition = (agentId: string) => persistedNodePositions.get(agentId)

const withNodeAnnotation = (
  node: GraphNode,
  annotation: 'decision' | 'anomaly' | 'insight'
): GraphNode => {
  if (annotation === 'decision') {
    return { ...node, decisionCount: (node.decisionCount ?? 0) + 1 }
  }
  if (annotation === 'anomaly') {
    return { ...node, anomalyCount: (node.anomalyCount ?? 0) + 1, state: 'DEGRADED' }
  }
  return { ...node, insightCount: (node.insightCount ?? 0) + 1 }
}

const withEdgeAnnotation = (
  edge: GraphEdge,
  annotation: 'decision' | 'anomaly' | 'insight'
): GraphEdge => {
  if (annotation === 'decision') {
    return { ...edge, decisionCount: (edge.decisionCount ?? 0) + 1 }
  }
  if (annotation === 'anomaly') {
    return {
      ...edge,
      anomalyCount: (edge.anomalyCount ?? 0) + 1,
      riskState: 'ELEVATED',
    }
  }
  return { ...edge, insightCount: (edge.insightCount ?? 0) + 1 }
}

export const applyNormalizedEvents = (
  prevState: GraphState,
  events: ReadonlyArray<GraphEvent>
): GraphState => {
  if (events.length === 0) return prevState

  let nextNodes = prevState.nodes
  let nextEdges = prevState.edges
  let nextUnresolvedEdges = prevState.unresolvedEdges
  let nextLastAgentByTrace = prevState.lastAgentByTrace
  const preexistingUnresolvedIds = new Set(prevState.unresolvedEdges.keys())
  let changed = false
  let supportedEventCount = 0

  const ensureNodesWritable = () => {
    if (nextNodes === prevState.nodes) {
      nextNodes = new Map(prevState.nodes)
    }
  }

  const ensureEdgesWritable = () => {
    if (nextEdges === prevState.edges) {
      nextEdges = new Map(prevState.edges)
    }
  }

  const ensureUnresolvedWritable = () => {
    if (nextUnresolvedEdges === prevState.unresolvedEdges) {
      nextUnresolvedEdges = new Map(prevState.unresolvedEdges)
    }
  }

  const ensureLastAgentWritable = () => {
    if (nextLastAgentByTrace === prevState.lastAgentByTrace) {
      nextLastAgentByTrace = new Map(prevState.lastAgentByTrace)
    }
  }

  const upsertNode = (
    nodeId: string,
    timestamp: number,
    stateHint?: GraphNode['state'],
    annotation?: 'decision' | 'anomaly' | 'insight'
  ) => {
    if (!nodeId) return

    const persistedPosition = persistedNodePositions.get(nodeId)
    const previousNode = nextNodes.get(nodeId)

    let nextNode: GraphNode = previousNode
      ? {
          ...previousNode,
          lastEventTimestamp: Math.max(previousNode.lastEventTimestamp, timestamp),
          position: previousNode.position ?? persistedPosition,
        }
      : {
          id: nodeId,
          state: stateHint ?? 'ACTIVE',
          lastEventTimestamp: timestamp,
          position: persistedPosition,
        }

    if (stateHint && nextNode.state !== stateHint) {
      nextNode = { ...nextNode, state: stateHint }
    }

    if (annotation) {
      nextNode = withNodeAnnotation(nextNode, annotation)
    }

    if (
      previousNode &&
      previousNode.state === nextNode.state &&
      previousNode.lastEventTimestamp === nextNode.lastEventTimestamp &&
      previousNode.position?.x === nextNode.position?.x &&
      previousNode.position?.y === nextNode.position?.y &&
      previousNode.decisionCount === nextNode.decisionCount &&
      previousNode.anomalyCount === nextNode.anomalyCount &&
      previousNode.insightCount === nextNode.insightCount
    ) {
      return
    }

    ensureNodesWritable()
    nextNodes.set(nodeId, nextNode)
    changed = true
  }

  const upsertEdge = (
    source: string,
    target: string,
    interactionType: string,
    eventId: string,
    timestamp: number,
    annotation?: 'decision' | 'anomaly' | 'insight'
  ) => {
    if (!source || !target) return
    if (!nextNodes.has(source) || !nextNodes.has(target)) return

    const edgeId = getEdgeId(source, target, interactionType)
    const previousEdge = nextEdges.get(edgeId)
    let nextEdge: GraphEdge = {
      id: edgeId,
      key: edgeId,
      source,
      target,
      interactionType,
      count: (previousEdge?.count ?? 0) + 1,
      terminalEventId: eventId || previousEdge?.terminalEventId,
      lastEventTimestamp: Math.max(previousEdge?.lastEventTimestamp ?? 0, timestamp),
      riskState: previousEdge?.riskState ?? 'NORMAL',
      decisionCount: previousEdge?.decisionCount,
      anomalyCount: previousEdge?.anomalyCount,
      insightCount: previousEdge?.insightCount,
    }

    if (annotation) {
      nextEdge = withEdgeAnnotation(nextEdge, annotation)
    }

    if (
      previousEdge &&
      previousEdge.count === nextEdge.count &&
      previousEdge.terminalEventId === nextEdge.terminalEventId &&
      previousEdge.lastEventTimestamp === nextEdge.lastEventTimestamp &&
      previousEdge.riskState === nextEdge.riskState &&
      previousEdge.decisionCount === nextEdge.decisionCount &&
      previousEdge.anomalyCount === nextEdge.anomalyCount &&
      previousEdge.insightCount === nextEdge.insightCount
    ) {
      return
    }

    ensureEdgesWritable()
    nextEdges.set(edgeId, nextEdge)
    changed = true
  }

  for (const event of events) {
    const eventType = getEventType(event)
    if (!GRAPH_EVENT_TYPES.has(eventType)) continue

    supportedEventCount += 1
    const eventId = getEventId(event)
    const timestamp = getEventTimestamp(event)
    const traceId = readString(event.trace_id)
    const agentId = getEventAgentId(event)
    const source = getSourceAgentId(event)
    const target = getTargetAgentId(event)
    const sourceKnownBeforeEvent = source ? nextNodes.has(source) : false
    const targetKnownBeforeEvent = target ? nextNodes.has(target) : false

    const stateHint: GraphNode['state'] | undefined =
      eventType === 'TASK_FAIL' || eventType === 'AGENT_STEP_FAILED'
        ? 'FAILED'
        : eventType === 'ANOMALY'
          ? 'DEGRADED'
          : undefined

    upsertNode(agentId, timestamp, stateHint)
    upsertNode(source, timestamp)
    upsertNode(target, timestamp)

    if (EDGE_EVENT_TYPES.has(eventType)) {
      if (source && target && sourceKnownBeforeEvent && targetKnownBeforeEvent) {
        upsertEdge(source, target, eventType, eventId, timestamp)
        if (eventId && nextUnresolvedEdges.has(eventId)) {
          ensureUnresolvedWritable()
          nextUnresolvedEdges.delete(eventId)
          changed = true
        }
      } else {
        if (import.meta.env.DEV && eventType === 'FLOW_EVENT' && (!source || !target)) {
          console.warn('GRAPH_FLOW_EVENT_MISSING_ENDPOINT', {
            eventId,
            source,
            target,
          })
        }
        if (eventId) {
          ensureUnresolvedWritable()
          nextUnresolvedEdges.set(eventId, event)
          changed = true
        }
      }
    }

    if (DECISION_EVENT_TYPES.has(eventType)) {
      upsertNode(agentId, timestamp, undefined, 'decision')
      upsertNode(source, timestamp, undefined, 'decision')
      upsertNode(target, timestamp, undefined, 'decision')
      if (source && target) {
        const existing = nextEdges.get(getEdgeId(source, target, 'TASK_HANDOFF'))
        if (existing) {
          ensureEdgesWritable()
          nextEdges.set(existing.id, withEdgeAnnotation(existing, 'decision'))
          changed = true
        }
      }
    }

    if (ANOMALY_EVENT_TYPES.has(eventType)) {
      upsertNode(agentId, timestamp, 'DEGRADED', 'anomaly')
      upsertNode(source, timestamp, 'DEGRADED', 'anomaly')
      upsertNode(target, timestamp, 'DEGRADED', 'anomaly')
      if (source && target) {
        const anomalyEdgeId = getEdgeId(source, target, 'TASK_HANDOFF')
        const existing = nextEdges.get(anomalyEdgeId)
        if (existing) {
          ensureEdgesWritable()
          nextEdges.set(anomalyEdgeId, withEdgeAnnotation(existing, 'anomaly'))
          changed = true
        }
      }
    }

    if (META_INSIGHT_EVENT_TYPES.has(eventType)) {
      upsertNode(agentId, timestamp, undefined, 'insight')
      upsertNode(source, timestamp, undefined, 'insight')
      upsertNode(target, timestamp, undefined, 'insight')
      if (source && target) {
        const existing = nextEdges.get(getEdgeId(source, target, 'TASK_HANDOFF'))
        if (existing) {
          ensureEdgesWritable()
          nextEdges.set(existing.id, withEdgeAnnotation(existing, 'insight'))
          changed = true
        }
      }
    }

    if (
      eventType === 'AGENT_STEP_STARTED' ||
      eventType === 'AGENT_STEP_COMPLETED' ||
      eventType === 'AGENT_STEP_FAILED' ||
      eventType === 'AGENT_STEP_RETRY'
    ) {
      if (traceId && agentId) {
        const previousAgent = nextLastAgentByTrace.get(traceId)
        if (previousAgent && previousAgent !== agentId) {
          upsertEdge(previousAgent, agentId, 'FLOW_EVENT', eventId, timestamp)
        }
        ensureLastAgentWritable()
        nextLastAgentByTrace.set(traceId, agentId)
      }
    }
  }

  if (supportedEventCount === 0 && import.meta.env.DEV) {
    console.warn('GRAPH_UNSUPPORTED_EVENT_BATCH', {
      incoming: events.length,
    })
  }

  if (nextUnresolvedEdges.size > 0) {
    for (const [eventId, unresolvedEvent] of nextUnresolvedEdges.entries()) {
      if (!preexistingUnresolvedIds.has(eventId)) continue

      const eventType = getEventType(unresolvedEvent)
      if (!EDGE_EVENT_TYPES.has(eventType)) continue

      const source = getSourceAgentId(unresolvedEvent)
      const target = getTargetAgentId(unresolvedEvent)
      if (!source || !target) continue
      if (!nextNodes.has(source) || !nextNodes.has(target)) continue

      upsertEdge(
        source,
        target,
        eventType,
        getEventId(unresolvedEvent),
        getEventTimestamp(unresolvedEvent)
      )
      ensureUnresolvedWritable()
      nextUnresolvedEdges.delete(eventId)
      changed = true
    }
  }

  if (!changed) return prevState

  const nextState: GraphState = {
    nodes: nextNodes,
    edges: nextEdges,
    unresolvedEdges: nextUnresolvedEdges,
    lastAgentByTrace: nextLastAgentByTrace,
  }

  if (import.meta.env.DEV) {
    console.debug('GRAPH_ENGINE_APPLY', {
      incoming: events.length,
      nodes: nextState.nodes.size,
      edges: nextState.edges.size,
      unresolved: nextState.unresolvedEdges.size,
    })
  }

  return nextState
}

export const applyEvents = applyNormalizedEvents

export const applyNodePosition = (
  prevState: GraphState,
  agentId: string,
  position: GraphPosition
) => {
  if (!agentId) return prevState
  const previousPosition = persistedNodePositions.get(agentId)
  if (
    previousPosition &&
    previousPosition.x === position.x &&
    previousPosition.y === position.y &&
    prevState.nodes.get(agentId)?.position?.x === position.x &&
    prevState.nodes.get(agentId)?.position?.y === position.y
  ) {
    return prevState
  }

  persistedNodePositions.set(agentId, position)

  const existingNode = prevState.nodes.get(agentId)
  if (!existingNode) return prevState
  if (existingNode.position?.x === position.x && existingNode.position?.y === position.y) {
    return prevState
  }

  const nextNodes = new Map(prevState.nodes)
  nextNodes.set(agentId, {
    ...existingNode,
    position,
  })

  return {
    nodes: nextNodes,
    edges: prevState.edges,
    unresolvedEdges: prevState.unresolvedEdges,
    lastAgentByTrace: prevState.lastAgentByTrace,
  }
}

export const applyAgentSnapshot = (
  prevState: GraphState,
  agents: AgentSnapshot
): GraphState => {
  const entries = Object.entries(agents)
  if (entries.length === 0) return prevState

  let nextNodes = prevState.nodes
  let changed = false

  const ensureNodesWritable = () => {
    if (nextNodes === prevState.nodes) {
      nextNodes = new Map(prevState.nodes)
    }
  }

  for (const [agentId, agent] of entries) {
    const parsedSeen = Date.parse(agent.last_seen)
    const lastSeen = Number.isFinite(parsedSeen) ? parsedSeen : 0
    const previousNode = nextNodes.get(agentId)
    const persistedPosition = persistedNodePositions.get(agentId)
    const nextNode: GraphNode = {
      id: agentId,
      state: normalizeGraphState(agent.state),
      lastEventTimestamp: Math.max(previousNode?.lastEventTimestamp ?? 0, lastSeen),
      position: previousNode?.position ?? persistedPosition,
      decisionCount: previousNode?.decisionCount,
      anomalyCount: previousNode?.anomalyCount,
      insightCount: previousNode?.insightCount,
    }

    if (
      !previousNode ||
      previousNode.state !== nextNode.state ||
      previousNode.lastEventTimestamp !== nextNode.lastEventTimestamp
    ) {
      ensureNodesWritable()
      nextNodes.set(agentId, nextNode)
      changed = true
    }
  }

  if (!changed) return prevState
  return {
    nodes: nextNodes,
    edges: prevState.edges,
    unresolvedEdges: prevState.unresolvedEdges,
    lastAgentByTrace: prevState.lastAgentByTrace,
  }
}

export const graphStateToGraphData = (state: GraphState): GraphData => {
  const cached = graphDataCache.get(state)
  if (cached) return cached

  const graphData: GraphData = {
    nodes: Array.from(state.nodes.values()).sort((a, b) => a.id.localeCompare(b.id)),
    edges: Array.from(state.edges.values()).sort((a, b) => a.id.localeCompare(b.id)),
  }

  graphDataCache.set(state, graphData)
  return graphData
}

export const __resetGraphEngineForTests = () => {
  persistedNodePositions.clear()
}
