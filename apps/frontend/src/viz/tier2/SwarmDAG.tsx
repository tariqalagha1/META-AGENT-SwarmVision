import { useMemo, useCallback, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeTypes,
  type FitViewOptions,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useVizStore } from '../useVizStore'
import { PIPELINE } from '../VizBridge'
import { useObservabilityStore, selectTruthMixSummary } from '../../store'
import { TruthBadge } from '../../components/truth/TruthBadge'
import { AgentNode } from './AgentNode'
import type { AgentNodeData } from './AgentNode'
import { RoomDrillDown } from '../../components/observability/RoomDrillDown'
import './SwarmDAG.css'

const NODE_TYPES: NodeTypes = { agentNode: AgentNode }

const ZONE_POSITIONS: Record<string, { x: number; y: number }> = {
  INTAKE:   { x: 100,  y: 50  },
  FORGE:    { x: 400,  y: 50  },
  QA:       { x: 700,  y: 50  },
  ROUTER:   { x: 100,  y: 250 },
  MEMORY:   { x: 400,  y: 250 },
  DISPATCH: { x: 700,  y: 250 },
  AUDIT:    { x: 250,  y: 450 },
  HITL:     { x: 550,  y: 450 },
}

const ZONE_COLORS: Record<string, string> = {
  INTAKE:   '#2dd4bf',
  FORGE:    '#f59e0b',
  QA:       '#2dd4bf',
  ROUTER:   '#f59e0b',
  MEMORY:   '#2dd4bf',
  DISPATCH: '#10b981',
  AUDIT:    '#2dd4bf',
  HITL:     '#6366f1',
}

// Map zone IDs to the RoomDrillDown config IDs (QA → QA_SCAN)
const ZONE_TO_ROOM: Record<string, string> = {
  INTAKE:   'INTAKE',
  FORGE:    'FORGE',
  QA:       'QA_SCAN',
  ROUTER:   'ROUTER',
  MEMORY:   'MEMORY',
  DISPATCH: 'DISPATCH',
  AUDIT:    'AUDIT',
  HITL:     'HITL',
}

const FIT_VIEW_OPTIONS: FitViewOptions = { padding: 0.2 }

