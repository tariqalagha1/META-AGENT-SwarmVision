import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MarkerType,
  type Edge,
  type EdgeMouseHandler,
  type Node,
  type NodeMouseHandler,
  Position,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { agentStateTokens } from '../../design/agentStateTokens'
import { defaultEventTypeToken, eventTypeTokens } from '../../design/eventTypeTokens'
import {
  useFilteredGraphData,
  type GraphMode,
  useObservabilityStore,
  usePausedSnapshot,
  useSelectedAgentLatestTrace,
  useTopologyEvents,
} from '../../store'
import { useEcosystemTraceState } from '../../store/ecosystemRuntimeStore'
import { adaptEdgesForMode, adaptNodesForMode } from './graphModeAdapters'
import { GraphLegend } from './GraphLegend'
import { EmptyStateCard } from './EmptyStateCard'
import { GraphControlsBar } from './GraphControlsBar'
import { ObservabilityGraph } from './ObservabilityGraph'
import { PipelineExecutionView } from './PipelineExecutionView'
import { CinematicSwarmView } from './CinematicSwarmView'
import { ReplayControls } from './ReplayControls'
import './ObservabilityPanels.css'

type SystemGraphPanelProps = {
  tenantId?: string
  appId?: string
  disconnected: boolean
}

type GraphNodeData = {
  label: string
  state: 'ACTIVE' | 'DEGRADED' | 'FAILED'
  recentlyActive: boolean
  safeMode: boolean
}

const PANEL_WIDTH = 740
const PANEL_HEIGHT = 420
const ACTIVITY_WINDOW_MS = 2000

function stableNodePosition(
  nodeId: string,
  radius: number = 260,
  jitterAmount: number = 40,
): { x: number; y: number } {
  // FNV-1a 32-bit hash — deterministic, good distribution for short strings
  let h = 2166136261
  for (let i = 0; i < nodeId.length; i++) {
    h = Math.imul(h ^ nodeId.charCodeAt(i), 16777619)
  }

  // Two independent fractions: one for angle, one for radius jitter
  const hashA = (h >>> 0) / 0xffffffff
  const hashB = ((Math.imul(h, 2654435761) >>> 0) / 0xffffffff)

  const angle = hashA * Math.PI * 2
  const effectiveRadius = radius + (hashB - 0.5) * 2 * jitterAmount

  return {
    x: Math.cos(angle) * effectiveRadius,
    y: Math.sin(angle) * effectiveRadius,
  }
}

