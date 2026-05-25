import type { VizEvent } from '../VizBridge'
import { ZONES } from '../VizBridge'

// ─── Production palette ───────────────────────────────────────────────────────
const PALETTE = {
  bg:        0x080c14,
  bgRoom:    0x0d1420,
  bgRoomAlt: 0x0a1018,
  grid:      0x111827,
  border:    0x1e2d3d,

  INTAKE:   0x2dd4bf,
  FORGE:    0xf59e0b,
  QA:       0x10b981,
  ROUTER:   0x6366f1,
  MEMORY:   0x8b5cf6,
  DISPATCH: 0x2dd4bf,
  AUDIT:    0xef4444,
  HITL:     0xf59e0b,

  agentColors: [0x2dd4bf, 0xf59e0b, 0x10b981, 0x6366f1, 0x8b5cf6, 0xef4444],
  taskColors:  [0x2dd4bf, 0x10b981, 0xf59e0b],

  textPrimary:   0xe2e8f0,
  textSecondary: 0x64748b,
  textMuted:     0x374151,
  textAccent:    0x2dd4bf,
}

// ── ISO MATH ──────────────────────────────────────────────────────────────────
const ISO_TILE_W = 96
const ISO_TILE_H = 48
const ISO_WALL_H = 36

type P = { x: number; y: number }

function isoToScreen(col: number, row: number, ox: number, oy: number): P {
  return {
    x: ox + (col - row) * (ISO_TILE_W / 2),
    y: oy + (col + row) * (ISO_TILE_H / 2),
  }
}

function isoTileVertices(col: number, row: number, ox: number, oy: number) {
  const center = isoToScreen(col, row, ox, oy)
  const hw = ISO_TILE_W / 2
  const hh = ISO_TILE_H / 2
  return {
    top:    { x: center.x,      y: center.y - hh },
    right:  { x: center.x + hw, y: center.y      },
    bottom: { x: center.x,      y: center.y + hh },
    left:   { x: center.x - hw, y: center.y      },
  }
}

function darkenColor(hex: number, factor: number): number {
  const r = Math.floor(((hex >> 16) & 0xff) * factor)
  const g = Math.floor(((hex >>  8) & 0xff) * factor)
  const b = Math.floor(( hex        & 0xff) * factor)
  return (r << 16) | (g << 8) | b
}

function lightenColor(hex: number, factor: number): number {
  const r = Math.min(255, Math.floor(((hex >> 16) & 0xff) + (255 - ((hex >> 16) & 0xff)) * factor))
  const g = Math.min(255, Math.floor(((hex >>  8) & 0xff) + (255 - ((hex >>  8) & 0xff)) * factor))
  const b = Math.min(255, Math.floor(( hex        & 0xff) + (255 - ( hex        & 0xff)) * factor))
  return (r << 16) | (g << 8) | b
}

function getAgentTones(baseColor: number): { highlight: number; base: number; shadow: number; outline: number } {
  return {
    highlight: lightenColor(baseColor, 0.45),
    base:      baseColor,
    shadow:    darkenColor(baseColor, 0.45),
    outline:   darkenColor(baseColor, 0.15),
  }
}

// ── ISO ROOM LAYOUT ───────────────────────────────────────────────────────────
const ISO_ROOM_LAYOUT = [
  { id: 'INTAKE',   gridCol:  0, gridRow: 0, wTiles: 3, dTiles: 3,
    color: 0x2dd4bf, label: 'INTAKE',   icon: '⬇', role: 'SCRAPER'   },
  { id: 'FORGE',    gridCol:  3, gridRow: 0, wTiles: 3, dTiles: 3,
    color: 0xf59e0b, label: 'FORGE',    icon: '⚙', role: 'WRITER'    },
  { id: 'QA',       gridCol:  6, gridRow: 0, wTiles: 3, dTiles: 3,
    color: 0x10b981, label: 'QA',       icon: '◎', role: 'CHECKER'   },
  { id: 'ROUTER',   gridCol:  9, gridRow: 0, wTiles: 3, dTiles: 3,
    color: 0x6366f1, label: 'ROUTER',   icon: '⚡', role: 'DIRECTOR'  },
  { id: 'MEMORY',   gridCol:  0, gridRow: 3, wTiles: 3, dTiles: 3,
    color: 0x8b5cf6, label: 'MEMORY',   icon: '◈', role: 'KNOWLEDGE' },
  { id: 'DISPATCH', gridCol:  3, gridRow: 3, wTiles: 3, dTiles: 3,
    color: 0x10b981, label: 'DISPATCH', icon: '▶', role: 'SHIPPER'   },
  { id: 'AUDIT',    gridCol:  6, gridRow: 3, wTiles: 3, dTiles: 3,
    color: 0xef4444, label: 'AUDIT',    icon: '≡', role: 'LOGGER'    },
  { id: 'HITL',     gridCol:  9, gridRow: 3, wTiles: 3, dTiles: 3,
    color: 0xf59e0b, label: 'HITL',     icon: '⚑', role: 'HUMAN'    },
] as const

type IsoRoom = typeof ISO_ROOM_LAYOUT[number]

const ISO_PIPELINES: Array<{ from: string; to: string }> = [
  { from: 'INTAKE',   to: 'FORGE'    },
  { from: 'FORGE',    to: 'QA'       },
  { from: 'QA',       to: 'ROUTER'   },
  { from: 'ROUTER',   to: 'MEMORY'   },
  { from: 'MEMORY',   to: 'DISPATCH' },
  { from: 'DISPATCH', to: 'AUDIT'    },
  { from: 'AUDIT',    to: 'HITL'     },
]

// ── AGENT RENDERING CONSTANTS ─────────────────────────────────────────────────
const AGENT_SCALE  = 4
const PLUMBOB_H    = 20

const ZONE_ROLES: Record<string, { role: string; variant: 'worker' | 'checker' | 'director' | 'supervisor' }> = {
  INTAKE:   { role: 'SCRAPER',   variant: 'worker'     },
  FORGE:    { role: 'WRITER',    variant: 'worker'     },
  QA:       { role: 'CHECKER',   variant: 'checker'    },
  ROUTER:   { role: 'DIRECTOR',  variant: 'director'   },
  MEMORY:   { role: 'STORE',     variant: 'worker'     },
  DISPATCH: { role: 'SHIPPER',   variant: 'worker'     },
  AUDIT:    { role: 'LOGGER',    variant: 'checker'    },
  HITL:     { role: 'HUMAN',     variant: 'supervisor' },
}

