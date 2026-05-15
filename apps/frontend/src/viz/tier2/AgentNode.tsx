import { Handle, Position } from '@xyflow/react'
import { useVizStore } from '../useVizStore'
import './AgentNode.css'

export interface AgentNodeData {
  label: string
  zone: string
  agentCount: number
  state: string
  color: string
  active: boolean
  taskCount?: number
  sparkline?: number[]
}

interface AgentNodeProps {
  data: AgentNodeData
}

const ZONE_ICONS: Record<string, string> = {
  INTAKE:   '⬇',
  FORGE:    '⚙',
  QA:       '🔍',
  ROUTER:   '⟁',
  MEMORY:   '🧠',
  DISPATCH: '📦',
  AUDIT:    '📋',
  HITL:     '⚠',
}

const DEFAULT_SPARKLINE = [2, 4, 3, 6, 5, 7, 4, 6]

export function AgentNode({ data }: AgentNodeProps) {
  const setActiveRoom = useVizStore((s) => s.setActiveRoom)
  const spark = data.sparkline ?? DEFAULT_SPARKLINE
  const sparkMax = Math.max(...spark, 1)

  return (
    <div
      className={`agent-node ${data.active ? 'agent-node--active' : ''}`}
      style={{ borderColor: data.color, boxShadow: data.active ? `0 0 10px ${data.color}44` : 'none' }}
      onClick={() => setActiveRoom(data.zone)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') setActiveRoom(data.zone) }}
      aria-label={`Zone ${data.label}`}
    >
      {/* Corner brackets */}
      <span className="agent-node__corner agent-node__corner--tl" style={{ borderColor: data.color }} />
      <span className="agent-node__corner agent-node__corner--tr" style={{ borderColor: data.color }} />
      <span className="agent-node__corner agent-node__corner--bl" style={{ borderColor: data.color }} />
      <span className="agent-node__corner agent-node__corner--br" style={{ borderColor: data.color }} />

      {/* Header row: icon + label | status dot */}
      <div className="agent-node__header" style={{ color: data.color }}>
        <div className="agent-node__header-left">
          <span className="agent-node__icon">{ZONE_ICONS[data.zone] ?? '◆'}</span>
          <span className="agent-node__label">{data.label}</span>
        </div>
        <span
          className={`agent-node__status-dot ${data.active ? 'agent-node__status-dot--active' : ''}`}
          style={data.active ? { background: data.color } : undefined}
        />
      </div>

      {/* Body row: count block | sparkline */}
      <div className="agent-node__body">
        <div className="agent-node__count-block">
          <span className="agent-node__count-num" style={{ color: data.color }}>
            {data.agentCount}
          </span>
          <span className="agent-node__count-label">AGENTS</span>
        </div>
        <div className="agent-node__sparkline" style={{ color: data.color }}>
          {spark.map((v, i) => (
            <span
              key={i}
              className="agent-node__spark-bar"
              style={{ height: `${Math.round((v / sparkMax) * 18)}px` }}
            />
          ))}
        </div>
      </div>

      {/* Footer row: status badge | task count */}
      <div className="agent-node__footer">
        <div className={`agent-node__badge ${data.active ? 'agent-node__badge--active' : 'agent-node__badge--idle'}`}>
          {data.active ? 'ACTIVE' : 'IDLE'}
        </div>
        <span className="agent-node__task-count">
          {data.taskCount ?? 0} TASKS
        </span>
      </div>

      <Handle type="target" position={Position.Top} className="agent-node__handle" />
      <Handle type="source" position={Position.Bottom} className="agent-node__handle" />
    </div>
  )
}
