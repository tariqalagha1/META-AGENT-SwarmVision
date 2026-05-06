import type { VizEvent } from '../VizBridge'
import { ZONES } from '../VizBridge'

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  bg:    0x0a0a1a,
  neon1: 0x00f5ff,  // cyan
  neon2: 0xff006e,  // pink
  neon3: 0xffbe0b,  // amber
  neon4: 0x8338ec,  // purple
  neon5: 0x06d6a0,  // green
  dim:   0x0a1a2a,
  text:  0xd0eeff,
  grid:  0x0c1830,
}

// Zone layout — fractional positions (0..1) on canvas, then scaled
const ZONE_LAYOUT: Record<string, { fx: number; fy: number }> = {
  INTAKE:   { fx: 0.05, fy: 0.08 },
  FORGE:    { fx: 0.30, fy: 0.08 },
  QA:       { fx: 0.55, fy: 0.08 },
  ROUTER:   { fx: 0.80, fy: 0.08 },
  MEMORY:   { fx: 0.05, fy: 0.45 },
  DISPATCH: { fx: 0.30, fy: 0.45 },
  AUDIT:    { fx: 0.55, fy: 0.45 },
  HITL:     { fx: 0.80, fy: 0.45 },
}

const ZONE_COLORS: Record<string, number> = {
  INTAKE:   C.neon1,
  FORGE:    C.neon3,
  QA:       C.neon1,
  ROUTER:   C.neon3,
  MEMORY:   C.neon1,
  DISPATCH: C.neon5,
  AUDIT:    C.neon1,
  HITL:     C.neon4,
}

const ZONE_ICONS: Record<string, string> = {
  INTAKE:'⬇', FORGE:'⚙', QA:'🔍', ROUTER:'⟁',
  MEMORY:'🧠', DISPATCH:'📦', AUDIT:'📋', HITL:'⚠',
}

interface RoomRect { x: number; y: number; w: number; h: number; label: string; color: number }
interface PixiAgent { id: string; zone: string; px: number; py: number; tx: number; ty: number; color: number; state: string }
interface PixiTask  { id: string; sx: number; sy: number; ex: number; ey: number; progress: number; color: number; trail: Array<{x:number;y:number}> }
interface Particle  { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: number }

interface Stats { processed: number; shipped: number; active: number; errors: number }

// Dynamic import of pixi.js to avoid SSR issues
type PixiApp = import('pixi.js').Application
type PixiGraphics = import('pixi.js').Graphics
type PixiText = import('pixi.js').Text
type PixiContainer = import('pixi.js').Container

export class SimEngine {
  private canvas: HTMLCanvasElement
  private app: PixiApp | null = null
  private rooms: RoomRect[] = []
  private agents: Map<string, PixiAgent> = new Map()
  private tasks: Map<string, PixiTask> = new Map()
  private particles: Particle[] = []
  private stats: Stats = { processed: 0, shipped: 0, active: 0, errors: 0 }
  private taskCounter = 0

  // Pixi layers
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
  private statsTexts:    PixiText[]          = []
  private rafHandle:     number              = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  async init(): Promise<void> {
    const PIXI = await import('pixi.js')

    this.app = new PIXI.Application()
    await this.app.init({
      canvas: this.canvas,
      width:  this.canvas.clientWidth  || 900,
      height: this.canvas.clientHeight || 500,
      background: C.bg,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })

    const W = this.app.renderer.width
    const H = this.app.renderer.height

    // Layers
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

    // Draw static grid background
    const bgGfx = new PIXI.Graphics()
    bgGfx.rect(0, 0, W, H).fill({ color: C.bg })
    for (let x = 0; x < W; x += 30) {
      bgGfx.moveTo(x, 0).lineTo(x, H).stroke({ color: C.grid, width: 0.5 })
    }
    for (let y = 0; y < H; y += 30) {
      bgGfx.moveTo(0, y).lineTo(W, y).stroke({ color: C.grid, width: 0.5 })
    }
    this.bgLayer.addChild(bgGfx)

    // Build rooms
    const RW = W * 0.17
    const RH = H * 0.30
    ZONES.forEach((zone) => {
      const pos = ZONE_LAYOUT[zone]
      const rx = pos.fx * W
      const ry = pos.fy * H + H * 0.08
      this.rooms.push({ x: rx, y: ry, w: RW, h: RH, label: zone, color: ZONE_COLORS[zone] ?? C.neon1 })
    })

    // Persistent graphics objects (cleared + redrawn each frame)
    this.roomGraphics  = new PIXI.Graphics()
    this.agentGraphics = new PIXI.Graphics()
    this.taskGraphics  = new PIXI.Graphics()
    this.fxGraphics    = new PIXI.Graphics()

    this.roomLayer.addChild(this.roomGraphics)
    this.agentLayer.addChild(this.agentGraphics)
    this.taskLayer.addChild(this.taskGraphics)
    this.fxLayer.addChild(this.fxGraphics)

    // Room labels (static)
    ZONES.forEach((zone, i) => {
      const r = this.rooms[i]
      const label = new PIXI.Text({
        text: `${ZONE_ICONS[zone] ?? ''} ${zone}`,
        style: {
          fontFamily: 'Courier New',
          fontSize: 10,
          fill: ZONE_COLORS[zone] ?? C.neon1,
          fontWeight: 'bold',
          letterSpacing: 1,
        },
      })
      label.x = r.x + 6
      label.y = r.y + 6
      this.roomLayer!.addChild(label)
    })

    // HUD
    this.buildHUD(PIXI, W, H)

    // Seed agents
    const colors = [C.neon1, C.neon2, C.neon3, C.neon4, C.neon5, 0xff4500]
    const names = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot']
    names.forEach((_name, i) => {
      const zone = ZONES[i % ZONES.length]
      const center = this.roomCenter(zone)
      this.agents.set(`agent-${i}`, {
        id: `agent-${i}`,
        zone,
        px: center.x + (Math.random() - 0.5) * 30,
        py: center.y + (Math.random() - 0.5) * 20,
        tx: center.x,
        ty: center.y,
        color: colors[i % colors.length],
        state: 'idle',
      })
    })
    this.stats.active = this.agents.size

    // Start render loop (manual RAF, no pixi ticker dependency)
    const loop = () => {
      this.render()
      this.rafHandle = requestAnimationFrame(loop)
    }
    this.rafHandle = requestAnimationFrame(loop)
  }

