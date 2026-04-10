import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import './App.css'
import { useWebSocket, type WebSocketEvent } from './hooks/useWebSocket'
import { useSwarmTopology } from './hooks/useSwarmTopology'
import { useReplay } from './hooks/useReplay'
import { useAnalytics } from './hooks/useAnalytics'
import { ConnectionStatus } from './components/websocket/ConnectionStatus'
import { EventLog } from './components/websocket/EventLog'
import { SwarmFlowMap } from './components/graph/SwarmFlowMap'
import { TopologyControls } from './components/graph/TopologyControls'
import { SwarmInspector } from './components/graph/SwarmInspector'
import { SwarmFlowMap3D } from './components/graph/SwarmFlowMap3D'
import { ViewToggle, ViewMode } from './components/graph/ViewToggle'
import {
  TopologyFilters,
  FlowAgent,
  FlowEdge,
  ActiveHandoff,
} from './components/graph/types'
import { ModeToggle, type AppMode } from './components/replay/ModeToggle'
import { ReplayTimeline } from './components/replay/ReplayTimeline'
import { AnalyticsSummary } from './components/analytics/AnalyticsSummary'
import { AnalyticsTimelineCharts } from './components/analytics/AnalyticsTimelineCharts'
import { RootCausePanel } from './components/analytics/RootCausePanel'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws/events'

