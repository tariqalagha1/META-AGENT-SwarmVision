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

const ZONE_ICONS: Record<string, string> = {
  INTAKE:'⬇', FORGE:'⚙', QA:'✓', ROUTER:'⟁',
  MEMORY:'◈', DISPATCH:'▶', AUDIT:'≡', HITL:'⚑',
}

// Zone layout — fractional positions
const ZONE_LAYOUT: Record<string, { fx: number; fy: number }> = {
  INTAKE:   { fx: 0.03, fy: 0.10 },
  FORGE:    { fx: 0.28, fy: 0.10 },
  QA:       { fx: 0.53, fy: 0.10 },
  ROUTER:   { fx: 0.78, fy: 0.10 },
  MEMORY:   { fx: 0.03, fy: 0.52 },
  DISPATCH: { fx: 0.28, fy: 0.52 },
  AUDIT:    { fx: 0.53, fy: 0.52 },
  HITL:     { fx: 0.78, fy: 0.52 },
}

// Pipeline connections for flow dots
const CONNECTIONS: Array<[string, string]> = [
  ['INTAKE','FORGE'], ['FORGE','QA'], ['QA','ROUTER'],
  ['ROUTER','MEMORY'], ['MEMORY','DISPATCH'], ['DISPATCH','AUDIT'], ['AUDIT','HITL'],
]

interface RoomRect { x: number; y: number; w: number; h: number; label: string; color: number; activity: number; activityTarget: number }
interface PixiAgent { id: string; zone: string; px: number; py: number; tx: number; ty: number; color: number; state: string; bobPhase: number }
interface PixiTask  { id: string; sx: number; sy: number; ex: number; ey: number; progress: number; color: number; trail: Array<{x:number;y:number}> }
interface Particle  { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: number; isSquare: boolean }
interface FlowDot   { conn: number; t: number; speed: number }

interface Stats { processed: number; shipped: number; active: number; errors: number; latency: number | null }

type PixiApp       = import('pixi.js').Application
type PixiGraphics  = import('pixi.js').Graphics
type PixiText      = import('pixi.js').Text
type PixiContainer = import('pixi.js').Container

export class SimEngine {
  private canvas: HTMLCanvasElement
  private app: PixiApp | null = null
  private rooms: RoomRect[] = []
  private agents: Map<string, PixiAgent> = new Map()
  private tasks: Map<string, PixiTask> = new Map()
  private particles: Particle[] = []
  private flowDots: FlowDot[] = []
  private stats: Stats = { processed: 0, shipped: 0, active: 0, errors: 0, latency: null }
  private taskCounter = 0
  private startTime = Date.now()

  private bgLayer:    PixiContainer | null = null
  private roomLayer:  PixiContainer | null = null
  private agentLayer: PixiContainer | null = null
  private taskLayer:  PixiContainer | null = null
  private fxLayer:    PixiContainer | null = null
  private hudLayer:   PixiContainer | null = null

  private roomGraphics:  PixiGraphics | null = null
  private agentGraphics: PixiGraphics | null = null
  private taskGraphics:  PixiGraphics | null = null
  private fxGraphics:    PixiGraphics | null = null
  private connGraphics:  PixiGraphics | null = null

