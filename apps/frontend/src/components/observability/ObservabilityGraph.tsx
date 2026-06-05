import type { Edge, EdgeMouseHandler, Node, NodeMouseHandler, ReactFlowInstance } from '@xyflow/react'
import { BaseGraphView } from './BaseGraphView'

type ObservabilityGraphProps = {
  nodes: Node[]
  edges: Edge[]
  onNodeClick: NodeMouseHandler<Node>
  onNodeDragStop: NodeMouseHandler<Node>
  onEdgeClick: EdgeMouseHandler<Edge>
  onInit?: (instance: ReactFlowInstance) => void
  onMoveStart?: () => void
}

export function ObservabilityGraph({
  nodes,
  edges,
  onNodeClick,
  onNodeDragStop,
  onEdgeClick,
  onInit,
  onMoveStart,
}: ObservabilityGraphProps) {
  return (
    <BaseGraphView
      nodes={nodes}
      edges={edges}
      onNodeClick={onNodeClick}
      onNodeDragStop={onNodeDragStop}
      onEdgeClick={onEdgeClick}
      onInit={onInit}
      onMoveStart={onMoveStart}
      className="ov-graph-canvas-observability ov-graph-canvas-premium"
      backgroundColor="#1d3350"
      backgroundGap={28}
    />
  )
}
