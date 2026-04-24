import type { Edge, EdgeMouseHandler, Node, NodeMouseHandler, ReactFlowInstance } from '@xyflow/react'
import { BaseGraphView } from './BaseGraphView'

type CinematicGraphProps = {
  nodes: Node[]
  edges: Edge[]
  onNodeClick: NodeMouseHandler<Node>
  onNodeDragStop: NodeMouseHandler<Node>
  onEdgeClick: EdgeMouseHandler<Edge>
  onInit?: (instance: ReactFlowInstance) => void
}

export function CinematicGraph({
  nodes,
  edges,
  onNodeClick,
  onNodeDragStop,
  onEdgeClick,
  onInit,
}: CinematicGraphProps) {
  return (
    <BaseGraphView
      nodes={nodes}
      edges={edges}
      onNodeClick={onNodeClick}
      onNodeDragStop={onNodeDragStop}
      onEdgeClick={onEdgeClick}
      onInit={onInit}
      className="ov-graph-canvas-cinematic"
      backgroundColor="#2D3C60"
      backgroundGap={30}
    />
  )
}
