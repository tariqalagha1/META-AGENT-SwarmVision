import { v4 as uuidv4 } from 'uuid';
import { KnowledgeGraph, KGNode, KGEdge } from '../types';
import { ScoringWindow } from '../scoring/health-scorer';

const ANOMALY_TYPES = new Set(['ANOMALY_DETECTED', 'CIRCUIT_BREAKER_OPEN', 'AGENT_TIMEOUT', 'QUEUE_OVERFLOW']);
const RETRY_TYPES   = new Set(['TASK_RETRY', 'AGENT_RETRY', 'CIRCUIT_BREAKER_HALF_OPEN']);
const HANDOFF_TYPES = new Set(['TASK_HANDOFF', 'AGENT_HANDOFF']);

export class KnowledgeGraphBuilder {

  build(window: ScoringWindow): KnowledgeGraph {
    const nodes = new Map<string, KGNode>();
    const edgeAccum = new Map<string, { from: string; to: string; kind: KGEdge['kind']; weight: number; label: string }>();

    // ── Swarm node ────────────────────────────────────────────────────────────
    nodes.set(window.swarm_id, {
      id:         window.swarm_id,
      kind:       'swarm',
      label:      `Swarm ${window.swarm_id.slice(0, 8)}`,
      weight:     window.events.length,
      state:      'active',
      is_anomaly: false,
    });

    // ── Agent + zone nodes from events ────────────────────────────────────────
    const agentEventCount  = new Map<string, number>();
    const agentLastState   = new Map<string, string>();
    const agentIsAnomaly   = new Map<string, boolean>();
    const zoneEventCount   = new Map<string, number>();
    const zoneLastState    = new Map<string, string>();
    const zoneIsAnomaly    = new Map<string, boolean>();

    for (const e of window.events) {
      agentEventCount.set(e.agent_id, (agentEventCount.get(e.agent_id) ?? 0) + 1);
      agentLastState.set(e.agent_id, e.event_type);
      if (ANOMALY_TYPES.has(e.event_type)) agentIsAnomaly.set(e.agent_id, true);

      if (e.zone_id) {
        zoneEventCount.set(e.zone_id, (zoneEventCount.get(e.zone_id) ?? 0) + 1);
        zoneLastState.set(e.zone_id, e.event_type);
        if (ANOMALY_TYPES.has(e.event_type)) zoneIsAnomaly.set(e.zone_id, true);
      }
    }

    const maxAgentEvents = Math.max(...agentEventCount.values(), 1);
    for (const [agent_id, count] of agentEventCount) {
      nodes.set(agent_id, {
        id:         agent_id,
        kind:       'agent',
        label:      agent_id,
        weight:     count / maxAgentEvents,
        state:      agentLastState.get(agent_id) ?? 'unknown',
        is_anomaly: agentIsAnomaly.get(agent_id) ?? false,
      });
    }

    const maxZoneEvents = Math.max(...zoneEventCount.values(), 1);
    for (const [zone_id, count] of zoneEventCount) {
      nodes.set(zone_id, {
        id:         zone_id,
        kind:       'zone',
        label:      zone_id,
        weight:     count / maxZoneEvents,
        state:      zoneLastState.get(zone_id) ?? 'unknown',
        is_anomaly: zoneIsAnomaly.get(zone_id) ?? false,
      });
    }

    // ── Edges from event relationships ────────────────────────────────────────

    const addEdge = (
      from: string, to: string,
      kind: KGEdge['kind'], label: string
    ) => {
      const key = `${from}→${to}|${kind}`;
      const existing = edgeAccum.get(key);
      if (existing) existing.weight++;
      else edgeAccum.set(key, { from, to, kind, weight: 1, label });
    };

    // Agent → Zone presence edges
    for (const e of window.events) {
      if (e.zone_id) addEdge(e.agent_id, e.zone_id, 'collaboration', 'operates in');
    }

    // Agent → Swarm membership
    for (const [agent_id] of agentEventCount) {
      addEdge(agent_id, window.swarm_id, 'dependency', 'member of');
    }

    // Handoff edges: agent → target agent
    for (const e of window.events.filter(ev => HANDOFF_TYPES.has(ev.event_type))) {
      const target = e.data.target_agent_id as string | undefined;
      if (target && agentEventCount.has(target)) {
        addEdge(e.agent_id, target, 'handoff', 'handoff');
      }
    }

    // Retry edges: agent → same agent (self-loop for retry pressure)
    const agentRetryCounts = new Map<string, number>();
    for (const e of window.events.filter(ev => RETRY_TYPES.has(ev.event_type))) {
      agentRetryCounts.set(e.agent_id, (agentRetryCounts.get(e.agent_id) ?? 0) + 1);
    }
    for (const [agent_id, count] of agentRetryCounts) {
      if (count >= 2) addEdge(agent_id, agent_id, 'retry', `${count} retries`);
    }

    // Anomaly propagation: if two agents in same zone both have anomalies within 5s
    const anomalyEvents = window.events.filter(e => ANOMALY_TYPES.has(e.event_type));
    for (let i = 0; i < anomalyEvents.length; i++) {
      for (let j = i + 1; j < anomalyEvents.length; j++) {
        const a = anomalyEvents[i], b = anomalyEvents[j];
        if (Math.abs(a.offset_ms - b.offset_ms) > 5000) break;
        if (a.agent_id !== b.agent_id && a.zone_id === b.zone_id) {
          addEdge(a.agent_id, b.agent_id, 'anomaly_propagation', 'co-anomaly');
        }
      }
    }

    // ── Normalize edge weights ─────────────────────────────────────────────────

    const maxEdgeWeight = Math.max(...[...edgeAccum.values()].map(e => e.weight), 1);
    const edges: KGEdge[] = [];
    for (const [, e] of edgeAccum) {
      edges.push({
        id:     uuidv4(),
        from:   e.from,
        to:     e.to,
        kind:   e.kind,
        weight: e.weight / maxEdgeWeight,
        label:  e.label,
      });
    }

    return {
      swarm_id:       window.swarm_id,
      nodes:          [...nodes.values()],
      edges,
      computed_at_ms: Date.now(),
    };
  }
}
