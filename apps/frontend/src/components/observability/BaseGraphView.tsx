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
      <div className="ov-map-surface-header" aria-hidden="true">
        <span>Executive Command Map</span>
        <span>Pan · Zoom · Fit</span>
      </div>
      <div className="ov-map-surface-frame">
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
          className="ov-map-reactflow"
        >
          <Background color={backgroundColor} gap={backgroundGap} />
          <Controls />
        </ReactFlow>
        <div className="ov-map-scanlines" aria-hidden="true" />
        <div className="ov-map-grid-inset" aria-hidden="true" />
        <div className="ov-map-corner ov-map-corner--tl" aria-hidden="true" />
        <div className="ov-map-corner ov-map-corner--tr" aria-hidden="true" />
        <div className="ov-map-corner ov-map-corner--bl" aria-hidden="true" />
        <div className="ov-map-corner ov-map-corner--br" aria-hidden="true" />
        <div className="ov-map-micro-label ov-map-micro-label--top-left" aria-hidden="true">sector · north</div>
        <div className="ov-map-micro-label ov-map-micro-label--top-right" aria-hidden="true">focus · tactical</div>
        <div className="ov-map-micro-label ov-map-micro-label--bottom-left" aria-hidden="true">vector field</div>
        <div className="ov-map-micro-label ov-map-micro-label--bottom-right" aria-hidden="true">selection aware</div>
      </div>
    </div>
  )
}
