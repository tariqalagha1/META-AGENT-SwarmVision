import { useEffect, useMemo, useState } from 'react'
import { useObservabilityStore } from '../../store'
import type { ObservabilityEvent } from '../../store'
import './RoomDrillDown.css'

// Persists HITL decisions across modal open/close cycles
const _hitlStore = new Map<string, 'pending' | 'approved' | 'rejected'>()

interface RoomDrillDownProps {
  roomId:        string
  onClose:       () => void
  activeAgents?: string[]
}

interface RoomConfig {
  id:          string
  label:       string
  icon:        string
  description: string
  accentColor: string
  eventTypes:  string[]
  interactive: boolean
}

const ROOM_CONFIGS: Record<string, RoomConfig> = {
  INTAKE: {
    id:'INTAKE', label:'INTAKE', icon:'⬇',
    description:'Everything entering the pipeline — new agents spawning, task arrivals, onboarding queue.',
    accentColor:'#00FFEE', eventTypes:['AGENT_SPAWN','TASK_START'], interactive:false,
  },
  FORGE: {
    id:'FORGE', label:'FORGE', icon:'⚙',
    description:'Active task execution — what is being built right now, live timers, pipeline updates.',
    accentColor:'#FF8800', eventTypes:['TASK_START','PIPELINE_UPDATE'], interactive:false,
  },
  QA_SCAN: {
    id:'QA_SCAN', label:'QA SCAN', icon:'🔍',
    description:'Quality gate — confidence scores, pass/fail decisions, decision points.',
    accentColor:'#00FFEE', eventTypes:['DECISION_POINT','DECISION'], interactive:false,
  },
  ROUTER: {
    id:'ROUTER', label:'ROUTER', icon:'⟁',
    description:'Control tower — routing decisions, handoffs between agents, active flow map.',
    accentColor:'#FF8800', eventTypes:['TASK_HANDOFF','DECISION','AGENT_MOVE'], interactive:false,
  },
  MEMORY: {
    id:'MEMORY', label:'MEMORY', icon:'🧠',
    description:'Knowledge vault — meta insights surfaced by the swarm, categorized and searchable.',
    accentColor:'#00FFEE', eventTypes:['META_INSIGHT'], interactive:false,
  },
  DISPATCH: {
    id:'DISPATCH', label:'DISPATCH', icon:'📦',
    description:'Shipping dock — completed tasks, output payloads, throughput metrics.',
    accentColor:'#FF8800', eventTypes:['TASK_SUCCESS','TASK_HANDOFF'], interactive:false,
  },
  AUDIT: {
    id:'AUDIT', label:'AUDIT', icon:'📋',
    description:'Compliance room — health checks, terminations, uptime and error rate trends.',
    accentColor:'#00FFEE', eventTypes:['HEALTH_CHECK','AGENT_TERMINATION'], interactive:false,
  },
  HITL: {
    id:'HITL', label:'HITL', icon:'⚠',
    description:'Command desk — anomalies and failures requiring human approval. Approve or reject each item.',
    accentColor:'#AA44FF', eventTypes:['ANOMALY','TASK_FAIL'], interactive:true,
  },
}

interface HitlItem {
  id:          string
  agentId:     string
  description: string
  severity:    string
  ts:          number
  status:      'pending' | 'approved' | 'rejected'
}

