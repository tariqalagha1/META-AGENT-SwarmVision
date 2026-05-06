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

export function AgentNode({ data }: AgentNodeProps) {
  const setActiveRoom = useVizStore((s) => s.setActiveRoom)

  return (
    <div
      className={`agent-node ${data.active ? 'agent-node--active' : ''}`}
      style={{ borderColor: data.color, boxShadow: data.active ? `0 0 12px ${data.color}55` : 'none' }}
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

      {/* Top bar */}
      <div className="agent-node__header" style={{ color: data.color }}>
        <span className="agent-node__icon">{ZONE_ICONS[data.zone] ?? '◆'}</span>
        <span className="agent-node__label">{data.label}</span>
      </div>

      {/* Agent count badge */}
      <div className="agent-node__count">
        <span className="agent-node__count-num" style={{ color: data.color }}>
          {data.agentCount}
        </span>
        <span className="agent-node__count-label">AGENTS</span>
      </div>

      {/* Status bar */}
      <div className="agent-node__status">
        <div
          className={`agent-node__status-bar ${data.active ? 'agent-node__status-bar--pulse' : ''}`}
          style={{ background: data.active ? data.color : '#1a2a3a' }}
        />
        <span className="agent-node__status-text">
          {data.active ? 'ACTIVE' : 'IDLE'}
        </span>
      </div>

      <Handle type="target" position={Position.Top} className="agent-node__handle" />
      <Handle type="source" position={Position.Bottom} className="agent-node__handle" />
    </div>
  )
}
