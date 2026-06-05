import { useCallback, useEffect, useRef, useState } from 'react'
import { useObservabilityStore } from '../../store'
import { withApiScope } from '../../lib/requestContext'
import './AgentEcosystemPanel.css'

// ─── Canvas dimensions ────────────────────────────────────────────────────────

const W = 1200
const H = 700

// ─── Physics constants ────────────────────────────────────────────────────────

const REPULSION  = 8000
const ATTRACTION = 0.04
const DAMPING    = 0.85
const CENTER_PULL = 0.003
const MIN_DIST   = 120
const EDGE_REST  = 220

// ─── Palette ──────────────────────────────────────────────────────────────────

const P = {
  void:        '#05040A',
  surface:     '#0A0806',
  gold:        '#FFB800',
  goldBright:  '#FFD060',
  goldDim:     '#8A6200',
  goldGlow:    '#CC9000',
  amber:       '#FF8C00',
  amberDim:    '#6A3800',
  active:      '#44FF88',
  activeDim:   '#1A4A2A',
  warning:     '#FF6600',
  danger:      '#FF2244',
  info:        '#00CCFF',
  textBright:  '#FFE8A0',
  textMid:     '#B08840',
  textDim:     '#503C18',
  cardBg:      '#100C06',
  cardBorder:  '#2A1E08',
  edgeFlow:    '#FFB800',
  edgeReturn:  '#FF6600',
  edgeMeta:    '#00CCFF',
  sparkActive: '#44FF88',
  sparkDim:    '#1A3A24',
  scanline:    'rgba(255,180,0,0.02)',
  grid:        'rgba(42,30,8,0.3)',
}

const AGENT_COLORS = [
  '#FFB800', '#FF6600', '#44FF88', '#00CCFF',
  '#AA44FF', '#FF2244', '#00FFEE', '#FFD060',
  '#FF8C00', '#44BBFF',
]

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface EcoAgent {
  id:           string
  name:         string
  type:         string
  sourceApp:    string
  description:  string
  agentIndex:   number
  color:        string
  x:            number
  y:            number
  vx:           number
  vy:           number
  state:        'ACTIVE' | 'DEGRADED' | 'FAILED' | 'IDLE'
  currentTask:  string
  lastEvent:    string
  lastEventTs:  number
  taskProgress: number
  activityLog:  number[]
  capabilities: string[]
}

interface FlowParticle {
  progress: number
  speed:    number
  color:    string
  age:      number
}

interface FlowEdge {
  id:        string
  fromId:    string
  toId:      string
  type:      'handoff' | 'decision' | 'meta' | 'spawn'
  particles: FlowParticle[]
  strength:  number
  lastFlow:  number
}

interface RegistryAgent {
  agent_id:     string
  name:         string
  type:         string
  description:  string | null
  source_app:   string
  capabilities: string[]
}

interface SimRef {
  agents:       Map<string, EcoAgent>
  edges:        Map<string, FlowEdge>
  agentCounter: number
  tick:         number
  lastEventId:  string
  dragging:     string | null
  dragOffX:     number
  dragOffY:     number
}

