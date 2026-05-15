/*
 * BACKEND EVENT DISCOVERY — updated after live WS capture
 *
 * WS endpoints:
 *   /ws/events  — primary (TASK_*, AGENT_*, ANOMALY, DECISION, META_INSIGHT)
 *   /metrics    — METRICS_SNAPSHOT + AGENT_STATE_SNAPSHOT
 *   /alerts     — ANOMALY
 *
 * enrich_event_payload() wraps all events with:
 *   event_id, event_type, timestamp, trace_id, agent_id, session_id,
 *   step_id, latency_ms, decision_flag, step_index, context{}
 *
 * ── Pulse emitter shapes (pulse.py → /ws/events) ──────────────────────────
 *   HEALTH_CHECK  { payload: { system_health: { status, agents_active,
 *                                               tasks_processing, uptime_seconds } } }
 *   AGENT_SPAWN   { payload: { agent_id, agent_name, agent_type } }
 *   TASK_START    { payload: { agent_id, task_id } }
 *   AGENT_MOVE    { payload: { agent_id, from_node, to_node } }
 *                 from_node/to_node ∈ {"entry","processing","validation","enrichment","output"}
 *   TASK_HANDOFF  { payload: { source_agent_id, target_agent_id, task_id } }
 *   TASK_SUCCESS  { payload: { agent_id, task_id, processing_time_ms } }
 *
 * ── METRICS_SNAPSHOT shape (/metrics channel) ─────────────────────────────
 *   { event_type:"METRICS_SNAPSHOT", payload: {
 *       timestamp, agents: [{ agent_id, latency_avg, failure_rate,
 *                             throughput, is_bottleneck, last_seen }],
 *       traces: [{ trace_id, start, end, duration_ms, retry_count }]
 *   }}
 *   No top-level processed/active counters — must aggregate from agents[].
 *   active  = agents.length
 *   processed = sum(agents[].throughput)
 *   errors  = agents where failure_rate > 0
 *   latency = mean(agents[].latency_avg) when agents.length > 0
 *
 * ── DECISION shape (/ws/events channel) ───────────────────────────────────
 *   { event_type:"DECISION", decision_point:"retry_logic",
 *     input: { event_type: "TASK_HANDOFF" },
 *     output: { retry_applied: false },
 *     reason: "No retry policy configured",
 *     agent_id: null,        ← always null for system decisions
 *     decision_flag: null,   ← null for pass-through decisions
 *     step_index: 852,
 *     latency_ms: 0,
 *     payload: { decision_point, input, output, reason }
 *   }
 *
 * ── TASK_HANDOFF step_index ───────────────────────────────────────────────
 *   step_index observed range: ~600–900+ (cumulative session counter)
 *   Used modulo-8 for zone cycling. from_node/to_node not present in TASK_HANDOFF.
 */

import type { VizEvent } from './VizBridge'

// ── Zone routing ───────────────────────────────────────────────────────────

const NODE_TO_ZONE: Record<string, string> = {
  // pulse.py node names
  entry:        'INTAKE',
  intake:       'INTAKE',
  ingest:       'INTAKE',
  processing:   'FORGE',
  forge:        'FORGE',
  execute:      'FORGE',
  validation:   'QA',
  qa:           'QA',
  verify:       'QA',
  routing:      'ROUTER',
  router:       'ROUTER',
  dispatch_pre: 'ROUTER',
  enrichment:   'MEMORY',
  memory:       'MEMORY',
  context:      'MEMORY',
  output:       'DISPATCH',
  dispatch:     'DISPATCH',
  deliver:      'DISPATCH',
  audit:        'AUDIT',
  log:          'AUDIT',
  record:       'AUDIT',
  hitl:         'HITL',
  human:        'HITL',
  review:       'HITL',
  // already-zone strings pass through (uppercase)
  INTAKE:       'INTAKE',
  FORGE:        'FORGE',
  QA:           'QA',
  ROUTER:       'ROUTER',
  MEMORY:       'MEMORY',
  DISPATCH:     'DISPATCH',
  AUDIT:        'AUDIT',
  HITL:         'HITL',
}

const ZONES_ORDERED = ['INTAKE', 'FORGE', 'QA', 'ROUTER', 'MEMORY', 'DISPATCH', 'AUDIT', 'HITL']

