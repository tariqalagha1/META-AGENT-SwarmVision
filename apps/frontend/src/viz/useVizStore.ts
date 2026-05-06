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
}

type Updater = (s: VizStore) => VizStore
type Selector<T> = (s: VizStore) => T

const AGENT_COLORS = ['#00f5ff', '#ff006e', '#ffbe0b', '#8338ec', '#06d6a0', '#ff4500']
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

function addLog(log: LogEntry[], entry: LogEntry): LogEntry[] {
  return [entry, ...log].slice(0, 50)
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
        log = addLog(log, {
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
          color: String(p['color'] ?? '#ffbe0b'),
        })
        log = addLog(log, {
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
        log = addLog(log, {
          id: nextLogId(),
          msg: `✓ SHIPPED ${taskId}`,
          ts: Date.now(),
        })
        break
      }
      case 'hitl_trigger': {
        stats.errors += 1
        log = addLog(log, {
          id: nextLogId(),
          msg: `⚠ HITL ${String(p['severity'] ?? 'medium').toUpperCase()}`,
          ts: Date.now(),
        })
        break
      }
    }

    return { ...s, agents, tasks, stats, log }
  })
}

storeState = {
  agents: new Map(),
  tasks: new Map(),
  stats: { processed: 0, shipped: 0, active: 0, errors: 0 },
  log: [],
  activeView: 'ops',
  activeRoom: null,

  setView: (v) => setState((s) => ({ ...s, activeView: v })),
  setActiveRoom: (id) => setState((s) => ({ ...s, activeRoom: id })),
  applyEvent,
  initMockAgents,
}

// Seed agents and start mock on module load
initMockAgents()
vizBridge.startMock()
vizBridge.subscribe((event) => applyEvent(event))

export const useVizStore = <T,>(selector: Selector<T>): T =>
  useSyncExternalStore(subscribeStore, () => selector(getState()), () => selector(getState()))

export const vizStore = { getState }