interface AgentEcosystemPanelProps {
  apiBaseUrl: string
  tenantId?: string
  appId?: string
  appName?: string
  authHeaders: Record<string, string>
  onClose:    () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function canvasPos(
  e: MouseEvent,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const scaleX = W / rect.width
  const scaleY = H / rect.height
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AgentEcosystemPanel({
  apiBaseUrl,
  tenantId,
  appId,
  appName,
  authHeaders,
  onClose,
}: AgentEcosystemPanelProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)

  const simRef = useRef<SimRef>({
    agents:       new Map(),
    edges:        new Map(),
    agentCounter: 0,
    tick:         0,
    lastEventId:  '',
    dragging:     null,
    dragOffX:     0,
    dragOffY:     0,
  })

  const [selectedAgentId,  setSelectedAgentId]  = useState<string | null>(null)
  const [showConnectModal, setShowConnectModal]  = useState(false)
  const [registryAgents,   setRegistryAgents]    = useState<RegistryAgent[]>([])
  const [simAgentDisplay,  setSimAgentDisplay]   = useState<EcoAgent | null>(null)
  const [agentCount,       setAgentCount]        = useState(0)
  const [edgeCount,        setEdgeCount]         = useState(0)

  const events     = useObservabilityStore(s => s.events)
  const eventOrder = useObservabilityStore(s => s.eventOrder)

  // ── Event processing ──────────────────────────────────────────────────────
  useEffect(() => {
    if (eventOrder.length === 0) return
    const sim = simRef.current
    // Find only events we haven't processed yet (after lastEventId)
    const lastIdx = sim.lastEventId ? eventOrder.lastIndexOf(sim.lastEventId) : -1
    const newIds = lastIdx >= 0 ? eventOrder.slice(lastIdx + 1) : eventOrder.slice(-5)
    if (newIds.length === 0) return
    sim.lastEventId = eventOrder[eventOrder.length - 1]

    newIds.slice(0, 10).forEach(eid => {
      const ev = events[eid]
      if (!ev) return
      const evRaw   = ev as unknown as Record<string, unknown>
      const evType  = String(ev.event_type ?? evRaw['type'] ?? '')
      const agentId = String(ev.agent_id ?? '')
      if (!agentId || agentId === 'system') return

      if (!sim.agents.has(agentId)) {
        const angle = Math.random() * Math.PI * 2
        const r     = 150 + Math.random() * 200
        const idx   = sim.agentCounter++
        sim.agents.set(agentId, {
          id: agentId, name: agentId, type: 'auto',
          sourceApp:    String(ev.source ?? 'unknown'),
          description:  '',
          agentIndex:   idx,
          color:        AGENT_COLORS[idx % AGENT_COLORS.length],
          x: W / 2 + Math.cos(angle) * r,
          y: H / 2 + Math.sin(angle) * r,
          vx: 0, vy: 0,
          state:        'ACTIVE',
          currentTask:  '',
          lastEvent:    evType,
          lastEventTs:  Date.now(),
          taskProgress: 0,
          activityLog:  [],
          capabilities: [],
        })
      }

      const agent = sim.agents.get(agentId)!
      agent.lastEvent   = evType
      agent.lastEventTs = Date.now()
      agent.activityLog = [...agent.activityLog.slice(-19), Date.now()]

      if (evType === 'TASK_START') {
        const pload = (ev.payload ?? {}) as Record<string, unknown>
        agent.currentTask  = String(pload['task_name'] ?? evType)
        agent.taskProgress = 0
        agent.state        = 'ACTIVE'
      } else if (evType === 'TASK_SUCCESS') {
        agent.taskProgress = 1
        agent.state        = 'ACTIVE'
      } else if (evType === 'TASK_FAIL' || evType === 'ANOMALY') {
        agent.state        = 'DEGRADED'
        agent.taskProgress = 0
      } else if (evType === 'AGENT_TERMINATION') {
        agent.state = 'FAILED'
      } else if (evType === 'AGENT_SPAWN') {
        agent.state = 'ACTIVE'
      }

      if (agent.state === 'ACTIVE' && agent.taskProgress < 1) {
        agent.taskProgress = Math.min(1, agent.taskProgress + 0.15)
      }

      // TASK_HANDOFF → handoff edge
      if (evType === 'TASK_HANDOFF') {
        const pload  = (ev.payload ?? {}) as Record<string, unknown>
        const toId   = String(pload['to_agent'] ?? '')
        if (toId && toId !== agentId && sim.agents.has(toId)) {
          const edgeId   = `${agentId}→${toId}`
          const existing = sim.edges.get(edgeId)
          if (existing) {
            existing.strength = Math.min(1, existing.strength + 0.4)
            existing.lastFlow = Date.now()
            existing.particles.push({ progress: 0, speed: 0.008 + Math.random() * 0.006, color: P.edgeFlow, age: 0 })
          } else {
            sim.edges.set(edgeId, {
              id: edgeId, fromId: agentId, toId, type: 'handoff',
              strength: 0.6, lastFlow: Date.now(),
              particles: [{ progress: 0, speed: 0.01, color: P.edgeFlow, age: 0 }],
            })
          }
        }
      }

      // DECISION → decision edge back to orchestrator
      if (evType === 'DECISION' || evType === 'DECISION_POINT') {
        const orchestratorId = [...sim.agents.keys()].find(id =>
          id.includes('orchestrat') || id.includes('controller') || id.includes('router'),
        )
        if (orchestratorId && orchestratorId !== agentId) {
          const edgeId = `${agentId}→${orchestratorId}`
          if (!sim.edges.has(edgeId)) {
            sim.edges.set(edgeId, {
              id: edgeId, fromId: agentId, toId: orchestratorId,
              type: 'decision', strength: 0.4, lastFlow: Date.now(),
              particles: [],
            })
          }
          const edge = sim.edges.get(edgeId)!
          edge.strength = Math.min(1, edge.strength + 0.3)
          edge.particles.push({ progress: 0, speed: 0.009, color: P.edgeReturn, age: 0 })
        }
      }

      // META_INSIGHT → meta edge broadcast to all
      if (evType === 'META_INSIGHT') {
        sim.agents.forEach((_, targetId) => {
          if (targetId === agentId) return
          const edgeId = `${agentId}→${targetId}:meta`
          sim.edges.set(edgeId, {
            id: edgeId, fromId: agentId, toId: targetId,
            type: 'meta', strength: 0.2, lastFlow: Date.now(),
            particles: [{ progress: 0, speed: 0.012, color: P.edgeMeta, age: 0 }],
          })
        })
      }
    })
  }, [eventOrder, events])

  // ── Registry poll (every 10s) ─────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(
          withApiScope(`${apiBaseUrl}/agents/registry`, { tenantId, appId, appName }),
          { headers: authHeaders },
        )
        if (!res.ok) return
        const data = (await res.json()) as { agents: RegistryAgent[] }
        const sim  = simRef.current
        const scopedAgents = appId
          ? data.agents.filter((ra) => ra.source_app === appId)
          : data.agents
        scopedAgents.forEach(ra => {
          if (!sim.agents.has(ra.agent_id)) {
            const angle = Math.random() * Math.PI * 2
            const r     = 150 + Math.random() * 200
            const idx   = sim.agentCounter++
            sim.agents.set(ra.agent_id, {
              id: ra.agent_id, name: ra.name, type: ra.type,
              sourceApp:    ra.source_app,
              description:  ra.description ?? '',
              agentIndex:   idx,
              color:        AGENT_COLORS[idx % AGENT_COLORS.length],
              x: W / 2 + Math.cos(angle) * r,
              y: H / 2 + Math.sin(angle) * r,
              vx: 0, vy: 0,
              state: 'IDLE', currentTask: '', lastEvent: '',
              lastEventTs: 0, taskProgress: 0,
              activityLog: [], capabilities: ra.capabilities,
            })
          } else {
            const agent = sim.agents.get(ra.agent_id)!
            agent.capabilities = ra.capabilities
            agent.type         = ra.type
            agent.description  = ra.description ?? ''
          }
        })
        setRegistryAgents(scopedAgents)
      } catch { /* ignore */ }
    }
    void poll()
    const interval = setInterval(() => void poll(), 10000)
    return () => clearInterval(interval)
  }, [apiBaseUrl, appId, appName, authHeaders, tenantId])

  // ── Flush inspector display every 400ms ───────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      const sim = simRef.current
      setAgentCount(sim.agents.size)
      setEdgeCount(sim.edges.size)
      if (selectedAgentId && sim.agents.has(selectedAgentId)) {
        setSimAgentDisplay({ ...sim.agents.get(selectedAgentId)! })
      } else {
        setSimAgentDisplay(null)
      }
    }, 400)
    return () => clearInterval(iv)
  }, [selectedAgentId])

  // ── ESC key closes panel ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Draw helpers ──────────────────────────────────────────────────────────

  const drawEdge = useCallback((
    ctx: CanvasRenderingContext2D,
    edge: FlowEdge,
    agents: Map<string, EcoAgent>,
  ) => {
    const a = agents.get(edge.fromId)
    const b = agents.get(edge.toId)
    if (!a || !b) return

    const dx   = b.x - a.x
    const dy   = b.y - a.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1) return
    const ux = dx / dist
    const uy = dy / dist

    const alpha = Math.min(0.6, edge.strength * 0.8)
    const edgeColor = edge.type === 'meta' ? P.edgeMeta
      : edge.type === 'decision' ? P.edgeReturn : P.edgeFlow

    ctx.globalAlpha = alpha
    ctx.strokeStyle = edgeColor
    ctx.lineWidth   = 1 + edge.strength
    ctx.setLineDash(edge.type === 'meta' ? [3, 5] : [])
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.setLineDash([])

    // Arrowhead
    const ax = b.x - ux * 16
    const ay = b.y - uy * 16
    const px = -uy * 6
    const py =  ux * 6
    ctx.fillStyle = edgeColor
    ctx.beginPath()
    ctx.moveTo(b.x - ux * 8, b.y - uy * 8)
    ctx.lineTo(ax + px, ay + py)
    ctx.lineTo(ax - px, ay - py)
    ctx.closePath()
    ctx.fill()

    ctx.globalAlpha = 1

    // Flow particles
    edge.particles = edge.particles.filter(p => p.progress < 1 && p.age < 150)
    edge.particles.forEach(p => {
      p.progress += p.speed
      p.age++
      const px2  = a.x + (b.x - a.x) * p.progress
      const py2  = a.y + (b.y - a.y) * p.progress
      const fade = p.progress > 0.85 ? 1 - (p.progress - 0.85) / 0.15 : 1
      ctx.globalAlpha  = fade * 0.9
      ctx.shadowBlur   = 6
      ctx.shadowColor  = p.color
      ctx.fillStyle    = p.color
      ctx.beginPath()
      ctx.arc(px2, py2, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur   = 0
      ctx.globalAlpha  = 1
    })
  }, [])

  const drawAgentCard = useCallback((
    ctx: CanvasRenderingContext2D,
    agent: EcoAgent,
    selected: boolean,
  ) => {
    const CW = 120
    const CH = 90
    const cx = agent.x - CW / 2
    const cy = agent.y - CH / 2

    ctx.save()

    // Glow
    if (agent.state === 'ACTIVE') {
      ctx.shadowBlur  = selected ? 20 : 10
      ctx.shadowColor = agent.color
    }

    // Card background
    ctx.fillStyle   = P.cardBg
    ctx.strokeStyle = selected ? agent.color : P.cardBorder
    ctx.lineWidth   = selected ? 2 : 1
    roundRect(ctx, cx, cy, CW, CH, 6)
    ctx.fill()
    ctx.stroke()
    ctx.shadowBlur = 0

    // Color accent bar
    ctx.fillStyle = agent.color
    ctx.fillRect(cx + 1, cy + 1, CW - 2, 4)

    // Name
    ctx.font      = 'bold 8px Courier New'
    ctx.fillStyle = agent.color
    ctx.textAlign = 'center'
    ctx.fillText(agent.name.slice(0, 16), agent.x, cy + 18)

    // State badge
    const stateColor = agent.state === 'ACTIVE'   ? P.active
                     : agent.state === 'DEGRADED' ? P.warning
                     : agent.state === 'FAILED'   ? P.danger
                     : P.textDim
    ctx.font      = '6px Courier New'
    ctx.fillStyle = stateColor
    ctx.fillText(agent.state, agent.x, cy + 27)

    // Current task
    ctx.fillStyle = P.textMid
    ctx.fillText((agent.currentTask || agent.lastEvent).slice(0, 18), agent.x, cy + 37)

    // Task progress bar
    const barX = cx + 8
    const barY = cy + 42
    const barW = CW - 16
    const barH = 4
    ctx.fillStyle = '#1A1408'
    ctx.fillRect(barX, barY, barW, barH)
    ctx.fillStyle = agent.taskProgress >= 1 ? P.active : agent.color
    ctx.fillRect(barX, barY, barW * agent.taskProgress, barH)

    // Sparkline
    const sparkX = cx + 8
    const sparkY = cy + 52
    const sparkW = CW - 16
    const sparkH = 16
    const now    = Date.now()
    const buckets = 20
    for (let i = 0; i < buckets; i++) {
      const bucketStart = now - (buckets - i) * 3000
      const count = agent.activityLog.filter(t => t >= bucketStart && t < bucketStart + 3000).length
      const bh    = Math.min(sparkH, count * 4)
      ctx.fillStyle = count > 0 ? P.sparkActive : P.sparkDim
      ctx.fillRect(sparkX + i * (sparkW / buckets), sparkY + sparkH - bh, (sparkW / buckets) - 1, bh)
    }

    // Last event timestamp
    const secAgo = agent.lastEventTs > 0 ? Math.round((now - agent.lastEventTs) / 1000) : 0
    ctx.font      = '5px Courier New'
    ctx.fillStyle = P.textDim
    ctx.fillText(agent.lastEventTs > 0 ? `${secAgo}s ago` : 'idle', agent.x, cy + CH - 6)

    ctx.textAlign = 'left'
    ctx.restore()
  }, [])

  const drawScanlines = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = P.scanline
    for (let sy = 0; sy < H; sy += 2) {
      ctx.fillRect(0, sy, W, 1)
    }
  }, [])

  // ── Draw loop ─────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sim      = simRef.current
    const agentArr = [...sim.agents.values()]

    // 1. Background
    ctx.fillStyle = P.void
    ctx.fillRect(0, 0, W, H)

    // 2. Ambient grid
    ctx.strokeStyle = P.grid
    ctx.lineWidth   = 0.5
    for (let gx = 0; gx < W; gx += 40) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke()
    }
    for (let gy = 0; gy < H; gy += 40) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
    }

    // 3. Edges
    sim.edges.forEach(edge => drawEdge(ctx, edge, sim.agents))

    // 4. Agent cards
    agentArr.forEach(agent => {
      drawAgentCard(ctx, agent, agent.id === sim.dragging || agent.id === selectedAgentId)
    })

    // 5. Physics tick
    // Repulsion
    for (let i = 0; i < agentArr.length; i++) {
      for (let j = i + 1; j < agentArr.length; j++) {
        const a  = agentArr[i]
        const b  = agentArr[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        if (dist < MIN_DIST * 3) {
          const force = REPULSION / (dist * dist)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          a.vx -= fx; a.vy -= fy
          b.vx += fx; b.vy += fy
        }
      }
    }

    // Spring attraction along edges
    sim.edges.forEach(edge => {
      const a = sim.agents.get(edge.fromId)
      const b = sim.agents.get(edge.toId)
      if (!a || !b) return
      const dx   = b.x - a.x
      const dy   = b.y - a.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      const stretch = dist - EDGE_REST
      const force   = stretch * ATTRACTION * edge.strength
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx += fx; a.vy += fy
      b.vx -= fx; b.vy -= fy
    })

    // Center pull + integrate
    agentArr.forEach(agent => {
      if (sim.dragging === agent.id) return
      agent.vx += (W / 2 - agent.x) * CENTER_PULL
      agent.vy += (H / 2 - agent.y) * CENTER_PULL
      agent.vx *= DAMPING
      agent.vy *= DAMPING
      agent.x = Math.max(80, Math.min(W - 80, agent.x + agent.vx))
      agent.y = Math.max(80, Math.min(H - 80, agent.y + agent.vy))
    })

    // Edge decay
    sim.edges.forEach((edge, key) => {
      edge.strength = Math.max(0, edge.strength - 0.0008)
      if (edge.strength < 0.02 && Date.now() - edge.lastFlow > 30000) {
        sim.edges.delete(key)
      }
    })

    // 6. Scanlines
    drawScanlines(ctx)

    // 7. HUD
    const hudText = `AGENTS: ${sim.agents.size}   EDGES: ${sim.edges.size}   REGISTRY: ${registryAgents.length}`
    ctx.font      = '9px Courier New'
    ctx.fillStyle = P.textDim
    ctx.textAlign = 'right'
    ctx.fillText(hudText, W - 12, 16)
    ctx.textAlign = 'left'

    sim.tick++
    rafRef.current = requestAnimationFrame(draw)
  }, [drawEdge, drawAgentCard, drawScanlines, selectedAgentId, registryAgents.length])

  // ── Start / stop animation loop ───────────────────────────────────────────
  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(rafRef.current) }
  }, [draw])

  // ── Mouse handlers ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onMouseDown = (e: MouseEvent) => {
      const pos = canvasPos(e, canvas)
      const sim = simRef.current
      for (const [id, agent] of sim.agents) {
        if (Math.abs(agent.x - pos.x) < 60 && Math.abs(agent.y - pos.y) < 45) {
          sim.dragging  = id
          sim.dragOffX  = pos.x - agent.x
          sim.dragOffY  = pos.y - agent.y
          setSelectedAgentId(id)
          break
        }
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      const pos = canvasPos(e, canvas)
      const sim = simRef.current
      if (sim.dragging) {
        const agent = sim.agents.get(sim.dragging)
        if (agent) {
          agent.x = pos.x - sim.dragOffX
          agent.y = pos.y - sim.dragOffY
        }
      }
    }

    const onMouseUp = () => { simRef.current.dragging = null }

    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseup',   onMouseUp)

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseup',   onMouseUp)
    }
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  const selectedColor = selectedAgentId
    ? (simRef.current.agents.get(selectedAgentId)?.color ?? P.gold)
    : P.gold

  return (
    <section className="eco-panel" aria-label="Agent Ecosystem">

      {/* Header */}
      <header className="eco-header">
        <div className="eco-live-dot" />
        <span className="eco-title">⬡ AGENT ECOSYSTEM</span>

        <div className="eco-header-stats">
          <div className="eco-stat">
            <span className="eco-stat-label">AGENTS</span>
            <span className="eco-stat-val">{agentCount}</span>
          </div>
          <div className="eco-stat">
            <span className="eco-stat-label">EDGES</span>
            <span className="eco-stat-val">{edgeCount}</span>
          </div>
          <div className="eco-stat">
            <span className="eco-stat-label">REGISTRY</span>
            <span className="eco-stat-val">{registryAgents.length}</span>
          </div>
        </div>

        <button
          type="button"
          className="eco-connect-btn"
          onClick={() => setShowConnectModal(true)}
        >
          + Connect App
        </button>

        <button type="button" className="eco-close-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      {/* Canvas */}
      <div className="eco-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
        />

        {/* Inspector */}
        {selectedAgentId && simAgentDisplay && (
          <div className="eco-inspector">
            <div className="eco-inspector-header">
              <span style={{ color: selectedColor }}>⬡ {selectedAgentId}</span>
              <button type="button" onClick={() => setSelectedAgentId(null)}>✕</button>
            </div>
            <div className="eco-inspector-row">
              <span>Source</span>
              <span>{simAgentDisplay.sourceApp}</span>
            </div>
            <div className="eco-inspector-row">
              <span>Type</span>
              <span>{simAgentDisplay.type}</span>
            </div>
            <div className="eco-inspector-row">
              <span>State</span>
              <span className={`state-${simAgentDisplay.state.toLowerCase()}`}>
                {simAgentDisplay.state}
              </span>
            </div>
            <div className="eco-inspector-row">
              <span>Current task</span>
              <span>{simAgentDisplay.currentTask || '—'}</span>
            </div>
            <div className="eco-inspector-row">
              <span>Last event</span>
              <span>{simAgentDisplay.lastEvent || '—'}</span>
            </div>
            <div className="eco-inspector-row">
              <span>Events (20s)</span>
              <span>
                {simAgentDisplay.activityLog.filter(t => t > Date.now() - 20000).length}
              </span>
            </div>
            <div className="eco-inspector-row">
              <span>Capabilities</span>
              <span>{simAgentDisplay.capabilities.join(', ') || '—'}</span>
            </div>

            <div className="eco-inspector-connections">
              <div className="eco-inspector-section-title">CONNECTIONS</div>
              {[...simRef.current.edges.values()]
                .filter(e => e.fromId === selectedAgentId || e.toId === selectedAgentId)
                .map(e => (
                  <div key={e.id} className="eco-inspector-edge">
                    <span>{e.fromId === selectedAgentId ? '→' : '←'}</span>
                    <span>{e.fromId === selectedAgentId ? e.toId : e.fromId}</span>
                    <span className="eco-edge-type">{e.type}</span>
                    <span>{Math.round(e.strength * 100)}%</span>
                  </div>
                ))
              }
              {[...simRef.current.edges.values()].filter(
                e => e.fromId === selectedAgentId || e.toId === selectedAgentId,
              ).length === 0 && (
                <div style={{ fontSize: 8, color: P.textDim, padding: '4px 0' }}>
                  No active connections
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Connect modal */}
      {showConnectModal && (
        <div className="eco-modal-overlay">
          <div className="eco-modal">
            <div className="eco-modal-title">Connect External App</div>
            <p className="eco-modal-desc">
              Use the API key in your orchestration app to stream agent events to SwarmVision.
            </p>
            <div className="eco-modal-row">
              <span>Master API Key</span>
              <code className="eco-api-key">sv-dev-key-change-in-prod</code>
            </div>
            <div className="eco-modal-row">
              <span>Connect endpoint</span>
              <code className="eco-api-key">POST /agents/connect</code>
            </div>
            <div className="eco-modal-row">
              <span>Events endpoint</span>
              <code className="eco-api-key">POST /events/broadcast</code>
            </div>
            <div className="eco-modal-section">SDK snippet (Python):</div>
            <pre className="eco-code-block">{`from swarmvision_sdk import SwarmVisionClient
client = SwarmVisionClient(host="http://YOUR_HOST:8012")
await client.task_start("my-agent", "run-001", "My task")`}</pre>
            <button
              type="button"
              className="eco-modal-close"
              onClick={() => setShowConnectModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