function StandardRoomView({
  roomEvents,
  config,
}: {
  roomEvents: ObservabilityEvent[]
  config: RoomConfig
}) {
  const now = Date.now()
  return (
    <div className="rdd-standard">
      <div className="rdd-stats-row">
        <div className="rdd-stat-card">
          <div className="rdd-stat-label">TOTAL EVENTS</div>
          <div className="rdd-stat-val" style={{ color: config.accentColor }}>{roomEvents.length}</div>
        </div>
        <div className="rdd-stat-card">
          <div className="rdd-stat-label">AGENTS ACTIVE</div>
          <div className="rdd-stat-val" style={{ color: config.accentColor }}>
            {new Set(roomEvents.map(e => e.agent_id).filter(Boolean)).size}
          </div>
        </div>
        <div className="rdd-stat-card">
          <div className="rdd-stat-label">LATEST</div>
          <div className="rdd-stat-val" style={{ color: config.accentColor, fontSize: 11 }}>
            {roomEvents[0]
              ? `${Math.round((now - new Date(roomEvents[0].timestamp).getTime()) / 1000)}s ago`
              : '—'}
          </div>
        </div>
        <div className="rdd-stat-card">
          <div className="rdd-stat-label">WATCHING</div>
          <div className="rdd-stat-val" style={{ color: config.accentColor, fontSize: 9 }}>
            {config.eventTypes.join(', ')}
          </div>
        </div>
      </div>

      <div className="rdd-sparkline-section">
        <div className="rdd-section-title">ACTIVITY — LAST 5 MINUTES</div>
        <div className="rdd-sparkline">
          {Array.from({ length: 30 }, (_, i) => {
            const bucketEnd   = now - (29 - i) * 10000
            const bucketStart = bucketEnd - 10000
            const count = roomEvents.filter(ev => {
              const t = new Date(ev.timestamp).getTime()
              return t >= bucketStart && t < bucketEnd
            }).length
            return (
              <div
                key={i}
                className="rdd-spark-bar"
                style={{
                  height: Math.max(2, Math.min(48, count * 8)),
                  background: count > 0 ? config.accentColor : '#1A1A2A',
                  opacity: count > 0 ? 0.5 + (i / 30) * 0.5 : 0.3,
                }}
                title={`${count} events`}
              />
            )
          })}
        </div>
      </div>

      <div className="rdd-events-section">
        <div className="rdd-section-title">LIVE EVENT FEED</div>
        <div className="rdd-event-list">
          {roomEvents.slice(0, 100).map((ev, i) => (
            <div key={ev.event_id ?? i} className="rdd-event-row">
              <span className="rdd-event-dot" style={{ background: config.accentColor }} />
              <span className="rdd-event-type" style={{ color: config.accentColor }}>
                {ev.event_type ?? ev.type}
              </span>
              <span className="rdd-event-agent">{ev.agent_id ?? 'system'}</span>
              <span className="rdd-event-payload">
                {Object.entries(ev.payload).slice(0, 2)
                  .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
                  .join(' · ')}
              </span>
              <span className="rdd-event-ts">
                {Math.round((now - new Date(ev.timestamp).getTime()) / 1000)}s
              </span>
            </div>
          ))}
          {roomEvents.length === 0 && (
            <div className="rdd-empty">
              No {config.eventTypes.join(' / ')} events yet. Waiting for pipeline activity…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function HITLView({
  queue,
  onDecide,
  accentColor,
}: {
  queue:      HitlItem[]
  onDecide:   (id: string, decision: 'approved' | 'rejected') => void
  accentColor: string
}) {
  const pending  = queue.filter(h => h.status === 'pending')
  const resolved = queue.filter(h => h.status !== 'pending')
  const now = Date.now()
  return (
    <div className="rdd-hitl">
      <div className="rdd-stats-row">
        <div className="rdd-stat-card">
          <div className="rdd-stat-label">PENDING</div>
          <div className="rdd-stat-val" style={{ color: '#FF2244' }}>{pending.length}</div>
        </div>
        <div className="rdd-stat-card">
          <div className="rdd-stat-label">APPROVED</div>
          <div className="rdd-stat-val" style={{ color: '#44FF88' }}>
            {queue.filter(h => h.status === 'approved').length}
          </div>
        </div>
        <div className="rdd-stat-card">
          <div className="rdd-stat-label">REJECTED</div>
          <div className="rdd-stat-val" style={{ color: '#FF8800' }}>
            {queue.filter(h => h.status === 'rejected').length}
          </div>
        </div>
        <div className="rdd-stat-card">
          <div className="rdd-stat-label">RESOLUTION</div>
          <div className="rdd-stat-val" style={{ color: accentColor, fontSize: 11 }}>
            {queue.length > 0 ? `${Math.round((resolved.length / queue.length) * 100)}%` : '—'}
          </div>
        </div>
      </div>

      {pending.length > 0 ? (
        <div className="rdd-hitl-section">
          <div className="rdd-section-title" style={{ color: '#FF2244' }}>
            ⚠ PENDING APPROVAL ({pending.length})
          </div>
          <div className="rdd-hitl-queue">
            {pending.map(item => (
              <div key={item.id} className="rdd-hitl-card">
                <div className="rdd-hitl-card-header">
                  <span className={`rdd-severity-badge severity-${item.severity}`}>
                    {item.severity.toUpperCase()}
                  </span>
                  <span className="rdd-hitl-agent">{item.agentId}</span>
                  <span className="rdd-hitl-ts">{Math.round((now - item.ts) / 1000)}s ago</span>
                </div>
                <div className="rdd-hitl-desc">{item.description}</div>
                <div className="rdd-hitl-actions">
                  <button type="button" className="rdd-approve-btn"
                    onClick={() => onDecide(item.id, 'approved')}>✓ APPROVE</button>
                  <button type="button" className="rdd-reject-btn"
                    onClick={() => onDecide(item.id, 'rejected')}>✕ REJECT</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rdd-hitl-clear"><span>✓</span><span>All clear — no pending approvals</span></div>
      )}

      {resolved.length > 0 && (
        <div className="rdd-hitl-section">
          <div className="rdd-section-title">RESOLVED HISTORY</div>
          <div className="rdd-hitl-history">
            {resolved.map(item => (
              <div key={item.id} className={`rdd-hitl-history-row ${item.status}`}>
                <span className={`rdd-history-badge ${item.status}`}>
                  {item.status === 'approved' ? '✓' : '✕'} {item.status.toUpperCase()}
                </span>
                <span className="rdd-hitl-agent">{item.agentId}</span>
                <span className="rdd-hitl-desc-short">{item.description.slice(0, 60)}</span>
                <span className="rdd-hitl-ts">{Math.round((now - item.ts) / 1000)}s ago</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function RoomDrillDown({ roomId, onClose, activeAgents = [] }: RoomDrillDownProps) {
  const events     = useObservabilityStore(s => s.events)
  const eventOrder = useObservabilityStore(s => s.eventOrder)
  const config     = ROOM_CONFIGS[roomId]

  const [hitlQueue, setHitlQueue] = useState<HitlItem[]>([])

  const roomEvents = useMemo(() => {
    if (!config) return []
    return eventOrder
      .map(id => events[id])
      .filter((ev): ev is ObservabilityEvent =>
        !!ev && config.eventTypes.includes(ev.event_type ?? ev.type ?? '')
      )
      .slice(0, 200)
  }, [eventOrder, events, config])

  useEffect(() => {
    if (roomId !== 'HITL') return
    setHitlQueue(prev => {
      const existingIds = new Set(prev.map(h => h.id))
      const newItems: HitlItem[] = roomEvents
        .filter(ev => !existingIds.has(ev.event_id))
        .map(ev => ({
          id:          ev.event_id,
          agentId:     ev.agent_id ?? 'unknown',
          description: String(ev.payload['description'] ?? ev.event_type ?? 'Anomaly detected'),
          severity:    String(ev.payload['severity'] ?? 'medium'),
          ts:          new Date(ev.timestamp).getTime(),
          status:      (_hitlStore.get(ev.event_id) ?? 'pending') as 'pending' | 'approved' | 'rejected',
        }))
      return [...newItems, ...prev].slice(0, 50)
    })
  }, [roomEvents, roomId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleHITL = (id: string, decision: 'approved' | 'rejected') => {
    _hitlStore.set(id, decision)
    setHitlQueue(prev => prev.map(item => item.id === id ? { ...item, status: decision } : item))
  }

  if (!config) return null

  return (
    <div className="rdd-overlay" role="dialog" aria-modal="true">
      <div className="rdd-modal">
        <header className="rdd-header" style={{ borderBottomColor: config.accentColor + '44' }}>
          <div className="rdd-breadcrumb">
            <button type="button" className="rdd-back-btn" onClick={onClose}>← SWARM SIM</button>
            <span className="rdd-breadcrumb-sep">›</span>
            <span className="rdd-breadcrumb-current" style={{ color: config.accentColor }}>
              {config.icon} {config.label}
            </span>
          </div>
          <div className="rdd-header-meta">
            <span className="rdd-event-count">{roomEvents.length} events</span>
            <div className="rdd-live-dot" style={{ background: config.accentColor }} />
            <span className="rdd-live-label">LIVE</span>
          </div>
          <button type="button" className="rdd-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="rdd-description" style={{ borderLeftColor: config.accentColor }}>
          {config.description}
        </div>

        {activeAgents.length > 0 && (
          <div className="rdd-agent-bar">
            <span className="rdd-agent-bar-label">AGENTS IN ZONE</span>
            {activeAgents.map(id => (
              <span key={id} className="rdd-agent-chip">{id.slice(0, 12)}</span>
            ))}
          </div>
        )}

        <div className="rdd-body">
          {config.interactive
            ? <HITLView queue={hitlQueue} onDecide={handleHITL} accentColor={config.accentColor} />
            : <StandardRoomView roomEvents={roomEvents} config={config} />
          }
        </div>
      </div>
    </div>
  )
}