  private statsTexts: PixiText[] = []
  private clockText:  PixiText | null = null
  private uptimeText: PixiText | null = null
  private rafHandle:  number = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  async init(): Promise<void> {
    const PIXI = await import('pixi.js')

    this.app = new PIXI.Application()
    await this.app.init({
      canvas:     this.canvas,
      width:      this.canvas.getBoundingClientRect().width  || this.canvas.clientWidth  || 1200,
      height:     this.canvas.getBoundingClientRect().height || this.canvas.clientHeight || 600,
      background: PALETTE.bg,
      antialias:  true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })

    const W = this.app.renderer.width
    const H = this.app.renderer.height

    this.bgLayer    = new PIXI.Container()
    this.roomLayer  = new PIXI.Container()
    this.agentLayer = new PIXI.Container()
    this.taskLayer  = new PIXI.Container()
    this.fxLayer    = new PIXI.Container()
    this.hudLayer   = new PIXI.Container()

    this.app.stage.addChild(this.bgLayer)
    this.app.stage.addChild(this.roomLayer)
    this.app.stage.addChild(this.taskLayer)
    this.app.stage.addChild(this.agentLayer)
    this.app.stage.addChild(this.fxLayer)
    this.app.stage.addChild(this.hudLayer)

    // ── Static background ─────────────────────────────────────────────────
    const bgGfx = new PIXI.Graphics()
    bgGfx.rect(0, 0, W, H).fill({ color: PALETTE.bg })

    // Dot grid
    for (let gx = 0; gx < W; gx += 24) {
      for (let gy = 0; gy < H; gy += 24) {
        bgGfx.circle(gx, gy, 0.5).fill({ color: PALETTE.border, alpha: 0.6 })
      }
    }
    this.bgLayer.addChild(bgGfx)

    // ── Build rooms ───────────────────────────────────────────────────────
    const RW = W * 0.18
    const RH = H * 0.34
    ZONES.forEach((zone) => {
      const pos = ZONE_LAYOUT[zone]
      const rx = pos.fx * W
      const ry = pos.fy * H + 36
      const zoneColors: Record<string, number> = {
        INTAKE: PALETTE.INTAKE, FORGE: PALETTE.FORGE, QA: PALETTE.QA, ROUTER: PALETTE.ROUTER,
        MEMORY: PALETTE.MEMORY, DISPATCH: PALETTE.DISPATCH, AUDIT: PALETTE.AUDIT, HITL: PALETTE.HITL,
      }
      const color = zoneColors[zone] ?? PALETTE.textAccent
      this.rooms.push({ x: rx, y: ry, w: RW, h: RH, label: zone, color, activity: 0, activityTarget: 0 })
    })

    // Persistent graphics layers
    this.connGraphics  = new PIXI.Graphics()
    this.roomGraphics  = new PIXI.Graphics()
    this.agentGraphics = new PIXI.Graphics()
    this.taskGraphics  = new PIXI.Graphics()
    this.fxGraphics    = new PIXI.Graphics()

    this.bgLayer.addChild(this.connGraphics)
    this.roomLayer.addChild(this.roomGraphics)
    this.agentLayer.addChild(this.agentGraphics)
    this.taskLayer.addChild(this.taskGraphics)
    this.fxLayer.addChild(this.fxGraphics)

    // Static room labels (zone name watermark + header labels)
    ZONES.forEach((zone, i) => {
      const r = this.rooms[i]
      // Watermark
      const wm = new PIXI.Text({
        text: zone,
        style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fill: r.color, fontWeight: 'bold', letterSpacing: 2 },
      })
      wm.alpha = 0.05
      wm.x = r.x + r.w / 2 - wm.width / 2
      wm.y = r.y + r.h / 2 - 8
      this.roomLayer!.addChild(wm)

      // Header label
      const hdr = new PIXI.Text({
        text: `${ZONE_ICONS[zone] ?? ''} ${zone}`,
        style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 8, fill: r.color, fontWeight: '700', letterSpacing: 1 },
      })
      hdr.x = r.x + 6
      hdr.y = r.y + 5
      this.roomLayer!.addChild(hdr)
    })

    // Seed flow dots — 3 per connection, staggered
    CONNECTIONS.forEach((_, ci) => {
      for (let d = 0; d < 3; d++) {
        this.flowDots.push({ conn: ci, t: d / 3, speed: 0.003 + Math.random() * 0.001 })
      }
    })

    // ── HUD ───────────────────────────────────────────────────────────────
    this.buildHUD(PIXI, W, H)

    // ── Seed agents ───────────────────────────────────────────────────────
    const agentColors = PALETTE.agentColors
    const names = ['alpha','bravo','charlie','delta','echo','foxtrot']
    names.forEach((_n, i) => {
      const zone = ZONES[i % ZONES.length]
      const center = this.roomCenter(zone)
      this.agents.set(`agent-${i}`, {
        id: `agent-${i}`,
        zone,
        px: center.x + (Math.random() - 0.5) * 24,
        py: center.y + (Math.random() - 0.5) * 16,
        tx: center.x,
        ty: center.y,
        color: agentColors[i % agentColors.length],
        state: 'idle',
        bobPhase: Math.random() * Math.PI * 2,
      })
    })
    this.stats.active = this.agents.size

    // Start render loop
    const loop = () => {
      this.render()
      this.rafHandle = requestAnimationFrame(loop)
    }
    this.rafHandle = requestAnimationFrame(loop)
  }

  private buildHUD(PIXI: typeof import('pixi.js'), W: number, H: number) {
    // Top bar
    const topBar = new PIXI.Graphics()
    topBar.rect(0, 0, W, 36).fill({ color: PALETTE.bg, alpha: 0.98 })
    topBar.moveTo(0, 36).lineTo(W, 36).stroke({ color: PALETTE.border, width: 1 })
    this.hudLayer!.addChild(topBar)

    // Title
    const titleLeft = new PIXI.Text({
      text: '⬡ SWARMVISION',
      style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: PALETTE.textAccent, fontWeight: '700', letterSpacing: 2 },
    })
    titleLeft.x = 14
    titleLeft.y = 12
    this.hudLayer!.addChild(titleLeft)

    const titleRight = new PIXI.Text({
      text: ' — LIVE ORCHESTRATION',
      style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: PALETTE.textSecondary, letterSpacing: 1 },
    })
    titleRight.x = 14 + titleLeft.width
    titleRight.y = 12
    this.hudLayer!.addChild(titleRight)

    // Clock (center)
    this.clockText = new PIXI.Text({
      text: '00:00:00',
      style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fill: PALETTE.textPrimary, fontWeight: '700', letterSpacing: 2 },
    })
    this.clockText.x = W / 2 - 36
    this.clockText.y = 12
    this.hudLayer!.addChild(this.clockText)

    // Uptime (right)
    this.uptimeText = new PIXI.Text({
      text: 'UP 00:00:00',
      style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fill: PALETTE.FORGE, letterSpacing: 1 },
    })
    this.uptimeText.x = W - 110
    this.uptimeText.y = 13
    this.hudLayer!.addChild(this.uptimeText)

    // Bottom stats bar
    const botBar = new PIXI.Graphics()
    botBar.rect(0, H - 40, W, 40).fill({ color: PALETTE.bg, alpha: 0.98 })
    botBar.moveTo(0, H - 40).lineTo(W, H - 40).stroke({ color: PALETTE.border, width: 1 })
    this.hudLayer!.addChild(botBar)

    const statDefs = [
      { label: 'PROCESSED', color: PALETTE.textAccent },
      { label: 'SHIPPED',   color: PALETTE.QA },
      { label: 'ACTIVE',    color: PALETTE.FORGE },
      { label: 'ERRORS',    color: PALETTE.AUDIT },
      { label: 'LATENCY',   color: PALETTE.ROUTER },
    ]
    const colW = W / statDefs.length
    this.statsTexts = []

    statDefs.forEach((def, i) => {
      // Separator line
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

    // Scanline overlay (drawn once — very subtle horizontal lines)
    const scanlines = new PIXI.Graphics()
    for (let sy = 0; sy < H; sy += 3) {
      scanlines.moveTo(0, sy).lineTo(W, sy).stroke({ color: 0x000000, width: 1, alpha: 0.04 })
    }
    this.hudLayer!.addChild(scanlines)
  }

  private roomCenter(zone: string): { x: number; y: number } {
    const idx = ZONES.indexOf(zone as typeof ZONES[number])
    const r = this.rooms[idx >= 0 ? idx : 0]
    if (!r) return { x: 100, y: 100 }
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
  }

  private drawAgent(g: PixiGraphics, agent: PixiAgent, t: number) {
    const c = agent.color
    const lighter = Math.min(0xffffff, c + 0x303030)
    let { px, py } = agent

    // Working: vertical bob
    if (agent.state === 'working') {
      py += Math.sin(t * 4.2 + agent.bobPhase) * 1.2
    }

    // Moving: trail of fading copies (lean forward effect)
    if (agent.state === 'moving') {
      for (let trail = 1; trail <= 3; trail++) {
        const ta = 0.07 * (4 - trail)
        const ox = -trail * 2
        this.drawAgentBody(g, px + ox, py, c, ta)
      }
    }

    this.drawAgentBody(g, px, py, c, 1.0)

    // Glow when working
    if (agent.state === 'working') {
      g.circle(px, py - 2, 14).fill({ color: c, alpha: 0.05 })
    }

    // Highlight pixel on head
    g.rect(px - 2, py - 13, 2, 2).fill({ color: lighter, alpha: 0.6 })

    // Name tag
    // (handled via separate text objects — skip in graphics path)
  }

  private drawAgentBody(g: PixiGraphics, px: number, py: number, c: number, alpha: number) {
    const bg = PALETTE.bg

    // HEAD rows (5×5 centered at px, py-10)
    const hx = px - 2  // left edge of 5-wide head
    const hy = py - 14
    // Row 0: .XXX.
    g.rect(hx + 1, hy,     3, 1).fill({ color: c, alpha })
    // Row 1-3: XXXXX
    for (let row = 1; row <= 3; row++) {
      g.rect(hx, hy + row, 5, 1).fill({ color: c, alpha })
    }
    // Row 4: .XXX.
    g.rect(hx + 1, hy + 4, 3, 1).fill({ color: c, alpha })
    // Eyes row 2 col 1 and col 3
    g.rect(hx + 1, hy + 2, 1, 1).fill({ color: bg, alpha: alpha * 0.9 })
    g.rect(hx + 3, hy + 2, 1, 1).fill({ color: bg, alpha: alpha * 0.9 })

    // NECK
    const nx = px - 1
    const ny = hy + 5
    g.rect(nx, ny, 2, 1).fill({ color: c, alpha: alpha * 0.8 })

    // BODY (7-wide centered at px)
    const bx = px - 3
    const by = ny + 1
    // Shoulders
    g.rect(bx + 1, by,     5, 1).fill({ color: c, alpha })
    // Rows +1,+2: full 7
    g.rect(bx,     by + 1, 7, 1).fill({ color: c, alpha })
    g.rect(bx,     by + 2, 7, 1).fill({ color: c, alpha })
    // Row +3: 5
    g.rect(bx + 1, by + 3, 5, 1).fill({ color: c, alpha })
    // Waist
    g.rect(bx + 2, by + 4, 3, 1).fill({ color: c, alpha: alpha * 0.9 })

    // LEGS (split at px)
    const ly = by + 5
    // Left leg
    g.rect(px - 3, ly,     2, 1).fill({ color: c, alpha })
    g.rect(px - 3, ly + 1, 2, 1).fill({ color: c, alpha })
    g.rect(px - 3, ly + 2, 2, 1).fill({ color: c, alpha: alpha * 0.8 })
    // Right leg
    g.rect(px + 1, ly,     2, 1).fill({ color: c, alpha })
    g.rect(px + 1, ly + 1, 2, 1).fill({ color: c, alpha })
    g.rect(px + 1, ly + 2, 2, 1).fill({ color: c, alpha: alpha * 0.8 })
  }

  private render() {
    const gRoom  = this.roomGraphics
    const gAgent = this.agentGraphics
    const gTask  = this.taskGraphics
    const gFx    = this.fxGraphics
    const gConn  = this.connGraphics
    if (!gRoom || !gAgent || !gTask || !gFx || !gConn) return

    const now = Date.now()
    const t   = now / 1000

    gConn.clear()
    gRoom.clear()
    gAgent.clear()
    gTask.clear()
    gFx.clear()

    // ── Pipeline connectors (base lines + flow dots) ───────────────────────
    CONNECTIONS.forEach(([fromZ, toZ], ci) => {
      const from = this.roomCenter(fromZ)
      const to   = this.roomCenter(toZ)
      // Base wire
      gConn.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: PALETTE.border, width: 1 })
      // Arrowhead at target
      const dx = to.x - from.x
      const dy = to.y - from.y
      const len = Math.sqrt(dx * dx + dy * dy)
      const nx2 = dx / len
      const ny2 = dy / len
      const ax = to.x - nx2 * 10
      const ay = to.y - ny2 * 10
      const perpX = -ny2 * 4
      const perpY =  nx2 * 4
      gConn.moveTo(to.x, to.y)
        .lineTo(ax + perpX, ay + perpY)
        .lineTo(ax - perpX, ay - perpY)
        .lineTo(to.x, to.y)
        .fill({ color: PALETTE.textAccent, alpha: 0.5 })

      // Flow dots (3 per connection)
      this.flowDots.filter(d => d.conn === ci).forEach(dot => {
        dot.t = (dot.t + dot.speed) % 1
        const ft = dot.t
        const fx = from.x + (to.x - from.x) * ft
        const fy = from.y + (to.y - from.y) * ft
        // Fade in/out: 0–0.2 fade in, 0.8–1.0 fade out
        const edgeFade = ft < 0.2 ? ft / 0.2 : ft > 0.8 ? (1 - ft) / 0.2 : 1
        gConn.circle(fx, fy, 2.5).fill({ color: PALETTE.textAccent, alpha: edgeFade * 0.85 })
      })
    })

    // ── Rooms ─────────────────────────────────────────────────────────────
    this.rooms.forEach((r) => {
      // Activity bar lerp
      r.activity += (r.activityTarget - r.activity) * 0.05
      r.activityTarget *= 0.995

      // Background
      gRoom.roundRect(r.x, r.y, r.w, r.h, 3).fill({ color: PALETTE.bgRoom })

      // Floor dot pattern (sparse — every 12px, accent-colored)
      for (let fx2 = r.x + 8; fx2 < r.x + r.w - 4; fx2 += 12) {
        for (let fy2 = r.y + 22; fy2 < r.y + r.h - 8; fy2 += 12) {
          gRoom.circle(fx2, fy2, 0.5).fill({ color: r.color, alpha: 0.12 })
        }
      }

      // Border (1px, accent at 0.4 opacity)
      gRoom.roundRect(r.x, r.y, r.w, r.h, 3).stroke({ color: r.color, width: 1, alpha: 0.4 })
      // Inner glow line (2px inside)
      gRoom.roundRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 2).stroke({ color: r.color, width: 1, alpha: 0.1 })

      // Header bar (18px)
      gRoom.rect(r.x, r.y, r.w, 18).fill({ color: r.color, alpha: 0.07 })
      gRoom.moveTo(r.x, r.y + 18).lineTo(r.x + r.w, r.y + 18).stroke({ color: r.color, width: 1, alpha: 0.18 })

      // Corner brackets (6px L-shapes)
      const s = 6
      ;[
        [r.x,       r.y,       1,  1],
        [r.x + r.w, r.y,      -1,  1],
        [r.x,       r.y + r.h, 1, -1],
        [r.x + r.w, r.y + r.h,-1, -1],
      ].forEach(([cx, cy, dx, dy]) => {
        gRoom
          .moveTo(cx as number, (cy as number) + (dy as number) * s)
          .lineTo(cx as number, cy as number)
          .lineTo((cx as number) + (dx as number) * s, cy as number)
          .stroke({ color: r.color, width: 1.5, alpha: 1.0 })
      })

      // Status dot (bottom-left, pulsing)
      const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * Math.PI))
      const dotAlpha = r.activity > 0.05 ? pulse : 0.3
      const dotColor = r.activity > 0.05 ? r.color : PALETTE.textMuted
      gRoom.circle(r.x + 6, r.y + r.h - 6, 3).fill({ color: dotColor, alpha: dotAlpha })

      // Activity bar (bottom, full width, 3px)
      gRoom.rect(r.x, r.y + r.h - 4, r.w, 3).fill({ color: r.color, alpha: 0.08 })
      const barW = r.w * Math.min(1, r.activity)
      if (barW > 0) {
        gRoom.rect(r.x, r.y + r.h - 4, barW, 3).fill({ color: r.color, alpha: 0.75 })
      }
    })

    // ── Task tokens (data packet style) ───────────────────────────────────
    this.tasks.forEach((task, tid) => {
      task.progress = Math.min(1, task.progress + 0.006)
      // Cubic ease-in-out
      const et = task.progress < 0.5
        ? 4 * task.progress * task.progress * task.progress
        : 1 - Math.pow(-2 * task.progress + 2, 3) / 2
      const tx = task.sx + (task.ex - task.sx) * et
      const ty = task.sy + (task.ey - task.sy) * et

      // Trail (quadratic fade, last 20 positions)
      task.trail.push({ x: tx, y: ty })
      if (task.trail.length > 20) task.trail.shift()
      task.trail.forEach((pt, i) => {
        const ratio = i / task.trail.length
        const ta = ratio * ratio * 0.3
        // Alternate 4×4 squares and 2px dots for trail
        if (i % 2 === 0) {
          gTask.rect(pt.x - 2, pt.y - 2, 4, 4).fill({ color: task.color, alpha: ta })
        } else {
          gTask.circle(pt.x, pt.y, 1.5).fill({ color: task.color, alpha: ta })
        }
      })

      // Token: 10×10 rounded rect
      gTask.roundRect(tx - 5, ty - 5, 10, 10, 2).fill({ color: task.color, alpha: 0.15 })
      gTask.roundRect(tx - 5, ty - 5, 10, 10, 2).stroke({ color: task.color, width: 1, alpha: 0.9 })
      // Inner data block (3×3)
      gTask.rect(tx - 1.5, ty - 1.5, 3, 3).fill({ color: task.color, alpha: 0.8 })

      if (task.progress >= 1) {
        // Burst — 12 particles, mix squares and dots
        for (let i = 0; i < 12; i++) {
          const angle = (Math.PI * 2 * i) / 12
          const speed = 1.5 + Math.random() * 3
          this.particles.push({
            x: task.ex, y: task.ey,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1, maxLife: 1,
            color: task.color,
            isSquare: i % 2 === 0,
          })
        }
        this.stats.processed++
        this.stats.shipped++
        // Activate destination room
        const destRoom = this.rooms.find(r => {
          const center = this.roomCenter(r.label)
          return Math.abs(center.x - task.ex) < 30 && Math.abs(center.y - task.ey) < 30
        })
        if (destRoom) destRoom.activityTarget = Math.min(1, destRoom.activityTarget + 0.4)
        this.tasks.delete(tid)
      }
    })

    // ── Agents ────────────────────────────────────────────────────────────
    this.agents.forEach((agent) => {
      agent.px += (agent.tx - agent.px) * 0.07
      agent.py += (agent.ty - agent.py) * 0.07
      this.drawAgent(gAgent, agent, t)
    })

    // ── Particles ─────────────────────────────────────────────────────────
    this.particles = this.particles.filter(p => p.life > 0)
    this.particles.forEach(p => {
      p.x  += p.vx
      p.y  += p.vy
      p.vx *= 0.92
      p.vy *= 0.92
      p.life -= 0.017  // ~800ms decay at 60fps: 0.017 * 60 ≈ 1.0

      const alpha = p.life * p.life * 0.85
      if (p.isSquare) {
        const sz = p.life * 3
        gFx.rect(p.x - sz / 2, p.y - sz / 2, sz, sz).fill({ color: p.color, alpha })
      } else {
        gFx.circle(p.x, p.y, p.life * 2).fill({ color: p.color, alpha })
      }
    })

    // ── HUD value updates ─────────────────────────────────────────────────
    const vals: string[] = [
      String(this.stats.processed),
      String(this.stats.shipped),
      String(this.stats.active),
      String(this.stats.errors),
      this.stats.latency != null ? `${this.stats.latency.toFixed(0)}ms` : '—',
    ]
    this.statsTexts.forEach((txt, i) => {
      if (txt.text !== vals[i]) txt.text = vals[i]
    })

    // Clock
    const d = new Date()
    const clock = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map(v => String(v).padStart(2, '0')).join(':')
    if (this.clockText && this.clockText.text !== clock) this.clockText.text = clock

    // Uptime
    const elapsed = Math.floor((now - this.startTime) / 1000)
    const uh = Math.floor(elapsed / 3600)
    const um = Math.floor((elapsed % 3600) / 60)
    const us = elapsed % 60
    const upStr = `UP ${String(uh).padStart(2,'0')}:${String(um).padStart(2,'0')}:${String(us).padStart(2,'0')}`
    if (this.uptimeText && this.uptimeText.text !== upStr) this.uptimeText.text = upStr
  }

  applyEvent(event: VizEvent): void {
    const p = event.payload

    if (event.type === 'agent_move') {
      const id     = String(p['agentId'] ?? '')
      const toZone = String(p['toZone'] ?? '')
      const agent  = this.agents.get(id)
      if (agent) {
        const center = this.roomCenter(toZone)
        agent.zone  = toZone
        agent.state = 'moving'
        agent.tx    = center.x + (Math.random() - 0.5) * 18
        agent.ty    = center.y + (Math.random() - 0.5) * 12
        setTimeout(() => { agent.state = 'working' }, 500)
        setTimeout(() => { agent.state = 'idle'    }, 1400)
        // Light up destination room
        const room = this.rooms.find(r => r.label === toZone)
        if (room) room.activityTarget = Math.min(1, room.activityTarget + 0.3)
      }
    }

    if (event.type === 'task_spawn') {
      const fromZone = String(p['zone'] ?? 'INTAKE')
      const toZone   = String(p['fromZone'] && p['fromZone'] !== fromZone ? p['fromZone'] : 'FORGE')
      const from = this.roomCenter(fromZone)
      const to   = this.roomCenter(toZone === fromZone ? 'FORGE' : toZone)
      const tid  = String(p['taskId'] ?? `t-${++this.taskCounter}`)
      const colorHex = String(p['color'] ?? '#2dd4bf').replace('#', '')
      const color = parseInt(colorHex, 16) || PALETTE.textAccent
      this.tasks.set(tid, { id: tid, sx: from.x, sy: from.y, ex: to.x, ey: to.y, progress: 0, color, trail: [] })
      const room = this.rooms.find(r => r.label === fromZone)
      if (room) room.activityTarget = Math.min(1, room.activityTarget + 0.25)
    }

    if (event.type === 'task_complete') {
      const fromZone = String(p['zone'] ?? 'DISPATCH')
      const from = this.roomCenter(fromZone)
      const to   = this.roomCenter('AUDIT')
      const tid  = String(p['taskId'] ?? `tc-${++this.taskCounter}`)
      this.tasks.set(tid, { id: tid, sx: from.x, sy: from.y, ex: to.x, ey: to.y, progress: 0, color: PALETTE.QA, trail: [] })
    }

    if (event.type === 'hitl_trigger') {
      this.stats.errors++
      const center = this.roomCenter('HITL')
      const room   = this.rooms.find(r => r.label === 'HITL')
      if (room) room.activityTarget = 1.0
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8
        this.particles.push({ x: center.x, y: center.y, vx: Math.cos(angle) * 2.5, vy: Math.sin(angle) * 2.5, life: 1, maxLife: 1, color: PALETTE.AUDIT, isSquare: i % 2 === 0 })
      }
    }

    if (event.type === 'metrics_update') {
      const m = p as Record<string, unknown>
      if (typeof m['processed'] === 'number') this.stats.processed = Math.max(this.stats.processed, m['processed'] as number)
      if (typeof m['shipped']   === 'number') this.stats.shipped   = Math.max(this.stats.shipped,   m['shipped']   as number)
      if (typeof m['active']    === 'number') this.stats.active    = m['active'] as number
      if (typeof m['errors']    === 'number') this.stats.errors    = Math.max(this.stats.errors,    m['errors']    as number)
      if (typeof m['latency_ms'] === 'number') this.stats.latency  = m['latency_ms'] as number
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.rafHandle)
    this.app?.destroy(false)
    this.app = null
  }
}