  private buildHUD(PIXI: typeof import('pixi.js'), W: number, H: number) {
    // Top bar
    const topBar = new PIXI.Graphics()
    topBar.rect(0, 0, W, 28).fill({ color: 0x060612, alpha: 0.95 })
    topBar.moveTo(0, 28).lineTo(W, 28).stroke({ color: C.neon1, width: 0.5, alpha: 0.4 })
    this.hudLayer!.addChild(topBar)

    const title = new PIXI.Text({
      text: 'SWARMVISION — DEMO VIEW',
      style: { fontFamily:'Courier New', fontSize:11, fill:C.neon1, fontWeight:'bold', letterSpacing:3 },
    })
    title.x = 12
    title.y = 8
    this.hudLayer!.addChild(title)

    // Bottom stats bar
    const botBar = new PIXI.Graphics()
    botBar.rect(0, H - 32, W, 32).fill({ color: 0x060612, alpha: 0.95 })
    botBar.moveTo(0, H - 32).lineTo(W, H - 32).stroke({ color: C.neon1, width: 0.5, alpha: 0.4 })
    this.hudLayer!.addChild(botBar)

    const statDefs = [
      { label: 'PROCESSED', color: C.neon5 },
      { label: 'SHIPPED',   color: C.neon1 },
      { label: 'ACTIVE',    color: C.neon3 },
      { label: 'ERRORS',    color: C.neon2 },
    ]
    const colW = W / 4
    this.statsTexts = []
    statDefs.forEach((def, i) => {
      const lbl = new PIXI.Text({
        text: def.label,
        style: { fontFamily:'Courier New', fontSize:7, fill:0x304860, letterSpacing:1 },
      })
      lbl.x = i * colW + colW / 2 - 25
      lbl.y = H - 29

      const val = new PIXI.Text({
        text: '0',
        style: { fontFamily:'Courier New', fontSize:13, fill:def.color, fontWeight:'bold' },
      })
      val.x = i * colW + colW / 2 - 6
      val.y = H - 20

      this.hudLayer!.addChild(lbl)
      this.hudLayer!.addChild(val)
      this.statsTexts.push(val)
    })
  }

  private roomCenter(zone: string): { x: number; y: number } {
    const idx = ZONES.indexOf(zone as typeof ZONES[number])
    const r = this.rooms[idx >= 0 ? idx : 0]
    if (!r) return { x: 100, y: 100 }
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
  }