export default function App() {
  const queryParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const embedMode = queryParams.get('embed') === '1'
  const scopedTenantId = queryParams.get('tenant_id') ?? undefined
  const scopedAppId = queryParams.get('app_id') ?? undefined
  const scopedAppName = queryParams.get('app_name') ?? undefined
  const scopedEnvironment = queryParams.get('environment') ?? undefined
  const scopedVersion = queryParams.get('version') ?? undefined
  const [events, setEvents] = useState<WebSocketEvent[]>([])
  const [agents, setAgents] = useState<Map<string, FlowAgent>>(new Map())
  const [edges, setEdges] = useState<Map<string, FlowEdge>>(new Map())
  const [activeHandoffs, setActiveHandoffs] = useState<ActiveHandoff[]>([])
  const [mode, setMode] = useState<AppMode>('live')
  const [viewMode, setViewMode] = useState<ViewMode>('2d')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<TopologyFilters>({
    agent: '',
    state: '',
    eventType: '',
    errorsOnly: false,
    activeOnly: false,
  })
  const visualizationPanelRef = useRef<HTMLDivElement | null>(null)
  const [graphDimensions, setGraphDimensions] = useState({ width: 800, height: 400 })

  useEffect(() => {
    const panel = visualizationPanelRef.current
    if (!panel) return

    const updateDimensions = () => {
      setGraphDimensions({
        width: Math.max(320, panel.clientWidth - 32),
        height: window.innerWidth < 768 ? 320 : 420,
      })
    }

    updateDimensions()

    const resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(panel)
    window.addEventListener('resize', updateDimensions)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateDimensions)
    }
  }, [])

  const handleEvent = useCallback((event: WebSocketEvent) => {
    setEvents((prev) => [...prev, event])
  }, [])

  const handleNodeSelect = useCallback((agentId: string | null) => {
    setSelectedAgentId(agentId)
  }, [])

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  const handleFilterChange = useCallback((newFilters: TopologyFilters) => {
    setFilters(newFilters)
  }, [])

  const handleViewModeChange = useCallback((nextMode: ViewMode) => {
    setViewMode(nextMode)
  }, [])

  const { state: wsState, connect, disconnect } = useWebSocket({
    url: WS_URL,
    reconnectAttempts: 10,
    reconnectDelay: 2000,
    autoConnect: true,
    onEvent: handleEvent,
  })

  const scopedLiveEvents = useMemo(
    () =>
      events.filter((event) => {
        if (scopedTenantId && event.context?.tenant_id !== scopedTenantId) return false
        if (scopedAppId && event.context?.app_id !== scopedAppId) return false
        return true
      }),
    [events, scopedAppId, scopedTenantId]
  )

  const topologyState = useSwarmTopology({
    events: scopedLiveEvents,
    width: graphDimensions.width,
    height: graphDimensions.height,
  })

  useEffect(() => {
    setAgents(topologyState.agents)
    setEdges(topologyState.edges)
    setActiveHandoffs(topologyState.activeHandoffs)
  }, [topologyState])

  const replay = useReplay(API_BASE_URL, mode === 'replay', {
    tenantId: scopedTenantId,
    appId: scopedAppId,
  })

  useEffect(() => {
    if (mode === 'replay' && viewMode === '3d') {
      setViewMode('2d')
    }
  }, [mode, viewMode])

  useEffect(() => {
    setSelectedAgentId(null)
  }, [mode])

  const displayedAgents = mode === 'replay' ? replay.agents : agents
  const displayedEdges = mode === 'replay' ? replay.edges : edges
  const displayedHandoffs = mode === 'replay' ? [] : activeHandoffs
  const displayedEvents = mode === 'replay' ? replay.events : scopedLiveEvents
  const analyticsFromTimestamp = useMemo(() => {
    if (mode === 'replay') {
      return replay.timeline[0] ?? replay.selectedTimestamp
    }
    return new Date(Date.now() - 60 * 60 * 1000).toISOString()
  }, [mode, replay.selectedTimestamp, replay.timeline])

  const analyticsToTimestamp = useMemo(() => {
    if (mode === 'replay') {
      return replay.selectedTimestamp
    }
    return new Date().toISOString()
  }, [mode, replay.selectedTimestamp])

  const analytics = useAnalytics({
    apiBaseUrl: API_BASE_URL,
    enabled: mode === 'live' || Boolean(replay.status?.available),
    mode,
    fromTimestamp: analyticsFromTimestamp,
    toTimestamp: analyticsToTimestamp,
    tenantId: scopedTenantId,
    appId: scopedAppId,
  })

  const handleExportTopology = useCallback(() => {
    const topologyData = {
      timestamp: new Date().toISOString(),
      mode,
      replayTimestamp: replay.selectedTimestamp,
      agents: Array.from(displayedAgents.values()),
      edges: Array.from(displayedEdges.values()),
      filters,
      searchQuery,
      selectedAgentId,
    }

    const blob = new Blob([JSON.stringify(topologyData, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `swarm-topology-${new Date().toISOString().slice(0, 19)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [
    displayedAgents,
    displayedEdges,
    filters,
    mode,
    replay.selectedTimestamp,
    searchQuery,
    selectedAgentId,
  ])

  const handleExportEvents = useCallback(() => {
    const visibleEvents = displayedEvents.filter((event) => {
      if (filters.eventType && event.type !== filters.eventType) return false
      if (filters.errorsOnly && event.type !== 'TASK_FAIL') return false
      return true
    })

    const eventsData = {
      timestamp: new Date().toISOString(),
      mode,
      replayTimestamp: replay.selectedTimestamp,
      totalEvents: displayedEvents.length,
      visibleEvents: visibleEvents.length,
      filters,
      events: visibleEvents,
    }

    const blob = new Blob([JSON.stringify(eventsData, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `swarm-events-${new Date().toISOString().slice(0, 19)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [displayedEvents, filters, mode, replay.selectedTimestamp])

  const handleExportSelected = useCallback(
    (agentId: string) => {
      const agent = displayedAgents.get(agentId)
      const agentData = {
        timestamp: new Date().toISOString(),
        mode,
        replayTimestamp: replay.selectedTimestamp,
        agentId,
        agent,
      }

      const blob = new Blob([JSON.stringify(agentData, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `agent-${agentId}-${new Date().toISOString().slice(0, 19)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
    [displayedAgents, mode, replay.selectedTimestamp]
  )

  const replayAvailabilityMessage = useMemo(() => {
    if (mode !== 'replay') return null
    if (replay.status?.available) return null
    return replay.error ?? replay.status?.message ?? 'Replay data is unavailable.'
  }, [mode, replay.error, replay.status])

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>SwarmVision OS Layer</h1>
        <p className="app-subtitle">Real-time AI Agent Visualization & Monitoring</p>
        {(scopedTenantId || scopedAppId || embedMode) && (
          <div className="app-scope-bar" data-testid="app-scope-bar">
            {embedMode && <span className="scope-chip">Embedded Monitor</span>}
            {scopedTenantId && <span className="scope-chip">Tenant {scopedTenantId}</span>}
            {scopedAppId && <span className="scope-chip">App {scopedAppId}</span>}
            {scopedAppName && <span className="scope-chip">{scopedAppName}</span>}
            {scopedEnvironment && <span className="scope-chip">{scopedEnvironment}</span>}
            {scopedVersion && <span className="scope-chip">v{scopedVersion}</span>}
          </div>
        )}
      </header>

      <main className={`app-main ${embedMode ? 'app-main-embed' : ''}`}>
        {!embedMode && <div className="control-panel">
          <div className="control-buttons">
            <button
              onClick={connect}
              disabled={wsState.connected}
              className="btn btn-primary"
            >
              Connect
            </button>
            <button
              onClick={disconnect}
              disabled={!wsState.connected}
              className="btn btn-secondary"
            >
              Disconnect
            </button>
          </div>
        </div>}

        <div className="mode-toggle-panel">
          <ModeToggle mode={mode} onModeChange={setMode} />
        </div>

        {!embedMode && <div className="view-toggle-panel">
          <ViewToggle
            mode={viewMode}
            onModeChange={handleViewModeChange}
            disable3D={mode === 'replay'}
          />
        </div>}

        {mode === 'replay' && (
          <div className="replay-panel">
            <ReplayTimeline
              disabled={!replay.status?.available}
              loading={replay.loading}
              available={replay.status?.available}
              error={replayAvailabilityMessage}
              eventCount={replay.allEvents.length}
              selectedIndex={replay.selectedIndex}
              maxIndex={Math.max(replay.timeline.length - 1, -1)}
              selectedTimestamp={replay.selectedTimestamp}
              onIndexChange={replay.setSelectedIndex}
            />
          </div>
        )}

        <div className="analytics-summary-panel">
          <AnalyticsSummary
            summary={analytics.summary}
            loading={analytics.loading}
            error={analytics.error}
            mode={mode}
          />
        </div>

        <div className="analytics-timeline-panel">
          <AnalyticsTimelineCharts
            latency={analytics.latency}
            failures={analytics.failures}
          />
        </div>

        {!embedMode && <div className="topology-controls-panel">
          <TopologyControls
            events={displayedEvents}
            agents={displayedAgents}
            onSearchChange={handleSearchChange}
            onFilterChange={handleFilterChange}
            onExportTopology={handleExportTopology}
            onExportEvents={handleExportEvents}
            onExportSelected={handleExportSelected}
          />
        </div>}

        <div className="visualization-panel" ref={visualizationPanelRef}>
          {mode === 'replay' && replayAvailabilityMessage ? (
            <div className="replay-unavailable">
              <h3>Replay Mode Unavailable</h3>
              <p>{replayAvailabilityMessage}</p>
              <p>Live Mode remains fully operational.</p>
            </div>
          ) : viewMode === '2d' || mode === 'replay' ? (
            <SwarmFlowMap
              agents={displayedAgents}
              edges={displayedEdges}
              activeHandoffs={displayedHandoffs}
              healthByAgent={analytics.healthByAgent}
              width={graphDimensions.width}
              height={graphDimensions.height}
              selectedAgentId={selectedAgentId}
              searchQuery={searchQuery}
              filters={filters}
              onNodeSelect={handleNodeSelect}
            />
          ) : (
            <SwarmFlowMap3D
              agents={displayedAgents}
              edges={displayedEdges}
              activeHandoffs={displayedHandoffs}
              selectedAgentId={selectedAgentId}
              width={graphDimensions.width}
              height={graphDimensions.height}
              onNodeSelect={handleNodeSelect}
            />
          )}
        </div>

        <div className="inspector-panel">
          <div className="inspector-stack">
            <SwarmInspector
              selectedAgentId={selectedAgentId}
              agents={displayedAgents}
              edges={displayedEdges}
              events={displayedEvents}
              onClose={() => setSelectedAgentId(null)}
            />
            <RootCausePanel
              selectedAgentId={selectedAgentId}
              failures={analytics.failures}
              bottlenecks={analytics.bottlenecks}
            />
          </div>
        </div>

        {!embedMode && <div className="status-panel">
          <ConnectionStatus state={wsState} />
        </div>}

        {!embedMode && <div className="events-panel">
          <EventLog
            events={displayedEvents}
            maxItems={100}
            title={mode === 'replay' ? 'Historical Event Stream' : 'Live Event Stream'}
          />
        </div>}
      </main>

      {!embedMode && <footer className="app-footer">
        <p>
          SwarmVision Graph v0.5.0 | Phase 8: Multi-App SDK + Embeddable Monitor Layer
        </p>
      </footer>}
    </div>
  )
}
