import { adaptBackendEvent } from './adaptBackendEvent'

export interface VizAgent {
  id: string
  name: string
  zone: string
  state: 'idle' | 'working' | 'moving'
  confidence: number
  color: string
}

export interface VizTask {
  id: string
  name: string
  fromZone: string
  toZone: string
  progress: number
  color: string
}

export interface VizEvent {
  type: 'agent_move' | 'task_complete' | 'task_spawn' | 'hitl_trigger' | 'metrics_update' | 'decision'
  payload: Record<string, unknown>
}

export const ZONES = [
  'INTAKE', 'FORGE', 'QA', 'ROUTER', 'MEMORY', 'DISPATCH', 'AUDIT', 'HITL',
] as const

export type ZoneId = typeof ZONES[number]

export const PIPELINE: Record<string, string[]> = {
  INTAKE:   ['FORGE'],
  FORGE:    ['QA', 'ROUTER'],
  QA:       ['ROUTER', 'DISPATCH'],
  ROUTER:   ['MEMORY', 'DISPATCH'],
  MEMORY:   ['DISPATCH', 'AUDIT'],
  DISPATCH: ['AUDIT'],
  AUDIT:    ['HITL'],
  HITL:     [],
}

const AGENT_COLORS = ['#2dd4bf', '#f59e0b', '#10b981', '#6366f1', '#8b5cf6', '#ef4444']

const MOCK_AGENT_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot']

type Subscriber = (event: VizEvent) => void

export class VizBridge {
  private subscribers: Set<Subscriber> = new Set()
  private mockInterval: ReturnType<typeof setInterval> | null = null
  private taskCounter = 0
  private mockAgents: VizAgent[] = []
  private _ws: WebSocket | null = null
  private _reconnectAttempts = 0

  subscribe(cb: Subscriber): void {
    this.subscribers.add(cb)
  }

  unsubscribe(cb: Subscriber): void {
    this.subscribers.delete(cb)
  }

  emit(event: VizEvent): void {
    this.subscribers.forEach((cb) => {
      try { cb(event) } catch { /* subscriber errors must not break the bridge */ }
    })
  }

  startMock(): void {
    if (this.mockInterval !== null) return

    // Seed initial agents
    this.mockAgents = MOCK_AGENT_NAMES.map((name, i) => ({
      id: `agent-${i}`,
      name,
      zone: ZONES[i % ZONES.length],
      state: 'idle' as const,
      confidence: 0.7 + Math.random() * 0.3,
      color: AGENT_COLORS[i % AGENT_COLORS.length],
    }))

    this.mockInterval = setInterval(() => {
      const roll = Math.random()

      if (roll < 0.35) {
        // agent_move: move a random agent to a downstream zone
        const agent = this.mockAgents[Math.floor(Math.random() * this.mockAgents.length)]
        const downstream = PIPELINE[agent.zone]
        const nextZone = downstream.length > 0
          ? downstream[Math.floor(Math.random() * downstream.length)]
          : ZONES[Math.floor(Math.random() * ZONES.length)]
        const fromZone = agent.zone
        agent.zone = nextZone
        agent.state = 'moving'
        this.emit({
          type: 'agent_move',
          payload: { agentId: agent.id, agentName: agent.name, fromZone, toZone: nextZone, color: agent.color },
        })
        // Reset state after move
        setTimeout(() => { agent.state = 'working' }, 300)
        setTimeout(() => { agent.state = 'idle' }, 900)

      } else if (roll < 0.60) {
        // task_spawn: new task enters INTAKE
        this.taskCounter++
        const taskId = `task-${this.taskCounter}`
        this.emit({
          type: 'task_spawn',
          payload: { taskId, taskName: `Task #${this.taskCounter}`, zone: 'INTAKE', color: '#f59e0b' },
        })

      } else if (roll < 0.88) {
        // task_complete: task exits DISPATCH
        this.emit({
          type: 'task_complete',
          payload: {
            taskId: `task-${Math.max(1, this.taskCounter - Math.floor(Math.random() * 3))}`,
            fromZone: 'DISPATCH',
            burst: true,
            color: '#10b981',
          },
        })

      } else {
        // hitl_trigger (1-in-8 chance)
        this.emit({
          type: 'hitl_trigger',
          payload: { severity: Math.random() > 0.5 ? 'high' : 'medium', zone: 'HITL' },
        })
      }
    }, 800)
  }

  stopMock(): void {
    if (this.mockInterval !== null) {
      clearInterval(this.mockInterval)
      this.mockInterval = null
    }
  }

  private _metricsWs: WebSocket | null = null

  connectMetricsWS(url: string): void {
    if (this._metricsWs) {
      this._metricsWs.onclose = null
      this._metricsWs.close()
      this._metricsWs = null
    }
    const ws = new WebSocket(url)
    this._metricsWs = ws
    ws.onmessage = (msg) => {
      try {
        const raw: unknown = JSON.parse(msg.data)
        const event = adaptBackendEvent(raw)
        if (event) this.emit(event)
      } catch { /* ignore parse errors on metrics channel */ }
    }
    ws.onclose = () => {
      setTimeout(() => this.connectMetricsWS(url), 3000)
    }
  }

  disconnectMetricsWS(): void {
    if (this._metricsWs) {
      this._metricsWs.onclose = null
      this._metricsWs.close()
      this._metricsWs = null
    }
  }

  connectWS(url: string): void {
    this.stopMock()

    const connect = () => {
      const ws = new WebSocket(url)
      this._ws = ws

      ws.onopen = () => {
        console.log('[VizBridge] WS connected:', url)
        this._reconnectAttempts = 0
      }

      ws.onmessage = (msg) => {
        try {
          const raw: unknown = JSON.parse(msg.data)
          const event = adaptBackendEvent(raw)
          if (event) this.emit(event)
        } catch (e) {
          console.warn('[VizBridge] parse error:', e)
        }
      }

      ws.onerror = (err) => {
        console.warn('[VizBridge] WS error:', err)
      }

      ws.onclose = () => {
        console.warn('[VizBridge] WS closed — reconnecting...')
        const delay = Math.min(1000 * Math.pow(1.5, this._reconnectAttempts), 30000)
        this._reconnectAttempts++
        setTimeout(connect, delay)
      }
    }

    connect()
  }

  disconnectWS(): void {
    if (this._ws) {
      this._ws.onclose = null
      this._ws.close()
      this._ws = null
    }
    this.disconnectMetricsWS()
    this._reconnectAttempts = 0
  }

  getMockAgents(): VizAgent[] {
    return [...this.mockAgents]
  }
}

export const vizBridge = new VizBridge()