export function SystemGraphPanel({ tenantId, appId, disconnected }: SystemGraphPanelProps) {
  const selectAgent = useObservabilityStore((s) => s.selectAgent)
  const selectEvent = useObservabilityStore((s) => s.selectEvent)
  const selectTrace = useObservabilityStore((s) => s.selectTrace)
  const selectRequest = useObservabilityStore((s) => s.selectRequest)
  const selectedAgentId = useObservabilityStore((s) => s.selectedAgentId)
  const selectedTraceId = useObservabilityStore((s) => s.selectedTraceId)
  const selectedRequestId = useObservabilityStore((s) => s.selectedRequestId)
  const selectedEventId = useObservabilityStore((s) => s.selectedEventId)
  const traces = useObservabilityStore((s) => s.traces)
  const events = useObservabilityStore((s) => s.events)
  const safeMode = useObservabilityStore((s) => s.safeMode)
  const graphMode = useObservabilityStore((s) => s.graphMode)
  const filters = useObservabilityStore((s) => s.filters)
  const streamMode = useObservabilityStore((s) => s.mode)
  const isPaused = streamMode === 'PAUSED'

  const liveGraphData = useFilteredGraphData({ tenantId, appId })
  const { setNodePosition } = liveGraphData
  const graphData = usePausedSnapshot(liveGraphData, isPaused)
  const topologyEvents = useTopologyEvents({ tenantId, appId })
  const selectedAgentLatestTrace = useSelectedAgentLatestTrace()

  const lastNodeSelectionRef = useRef<string | null>(null)
  const reactFlowRef = useRef<ReactFlowInstance | null>(null)

  const focusTraceId = selectedRequestId ?? selectedTraceId
  const focusedAgentIds = useMemo(() => {
    if (!focusTraceId) return new Set<string>()
    const ids = traces[focusTraceId] ?? []
    const result = new Set<string>()
    for (const eventId of ids) {
      const event = events[eventId]
      if (!event) continue
      if (event.agent_id) result.add(String(event.agent_id))
      const payload = event.payload ?? {}
      const source = String(payload.source_agent_id ?? '')
      const target = String(payload.target_agent_id ?? '')
      if (source) result.add(source)
      if (target) result.add(target)
    }
    return result
  }, [events, focusTraceId, traces])

  const runtimeTraceState = useEcosystemTraceState(focusTraceId)
  if (import.meta.env.DEV) {
    console.log('HOOK_SNAPSHOT', JSON.stringify({
      focusTraceId,
      runtimeTraceState,
    }))
  }

  const runtimeNodeState = useCallback(
    (nodeId: string) => runtimeTraceState?.nodes?.[nodeId]?.state ?? 'idle',
    [runtimeTraceState]
  )

  const runtimeEdgeState = useCallback(
    (source: string, target: string) =>
      runtimeTraceState?.edges?.[`${source}->${target}`]?.state ?? 'idle',
    [runtimeTraceState]
  )

  const diagnosticSeverityForFocusedTrace = useMemo<'FAIL' | 'WARNING' | null>(() => {
    if (!focusTraceId) return null
    const traceEventIds = traces[focusTraceId] ?? []
    for (let i = traceEventIds.length - 1; i >= 0; i -= 1) {
      const event = events[traceEventIds[i]]
      if (!event || event.event_type !== 'DIAGNOSTIC_RESULT') continue
      const payload = (event.payload ?? {}) as Record<string, unknown>
      const unified = (payload.unified ?? {}) as Record<string, unknown>
      const enforcement = (payload.enforcement ?? {}) as Record<string, unknown>
      const verdict = String(unified.verdict ?? '').toUpperCase()
      const blocked = Boolean(enforcement.block)
      const warned = Boolean(enforcement.warn)
      if (blocked || verdict === 'FAIL') return 'FAIL'
      if (warned || verdict === 'WARNING') return 'WARNING'
      return null
    }
    return null
  }, [events, focusTraceId, traces])

  const baseNodePositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>()
    for (const node of graphData.nodes) {
      positions.set(node.id, stableNodePosition(node.id))
    }
    return positions
  }, [graphData.nodes])

  const nextNodeMap = useMemo(() => {
    const now = Date.now()
    return new Map(
      graphData.nodes.map((node) => {
        const position = baseNodePositions.get(node.id) ?? { x: PANEL_WIDTH / 2, y: PANEL_HEIGHT / 2 }
        const persistedPosition = node.position ?? position
        const recentlyActive = now - node.lastEventTimestamp <= ACTIVITY_WINDOW_MS
        const motionState = runtimeNodeState(node.id)

        const nextNode: Node<GraphNodeData> = {
          id: node.id,
          position: persistedPosition,
          data: {
            label: node.id,
            state: node.state,
            recentlyActive,
            safeMode,
          },
          className: [
            'ov-graph-node',
            `ov-node-${node.state.toLowerCase()}`,
            !safeMode && recentlyActive ? 'ov-node-recent' : '',
            focusedAgentIds.size > 0 && focusedAgentIds.has(node.id) ? 'ov-node-focused' : '',
            focusedAgentIds.size > 0 && !focusedAgentIds.has(node.id) ? 'ov-node-dimmed' : '',
            focusedAgentIds.size > 0 && focusedAgentIds.has(node.id) && diagnosticSeverityForFocusedTrace === 'FAIL'
              ? 'ov-node-diagnostic-fail'
              : '',
            focusedAgentIds.size > 0 && focusedAgentIds.has(node.id) && diagnosticSeverityForFocusedTrace === 'WARNING'
              ? 'ov-node-diagnostic-warning'
              : '',
            motionState === 'active' ? 'ov-node-motion-active' : '',
            motionState === 'completed' ? 'ov-node-motion-completed' : '',
            motionState === 'failed' ? 'ov-node-motion-failed' : '',
            motionState === 'degraded' ? 'ov-node-motion-degraded' : '',
            motionState === 'idle' ? 'ov-node-motion-idle' : '',
          ]
            .filter(Boolean)
            .join(' '),
          style: {
            borderColor: agentStateTokens[node.state].ringColor,
            opacity: focusedAgentIds.size > 0 && !focusedAgentIds.has(node.id) ? 0.32 : 1,
            boxShadow:
                focusedAgentIds.size > 0 && focusedAgentIds.has(node.id)
                  ? `0 0 0 2px ${agentStateTokens[node.state].ringColor}, 0 0 16px ${agentStateTokens[node.state].ringColor}`
                  : undefined,
          },
          ariaLabel: node.id,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        }

        return [node.id, nextNode]
      })
    )
  }, [baseNodePositions, diagnosticSeverityForFocusedTrace, focusedAgentIds, graphData.nodes, runtimeNodeState, safeMode])

  const nextEdgeMap = useMemo(() => {
    const mapped = new Map(
      graphData.edges.map((edge) => {
        const edgeToken = eventTypeTokens[edge.interactionType] ?? defaultEventTypeToken
        const motionState = runtimeEdgeState(edge.source, edge.target)
        const isFlowing = motionState === 'flowing'
        const isCompleted = motionState === 'completed'
        const isFailed = motionState === 'failed'
        const isRetrying = motionState === 'retrying'
        const strokeColor = isFailed
          ? '#E24B4A'
          : isRetrying
            ? '#F2A623'
            : edgeToken.color
        const nextEdge: Edge = {
          id: edge.key,
          source: edge.source,
          target: edge.target,
          animated: !safeMode && (isFlowing || isRetrying),
          label: edge.interactionType,
          style: {
            stroke: strokeColor,
            strokeWidth: isFailed || isRetrying ? 2.8 : 2.2,
            strokeDasharray: isFlowing ? '6 4' : isRetrying ? '2 6' : undefined,
            opacity: isCompleted ? 0.45 : 1,
          },
          labelStyle: {
            fill: strokeColor,
            fontSize: 10,
            fontWeight: 600,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: strokeColor,
          },
          data: {
            terminalEventId: edge.terminalEventId,
          },
        }

        return [edge.key, nextEdge]
      })
    )

    if (runtimeTraceState) {
      for (const [nodeId, node] of Object.entries(runtimeTraceState.nodes)) {
        if (!node.retrying) continue
        const loopId = `retry-${nodeId}`
        const retryLoopEdge: Edge = {
          id: loopId,
          source: nodeId,
          target: nodeId,
          label: 'retry',
          animated: true,
          className: 'ov-retry-loop',
          style: {
            stroke: '#F2A623',
            strokeWidth: 2,
            strokeDasharray: '4 4',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#F2A623',
          },
          data: {
            isRetryLoop: true,
          },
        }
        mapped.set(loopId, retryLoopEdge)
      }
    }

    return mapped
  }, [graphData.edges, runtimeEdgeState, runtimeTraceState, safeMode])

  const [nodes, setNodes] = useState<Node<GraphNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  // Incremental update contract proof (dev only):
  // 1) Incoming selector output is converted to keyed maps (nextNodeMap/nextEdgeMap).
  // 2) Existing rendered arrays are diffed by id/key and only changed entities are replaced.
  // 3) Unchanged entities keep object identity, preserving React Flow stability.
  // if (import.meta.env.DEV) console.count('graph-rerender')
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.count('graph-rerender')
    }

    setNodes((currentNodes: Node<GraphNodeData>[]) => {
      const currentMap = new Map(currentNodes.map((node) => [node.id, node]))
      const nextNodes: Node<GraphNodeData>[] = []

      nextNodeMap.forEach((nextNode, id) => {
        const current = currentMap.get(id)
        if (
          current &&
          current.className === nextNode.className &&
          current.position.x === nextNode.position.x &&
          current.position.y === nextNode.position.y &&
          current.data.label === nextNode.data.label &&
          current.data.state === nextNode.data.state &&
          current.data.recentlyActive === nextNode.data.recentlyActive &&
          current.data.safeMode === nextNode.data.safeMode
        ) {
          nextNodes.push(current)
          return
        }

        nextNodes.push(nextNode)
      })

      return nextNodes
    })

    setEdges((currentEdges: Edge[]) => {
      const currentMap = new Map(currentEdges.map((edge) => [edge.id, edge]))
      const nextEdges: Edge[] = []

      nextEdgeMap.forEach((nextEdge, key) => {
        const current = currentMap.get(key)
        if (
          current &&
          current.source === nextEdge.source &&
          current.target === nextEdge.target &&
          current.animated === nextEdge.animated &&
          current.label === nextEdge.label &&
          current.data?.terminalEventId === nextEdge.data?.terminalEventId &&
          current.style?.stroke === nextEdge.style?.stroke &&
          current.style?.strokeDasharray === nextEdge.style?.strokeDasharray &&
          current.style?.strokeWidth === nextEdge.style?.strokeWidth &&
          current.style?.opacity === nextEdge.style?.opacity &&
          current.className === nextEdge.className
        ) {
          nextEdges.push(current)
          return
        }

        nextEdges.push(nextEdge)
      })

      return nextEdges
    })
  }, [nextEdgeMap, nextNodeMap, setEdges, setNodes])

  useEffect(() => {
    if (!selectedAgentLatestTrace) return
    if (selectedAgentId !== lastNodeSelectionRef.current) return
    selectTrace(selectedAgentLatestTrace)
    selectRequest(selectedAgentLatestTrace)
  }, [selectRequest, selectTrace, selectedAgentId, selectedAgentLatestTrace])

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug('GRAPH MODE:', graphMode)
    }
  }, [graphMode])

  const handleNodeClick = (_: unknown, node: Node<GraphNodeData>) => {
    lastNodeSelectionRef.current = node.id
    selectAgent(node.id)
  }

  const handleEdgeClick = (_: unknown, edge: Edge) => {
    const eventId = edge.data?.terminalEventId
    if (!eventId) return
    selectEvent(String(eventId))
  }

  const handleNodeDragStop: NodeMouseHandler<Node<GraphNodeData>> = (_, node) => {
    setNodePosition(node.id, node.position)
  }

  const replayBounds = useMemo(() => {
    if (topologyEvents.length === 0) return { min: undefined, max: undefined }
    let min = Number.POSITIVE_INFINITY
    let max = 0
    for (const event of topologyEvents) {
      const parsed = Date.parse(String(event.timestamp))
      if (!Number.isFinite(parsed)) continue
      if (parsed < min) min = parsed
      if (parsed > max) max = parsed
    }
    if (!Number.isFinite(min) || max <= 0) return { min: undefined, max: undefined }
    return { min, max }
  }, [topologyEvents])

  const handleFlowInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowRef.current = instance
  }, [])

  useEffect(() => {
    if (!selectedEventId) return
    const event = events[selectedEventId]
    if (!event) return
    const payload = (event.payload ?? {}) as Record<string, unknown>
    const stepName = String(payload.step_name ?? event.agent_id ?? '').trim()
    if (!stepName) return
    setSyncMessage(`Synced to: ${stepName} step`)
    const timeout = window.setTimeout(() => setSyncMessage(null), 1400)
    return () => window.clearTimeout(timeout)
  }, [events, selectedEventId])

  useEffect(() => {
    if (!focusTraceId) return
    if (focusedAgentIds.size === 0) return
    const instance = reactFlowRef.current as unknown as {
      fitView?: (options?: { nodes?: Array<{ id: string }>; duration?: number; padding?: number }) => void
    } | null
    if (!instance?.fitView) return
    const nodes = Array.from(focusedAgentIds).map((id) => ({ id }))
    instance.fitView({ nodes, duration: 380, padding: 0.25 })
  }, [focusTraceId, focusedAgentIds])

  const exportJson = useCallback(() => {
    const payload = {
      nodes: graphData.nodes,
      edges: graphData.edges,
      timestamp: Date.now(),
      filters,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `graph-export-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }, [filters, graphData.edges, graphData.nodes])

  const exportPng = useCallback(async () => {
    const instance = reactFlowRef.current as unknown as { toPng?: () => Promise<string> }
    if (!instance?.toPng) {
      if (import.meta.env.DEV) {
        console.warn('GRAPH_EXPORT_PNG_UNAVAILABLE')
      }
      return
    }
    const dataUrl = await instance.toPng()
    if (!dataUrl) return
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `graph-export-${Date.now()}.png`
    link.click()
  }, [])

  const modeNodes = useMemo(
    () => adaptNodesForMode(nodes as Node[], edges, graphMode),
    [edges, graphMode, nodes]
  )
  const modeEdges = useMemo(() => adaptEdgesForMode(edges, graphMode), [edges, graphMode])
  const cinematicMode = graphMode === 'CINEMATIC'

  const handleNodeClickForMode = handleNodeClick as unknown as NodeMouseHandler<Node>
  const handleNodeDragStopForMode = handleNodeDragStop as unknown as NodeMouseHandler<Node>
  const handleEdgeClickForMode = handleEdgeClick as unknown as EdgeMouseHandler<Edge>

  const renderModeGraph = (mode: GraphMode) => {
    switch (mode) {
      case 'OBSERVABILITY':
        return (
          <ObservabilityGraph
            nodes={modeNodes}
            edges={modeEdges}
            onNodeClick={handleNodeClickForMode}
            onNodeDragStop={handleNodeDragStopForMode}
            onEdgeClick={handleEdgeClickForMode}
            onInit={handleFlowInit}
          />
        )
      case 'PIPELINE':
        return <PipelineExecutionView traceId={focusTraceId ?? null} runtimeTraceState={runtimeTraceState} />
      case 'CINEMATIC':
        return <CinematicSwarmView traceId={focusTraceId ?? null} runtimeTraceState={runtimeTraceState} />
      default:
        return (
          <ObservabilityGraph
            nodes={modeNodes}
            edges={modeEdges}
            onNodeClick={handleNodeClickForMode}
            onNodeDragStop={handleNodeDragStopForMode}
            onEdgeClick={handleEdgeClickForMode}
            onInit={handleFlowInit}
          />
        )
    }
  }

  if (graphData.nodes.length === 0) {
    return (
      <section className="ov-panel ov-panel-graph ov-panel-graph-immersive" aria-label="System graph panel">
        <header className="ov-panel-header ov-floating-header">
          <h2>System Graph</h2>
        </header>
        <div className="ov-floating-controls">
          <GraphControlsBar onExportPng={exportPng} onExportJson={exportJson} />
          <ReplayControls minTs={replayBounds.min} maxTs={replayBounds.max} />
        </div>
        <EmptyStateCard
          title="No graph data for current view"
          description="Adjust filters or replay cursor, or wait for events to stream."
        />
      </section>
    )
  }

  return (
    <section className="ov-panel ov-panel-graph ov-panel-graph-immersive" aria-label="System graph panel">
      <header className="ov-panel-header ov-floating-header">
        <h2>System Graph</h2>
      </header>

      {!cinematicMode ? (
        <div className="ov-floating-controls">
          <GraphControlsBar onExportPng={exportPng} onExportJson={exportJson} />
          <ReplayControls minTs={replayBounds.min} maxTs={replayBounds.max} />
        </div>
      ) : null}

      {disconnected ? <div className="ov-panel-overlay">Disconnected</div> : null}
      {syncMessage ? <div className="ov-sync-tooltip">{syncMessage}</div> : null}

      <div className="ov-immersive-canvas">{renderModeGraph(graphMode)}</div>

      {!cinematicMode ? <GraphLegend /> : null}
    </section>
  )
}
