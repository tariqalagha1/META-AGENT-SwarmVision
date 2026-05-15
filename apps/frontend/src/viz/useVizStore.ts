import { useSyncExternalStore } from 'react'
import { vizBridge, ZONES } from './VizBridge'
import type { VizAgent, VizTask, VizEvent } from './VizBridge'

export type { VizAgent, VizTask, VizEvent }

interface LogEntry {
  id: string
  msg: string
  ts: number
}

interface VizStats {
  processed: number
  shipped: number
  active: number
  errors: number
  latency: number | null
}

interface VizState {
  agents: Map<string, VizAgent>
  tasks: Map<string, VizTask>
  stats: VizStats
  log: LogEntry[]
  activeView: 'ops' | 'demo'
  activeRoom: string | null
}

interface VizStore extends VizState {
  setView: (v: 'ops' | 'demo') => void
  setActiveRoom: (id: string | null) => void
  applyEvent: (event: VizEvent) => void
  initMockAgents: () => void
  addLog: (msg: string) => void
  connectLive: () => void
  useMock: () => void
}

type Updater = (s: VizStore) => VizStore
type Selector<T> = (s: VizStore) => T

const AGENT_COLORS = ['#2dd4bf', '#f59e0b', '#10b981', '#6366f1', '#8b5cf6', '#ef4444']
const AGENT_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot']

let logCounter = 0
function nextLogId() { return `log-${++logCounter}` }

let storeState: VizStore
const storeListeners = new Set<() => void>()

const setState = (updater: Updater) => {
  storeState = updater(storeState)
  storeListeners.forEach((l) => l())
}

const getState = () => storeState

const subscribeStore = (listener: () => void) => {
  storeListeners.add(listener)
  return () => storeListeners.delete(listener)
}

function addLogEntry(log: LogEntry[], entry: LogEntry): LogEntry[] {
  return [entry, ...log].slice(0, 50)
}

const addLog = (msg: string) => {
  setState((s) => ({
    ...s,
    log: addLogEntry(s.log, { id: nextLogId(), msg, ts: Date.now() }),
  }))
}

const connectLive = () => {
  const url = (import.meta.env.VITE_API_URL as string | undefined) ?? 'ws://localhost:8012'
  const wsUrl = url.startsWith('ws') ? url : url.replace(/^http/, 'ws')
  vizBridge.connectWS(wsUrl + '/ws/events')
  vizBridge.connectMetricsWS(wsUrl + '/metrics')
  addLog('WS connected — live mode active')
}

const useMock = () => {
  vizBridge.disconnectWS()
  vizBridge.startMock()
  addLog('Mock engine active')
}

const initMockAgents = () => {
  setState((s) => {
    const agents = new Map<string, VizAgent>()
    AGENT_NAMES.forEach((name, i) => {
      const id = `agent-${i}`
      agents.set(id, {
        id,
        name,
        zone: ZONES[i % ZONES.length],
        state: 'idle',
        confidence: 0.7 + Math.random() * 0.3,
        color: AGENT_COLORS[i % AGENT_COLORS.length],
      })
    })
    return { ...s, agents, stats: { ...s.stats, active: agents.size } }
  })
}

const applyEvent = (event: VizEvent) => {
  setState((s) => {
    const p = event.payload
    let agents = new Map(s.agents)
    let tasks = new Map(s.tasks)
    const stats = { ...s.stats }
    let log = s.log

    switch (event.type) {
      case 'agent_move': {
        const agentId = String(p['agentId'] ?? '')
        const toZone = String(p['toZone'] ?? '')
        const agent = agents.get(agentId)
        if (agent) {
          agents.set(agentId, { ...agent, zone: toZone, state: 'moving' })
        }
        log = addLogEntry(log, {
          id: nextLogId(),
          msg: `${String(p['agentName'] ?? agentId)} → ${toZone}`,
          ts: Date.now(),
        })
        stats.active = agents.size
        break
      }
      case 'task_spawn': {
        const taskId = String(p['taskId'] ?? `t-${Date.now()}`)
        tasks.set(taskId, {
          id: taskId,
          name: String(p['taskName'] ?? taskId),
          fromZone: String(p['zone'] ?? 'INTAKE'),
          toZone: 'FORGE',
          progress: 0,
          color: String(p['color'] ?? '#f59e0b'),
        })
        log = addLogEntry(log, {
          id: nextLogId(),
          msg: `SPAWN ${String(p['taskName'] ?? taskId)}`,
          ts: Date.now(),
        })
        stats.active = Math.max(0, stats.active)
        break
      }
      case 'task_complete': {
        const taskId = String(p['taskId'] ?? '')
        tasks.delete(taskId)
        stats.processed += 1
        stats.shipped += 1
        log = addLogEntry(log, {
          id: nextLogId(),
          msg: `✓ SHIPPED ${taskId}`,
          ts: Date.now(),
        })
        break
      }
      case 'hitl_trigger': {
        stats.errors += 1
        log = addLogEntry(log, {
          id: nextLogId(),
          msg: `⚠ HITL ${String(p['severity'] ?? 'medium').toUpperCase()}`,
          ts: Date.now(),
        })
        break
      }
      case 'metrics_update': {
        const processed = Number(p['processed'] ?? 0)
        const shipped   = Number(p['shipped']   ?? 0)
        const active    = Number(p['active']     ?? 0)
        const errors    = Number(p['errors']     ?? 0)
        const latencyRaw = p['latency_ms']
        stats.processed = Math.max(s.stats.processed, processed)
        stats.shipped   = Math.max(s.stats.shipped,   shipped)
        stats.active    = active
        stats.errors    = Math.max(s.stats.errors,    errors)
        stats.latency   = typeof latencyRaw === 'number' ? latencyRaw : s.stats.latency
        break
      }
      case 'decision': {
        const decision = String(p['decision'] ?? 'ALLOW').toUpperCase()
        const agentId  = String(p['agent_id'] ?? 'system')
        const point    = String(p['decision_point'] ?? '')
        const icon     = decision === 'BLOCK' ? '✗' : decision === 'REVIEW' ? '◎' : '✓'
        const label    = point ? `${icon} ${decision}: ${point}` : `${icon} DECISION ${decision} (${agentId})`
        log = addLogEntry(log, { id: nextLogId(), msg: label, ts: Date.now() })
        break
      }
    }

    return { ...s, agents, tasks, stats, log }
  })
}

storeState = {
  agents: new Map(),
  tasks: new Map(),
  stats: { processed: 0, shipped: 0, active: 0, errors: 0, latency: null },
  log: [],
  activeView: 'ops',
  activeRoom: null,

  setView: (v) => setState((s) => ({ ...s, activeView: v })),
  setActiveRoom: (id) => setState((s) => ({ ...s, activeRoom: id })),
  applyEvent,
  initMockAgents,
  addLog,
  connectLive,
  useMock,
}

// Seed agents and start mock on module load
initMockAgents()
vizBridge.startMock()
vizBridge.subscribe((event) => applyEvent(event))

export const useVizStore = <T,>(selector: Selector<T>): T =>
  useSyncExternalStore(subscribeStore, () => selector(getState()), () => selector(getState()))

export const vizStore = { getState }
