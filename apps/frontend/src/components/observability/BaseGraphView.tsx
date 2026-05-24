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
  onMoveStart?: () => void
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
  onMoveStart,
}: BaseGraphViewProps) {
  return (
    <div className={`ov-graph-wrapper ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onEdgeClick={onEdgeClick}
        onInit={onInit}
        onMoveStart={onMoveStart}
        proOptions={{ hideAttribution: true }}
        minZoom={0.25}
        maxZoom={2.0}
        defaultViewport={{ x: 20, y: 20, zoom: 0.6 }}
      >
        <Background color={backgroundColor} gap={backgroundGap} />
        <Controls />
      </ReactFlow>
    </div>
  )
}