function zoneFromStepIndex(stepIndex: number): string {
  return ZONES_ORDERED[stepIndex % ZONES_ORDERED.length]
}

function toZone(node: unknown): string {
  const s = String(node ?? '')
  return NODE_TO_ZONE[s] ?? NODE_TO_ZONE[s.toLowerCase()] ?? NODE_TO_ZONE[s.toUpperCase()] ?? ''
}

function str(v: unknown, fallback = ''): string {
  return v != null ? String(v) : fallback
}

function getType(raw: Record<string, unknown>): string {
  return str(raw['event_type'] || raw['type']).toUpperCase()
}

function getPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const p = raw['payload']
  return p && typeof p === 'object' ? (p as Record<string, unknown>) : {}
}

/**
 * Resolve zone from a raw event using all available signals, in priority order:
 * 1. node/stage field → NODE_TO_ZONE
 * 2. step_index → zoneFromStepIndex
 * 3. source field hint
 * 4. INTAKE fallback
 */
export function getEventZone(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const p = getPayload(r)
  const type = getType(r)

  // Type-specific fast paths
  switch (type) {
    case 'AGENT_MOVE': {
      const z = toZone(p['to_node'])
      return z || 'INTAKE'
    }
    case 'AGENT_SPAWN':
    case 'TASK_START':
    case 'SWARM_STARTED':
      return 'INTAKE'
    case 'TASK_SUCCESS':
    case 'TASK_COMPLETE':
      return toZone(p['to_node'] || 'output') || 'DISPATCH'
    case 'TASK_FAIL':
      return 'AUDIT'
    case 'ANOMALY':
      return toZone(p['zone'] || 'AUDIT') || 'AUDIT'
    case 'TASK_HANDOFF': {
      // No node names — use step_index cycling
      const si = r['step_index']
      if (typeof si === 'number') return zoneFromStepIndex(si)
      return 'ROUTER'
    }
    case 'DECISION': {
      const si = r['step_index']
      if (typeof si === 'number') return zoneFromStepIndex(si)
      return 'QA'
    }
  }

  // Generic fallback: try any node/stage field, then step_index
  const nodeHint = r['node'] ?? r['stage'] ?? r['pipeline_step'] ?? p['to_node'] ?? p['node']
  if (nodeHint) {
    const z = toZone(nodeHint)
    if (z) return z
  }
  const si = r['step_index']
  if (typeof si === 'number') return zoneFromStepIndex(si)
  if (str(r['source']).toLowerCase().includes('hitl')) return 'HITL'
  return null
}

/**
 * Translate a raw backend WebSocket message into a VizEvent, or null to discard.
 */
