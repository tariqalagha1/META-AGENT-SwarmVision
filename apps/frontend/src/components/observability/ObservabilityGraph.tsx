import type { Edge, EdgeMouseHandler, Node, NodeMouseHandler, ReactFlowInstance } from '@xyflow/react'
import { BaseGraphView } from './BaseGraphView'

type ObservabilityGraphProps = {
  nodes: Node[]
  edges: Edge[]
  onNodeClick: NodeMouseHandler<Node>
  onNodeDragStop: NodeMouseHandler<Node>
  onEdgeClick: EdgeMouseHandler<Edge>
  onInit?: (instance: ReactFlowInstance) => void
}

export function ObservabilityGraph({
  nodes,
  edges,
  onNodeClick,
  onNodeDragStop,
  onEdgeClick,
  onInit,
}: ObservabilityGraphProps) {
  return (
    <BaseGraphView
      nodes={nodes}
      edges={edges}
      onNodeClick={onNodeClick}
      onNodeDragStop={onNodeDragStop}
      onEdgeClick={onEdgeClick}
      onInit={onInit}
      className="ov-graph-canvas-observability"
      backgroundColor="#223A5E"
      backgroundGap={24}
    />
  )
}