  private render() {
    const gRoom  = this.roomGraphics
    const gAgent = this.agentGraphics
    const gTask  = this.taskGraphics
    const gFx    = this.fxGraphics
    if (!gRoom || !gAgent || !gTask || !gFx) return

    gRoom.clear()
    gAgent.clear()
    gTask.clear()
    gFx.clear()

    // Rooms
    this.rooms.forEach((r) => {
      gRoom.roundRect(r.x, r.y, r.w, r.h, 3).fill({ color: 0x06080e, alpha: 0.9 })
      gRoom.roundRect(r.x, r.y, r.w, r.h, 3).stroke({ color: r.color, width: 1, alpha: 0.6 })
      // Corner brackets
      const s = 8
      ;[
        [r.x, r.y, 1, 1], [r.x+r.w, r.y, -1, 1],
        [r.x, r.y+r.h, 1, -1], [r.x+r.w, r.y+r.h, -1, -1],
      ].forEach(([cx, cy, dx, dy]) => {
        gRoom.moveTo(cx as number, (cy as number) + (dy as number)*s)
          .lineTo(cx as number, cy as number)
          .lineTo((cx as number) + (dx as number)*s, cy as number)
          .stroke({ color: r.color, width: 1.5, alpha: 0.9 })
      })
      // Bottom pulse bar
      const barW = r.w * (0.3 + Math.sin(Date.now() / 400) * 0.2)
      gRoom.rect(r.x + 4, r.y + r.h - 5, barW, 2)
        .fill({ color: r.color, alpha: 0.5 })
    })

    // Tasks (glowing dots traveling between rooms)
    this.tasks.forEach((task, tid) => {
      task.progress = Math.min(1, task.progress + 0.008)
      const tx = task.sx + (task.ex - task.sx) * task.progress
      const ty = task.sy + (task.ey - task.sy) * task.progress

      // Trail
      task.trail.push({ x: tx, y: ty })
      if (task.trail.length > 12) task.trail.shift()
      task.trail.forEach((pt, i) => {
        const a = (i / task.trail.length) * 0.5
        gTask.circle(pt.x, pt.y, 2).fill({ color: task.color, alpha: a })
      })

      // Main dot
      gTask.circle(tx, ty, 5).fill({ color: task.color, alpha: 0.9 })
      gTask.circle(tx, ty, 8).fill({ color: task.color, alpha: 0.2 })

      if (task.progress >= 1) {
        // Burst particles
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI * 2 * i) / 10
          this.particles.push({
            x: task.ex, y: task.ey,
            vx: Math.cos(angle) * (1 + Math.random() * 2),
            vy: Math.sin(angle) * (1 + Math.random() * 2),
            life: 1, maxLife: 1, color: task.color,
          })
        }
        this.stats.processed++
        this.stats.shipped++
        this.tasks.delete(tid)
      }
    })

    // Agents
    this.agents.forEach((agent) => {
      // Smooth towards target
      agent.px += (agent.tx - agent.px) * 0.06
      agent.py += (agent.ty - agent.py) * 0.06

      const blink = agent.state === 'working' && Math.sin(Date.now() / 200) > 0

      // Body
      gAgent.rect(agent.px - 4, agent.py - 6, 8, 12).fill({ color: agent.color, alpha: blink ? 0.4 : 0.85 })
      // Head
      gAgent.circle(agent.px, agent.py - 9, 4).fill({ color: agent.color, alpha: blink ? 0.4 : 0.85 })
      // Glow
      gAgent.circle(agent.px, agent.py, 10).fill({ color: agent.color, alpha: 0.08 })
    })

    // Particles
    this.particles = this.particles.filter((p) => p.life > 0)
    this.particles.forEach((p) => {
      p.x += p.vx
      p.y += p.vy
      p.vx *= 0.94
      p.vy *= 0.94
      p.life -= 0.04
      gFx.circle(p.x, p.y, 3 * p.life).fill({ color: p.color, alpha: p.life * 0.8 })
    })

    // Update stats HUD
    const vals = [this.stats.processed, this.stats.shipped, this.stats.active, this.stats.errors]
    this.statsTexts.forEach((t, i) => { t.text = String(vals[i]) })
  }

  applyEvent(event: VizEvent): void {
    const p = event.payload

    if (event.type === 'agent_move') {
      const id = String(p['agentId'] ?? '')
      const toZone = String(p['toZone'] ?? '')
      const agent = this.agents.get(id)
      if (agent) {
        const center = this.roomCenter(toZone)
        agent.zone = toZone
        agent.state = 'moving'
        agent.tx = center.x + (Math.random() - 0.5) * 20
        agent.ty = center.y + (Math.random() - 0.5) * 14
        setTimeout(() => { if (this.agents.get(id)) this.agents.get(id)!.state = 'working' }, 500)
        setTimeout(() => { if (this.agents.get(id)) this.agents.get(id)!.state = 'idle'    }, 1200)
      }
    }

    if (event.type === 'task_spawn') {
      const fromZone = String(p['zone'] ?? 'INTAKE')
      const toZone = 'FORGE'
      const from = this.roomCenter(fromZone)
      const to = this.roomCenter(toZone)
      const tid = String(p['taskId'] ?? `t-${++this.taskCounter}`)
      const colorHex = String(p['color'] ?? '#ffbe0b').replace('#', '')
      const color = parseInt(colorHex, 16) || C.neon3
      this.tasks.set(tid, { id: tid, sx: from.x, sy: from.y, ex: to.x, ey: to.y, progress: 0, color, trail: [] })
    }

    if (event.type === 'task_complete') {
      const from = this.roomCenter('DISPATCH')
      const to = this.roomCenter('AUDIT')
      const tid = String(p['taskId'] ?? `tc-${++this.taskCounter}`)
      this.tasks.set(tid, { id: tid, sx: from.x, sy: from.y, ex: to.x, ey: to.y, progress: 0, color: C.neon5, trail: [] })
    }

    if (event.type === 'hitl_trigger') {
      this.stats.errors++
      // Flash burst at HITL
      const center = this.roomCenter('HITL')
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6
        this.particles.push({ x: center.x, y: center.y, vx: Math.cos(a)*2, vy: Math.sin(a)*2, life: 1, maxLife: 1, color: C.neon4 })
      }
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.rafHandle)
    this.app?.destroy(false)
    this.app = null
  }
}