export function adaptBackendEvent(raw: unknown): VizEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const type = getType(r)
  const p = getPayload(r)

  switch (type) {

    // ── Agent events ────────────────────────────────────────────────────────

    case 'AGENT_MOVE': {
      const agentId = str(p['agent_id'], 'unknown')
      const fromZone = toZone(p['from_node']) || 'INTAKE'
      const toZ = toZone(p['to_node']) || 'FORGE'
      return {
        type: 'agent_move',
        payload: { agentId, agentName: str(p['agent_name'], agentId), fromZone, toZone: toZ, state: 'moving', confidence: 0.8 },
      }
    }

    case 'AGENT_SPAWN': {
      const agentId = str(p['agent_id'], str(r['id'], 'unknown'))
      // Route to zone by step_index if available, else INTAKE
      const zone = (typeof r['step_index'] === 'number') ? zoneFromStepIndex(r['step_index'] as number) : 'INTAKE'
      return {
        type: 'agent_move',
        payload: { agentId, agentName: str(p['agent_name'], agentId), fromZone: zone, toZone: zone, state: 'working', confidence: 1.0 },
      }
    }

    // ── Task events ─────────────────────────────────────────────────────────

    case 'TASK_START':
    case 'SWARM_STARTED': {
      const taskId = str(p['task_id'] || r['trace_id'] || r['id'], `t-${Date.now()}`)
      const zone = (typeof r['step_index'] === 'number') ? zoneFromStepIndex(r['step_index'] as number) : 'INTAKE'
      return {
        type: 'task_spawn',
        payload: { taskId, taskName: str(p['task_name'] || p['task'] || taskId), zone, color: '#f59e0b' },
      }
    }

    case 'TASK_HANDOFF': {
      const taskId = str(p['task_id'], `t-${Date.now()}`)
      const zone = getEventZone(r) ?? 'ROUTER'
      // Derive fromZone from step_index - 1 to show movement
      const si = typeof r['step_index'] === 'number' ? (r['step_index'] as number) : null
      const fromZone = si != null ? zoneFromStepIndex(Math.max(0, si - 1)) : 'INTAKE'
      return {
        type: 'task_spawn',
        payload: { taskId, taskName: `Handoff ${taskId}`, zone, fromZone, color: '#6366f1' },
      }
    }

    case 'TASK_SUCCESS':
    case 'TASK_COMPLETE': {
      const taskId = str(p['task_id'] || r['trace_id'] || r['id'], '')
      const zone = toZone(p['to_node'] || 'output') || 'DISPATCH'
      return {
        type: 'task_complete',
        payload: { taskId, zone, burst: true, color: '#10b981' },
      }
    }

    case 'TASK_FAIL': {
      const taskId = str(p['task_id'] || r['trace_id'] || r['id'], '')
      return {
        type: 'task_complete',
        payload: { taskId, zone: 'AUDIT', burst: false, color: '#ef4444' },
      }
    }

    // ── Anomaly / HITL ──────────────────────────────────────────────────────

    case 'ANOMALY': {
      return {
        type: 'hitl_trigger',
        payload: {
          eventId: str(r['event_id'] || r['id']),
          agentId: str(p['agent_id']),
          zone: toZone(p['zone'] || 'AUDIT') || 'AUDIT',
          reason: str((p['details'] as Record<string, unknown>)?.['message'] || p['type'] || 'anomaly'),
          severity: str(p['severity'], 'medium'),
        },
      }
    }

    // ── Metrics snapshot → HUD update ───────────────────────────────────────
    // METRICS_SNAPSHOT payload: { timestamp, agents: [...], traces: [...] }
    // Each agent: { agent_id, latency_avg, failure_rate, throughput, is_bottleneck }

    case 'METRICS_SNAPSHOT': {
      const agents = Array.isArray(p['agents']) ? (p['agents'] as Record<string, unknown>[]) : []
      if (agents.length === 0) return null
      const active = agents.length
      const processed = agents.reduce((acc, a) => acc + (Number(a['throughput']) || 0), 0)
      const errors = agents.filter(a => (Number(a['failure_rate']) || 0) > 0).length
      const latencies = agents.map(a => Number(a['latency_avg']) || 0).filter(v => v > 0)
      const latency_ms = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null
      return {
        type: 'metrics_update',
        payload: { processed, shipped: processed, active, errors, latency_ms },
      }
    }

    // ── Decision events → feed ──────────────────────────────────────────────
    // DECISION: { decision_point, input.event_type, output, reason,
    //             decision_flag (often null), step_index, agent_id (null) }

    case 'DECISION': {
      const decisionFlag = str(r['decision_flag'] || p['decision'] || 'ALLOW')
      const decidedEventType = str((p['input'] as Record<string, unknown>)?.['event_type'] || '')
      return {
        type: 'decision',
        payload: {
          event_id: str(r['event_id'] || r['id']),
          agent_id: str(r['agent_id'] || p['agent_id'] || 'system'),
          zone: getEventZone(r) ?? 'QA',
          decision: decisionFlag.toUpperCase() || 'ALLOW',
          reason: str(r['reason'] || p['reason'] || decidedEventType || ''),
          decision_point: str(r['decision_point'] || p['decision_point'] || ''),
          latency_ms: typeof r['latency_ms'] === 'number' ? r['latency_ms'] : null,
        },
      }
    }

    // ── Discard — no viz value ───────────────────────────────────────────────

    case 'CONNECTION_ESTABLISHED':
    case 'AGENT_STATE_SNAPSHOT':
    case 'META_INSIGHT':
    case 'HEALTH_CHECK':
    case 'ACKNOWLEDGED':
      return null

    default:
      return null
  }
}
