import {
  Background,
  Controls,
  ReactFlow,
  type ReactFlowInstance,
  type Edge,
  type EdgeMouseHandler,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react'

type BaseGraphViewProps = {
  nodes: Node[]
  edges: Edge[]
  onNodeClick: NodeMouseHandler<Node>
  onNodeDragStop: NodeMouseHandler<Node>
  onEdgeClick: EdgeMouseHandler<Edge>
  className: string
  backgroundColor: string
  backgroundGap: number
  onInit?: (instance: ReactFlowInstance) => void
}

export function BaseGraphView({
  nodes,
  edges,
  onNodeClick,
  onNodeDragStop,
  onEdgeClick,
  className,
  backgroundColor,
  backgroundGap,
  onInit,
}: BaseGraphViewProps) {
  return (
    <div className={`ov-graph-wrapper ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onEdgeClick={onEdgeClick}
        onInit={onInit}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.8}
      >
        <Background color={backgroundColor} gap={backgroundGap} />
        <Controls />
      </ReactFlow>
    </div>
  )
}