const PLUMBOB_COLORS: Record<string, number> = {
  idle:    0x2dd4bf,
  working: 0xf59e0b,
  moving:  0x6366f1,
  error:   0xef4444,
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface PixiAgent {
  id: string
  zone: string
  px: number; py: number
  tx: number; ty: number
  color: number
  state: string
  bobPhase: number
  walkPath: Array<P> | null
  walkStep: number
}

interface PixiTask {
  id: string
  sx: number; sy: number
  ex: number; ey: number
  progress: number
  color: number
  trail: Array<P>
}

interface Particle {
  x: number; y: number
  vx: number; vy: number
  life: number; maxLife: number
  color: number; isSquare: boolean
}

interface HandoffPacket {
  x: number; y: number
  tx: number; ty: number
  color: number
  life: number
  progress: number
}

interface Stats { processed: number; shipped: number; active: number; errors: number; latency: number | null }

type PixiApp       = import('pixi.js').Application
type PixiGraphics  = import('pixi.js').Graphics
type PixiText      = import('pixi.js').Text
type PixiContainer = import('pixi.js').Container

// ── SimEngine ─────────────────────────────────────────────────────────────────
export class SimEngine {
  private canvas: HTMLCanvasElement
  private app: PixiApp | null = null
  private W = 1200
  private H = 600

  private agents:         Map<string, PixiAgent> = new Map()
  private tasks:          Map<string, PixiTask>  = new Map()
  private particles:      Particle[]      = []
  private handoffPackets: HandoffPacket[] = []
  private stats: Stats = { processed: 0, shipped: 0, active: 0, errors: 0, latency: null }
  private taskCounter = 0
  private startTime   = Date.now()
  private tick        = 0

  private isoOriginX = 0
  private isoOriginY = 0

  private roomActivity: Map<string, number> = new Map()

  // PIXI layers
  private bgLayer:    PixiContainer | null = null
  private connLayer:  PixiContainer | null = null
  private roomLayer:  PixiContainer | null = null
  private labelLayer: PixiContainer | null = null
  private taskLayer:  PixiContainer | null = null
  private agentLayer: PixiContainer | null = null
  private fxLayer:    PixiContainer | null = null
  private hudLayer:   PixiContainer | null = null

  // Clearable graphics
  private gRooms:  PixiGraphics | null = null
  private gConn:   PixiGraphics | null = null
  private gAgents: PixiGraphics | null = null
  private gTasks:  PixiGraphics | null = null
  private gFx:     PixiGraphics | null = null

  // Persistent text
  private roomLabels:  Map<string, PixiText> = new Map()
  private agentTexts:  Map<string, { nameTag: PixiText; roleTag: PixiText }> = new Map()
  private statsTexts:  PixiText[] = []
  private clockText:   PixiText | null = null
  private uptimeText:  PixiText | null = null

  private _pixi: typeof import('pixi.js') | null = null
  private rafHandle = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  async init(): Promise<void> {
    const PIXI = await import('pixi.js')
    this._pixi = PIXI

    this.W = this.canvas.getBoundingClientRect().width  || this.canvas.clientWidth  || 1200
    this.H = this.canvas.getBoundingClientRect().height || this.canvas.clientHeight || 600

    this.app = new PIXI.Application()
    await this.app.init({
      canvas:      this.canvas,
      width:       this.W,
      height:      this.H,
      background:  PALETTE.bg,
      antialias:   true,
      resolution:  window.devicePixelRatio || 1,
      autoDensity: true,
    })

    // Grid is 12 cols × 6 rows iso.
    // x: (col-row) ranges [-6..12], center offset = (12-6)/2*40 = 120
    // Shift right 80px to account for agents extending left of origin col
    // Grid: 12 cols × 6 rows, ISO_TILE_W=96, ISO_TILE_H=48
    // x spans [ox-288 .. ox+576], width=864 → center: ox = (W - 864)/2 + 288
    // y spans [oy .. oy+432], height=432 → push down 100px from header for label clearance
    const usableH = this.H - 106   // subtract canvas top offset (~header)
    this.isoOriginX = (this.W - 864) / 2 + 288
    this.isoOriginY = (usableH - 432) / 2 + 100

    // ── Build layers back→front ───────────────────────────────────────────
    this.bgLayer    = new PIXI.Container()
    this.connLayer  = new PIXI.Container()
    this.roomLayer  = new PIXI.Container()
    this.labelLayer = new PIXI.Container()
    this.taskLayer  = new PIXI.Container()
    this.agentLayer = new PIXI.Container()
    this.fxLayer    = new PIXI.Container()
    this.hudLayer   = new PIXI.Container()

    this.app.stage.addChild(this.bgLayer)
    this.app.stage.addChild(this.connLayer)
    this.app.stage.addChild(this.roomLayer)
    this.app.stage.addChild(this.labelLayer)
    this.app.stage.addChild(this.taskLayer)
    this.app.stage.addChild(this.agentLayer)
    this.app.stage.addChild(this.fxLayer)
    this.app.stage.addChild(this.hudLayer)

    // Static background dot grid
    const bgGfx = new PIXI.Graphics()
    bgGfx.rect(0, 0, this.W, this.H).fill({ color: PALETTE.bg })
    for (let gx = 0; gx < this.W; gx += 32) {
      for (let gy = 0; gy < this.H; gy += 32) {
        bgGfx.circle(gx, gy, 0.5).fill({ color: PALETTE.border, alpha: 0.5 })
      }
    }
    this.bgLayer.addChild(bgGfx)

    // Clearable graphics objects
    this.gConn   = new PIXI.Graphics()
    this.gRooms  = new PIXI.Graphics()
    this.gAgents = new PIXI.Graphics()
    this.gTasks  = new PIXI.Graphics()
    this.gFx     = new PIXI.Graphics()

    this.connLayer.addChild(this.gConn)
    this.roomLayer.addChild(this.gRooms)
    this.agentLayer.addChild(this.gAgents)
    this.taskLayer.addChild(this.gTasks)
    this.fxLayer.addChild(this.gFx)

    for (const room of ISO_ROOM_LAYOUT) {
      this.roomActivity.set(room.id, 0)
    }

    this.buildHUD(PIXI)

    // ── Seed regular agents ───────────────────────────────────────────────
    const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot']
    names.forEach((_n, i) => {
      const zone   = ZONES[i % ZONES.length]
      const center = this.getRoomCenter(zone)
      const spread = ISO_TILE_W * 0.3
      this.agents.set(`agent-${i}`, {
        id:       `agent-${i}`,
        zone,
        px: center.x + (Math.random() - 0.5) * spread,
        py: center.y + (Math.random() - 0.5) * spread * 0.3,
        tx: center.x,
        ty: center.y,
        color:    PALETTE.agentColors[i % PALETTE.agentColors.length],
        state:    'idle',
        bobPhase: Math.random() * Math.PI * 2,
        walkPath: null,
        walkStep: 0,
      })
    })

    // ── Seed supervisor/orchestrator agent ────────────────────────────────
    const orchCenter = this.getRoomCenter('INTAKE')
    this.agents.set('orchestrator', {
      id:       'orchestrator',
      zone:     'INTAKE',
      px:       orchCenter.x,
      py:       orchCenter.y,
      tx:       orchCenter.x,
      ty:       orchCenter.y,
      color:    0xfbbf24,
      state:    'idle',
      bobPhase: 0,
      walkPath: null,
      walkStep: 0,
    })

    this.stats.active = this.agents.size

    const loop = () => {
      this.render()
      this.rafHandle = requestAnimationFrame(loop)
    }
    this.rafHandle = requestAnimationFrame(loop)
  }

  // ── ISO helpers ───────────────────────────────────────────────────────────
  private getRoomCenter(zoneId: string): P {
    const room = ISO_ROOM_LAYOUT.find(r => r.id === zoneId)
    if (!room) return { x: this.W / 2, y: this.H / 2 }
    const center = isoToScreen(
      room.gridCol + room.wTiles / 2,
      room.gridRow + room.dTiles / 2,
      this.isoOriginX,
      this.isoOriginY,
    )
    // Agents stand on the tile surface — tile top vertex is center.y - ISO_TILE_H/2
    // The floor is drawn at screen Y; py is the agent's foot base on that surface
    return { x: center.x, y: center.y - ISO_TILE_H / 2 }
  }

  // ── Agent walk system ─────────────────────────────────────────────────────
  private startAgentWalk(agent: PixiAgent, targetRoomId: string): void {
    const from = { x: agent.px, y: agent.py }
    const to   = this.getRoomCenter(targetRoomId)
    const spread = ISO_TILE_W * 0.25
    to.x += (Math.random() - 0.5) * spread
    to.y += (Math.random() - 0.5) * spread * 0.3

    const midX = (from.x + to.x) / 2 + (Math.random() - 0.5) * 50
    const midY = (from.y + to.y) / 2 + (Math.random() - 0.5) * 25

    agent.walkPath = [
      { x: from.x, y: from.y },
      { x: midX,   y: midY   },
      { x: to.x,   y: to.y   },
    ]
    agent.walkStep = 0
    agent.state    = 'moving'
    agent.zone     = targetRoomId
  }

  private updateAgentWalk(agent: PixiAgent): void {
    if (!agent.walkPath || agent.walkPath.length === 0) return

    const stepIdx = Math.min(Math.ceil(agent.walkStep), agent.walkPath.length - 1)
    const target  = agent.walkPath[stepIdx]
    const dx = target.x - agent.px
    const dy = target.y - agent.py
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 2.5) {
      agent.walkStep = stepIdx + 1
      if (agent.walkStep >= agent.walkPath.length) {
        agent.walkPath = null
        agent.walkStep = 0
        agent.state    = 'idle'
      }
    } else {
      const speed = agent.id === 'orchestrator' ? 1.5 : 1.8
      agent.px += (dx / dist) * speed
      agent.py += (dy / dist) * speed
    }
  }

  // ── Agent text labels (persistent PIXI.Text) ──────────────────────────────
  private updateAgentText(
    agentId: string,
    px: number,
    py: number,
    color: number,
    zone: string,
    totalBobY: number,
  ): void {
    const PIXI = this._pixi
    if (!PIXI) return

    let texts = this.agentTexts.get(agentId)

    if (!texts) {
      const shortId = agentId === 'orchestrator' ? 'ORCH' : agentId.replace('agent-', 'AGT-')
      // FIX 7: larger font + drop shadow on name tag
      const nameTag = new PIXI.Text({
        text: shortId,
        style: {
          fontFamily: 'JetBrains Mono, monospace',
          fontSize:   10,
          fill:       color,
          dropShadow: { color: 0x000000, blur: 2, distance: 1, alpha: 0.8 },
        },
      })
      // FIX 7: larger font + drop shadow on role tag
      const roleTag = new PIXI.Text({
        text: ZONE_ROLES[zone]?.role ?? 'AGENT',
        style: {
          fontFamily: 'JetBrains Mono, monospace',
          fontSize:   11,
          fontWeight: 'bold',
          fill:       color,
          dropShadow: { color: 0x000000, blur: 3, distance: 1, alpha: 0.8 },
        },
      })
      this.labelLayer!.addChild(nameTag)
      this.labelLayer!.addChild(roleTag)
      texts = { nameTag, roleTag }
      this.agentTexts.set(agentId, texts)
    }

    // Name tag: below feet
    texts.nameTag.x = px - texts.nameTag.width / 2
    texts.nameTag.y = py + 6

    // Role tag: above plumbob
    const s = AGENT_SCALE
    const headY   = py - 27 * s + totalBobY
    const pbBaseY = headY - 4 * s
    const pbH     = PLUMBOB_H * 1.4
    texts.roleTag.x = px - texts.roleTag.width / 2
    texts.roleTag.y = pbBaseY - pbH - 22

    // Update role if zone changed
    const expectedRole = ZONE_ROLES[zone]?.role ?? 'AGENT'
    if (texts.roleTag.text !== expectedRole) texts.roleTag.text = expectedRole

    // Sync colors
    texts.nameTag.style.fill = color
    texts.roleTag.style.fill = color
  }

  // ── Handoff packets ───────────────────────────────────────────────────────
  private spawnHandoff(fromZone: string, toZone: string, color: number): void {
    const from = this.getRoomCenter(fromZone)
    const to   = this.getRoomCenter(toZone)
    this.handoffPackets.push({
      x: from.x, y: from.y,
      tx: to.x,  ty: to.y,
      color,
      life:     1.0,
      progress: 0,
    })
  }

  private updateHandoffs(): void {
    this.handoffPackets.forEach(p => {
      p.progress = Math.min(1, p.progress + 0.018)
      const ease = p.progress < 0.5
        ? 4 * p.progress * p.progress * p.progress
        : 1 - Math.pow(-2 * p.progress + 2, 3) / 2
      p.x = p.x + (p.tx - p.x) * ease * 0.06
      p.y = p.y + (p.ty - p.y) * ease * 0.06
      if (p.progress >= 1) p.life -= 0.04
    })
    this.handoffPackets = this.handoffPackets.filter(p => p.life > 0)
  }

  private drawHandoffs(g: PixiGraphics): void {
    this.handoffPackets.forEach(p => {
      g.roundRect(p.x - 10, p.y - 7, 20, 14, 4)
       .fill({ color: p.color, alpha: p.life * 0.12 })
       .stroke({ color: p.color, alpha: p.life * 0.75, width: 1.5 })
      g.rect(p.x - 5, p.y - 3, 10, 6)
       .fill({ color: p.color, alpha: p.life * 0.65 })
      g.rect(p.x - 3, p.y - 1, 6, 1)
       .fill({ color: 0xffffff, alpha: p.life * 0.3 })
      const tdx = p.tx - p.x
      const tdy = p.ty - p.y
      g.circle(p.x - tdx * 0.04, p.y - tdy * 0.04, 3.5)
       .fill({ color: p.color, alpha: p.life * 0.28 })
      g.circle(p.x - tdx * 0.09, p.y - tdy * 0.09, 2)
       .fill({ color: p.color, alpha: p.life * 0.14 })
    })
  }

  // ── FIX 3: Dark outline pass (drawn before body) ──────────────────────────
  private drawAgentOutline(
    g: PixiGraphics,
    px: number,
    py: number,
    state: string,
    tick: number,
    agentIdx: number,
  ): void {
    const s     = AGENT_SCALE
    const phase = agentIdx * 1.3
    const breathY   = state === 'idle'    ? Math.sin(tick * 0.04 + phase) * 1.5 : 0
    const workBobY  = state === 'working' ? Math.sin(tick * 0.08 + phase) * 2   : 0
    const totalBobY = breathY + workBobY
    const walkPhase = tick * 0.15 + phase
    const legSwing  = state === 'moving'  ? Math.sin(walkPhase) * 3 : 0
    const baseY     = py
    const OC        = 0x080c14  // near-black outline color
    const OA        = 0.85      // outline alpha
    const E         = 1         // expand by 1px each side

    // Shoes outline
    g.rect(px - 4*s - E, baseY - 1*s - E, 3*s + E*2, s + E*2).fill({ color: OC, alpha: OA })
    g.rect(px + 1*s - E, baseY - 1*s - E, 3*s + E*2, s + E*2).fill({ color: OC, alpha: OA })

    // Legs outline
    g.rect(px - 3*s - E, baseY - 7*s + legSwing  - E, 2*s + E*2, 6*s + E*2).fill({ color: OC, alpha: OA })
    g.rect(px + 1*s - E, baseY - 7*s - legSwing  - E, 2*s + E*2, 6*s + E*2).fill({ color: OC, alpha: OA })

    // Body outline (hips + waist + chest combined)
    g.rect(px - 4*s - E, baseY - 18*s + totalBobY - E, 8*s + E*2, 11*s + E*2).fill({ color: OC, alpha: OA })

    // Arms outline
    const armY = baseY - 16*s + totalBobY
    if (state === 'working') {
      const armBob = Math.sin(tick * 0.14 + phase) * 2.5
      g.rect(px - 7*s - E, armY - 4*s + armBob - E, 2*s + E*2, 6*s + E*2).fill({ color: OC, alpha: OA })
      g.rect(px + 5*s - E, armY - 4*s + armBob - E, 2*s + E*2, 6*s + E*2).fill({ color: OC, alpha: OA })
    } else {
      g.rect(px - 7*s - E, armY - E, 2*s + E*2, 5*s + E*2).fill({ color: OC, alpha: OA })
      g.rect(px + 5*s - E, armY - E, 2*s + E*2, 5*s + E*2).fill({ color: OC, alpha: OA })
    }

    // Head + hair outline
    const headY = baseY - 27*s + totalBobY
    g.rect(px - 3*s - E, headY - 2*s - E, 7*s + E*2, 9*s + E*2).fill({ color: OC, alpha: OA })
  }

  // ── Agent body drawing ────────────────────────────────────────────────────
  private drawAgentBody(
    g: PixiGraphics,
    px: number,
    py: number,
    color: number,
    state: string,
    tick: number,
    agentIdx: number,
    variant: string,
    isOrchestrator: boolean,
  ): void {
    const s     = AGENT_SCALE
    const phase = agentIdx * 1.3

    // FIX 2: compute 3-tone palette
    const tones = getAgentTones(color)

    // Animation offsets
    const breathY  = state === 'idle'    ? Math.sin(tick * 0.04 + phase) * 1.5 : 0
    const workBobY = state === 'working' ? Math.sin(tick * 0.08 + phase) * 2.0 : 0
    const walkPhase = tick * 0.15 + phase
    const legSwing  = state === 'moving' ? Math.sin(walkPhase) * 3 : 0
    const totalBobY = breathY + workBobY
    const baseY     = py

    // FIX 5: working glow ring (drawn first, behind everything)
    if (state === 'working') {
      const glowPulse = Math.sin(tick * 0.08 + phase) * 0.3 + 0.4
      const glowSize  = 28 * s
      g.ellipse(px, py - 12*s + workBobY, glowSize,       glowSize * 0.5)
       .fill({ color, alpha: glowPulse * 0.08 })
      g.ellipse(px, py - 12*s + workBobY, glowSize * 0.6, glowSize * 0.3)
       .fill({ color, alpha: glowPulse * 0.12 })
    }

    // ── 1. FIX 4: Enhanced multi-layer ground shadow ──────────────────
    g.ellipse(px, baseY + 2, 16*s, 5*s).fill({ color: 0x000000, alpha: 0.14 })
    g.ellipse(px, baseY + 1, 11*s, 3*s).fill({ color: 0x000000, alpha: 0.20 })
    g.ellipse(px, baseY,      6*s, 2*s).fill({ color: 0x000000, alpha: 0.30 })

    // ── 2. Feet / shoes ───────────────────────────────────────────────
    g.rect(px - 4*s, baseY - 1*s, 3*s, s).fill({ color: tones.shadow, alpha: 0.95 })
    g.rect(px + 1*s, baseY - 1*s, 3*s, s).fill({ color: tones.shadow, alpha: 0.95 })

    // ── 3. Legs ───────────────────────────────────────────────────────
    const leftLegY  = baseY - 7*s + (state === 'moving' ?  legSwing : 0)
    const rightLegY = baseY - 7*s + (state === 'moving' ? -legSwing : 0)
    g.rect(px - 3*s, leftLegY,  2*s, 6*s).fill({ color: tones.shadow, alpha: 1 })
    g.rect(px + 1*s, rightLegY, 2*s, 6*s).fill({ color: tones.shadow, alpha: 1 })
    // Leg highlight (front face)
    g.rect(px - 3*s + 1, leftLegY  + s,     s, 4*s).fill({ color: tones.highlight, alpha: 0.35 })
    g.rect(px + 1*s + 1, rightLegY + s,     s, 4*s).fill({ color: tones.highlight, alpha: 0.35 })

    // ── 4. Hips + Waist + Chest ───────────────────────────────────────
    g.rect(px - 3*s, baseY - 9*s  + totalBobY, 6*s, 2*s).fill({ color: tones.shadow, alpha: 1 })
    g.rect(px - 2*s, baseY - 11*s + totalBobY, 4*s, 2*s).fill({ color: tones.base,   alpha: 0.9 })
    g.rect(px - 4*s, baseY - 17*s + totalBobY, 8*s, 6*s).fill({ color: tones.base,   alpha: 1 })

    // Chest left highlight (FIX 2: much brighter)
    g.rect(px - 3*s, baseY - 16*s + totalBobY, 2*s, 3*s)
     .fill({ color: tones.highlight, alpha: 0.80 })
    // Chest right shadow side (FIX 2: new)
    g.rect(px + 2*s, baseY - 17*s + totalBobY, 2*s, 6*s)
     .fill({ color: tones.shadow, alpha: 0.55 })

    // Variant badge on chest
    if (isOrchestrator) {
      const bx = px, by2 = baseY - 14*s + totalBobY
      g.poly([bx, by2 - s, bx + s, by2, bx, by2 + s, bx - s, by2])
       .fill({ color: 0xfbbf24, alpha: 1 })
    } else if (variant === 'director') {
      g.rect(px - 4*s, baseY - 14*s + totalBobY, 8*s, s)
       .fill({ color: 0xffffff, alpha: 0.28 })
    } else if (variant === 'checker') {
      g.rect(px - 2*s, baseY - 15*s + totalBobY, s, s).fill({ color: 0xffffff, alpha: 0.35 })
      g.rect(px,        baseY - 13*s + totalBobY, s, s).fill({ color: 0xffffff, alpha: 0.35 })
    }

    // ── 5. Arms ───────────────────────────────────────────────────────
    const armY = baseY - 16*s + totalBobY
    if (state === 'working') {
      const armBob = Math.sin(tick * 0.14 + phase) * 2.5
      // Left arm: lighter (highlight side)
      g.rect(px - 7*s, armY - 4*s + armBob, 2*s, 6*s).fill({ color: tones.highlight, alpha: 0.9 })
      g.rect(px - 8*s, armY - 5*s + armBob, 3*s, 2*s).fill({ color: tones.shadow,    alpha: 1   })
      // Right arm: darker (shadow side)
      g.rect(px + 5*s, armY - 4*s + armBob, 2*s, 6*s).fill({ color: tones.shadow,    alpha: 1.0 })
      g.rect(px + 5*s, armY - 5*s + armBob, 3*s, 2*s).fill({ color: tones.shadow,    alpha: 1   })
    } else if (state === 'moving') {
      const armSwing = -legSwing * 0.65
      g.rect(px - 7*s, armY + armSwing, 2*s, 5*s).fill({ color: tones.highlight, alpha: 0.9 })
      g.rect(px + 5*s, armY - armSwing, 2*s, 5*s).fill({ color: tones.shadow,    alpha: 1.0 })
    } else {
      g.rect(px - 7*s, armY, 2*s, 5*s).fill({ color: tones.highlight, alpha: 0.85 })
      g.rect(px + 5*s, armY, 2*s, 5*s).fill({ color: tones.shadow,    alpha: 0.85 })
    }

    // ── 6. Neck ───────────────────────────────────────────────────────
    g.rect(px - s, baseY - 19*s + totalBobY, 2*s, 2*s)
     .fill({ color: tones.shadow, alpha: 1 })

    // ── 7. Head ───────────────────────────────────────────────────────
    const headY = baseY - 27*s + totalBobY

    // Main head block
    g.rect(px - 3*s, headY, 7*s, 7*s).fill({ color: tones.base, alpha: 1 })
    // Head right-side shadow (FIX 2: new)
    g.rect(px + 2*s, headY + s, 2*s, 5*s).fill({ color: tones.shadow, alpha: 0.65 })
    // Forehead highlight (FIX 2: much brighter)
    g.rect(px - 2*s, headY + s, 2*s, 2*s).fill({ color: tones.highlight, alpha: 0.90 })

    // Hair by variant
    if (isOrchestrator) {
      g.rect(px - 3*s, headY - s,     7*s, 2*s).fill({ color: 0xfbbf24, alpha: 1 })
      g.rect(px - 2*s, headY - 2*s,   s,   s  ).fill({ color: 0xfbbf24, alpha: 1 })
      g.rect(px,        headY - 2*s,   s,   s  ).fill({ color: 0xfbbf24, alpha: 1 })
      g.rect(px + 2*s, headY - 2*s,   s,   s  ).fill({ color: 0xfbbf24, alpha: 1 })
    } else if (variant === 'checker') {
      g.rect(px - 4*s, headY - s,     9*s, s).fill({ color: tones.shadow, alpha: 1 })
      g.rect(px - 2*s, headY - 2*s,   5*s, s).fill({ color: tones.shadow, alpha: 1 })
    } else {
      g.rect(px - 3*s, headY - s, 7*s, 2*s).fill({ color: tones.shadow, alpha: 1 })
    }

    // ── 8. Face ───────────────────────────────────────────────────────
    const eyeY    = headY + 2*s
    const eyeOpen = state !== 'moving' || Math.sin(tick * 0.28 + phase) > -0.92

    if (eyeOpen) {
      g.rect(px - 2*s, eyeY, s, s).fill({ color: 0x080c14, alpha: 1 })
      g.rect(px + s,    eyeY, s, s).fill({ color: 0x080c14, alpha: 1 })
      if (state === 'working') {
        g.rect(px - 2*s, eyeY, s, s).fill({ color, alpha: 0.85 })
        g.rect(px + s,    eyeY, s, s).fill({ color, alpha: 0.85 })
        g.rect(px - 2*s, eyeY, 1, 1).fill({ color: 0xffffff, alpha: 0.5 })
        g.rect(px + s,    eyeY, 1, 1).fill({ color: 0xffffff, alpha: 0.5 })
      }
    } else {
      g.rect(px - 2*s, eyeY, s, 1).fill({ color: 0x080c14, alpha: 0.6 })
      g.rect(px + s,    eyeY, s, 1).fill({ color: 0x080c14, alpha: 0.6 })
    }

    const mouthY = headY + 5*s
    if (state === 'working') {
      g.rect(px - s, mouthY, 3*s, s).fill({ color: 0x080c14, alpha: 0.75 })
    } else {
      g.rect(px - s, mouthY, s, 1).fill({ color: 0x080c14, alpha: 0.45 })
      g.rect(px + s, mouthY, s, 1).fill({ color: 0x080c14, alpha: 0.45 })
    }

    // ── 9. FIX 6: Larger, brighter plumbob ───────────────────────────
    const pbColor  = isOrchestrator ? 0xfbbf24 : (PLUMBOB_COLORS[state] ?? PLUMBOB_COLORS.idle)
    const pbBaseY  = headY - 4*s
    const pbH      = PLUMBOB_H * 1.4  // FIX 6: bigger

    // Stronger glow ring
    const glowAlpha = 0.25 + Math.sin(tick * 0.06 + phase) * 0.15
    g.circle(px, pbBaseY - pbH * 0.4, pbH * 0.9)
     .fill({ color: pbColor, alpha: Math.max(0, glowAlpha) })

    // Plumbob outline for crispness
    g.poly([
      px,              pbBaseY - pbH - 1,
      px + pbH * 0.5 + 1, pbBaseY - pbH * 0.5,
      px,              pbBaseY + 1,
      px - pbH * 0.5 - 1, pbBaseY - pbH * 0.5,
    ]).stroke({ color: darkenColor(pbColor, 0.3), alpha: 0.6, width: 1 })

    // Upper diamond half
    g.poly([
      px,              pbBaseY - pbH,
      px + pbH * 0.5,  pbBaseY - pbH * 0.5,
      px,              pbBaseY,
      px - pbH * 0.5,  pbBaseY - pbH * 0.5,
    ]).fill({ color: pbColor, alpha: 1.0 })

    // Lower diamond half (darker)
    g.poly([
      px,              pbBaseY,
      px + pbH * 0.28, pbBaseY + pbH * 0.38,
      px,              pbBaseY + pbH * 0.55,
      px - pbH * 0.28, pbBaseY + pbH * 0.38,
    ]).fill({ color: darkenColor(pbColor, 0.58), alpha: 0.78 })

    // Shine highlight — brighter
    g.poly([
      px,              pbBaseY - pbH,
      px + pbH * 0.25, pbBaseY - pbH * 0.65,
      px,              pbBaseY - pbH * 0.5,
      px - pbH * 0.15, pbBaseY - pbH * 0.75,
    ]).fill({ color: 0xffffff, alpha: 0.60 })

    // ── 10. Working dots above plumbob ────────────────────────────────
    if (state === 'working') {
      const dotCount = Math.floor((tick * 0.04 + phase) % 4)
      for (let d = 0; d < 3; d++) {
        const da = d < dotCount ? 0.88 : 0.18
        g.circle(px - 5 + d * 5, pbBaseY - pbH - 10, 2.5)
         .fill({ color: pbColor, alpha: da })
      }
    }
  }

  // ── Room drawing ──────────────────────────────────────────────────────────
  private drawIsoRoom(room: IsoRoom, PIXI: typeof import('pixi.js')): void {
    const g  = this.gRooms!
    const ox = this.isoOriginX
    const oy = this.isoOriginY
    const { gridCol, gridRow, wTiles, dTiles, color, label, icon } = room

    // A: Floor tiles (checkerboard)
    for (let c = 0; c < wTiles; c++) {
      for (let d = 0; d < dTiles; d++) {
        const tileCol = gridCol + c
        const tileRow = gridRow + d
        const isAlt   = (c + d) % 2 === 0
        const floorBg = isAlt ? 0x0d1a28 : 0x0a111c
        const v = isoTileVertices(tileCol, tileRow, ox, oy)
        g.poly([v.top.x, v.top.y, v.right.x, v.right.y, v.bottom.x, v.bottom.y, v.left.x, v.left.y])
         .fill({ color: floorBg, alpha: 1 })
         .stroke({ color, alpha: 0.06, width: 0.5 })
        g.poly([v.top.x, v.top.y, v.right.x, v.right.y, v.bottom.x, v.bottom.y, v.left.x, v.left.y])
         .fill({ color, alpha: isAlt ? 0.10 : 0.05 })
      }
    }

    // B: Front-left wall (SW)
    const wallLeft = darkenColor(color, 0.28)
    for (let c = 0; c < wTiles; c++) {
      const v = isoTileVertices(gridCol + c, gridRow + dTiles, ox, oy)
      g.poly([v.left.x, v.left.y, v.bottom.x, v.bottom.y, v.bottom.x, v.bottom.y + ISO_WALL_H, v.left.x, v.left.y + ISO_WALL_H])
       .fill({ color: wallLeft, alpha: 0.92 })
       .stroke({ color, alpha: 0.35, width: 1 })
    }

    // C: Front-right wall (SE)
    const wallRight = darkenColor(color, 0.20)
    for (let d = 0; d < dTiles; d++) {
      const v = isoTileVertices(gridCol + wTiles, gridRow + d, ox, oy)
      g.poly([v.bottom.x, v.bottom.y, v.right.x, v.right.y, v.right.x, v.right.y + ISO_WALL_H, v.bottom.x, v.bottom.y + ISO_WALL_H])
       .fill({ color: wallRight, alpha: 0.92 })
       .stroke({ color, alpha: 0.22, width: 1 })
    }

    // Corner cap
    const vCorner = isoTileVertices(gridCol + wTiles, gridRow + dTiles, ox, oy)
    g.poly([vCorner.left.x, vCorner.left.y, vCorner.bottom.x, vCorner.bottom.y, vCorner.bottom.x, vCorner.bottom.y + ISO_WALL_H, vCorner.left.x, vCorner.left.y + ISO_WALL_H])
     .fill({ color: darkenColor(color, 0.15), alpha: 0.92 })

    // D: Glowing accent edges
    const tlStart = isoToScreen(gridCol,          gridRow,          ox, oy)
    const tlEnd   = isoToScreen(gridCol,          gridRow + dTiles, ox, oy)
    g.moveTo(tlStart.x - ISO_TILE_W / 2, tlStart.y).lineTo(tlEnd.x - ISO_TILE_W / 2, tlEnd.y)
     .stroke({ color, alpha: 0.65, width: 2 })
    const trStart = isoToScreen(gridCol,          gridRow, ox, oy)
    const trEnd   = isoToScreen(gridCol + wTiles, gridRow, ox, oy)
    g.moveTo(trStart.x - ISO_TILE_W / 2, trStart.y).lineTo(trEnd.x - ISO_TILE_W / 2, trEnd.y)
     .stroke({ color, alpha: 0.45, width: 1.5 })

    // E: Corner brackets
    const bLen = 10
    const corners: P[] = [
      isoToScreen(gridCol,          gridRow,          ox, oy),
      isoToScreen(gridCol + wTiles, gridRow,          ox, oy),
      isoToScreen(gridCol,          gridRow + dTiles, ox, oy),
    ]
    corners.forEach(corner => {
      const cx = corner.x - ISO_TILE_W / 2
      const cy = corner.y
      g.moveTo(cx - bLen, cy).lineTo(cx, cy).lineTo(cx, cy + bLen * 0.5)
       .stroke({ color, alpha: 0.85, width: 2 })
    })

    // F: Desk objects
    const deskSlots = [
      { c: gridCol + 0.5, r: gridRow + 0.5 },
      { c: gridCol + 1.8, r: gridRow + 1.8 },
    ]
    const deskH = 10
    deskSlots.forEach(dp => {
      const dv = isoTileVertices(dp.c, dp.r, ox, oy)
      g.poly([dv.left.x, dv.left.y, dv.bottom.x, dv.bottom.y, dv.bottom.x, dv.bottom.y + deskH, dv.left.x, dv.left.y + deskH])
       .fill({ color: darkenColor(color, 0.30), alpha: 0.9 })
      g.poly([dv.bottom.x, dv.bottom.y, dv.right.x, dv.right.y, dv.right.x, dv.right.y + deskH, dv.bottom.x, dv.bottom.y + deskH])
       .fill({ color: darkenColor(color, 0.22), alpha: 0.9 })
      g.poly([dv.top.x, dv.top.y, dv.right.x, dv.right.y, dv.bottom.x, dv.bottom.y, dv.left.x, dv.left.y])
       .fill({ color: darkenColor(color, 0.50), alpha: 0.95 })
       .stroke({ color, alpha: 0.25, width: 0.5 })
      const monX = dv.top.x - 5
      const monY = dv.top.y - deskH - 8
      g.roundRect(monX, monY, 10, 7, 1).fill({ color, alpha: 0.55 }).stroke({ color: 0xffffff, alpha: 0.12, width: 0.5 })
      g.circle(monX + 2, monY + 2, 1).fill({ color: 0xffffff, alpha: 0.25 })
    })

    // G: Activity pulse
    const activity = this.roomActivity.get(room.id) ?? 0
    if (activity > 0.05) {
      const pulseAlpha = activity * (0.35 + 0.25 * Math.sin(this.tick * 0.12))
      const centerPos  = isoToScreen(gridCol + wTiles / 2, gridRow + dTiles / 2, ox, oy)
      g.circle(centerPos.x, centerPos.y, ISO_TILE_W * 0.4).fill({ color, alpha: pulseAlpha })
    }

    // H: Room label sign
    let lbl = this.roomLabels.get(room.id)
    if (!lbl) {
      lbl = new PIXI.Text({
        text: `${icon}  ${label}`,
        style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 'bold', fill: color, letterSpacing: 1.5 },
      })
      this.labelLayer!.addChild(lbl)
      this.roomLabels.set(room.id, lbl)
    }
    const signAnchor = isoToScreen(gridCol + wTiles / 2, gridRow, ox, oy)
    const signX = signAnchor.x - lbl.width / 2
    const signY = signAnchor.y - ISO_TILE_H * 0.5 - 22
    g.roundRect(signX - 6, signY - 3, lbl.width + 12, 16, 3)
     .fill({ color: 0x060a10, alpha: 0.88 })
     .stroke({ color, alpha: 0.50, width: 1 })
    lbl.x = signX
    lbl.y = signY
  }

  // ── Pipeline drawing ──────────────────────────────────────────────────────
  private drawIsoPipeline(from: IsoRoom, to: IsoRoom): void {
    const g  = this.gConn!
    const ox = this.isoOriginX
    const oy = this.isoOriginY

    const fromExit = isoToScreen(from.gridCol + from.wTiles, from.gridRow + from.dTiles / 2, ox, oy)
    const toEntry  = isoToScreen(to.gridCol,                 to.gridRow   + to.dTiles   / 2, ox, oy)

    const fx = fromExit.x, fy = fromExit.y
    const tx = toEntry.x,  ty = toEntry.y

    g.moveTo(fx, fy).lineTo(tx, ty).stroke({ color: from.color, alpha: 0.18, width: 1.5 })

    const t = (this.tick * 0.006) % 1
    for (let i = 0; i < 3; i++) {
      const ft = (t + i / 3) % 1
      const dotX = fx + (tx - fx) * ft
      const dotY = fy + (ty - fy) * ft
      const alpha = ft < 0.15 ? ft / 0.15 : ft > 0.85 ? (1 - ft) / 0.15 : 1
      g.circle(dotX, dotY, 3).fill({ color: from.color, alpha: alpha * 0.85 })
    }

    const angle = Math.atan2(ty - fy, tx - fx)
    const aSize = 7
    g.poly([
      tx, ty,
      tx - Math.cos(angle - 0.4) * aSize, ty - Math.sin(angle - 0.4) * aSize,
      tx - Math.cos(angle + 0.4) * aSize, ty - Math.sin(angle + 0.4) * aSize,
    ]).fill({ color: from.color, alpha: 0.60 })
  }

  // ── Main render loop ──────────────────────────────────────────────────────
  private render(): void {
    if (!this.gRooms || !this.gConn || !this.gAgents || !this.gTasks || !this.gFx) return

    this.tick++
    const now = Date.now()

    this.gConn.clear()
    this.gRooms.clear()
    this.gAgents.clear()
    this.gTasks.clear()
    this.gFx.clear()

    // Room activity decay
    this.roomActivity.forEach((val, key) => {
      this.roomActivity.set(key, val * 0.992)
    })

    // ── 1. Supervisor patrol timer ────────────────────────────────────
    if (this.tick % 300 === 0) {
      const orch = this.agents.get('orchestrator')
      if (orch && !orch.walkPath) {
        const rooms    = ISO_ROOM_LAYOUT.map(r => r.id)
        const nextRoom = rooms[Math.floor(this.tick / 300) % rooms.length]
        this.startAgentWalk(orch, nextRoom)
      }
    }

    // ── 2. Pipelines ─────────────────────────────────────────────────
    ISO_PIPELINES.forEach(pipe => {
      const from = ISO_ROOM_LAYOUT.find(r => r.id === pipe.from)
      const to   = ISO_ROOM_LAYOUT.find(r => r.id === pipe.to)
      if (from && to) this.drawIsoPipeline(from, to)
    })

    // ── 3. Rooms (back→front painter's order) ─────────────────────────
    const pixi = this._pixi
    if (pixi) {
      const sorted = [...ISO_ROOM_LAYOUT].sort((a, b) => (a.gridCol + a.gridRow) - (b.gridCol + b.gridRow))
      sorted.forEach(room => this.drawIsoRoom(room, pixi))
    }

    // ── 4. Tasks + handoffs ───────────────────────────────────────────
    this.tasks.forEach((task, tid) => {
      task.progress = Math.min(1, task.progress + 0.006)
      const tp = task.progress
      const et = tp < 0.5 ? 4 * tp * tp * tp : 1 - Math.pow(-2 * tp + 2, 3) / 2
      const tx2 = task.sx + (task.ex - task.sx) * et
      const ty2 = task.sy + (task.ey - task.sy) * et

      task.trail.push({ x: tx2, y: ty2 })
      if (task.trail.length > 20) task.trail.shift()
      task.trail.forEach((pt, i) => {
        const ratio = i / task.trail.length
        const ta = ratio * ratio * 0.3
        if (i % 2 === 0) {
          this.gTasks!.rect(pt.x - 2, pt.y - 2, 4, 4).fill({ color: task.color, alpha: ta })
        } else {
          this.gTasks!.circle(pt.x, pt.y, 1.5).fill({ color: task.color, alpha: ta })
        }
      })

      this.gTasks!.roundRect(tx2 - 5, ty2 - 5, 10, 10, 2).fill({ color: task.color, alpha: 0.15 })
      this.gTasks!.roundRect(tx2 - 5, ty2 - 5, 10, 10, 2).stroke({ color: task.color, width: 1, alpha: 0.9 })
      this.gTasks!.rect(tx2 - 1.5, ty2 - 1.5, 3, 3).fill({ color: task.color, alpha: 0.8 })

      if (task.progress >= 1) {
        for (let i = 0; i < 12; i++) {
          const a2 = (Math.PI * 2 * i) / 12
          this.particles.push({
            x: task.ex, y: task.ey,
            vx: Math.cos(a2) * (1.5 + Math.random() * 3),
            vy: Math.sin(a2) * (1.5 + Math.random() * 3),
            life: 1, maxLife: 1,
            color: task.color, isSquare: i % 2 === 0,
          })
        }
        this.stats.processed++
        this.stats.shipped++
        const destRoom = ISO_ROOM_LAYOUT.find(r => {
          const c = this.getRoomCenter(r.id)
          return Math.abs(c.x - task.ex) < 60 && Math.abs(c.y - task.ey) < 60
        })
        if (destRoom) {
          this.roomActivity.set(destRoom.id, Math.min(1, (this.roomActivity.get(destRoom.id) ?? 0) + 0.5))
        }
        this.tasks.delete(tid)
      }
    })

    this.updateHandoffs()
    this.drawHandoffs(this.gTasks!)

    // ── 5. Agents: outline first, body on top ─────────────────────────
    let agentIdx = 0
    this.agents.forEach(agent => {
      if (agent.walkPath) {
        this.updateAgentWalk(agent)
      } else {
        agent.px += (agent.tx - agent.px) * 0.07
        agent.py += (agent.ty - agent.py) * 0.07
      }

      const isOrch   = agent.id === 'orchestrator'
      const zoneInfo = ZONE_ROLES[agent.zone] ?? { role: 'AGENT', variant: 'worker' as const }

      const breathY   = agent.state === 'idle'    ? Math.sin(this.tick * 0.04 + agentIdx * 1.3) * 1.5 : 0
      const workBobY  = agent.state === 'working' ? Math.sin(this.tick * 0.08 + agentIdx * 1.3) * 2.0 : 0
      const totalBobY = breathY + workBobY

      // FIX 3: outline pass drawn first (behind body)
      this.drawAgentOutline(this.gAgents!, agent.px, agent.py, agent.state, this.tick, agentIdx)

      this.drawAgentBody(
        this.gAgents!,
        agent.px,
        agent.py,
        agent.color,
        agent.state,
        this.tick,
        agentIdx,
        zoneInfo.variant,
        isOrch,
      )

      this.updateAgentText(agent.id, agent.px, agent.py, agent.color, agent.zone, totalBobY)

      agentIdx++
    })

    // ── 6. Particles ──────────────────────────────────────────────────
    this.particles = this.particles.filter(p => p.life > 0)
    this.particles.forEach(p => {
      p.x  += p.vx; p.y  += p.vy
      p.vx *= 0.92; p.vy *= 0.92
      p.life -= 0.017
      const a2 = p.life * p.life * 0.85
      if (p.isSquare) {
        const sz = p.life * 3
        this.gFx!.rect(p.x - sz / 2, p.y - sz / 2, sz, sz).fill({ color: p.color, alpha: a2 })
      } else {
        this.gFx!.circle(p.x, p.y, p.life * 2).fill({ color: p.color, alpha: a2 })
      }
    })

    // ── 7. HUD updates ────────────────────────────────────────────────
    const vals = [
      String(this.stats.processed),
      String(this.stats.shipped),
      String(this.stats.active),
      String(this.stats.errors),
      this.stats.latency != null ? `${this.stats.latency.toFixed(0)}ms` : '—',
    ]
    this.statsTexts.forEach((txt, i) => { if (txt.text !== vals[i]) txt.text = vals[i] })

    const d2 = new Date()
    const clock = [d2.getHours(), d2.getMinutes(), d2.getSeconds()].map(v => String(v).padStart(2, '0')).join(':')
    if (this.clockText && this.clockText.text !== clock) this.clockText.text = clock

    const elapsed = Math.floor((now - this.startTime) / 1000)
    const upStr = `UP ${String(Math.floor(elapsed / 3600)).padStart(2,'0')}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2,'0')}:${String(elapsed % 60).padStart(2,'0')}`
    if (this.uptimeText && this.uptimeText.text !== upStr) this.uptimeText.text = upStr
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  private buildHUD(PIXI: typeof import('pixi.js')): void {
    const W = this.W, H = this.H

    const topBar = new PIXI.Graphics()
    topBar.rect(0, 0, W, 36).fill({ color: PALETTE.bg, alpha: 0.98 })
    topBar.moveTo(0, 36).lineTo(W, 36).stroke({ color: PALETTE.border, width: 1 })
    this.hudLayer!.addChild(topBar)

    const titleLeft = new PIXI.Text({
      text: '⬡ SWARMVISION',
      style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: PALETTE.textAccent, fontWeight: '700', letterSpacing: 2 },
    })
    titleLeft.x = 14; titleLeft.y = 12
    this.hudLayer!.addChild(titleLeft)

    const titleRight = new PIXI.Text({
      text: ' — LIVE ORCHESTRATION',
      style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: PALETTE.textSecondary, letterSpacing: 1 },
    })
    titleRight.x = 14 + titleLeft.width; titleRight.y = 12
    this.hudLayer!.addChild(titleRight)

    this.clockText = new PIXI.Text({
      text: '00:00:00',
      style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fill: PALETTE.textPrimary, fontWeight: '700', letterSpacing: 2 },
    })
    this.clockText.x = W / 2 - 36; this.clockText.y = 12
    this.hudLayer!.addChild(this.clockText)

    this.uptimeText = new PIXI.Text({
      text: 'UP 00:00:00',
      style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fill: PALETTE.FORGE, letterSpacing: 1 },
    })
    this.uptimeText.x = W - 110; this.uptimeText.y = 13
    this.hudLayer!.addChild(this.uptimeText)

    const botBar = new PIXI.Graphics()
    botBar.rect(0, H - 40, W, 40).fill({ color: PALETTE.bg, alpha: 0.98 })
    botBar.moveTo(0, H - 40).lineTo(W, H - 40).stroke({ color: PALETTE.border, width: 1 })
    this.hudLayer!.addChild(botBar)

    const statDefs = [
      { label: 'PROCESSED', color: PALETTE.textAccent },
      { label: 'SHIPPED',   color: PALETTE.QA         },
      { label: 'ACTIVE',    color: PALETTE.FORGE       },
      { label: 'ERRORS',    color: PALETTE.AUDIT       },
      { label: 'LATENCY',   color: PALETTE.ROUTER      },
    ]
    const colW = W / statDefs.length
    this.statsTexts = []

    statDefs.forEach((def, i) => {
      if (i > 0) {
        const sep = new PIXI.Graphics()
        sep.moveTo(i * colW, H - 36).lineTo(i * colW, H - 4).stroke({ color: PALETTE.border, width: 1 })
        this.hudLayer!.addChild(sep)
      }
      const lbl = new PIXI.Text({
        text: def.label,
        style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 6, fill: PALETTE.textSecondary, letterSpacing: 1.5 },
      })
      lbl.x = i * colW + colW / 2 - lbl.width / 2
      lbl.y = H - 37
      const val = new PIXI.Text({
        text: def.label === 'LATENCY' ? '—' : '0',
        style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fill: def.color, fontWeight: '700' },
      })
      val.x = i * colW + colW / 2 - 10
      val.y = H - 26
      this.hudLayer!.addChild(lbl)
      this.hudLayer!.addChild(val)
      this.statsTexts.push(val)
    })

    const scanlines = new PIXI.Graphics()
    for (let sy = 0; sy < H; sy += 3) {
      scanlines.moveTo(0, sy).lineTo(W, sy).stroke({ color: 0x000000, width: 1, alpha: 0.04 })
    }
    this.hudLayer!.addChild(scanlines)
  }

  // ── Event handling ────────────────────────────────────────────────────────
  applyEvent(event: VizEvent): void {
    const p = event.payload

    if (event.type === 'agent_move') {
      const id     = String(p['agentId'] ?? '')
      const toZone = String(p['toZone']  ?? '')
      const agent  = this.agents.get(id)
      if (agent) {
        this.startAgentWalk(agent, toZone)
        setTimeout(() => {
          if (agent.state !== 'moving') agent.state = 'working'
        }, 900)
        setTimeout(() => {
          if (agent.state === 'working') agent.state = 'idle'
        }, 2200)
        this.roomActivity.set(toZone, Math.min(1, (this.roomActivity.get(toZone) ?? 0) + 0.3))
      }
    }

    if (event.type === 'task_spawn') {
      const fromZone = String(p['zone'] ?? 'INTAKE')
      const from     = this.getRoomCenter(fromZone)
      const to       = this.getRoomCenter('FORGE')
      const tid      = String(p['taskId'] ?? `t-${++this.taskCounter}`)
      const colorHex = String(p['color'] ?? '#2dd4bf').replace('#', '')
      const color    = parseInt(colorHex, 16) || PALETTE.textAccent
      this.tasks.set(tid, { id: tid, sx: from.x, sy: from.y, ex: to.x, ey: to.y, progress: 0, color, trail: [] })
      this.roomActivity.set(fromZone, Math.min(1, (this.roomActivity.get(fromZone) ?? 0) + 0.25))
    }

    if (event.type === 'task_complete') {
      const fromZone = String(p['fromZone'] ?? p['zone'] ?? 'DISPATCH')
      const from     = this.getRoomCenter(fromZone)
      const to       = this.getRoomCenter('AUDIT')
      const tid      = String(p['taskId'] ?? `tc-${++this.taskCounter}`)
      this.tasks.set(tid, { id: tid, sx: from.x, sy: from.y, ex: to.x, ey: to.y, progress: 0, color: PALETTE.QA, trail: [] })
      const roomColor = ISO_ROOM_LAYOUT.find(r => r.id === fromZone)?.color ?? PALETTE.QA
      this.spawnHandoff(fromZone, 'AUDIT', roomColor)
    }

    if (event.type === 'hitl_trigger') {
      this.stats.errors++
      const center = this.getRoomCenter('HITL')
      this.roomActivity.set('HITL', 1.0)
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8
        this.particles.push({
          x: center.x, y: center.y,
          vx: Math.cos(angle) * 2.5, vy: Math.sin(angle) * 2.5,
          life: 1, maxLife: 1, color: PALETTE.AUDIT, isSquare: i % 2 === 0,
        })
      }
      this.spawnHandoff('DISPATCH', 'HITL', PALETTE.AUDIT)
    }

    if (event.type === 'metrics_update') {
      const m = p as Record<string, unknown>
      if (typeof m['processed']  === 'number') this.stats.processed = Math.max(this.stats.processed, m['processed']  as number)
      if (typeof m['shipped']    === 'number') this.stats.shipped   = Math.max(this.stats.shipped,   m['shipped']    as number)
      if (typeof m['active']     === 'number') this.stats.active    = m['active'] as number
      if (typeof m['errors']     === 'number') this.stats.errors    = Math.max(this.stats.errors,    m['errors']     as number)
      if (typeof m['latency_ms'] === 'number') this.stats.latency   = m['latency_ms'] as number
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.rafHandle)
    this.app?.destroy(false)
    this.app = null
  }
}
