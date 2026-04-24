import type { Edge, EdgeMouseHandler, Node, NodeMouseHandler, ReactFlowInstance } from '@xyflow/react'
import { BaseGraphView } from './BaseGraphView'

type PipelineGraphProps = {
  nodes: Node[]
  edges: Edge[]
  onNodeClick: NodeMouseHandler<Node>
  onNodeDragStop: NodeMouseHandler<Node>
  onEdgeClick: EdgeMouseHandler<Edge>
  onInit?: (instance: ReactFlowInstance) => void
}

export function PipelineGraph({
  nodes,
  edges,
  onNodeClick,
  onNodeDragStop,
  onEdgeClick,
  onInit,
}: PipelineGraphProps) {
  return (
    <BaseGraphView
      nodes={nodes}
      edges={edges}
      onNodeClick={onNodeClick}
      onNodeDragStop={onNodeDragStop}
      onEdgeClick={onEdgeClick}
      onInit={onInit}
      className="ov-graph-canvas-pipeline"
      backgroundColor="#2A3E5E"
      backgroundGap={28}
    />
  )
}