export default function SwarmDAG() {
  const agents  = useVizStore((s) => s.agents)
  const stats   = useVizStore((s) => s.stats)
  const log     = useVizStore((s) => s.log)
  const setView = useVizStore((s) => s.setView)
  const truthSummary = selectTruthMixSummary(useObservabilityStore((s) => s))
  const primaryTruth = (Object.entries(truthSummary).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    'unknown') as 'runtime' | 'replay' | 'derived' | 'synthetic' | 'mock' | 'unknown'

  const [drillRoom, setDrillRoom] = useState<string | null>(null)

  const agentsByZone = useMemo(() => {
    const counts: Record<string, number> = {}
    agents.forEach((a) => {
      counts[a.zone] = (counts[a.zone] ?? 0) + 1
    })
    return counts
  }, [agents])

  const activeZones = useMemo(() => {
    const s = new Set<string>()
    agents.forEach((a) => { if (a.state === 'working' || a.state === 'moving') s.add(a.zone) })
    return s
  }, [agents])

  const nodes: Node[] = useMemo(() =>
    Object.keys(ZONE_POSITIONS).map((zone) => ({
      id: zone,
      type: 'agentNode',
      position: ZONE_POSITIONS[zone],
      data: {
        label: zone === 'QA' ? 'QA SCAN' : zone,
        zone,
        agentCount: agentsByZone[zone] ?? 0,
        state: activeZones.has(zone) ? 'active' : 'idle',
        color: ZONE_COLORS[zone] ?? '#2dd4bf',
        active: activeZones.has(zone),
        taskCount: agentsByZone[zone] ?? 0,
      } satisfies AgentNodeData,
    }))
  , [agentsByZone, activeZones])

  const edges: Edge[] = useMemo(() => {
    const result: Edge[] = []
    Object.entries(PIPELINE).forEach(([from, tos]) => {
      tos.forEach((to) => {
        result.push({
          id: `${from}-${to}`,
          source: from,
          target: to,
          animated: false,
          style: { stroke: '#2dd4bf', strokeWidth: 1.5, opacity: 0.35 },
        })
      })
    })
    return result
  }, [])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const roomId = ZONE_TO_ROOM[node.id]
    if (roomId) setDrillRoom(roomId)
  }, [])

  const agentList = Array.from(agents.values()).slice(0, 8)
  const displayAgentLabel = (agent: { id: string; name: string }) =>
    agent.id === agent.name ? agent.id : `${agent.id} · ${agent.name}`

  const statRows = [
    { label: 'PROCESSED', val: stats.processed,                                              color: '#2dd4bf'  },
    { label: 'SHIPPED',   val: stats.shipped,                                                 color: '#10b981'  },
    { label: 'ACTIVE',    val: stats.active,                                                  color: '#f59e0b'  },
    { label: 'ERRORS',    val: stats.errors,                                                  color: '#ef4444'  },
    { label: 'LATENCY',   val: stats.latency != null ? `${stats.latency.toFixed(1)}ms` : '—', color: '#6366f1'  },
  ]

  return (
    <div className="swarm-dag-wrapper">
      <div className="swarm-dag-canvas">
        <div className="sv-map-frame sv-map-frame--ops" aria-hidden="true">
          <div className="sv-map-frame__header">
            <span>Ops command map</span>
            <span>{agents.size} units · {log.length} log entries</span>
          </div>
          <div className="sv-map-frame__corners sv-map-frame__corners--tl" />
          <div className="sv-map-frame__corners sv-map-frame__corners--tr" />
          <div className="sv-map-frame__corners sv-map-frame__corners--bl" />
          <div className="sv-map-frame__corners sv-map-frame__corners--br" />
          <div className="sv-map-frame__scanlines" />
          <div className="sv-map-frame__micro sv-map-frame__micro--left">route sectors</div>
          <div className="sv-map-frame__micro sv-map-frame__micro--right">fit view enabled</div>
        </div>
        <div className="swarm-dag-topbar">
          <span className="swarm-dag-title">
            <span className="swarm-dag-title-main">⬡ SWARMVISION</span>
            <span className="swarm-dag-title-sub">— OPS VIEW</span>
          </span>
          <TruthBadge truthClass={primaryTruth} />
          <button
            type="button"
            className="swarm-dag-toggle"
            onClick={() => setView('demo')}
          >
            DEMO VIEW →
          </button>
          <button
            type="button"
            className="swarm-dag-toggle"
            onClick={() => setView('none')}
            style={{ marginLeft: '8px' }}
          >
            ✕ CLOSE
          </button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={FIT_VIEW_OPTIONS}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} color="#0d1420" gap={20} size={1} />
        </ReactFlow>
      </div>

      <aside className="swarm-dag-sidebar">
        <div className="swarm-dag-sidebar-section">
          <div className="swarm-dag-sidebar-title">LIVE STATS</div>
          {statRows.map((s) => (
            <div key={s.label} className="swarm-dag-stat">
              <span className="swarm-dag-stat-label">{s.label}</span>
              <span className="swarm-dag-stat-val" style={{ color: s.color }}>{s.val}</span>
            </div>
          ))}
        </div>

        {agentList.length > 0 && (
          <div className="swarm-dag-sidebar-section">
            <div className="swarm-dag-sidebar-title">AGENTS</div>
            <div className="swarm-dag-agent-list">
              {agentList.map((a) => (
                <div key={a.id} className="swarm-dag-agent-row">
                  <span
                    className="swarm-dag-agent-bar"
                    style={{ background: a.color }}
                  />
                  <span className="swarm-dag-agent-name">{displayAgentLabel(a)}</span>
                  <span className="swarm-dag-agent-zone">{a.zone}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="swarm-dag-sidebar-section">
          <div className="swarm-dag-sidebar-title">EVENT LOG</div>
          <div className="swarm-dag-log">
            {log.slice(0, 10).map((entry, i) => (
              <div
                key={entry.id}
                className="swarm-dag-log-entry"
                style={{ opacity: Math.max(0.2, 1 - i * 0.1) }}
              >
                <span className="swarm-dag-log-msg">{entry.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {drillRoom && (
        <RoomDrillDown
          roomId={drillRoom}
          onClose={() => setDrillRoom(null)}
        />
      )}
    </div>
  )
}
