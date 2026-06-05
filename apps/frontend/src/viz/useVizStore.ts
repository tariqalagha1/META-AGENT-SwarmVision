import { useSyncExternalStore } from 'react'
import { vizBridge, ZONES } from './VizBridge'
import type { VizAgent, VizTask, VizEvent } from './VizBridge'
import { observabilityStore } from '../store/useObservabilityStore'

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
  activeView: 'ops' | 'demo' | 'none'
  activeRoom: string | null
}

interface VizStore extends VizState {
  setView: (v: 'ops' | 'demo' | 'none') => void
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
    const agents = new Map(s.agents)
    const tasks = new Map(s.tasks)
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
  activeView: 'none',
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

// ── Bridge: pipe VizBridge mock events into the observability graph store ──────
// Translates each VizEvent to a NormalizedEvent so the System Graph on the
// Observe tab stays live even when the backend at :8012 is not running.

const _mockTraceId = `mock-trace-${Date.now()}`
let _mockEventSeq = 0

const makeMockEventId = () => `mock-evt-${++_mockEventSeq}-${Date.now()}`
const makeMockProvenance = (eventId: string, timestamp: number) => ({
  event_id: eventId,
  trace_id: _mockTraceId,
  sequence_no: _mockEventSeq,
  source_type: 'mock' as const,
  source_component: 'vizBridge.mock',
  trust_level: 'mock' as const,
  persistence_status: 'live_unpersisted' as const,
  timestamp: new Date(timestamp).toISOString(),
})

const MOCK_PAYLOAD_BASE = { source: 'viz-mock' }

// Zone → canonical role agent for edge endpoints
const ZONE_AGENT: Record<string, string> = {
  INTAKE:   'intake-agent',
  FORGE:    'intake-agent',   // tasks enter via intake then go to worker agents
  QA:       'intake-agent',
  ROUTER:   'intake-agent',
  MEMORY:   'intake-agent',
  DISPATCH: 'dispatch-agent',
  AUDIT:    'dispatch-agent',
  HITL:     'hitl-agent',
}

// Derive the destination agent: prefer the actual agent in toZone, fall back to zone role
function resolveTargetAgent(toZone: string): string {
  // Look through current VizStore agents for one in the target zone
  const agents = storeState.agents
  for (const [, agent] of agents) {
    if (agent.zone === toZone) return agent.id
  }
  return ZONE_AGENT[toZone] ?? toZone.toLowerCase() + '-agent'
}

const vizEventToNormalized = (event: VizEvent) => {
  const p = event.payload
  const ts = Date.now()

  switch (event.type) {
    case 'agent_move': {
      const eventId = makeMockEventId()
      const agentId  = String(p['agentId']   ?? '')
      const fromZone = String(p['fromZone']   ?? '')
      const toZone   = String(p['toZone']     ?? '')
      // Resolve the agent currently in the destination zone as the handoff target
      const targetAgentId = resolveTargetAgent(toZone)
      return [
        {
          event_id: eventId, id: eventId,
          event_type: 'TASK_HANDOFF', type: 'TASK_HANDOFF',
          timestamp: ts, trace_id: _mockTraceId,
          source: 'viz-mock',
          agent_id: agentId,
          source_agent_id: agentId,
          target_agent_id: targetAgentId !== agentId ? targetAgentId : 'dispatch-agent',
          payload: { ...MOCK_PAYLOAD_BASE, fromZone, toZone, agentName: p['agentName'] },
          provenance: makeMockProvenance(eventId, ts),
          _meta: { normalized: true as const, source_event_type: 'TASK_HANDOFF' },
        },
      ]
    }
    case 'task_spawn': {
      const eventId = makeMockEventId()
      // intake-agent receives a new task and hands it to a random worker agent
      const agents = [...storeState.agents.values()].filter(a => a.id.startsWith('agent-'))
      const target = agents.length > 0
        ? agents[Math.floor(Math.random() * agents.length)].id
        : 'agent-0'
      return [
        {
          event_id: eventId, id: eventId,
          event_type: 'TASK_HANDOFF', type: 'TASK_HANDOFF',
          timestamp: ts, trace_id: _mockTraceId,
          source: 'viz-mock',
          agent_id: 'intake-agent',
          source_agent_id: 'intake-agent',
          target_agent_id: target,
          payload: { ...MOCK_PAYLOAD_BASE, taskId: p['taskId'], taskName: p['taskName'], zone: p['zone'] },
          provenance: makeMockProvenance(eventId, ts),
          _meta: { normalized: true as const, source_event_type: 'TASK_HANDOFF' },
        },
      ]
    }
    case 'task_complete': {
      const eventId = makeMockEventId()
      // A worker agent completes and hands off to dispatch
      const agents = [...storeState.agents.values()].filter(a => a.id.startsWith('agent-'))
      const source = agents.length > 0
        ? agents[Math.floor(Math.random() * agents.length)].id
        : 'agent-0'
      return [
        {
          event_id: eventId, id: eventId,
          event_type: 'TASK_HANDOFF', type: 'TASK_HANDOFF',
          timestamp: ts, trace_id: _mockTraceId,
          source: 'viz-mock',
          agent_id: 'dispatch-agent',
          source_agent_id: source,
          target_agent_id: 'dispatch-agent',
          payload: { ...MOCK_PAYLOAD_BASE, taskId: p['taskId'], fromZone: p['fromZone'] },
          provenance: makeMockProvenance(eventId, ts),
          _meta: { normalized: true as const, source_event_type: 'TASK_HANDOFF' },
        },
      ]
    }
    case 'hitl_trigger': {
      const eventId = makeMockEventId()
      // dispatch-agent escalates an anomaly to hitl-agent
      return [
        {
          event_id: eventId, id: eventId,
          event_type: 'TASK_HANDOFF', type: 'TASK_HANDOFF',
          timestamp: ts, trace_id: _mockTraceId,
          source: 'viz-mock',
          agent_id: 'hitl-agent',
          source_agent_id: 'dispatch-agent',
          target_agent_id: 'hitl-agent',
          payload: { ...MOCK_PAYLOAD_BASE, severity: p['severity'], zone: p['zone'] },
          provenance: makeMockProvenance(eventId, ts),
          _meta: { normalized: true as const, source_event_type: 'TASK_HANDOFF' },
        },
      ]
    }
    case 'decision': {
      const eventId = makeMockEventId()
      const agentId = String(p['agent_id'] ?? 'system')
      return [
        {
          event_id: eventId, id: eventId,
          event_type: 'DECISION_EVENT', type: 'DECISION_EVENT',
          timestamp: ts, trace_id: _mockTraceId,
          source: 'viz-mock',
          agent_id: agentId,
          payload: { ...MOCK_PAYLOAD_BASE, ...p },
          provenance: makeMockProvenance(eventId, ts),
          _meta: { normalized: true as const, source_event_type: 'DECISION_EVENT' },
        },
      ]
    }
    default:
      return []
  }
}

// Emit a SWARM_STARTED event once so the trace auto-selects in the graph
const _swarmStartedEventId = makeMockEventId()
const _swarmStartedTs = Date.now()
const _swarmStartedEvt = {
  event_id: _swarmStartedEventId, id: _swarmStartedEventId,
  event_type: 'SWARM_STARTED', type: 'SWARM_STARTED',
  timestamp: _swarmStartedTs, trace_id: _mockTraceId,
  source: 'viz-mock',
  agent_id: 'system',
  payload: { ...MOCK_PAYLOAD_BASE, task: 'Mock swarm demo' },
  provenance: makeMockProvenance(_swarmStartedEventId, _swarmStartedTs),
  _meta: { normalized: true as const, source_event_type: 'SWARM_STARTED' },
}
setTimeout(() => {
  observabilityStore.getState().addBatchEvents([_swarmStartedEvt])
}, 200)

// Bridge: forward all subsequent mock events into the observability store
vizBridge.subscribe((event) => {
  const normalized = vizEventToNormalized(event)
  if (normalized.length > 0) {
    observabilityStore.getState().addBatchEvents(normalized)
  }
})

export const useVizStore = <T,>(selector: Selector<T>): T =>
  useSyncExternalStore(subscribeStore, () => selector(getState()), () => selector(getState()))

export const vizStore = { getState }

