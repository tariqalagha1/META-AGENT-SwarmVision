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
import { adaptEdgesForMode, adaptNodesForMode } from './graphModeAdapters'
import { GraphLegend } from './GraphLegend'
import { CinematicGraph } from './CinematicGraph'
import { EmptyStateCard } from './EmptyStateCard'
import { GraphControlsBar } from './GraphControlsBar'
import { ObservabilityGraph } from './ObservabilityGraph'
import { PipelineGraph } from './PipelineGraph'
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
  const selectedAgentId = useObservabilityStore((s) => s.selectedAgentId)
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
          ]
            .filter(Boolean)
            .join(' '),
          style: {
            borderColor: agentStateTokens[node.state].ringColor,
          },
          ariaLabel: node.id,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        }

        return [node.id, nextNode]
      })
    )
  }, [baseNodePositions, graphData.nodes, safeMode])

  const nextEdgeMap = useMemo(() => {
    return new Map(
      graphData.edges.map((edge) => {
        const edgeToken = eventTypeTokens[edge.interactionType] ?? defaultEventTypeToken
        const nextEdge: Edge = {
          id: edge.key,
          source: edge.source,
          target: edge.target,
          animated: !safeMode,
          label: edge.interactionType,
          style: {
            stroke: edgeToken.color,
          },
          labelStyle: {
            fill: edgeToken.color,
            fontSize: 10,
            fontWeight: 600,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edgeToken.color,
          },
          data: {
            terminalEventId: edge.terminalEventId,
          },
        }

        return [edge.key, nextEdge]
      })
    )
  }, [graphData.edges, safeMode])

  const [nodes, setNodes] = useState<Node<GraphNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

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
          current.style?.stroke === nextEdge.style?.stroke
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
  }, [selectTrace, selectedAgentId, selectedAgentLatestTrace])

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
        return (
          <PipelineGraph
            nodes={modeNodes}
            edges={modeEdges}
            onNodeClick={handleNodeClickForMode}
            onNodeDragStop={handleNodeDragStopForMode}
            onEdgeClick={handleEdgeClickForMode}
            onInit={handleFlowInit}
          />
        )
      case 'CINEMATIC':
        return (
          <CinematicGraph
            nodes={modeNodes}
            edges={modeEdges}
            onNodeClick={handleNodeClickForMode}
            onNodeDragStop={handleNodeDragStopForMode}
            onEdgeClick={handleEdgeClickForMode}
            onInit={handleFlowInit}
          />
        )
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
      <section className="ov-panel ov-panel-graph" aria-label="System graph panel">
        <header className="ov-panel-header">
          <h2>System Graph</h2>
        </header>
        <GraphControlsBar onExportPng={exportPng} onExportJson={exportJson} />
        <ReplayControls minTs={replayBounds.min} maxTs={replayBounds.max} />
        <EmptyStateCard
          title="No graph data for current view"
          description="Adjust filters or replay cursor, or wait for events to stream."
        />
      </section>
    )
  }

  return (
    <section className="ov-panel ov-panel-graph" aria-label="System graph panel">
      <header className="ov-panel-header">
        <h2>System Graph</h2>
      </header>

      <GraphControlsBar onExportPng={exportPng} onExportJson={exportJson} />
      <ReplayControls minTs={replayBounds.min} maxTs={replayBounds.max} />

      {disconnected ? <div className="ov-panel-overlay">Disconnected</div> : null}

      {renderModeGraph(graphMode)}

      <GraphLegend />
    </section>
  )
}
