import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import { useWebSocket, type WebSocketEvent } from './hooks/useWebSocket'
import { useBufferedStream } from './hooks/useBufferedStream'
import { runtimeConfig } from './config/runtime'
import { useObservabilityStore } from './store'
import { SystemGraphPanel } from './components/observability/SystemGraphPanel'
import { AlertsPanel } from './components/observability/AlertsPanel'
import { ExecutionTimelinePanel } from './components/observability/ExecutionTimelinePanel'
import { DecisionPanel } from './components/observability/DecisionPanel'
import { DiagnosticsPanel } from './components/observability/DiagnosticsPanel'
import { EventDetailsDrawer } from './components/observability/EventDetailsDrawer'
import { MetaInsightsPanel } from './components/observability/MetaInsightsPanel'
import { LiveTaskStreamPanel } from './components/observability/LiveTaskStreamPanel'
import { FinalOutputPanel } from './components/observability/FinalOutputPanel'
import { RunIntelligenceStrip } from './components/observability/RunIntelligenceStrip'
import { ExecutionNarrative } from './components/observability/ExecutionNarrative'
import { FailureCauseCard } from './components/observability/FailureCauseCard'
import { IntelligenceDataPanel } from './components/observability/IntelligenceDataPanel'
import { CommanderPanel } from './components/observability/CommanderPanel'
import { AgentEcosystemPanel } from './components/observability/AgentEcosystemPanel'
import { useVizStore } from './viz/useVizStore'
import SwarmDAG from './viz/tier2/SwarmDAG'
import PixelSim from './viz/tier3/PixelSim'
import { TopNav } from './components/TopNav/TopNav'

export type AppMode = 'observe' | 'visualize' | 'command'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8012/ws/events'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? WS_URL.replace(/^ws/i, 'http').replace(/\/(ws\/events|events|metrics|alerts|agents)$/, '')

const getChannelUrl = (base: string, channel: 'events' | 'metrics' | 'alerts' | 'agents') => {
  if (base.endsWith('/ws/events')) {
    return base.replace('/ws/events', `/${channel}`)
  }
  if (base.endsWith('/events')) {
    return base.replace('/events', `/${channel}`)
  }
  return `${base.replace(/\/$/, '')}/${channel}`
}

// ── Observe tab ────────────────────────────────────────────────────────────────
interface ObserveTabProps {
  eventsConnected: boolean
  followLatest: boolean
  onToggleFollowLatest: () => void
  tenantId?: string
  appId?: string
}

function ObserveTab({ eventsConnected, followLatest, onToggleFollowLatest, tenantId, appId }: ObserveTabProps) {
  return (
    <div className="app-tab-content observe-content">
      <RunIntelligenceStrip
        followLatest={followLatest}
        onToggleFollowLatest={onToggleFollowLatest}
      />
      {!eventsConnected && (
        <div className="app-disconnect-banner">
          Disconnected from events channel. Panels are showing the last snapshot.
        </div>
      )}
      <main className="app-main-layout">
        <section className="app-main-left app-main-graph">
          <SystemGraphPanel
            tenantId={tenantId}
            appId={appId}
            disconnected={!eventsConnected}
          />
        </section>
        <section className="app-main-right app-main-right-stack">
          <AlertsPanel />
          <ExecutionTimelinePanel disconnected={!eventsConnected} />
          <LiveTaskStreamPanel />
          <FinalOutputPanel />
          <ExecutionNarrative />
          <FailureCauseCard />
          <IntelligenceDataPanel />
          <DiagnosticsPanel apiBaseUrl={API_BASE_URL} />
          <DecisionPanel />
        </section>
      </main>
    </div>
  )
}

// ── Visualize tab ──────────────────────────────────────────────────────────────
function VisualizeTab() {
  const { t, i18n } = useTranslation()
  const activeView = useVizStore((s) => s.activeView)
  const setView    = useVizStore((s) => s.setView)
  const isRtl = i18n.language.startsWith('ar')

  return (
    <div className="app-tab-content viz-tab">
      {/* Control bar */}
      <div className="viz-tab-bar">
        <div className="viz-tab-bar-group">
          <button
            type="button"
            className={`viz-tab-btn ${activeView === 'ops' ? 'is-active' : ''}`}
            onClick={() => setView(activeView === 'ops' ? 'none' : 'ops')}
          >
            {t('viz.opsView')}
          </button>
          <button
            type="button"
            className={`viz-tab-btn ${activeView === 'demo' ? 'is-active' : ''}`}
            onClick={() => setView(activeView === 'demo' ? 'none' : 'demo')}
          >
            {t('viz.demoView')}
          </button>
        </div>
        <div className="viz-tab-bar-group">
          <SourceButtons />
        </div>
      </div>

      {/* Canvas area */}
      {activeView === 'none' && (
        <div className="viz-tab-empty" dir={isRtl ? 'rtl' : 'ltr'}>
          <span className="viz-tab-empty-hex">⬡</span>
          <p>{isRtl ? 'اختر طريقة العرض' : 'Select a view above to begin'}</p>
        </div>
      )}
      {activeView === 'ops' && (
        <div className="viz-tab-canvas">
          <SwarmDAG />
        </div>
      )}
      {activeView === 'demo' && (
        <div className="viz-tab-canvas">
          <PixelSim />
        </div>
      )}
    </div>
  )
}

function SourceButtons() {
  const { t } = useTranslation()
  const [source, setSource] = useState<'live' | 'mock'>('mock')
  const connectLive = useVizStore((s) => s.connectLive)
  const useMock = useVizStore((s) => s.useMock)

  const handleLive = () => { connectLive(); setSource('live') }
  const handleMock = () => { useMock(); setSource('mock') }

  return (
    <>
      <button
        type="button"
        className={`viz-tab-btn viz-tab-btn--live ${source === 'live' ? 'is-live' : ''}`}
        onClick={handleLive}
      >
        {t('viz.live')}
      </button>
      <button
        type="button"
        className={`viz-tab-btn viz-tab-btn--mock ${source === 'mock' ? 'is-mock' : ''}`}
        onClick={handleMock}
      >
        {t('viz.mock')}
      </button>
    </>
  )
}

// ── Command tab ────────────────────────────────────────────────────────────────
function CommandTab() {
  return (
    <div className="app-tab-content command-tab">
      <CommanderPanel />
      <MetaInsightsPanel />
    </div>
  )
}

// ── Root App ───────────────────────────────────────────────────────────────────
export default function App() {
  const { t } = useTranslation()
  const queryParams     = useMemo(() => new URLSearchParams(window.location.search), [])
  const scopedTenantId  = queryParams.get('tenant_id') ?? undefined
  const scopedAppId     = queryParams.get('app_id') ?? undefined
  const scopedAppName   = queryParams.get('app_name') ?? undefined

  const [appMode, setAppMode]           = useState<AppMode>('observe')
  const [eventMessage, setEventMessage] = useState<WebSocketEvent | null>(null)
  const [metricsMessage, setMetricsMessage]   = useState<WebSocketEvent | null>(null)
  const [alertsMessage, setAlertsMessage]     = useState<WebSocketEvent | null>(null)
  const [agentsMessage, setAgentsMessage]     = useState<WebSocketEvent | null>(null)
  const [taskInput, setTaskInput]   = useState('test pipeline execution')
  const [runPending, setRunPending] = useState(false)
  const [runError, setRunError]     = useState<string | null>(null)
  const [followLatest, setFollowLatest] = useState(true)
  const [showEcosystem, setShowEcosystem] = useState(false)

  const streamMode    = useObservabilityStore((s) => s.mode)
  const toggleMode    = useObservabilityStore((s) => s.toggleMode)
  const setConnection = useObservabilityStore((s) => s.setConnection)
  const selectTrace   = useObservabilityStore((s) => s.selectTrace)
  const selectRequest = useObservabilityStore((s) => s.selectRequest)
  const setGraphMode  = useObservabilityStore((s) => s.setGraphMode)
  const upsertRunHistoryFromApiResponse = useObservabilityStore((s) => s.upsertRunHistoryFromApiResponse)
  const eventOrder = useObservabilityStore((s) => s.eventOrder)
  const events     = useObservabilityStore((s) => s.events)

  const eventsWsUrl  = useMemo(() => getChannelUrl(WS_URL, 'events'),  [])
  const metricsWsUrl = useMemo(() => getChannelUrl(WS_URL, 'metrics'), [])
  const alertsWsUrl  = useMemo(() => getChannelUrl(WS_URL, 'alerts'),  [])
  const agentsWsUrl  = useMemo(() => getChannelUrl(WS_URL, 'agents'),  [])

  const { state: eventsWsState,  connect: connectEvents,  disconnect: disconnectEvents  } = useWebSocket({
    url: eventsWsUrl, reconnectAttempts: runtimeConfig.websocket.reconnectAttempts,
    reconnectDelay: runtimeConfig.websocket.reconnectDelayMs,
    heartbeatIntervalMs: runtimeConfig.websocket.heartbeatIntervalMs,
    reconnectBackoffMultiplier: runtimeConfig.websocket.reconnectBackoffMultiplier,
    autoConnect: true, onEvent: setEventMessage,
  })
  const { state: metricsWsState, connect: connectMetrics, disconnect: disconnectMetrics } = useWebSocket({
    url: metricsWsUrl, reconnectAttempts: runtimeConfig.websocket.reconnectAttempts,
    reconnectDelay: runtimeConfig.websocket.reconnectDelayMs,
    heartbeatIntervalMs: runtimeConfig.websocket.heartbeatIntervalMs,
    reconnectBackoffMultiplier: runtimeConfig.websocket.reconnectBackoffMultiplier,
    autoConnect: true, onEvent: setMetricsMessage,
  })
  const { state: alertsWsState,  connect: connectAlerts,  disconnect: disconnectAlerts  } = useWebSocket({
    url: alertsWsUrl, reconnectAttempts: runtimeConfig.websocket.reconnectAttempts,
    reconnectDelay: runtimeConfig.websocket.reconnectDelayMs,
    heartbeatIntervalMs: runtimeConfig.websocket.heartbeatIntervalMs,
    reconnectBackoffMultiplier: runtimeConfig.websocket.reconnectBackoffMultiplier,
    autoConnect: true, onEvent: setAlertsMessage,
  })
  const { state: agentsWsState,  connect: connectAgents,  disconnect: disconnectAgents  } = useWebSocket({
    url: agentsWsUrl, reconnectAttempts: runtimeConfig.websocket.reconnectAttempts,
    reconnectDelay: runtimeConfig.websocket.reconnectDelayMs,
    heartbeatIntervalMs: runtimeConfig.websocket.heartbeatIntervalMs,
    reconnectBackoffMultiplier: runtimeConfig.websocket.reconnectBackoffMultiplier,
    autoConnect: true, onEvent: setAgentsMessage,
  })

  useBufferedStream({
    eventMessage, metricsMessage, alertMessage: alertsMessage, agentMessage: agentsMessage,
    flushIntervalMs: 300,
  })

  const reconnectAll = useCallback(() => {
    connectEvents(); connectMetrics(); connectAlerts(); connectAgents()
  }, [connectAgents, connectAlerts, connectEvents, connectMetrics])

  const disconnectAll = useCallback(() => {
    disconnectEvents(); disconnectMetrics(); disconnectAlerts(); disconnectAgents()
  }, [disconnectAgents, disconnectAlerts, disconnectEvents, disconnectMetrics])

  const eventsConnected = eventsWsState.connected
  const channelHealth = [
    { id: 'events',  connected: eventsWsState.connected  },
    { id: 'metrics', connected: metricsWsState.connected },
    { id: 'alerts',  connected: alertsWsState.connected  },
    { id: 'agents',  connected: agentsWsState.connected  },
  ]

  useEffect(() => {
    if (eventsWsState.connected) { setConnection('CONNECTED'); return }
    if (eventsWsState.reconnectAttempts > 0) { setConnection('RECONNECTING'); return }
    setConnection('DISCONNECTED')
  }, [eventsWsState.connected, eventsWsState.reconnectAttempts, setConnection])

  useEffect(() => {
    if (!followLatest) return
    if (eventOrder.length === 0) return
    const lastEventId = eventOrder[eventOrder.length - 1]
    const lastEvent = events[lastEventId]
    if (!lastEvent) return
    if (String(lastEvent.event_type) !== 'SWARM_STARTED') return
    const traceId = String(lastEvent.trace_id ?? '')
    if (!traceId) return
    selectTrace(traceId)
    selectRequest(traceId)
  }, [eventOrder, events, followLatest, selectRequest, selectTrace])

  const runSwarm = useCallback(async () => {
    const task = taskInput.trim()
    if (!task) return
    setRunPending(true)
    setRunError(null)
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/swarm/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      })
      if (!response.ok) throw new Error(`Run failed (${response.status})`)
      const payload = (await response.json()) as {
        trace_id?: string
        status?: 'completed' | 'failed'
        steps?: Array<Record<string, unknown>>
        final_output?: unknown
      }
      const traceId = String(payload.trace_id ?? '')
      if (traceId) { selectTrace(traceId); selectRequest(traceId) }
      setGraphMode('PIPELINE')
      if (traceId) {
        upsertRunHistoryFromApiResponse({
          trace_id: traceId, task,
          status: payload.status === 'failed' ? 'failed' : 'completed',
          steps: payload.steps,
          final_output: payload.final_output ?? null,
        })
      }
    } catch (error) {
      setRunError((error as Error).message)
    } finally {
      setRunPending(false)
    }
  }, [setGraphMode, selectRequest, selectTrace, taskInput, upsertRunHistoryFromApiResponse])

  return (
    <div className="app-shell">
      <TopNav mode={appMode} onModeChange={setAppMode} />

      {/* Observe-only: subheader + channel strip + run bar */}
      {appMode === 'observe' && (
        <>
          <div className="app-subheader">
            <span className="app-scope-label">
              {scopedTenantId ? t('header.tenant', { id: scopedTenantId }) : t('header.global')}
              {scopedAppId   ? ` · ${t('header.app', { id: scopedAppId })}` : ''}
              {scopedAppName ? ` · ${scopedAppName}` : ''}
            </span>

            <div className="app-shell-controls">
              <span className={`app-mode-pill ${streamMode === 'LIVE' ? 'is-live' : 'is-paused'}`}>
                {streamMode === 'LIVE' ? t('status.live') : t('status.paused')}
              </span>
              <button type="button" className="app-action-btn" onClick={toggleMode}>
                {streamMode === 'LIVE' ? t('header.pauseVisuals') : t('header.resumeVisuals')}
              </button>
              <button
                type="button"
                className="app-ecosystem-btn"
                onClick={() => setShowEcosystem(e => !e)}
              >
                {showEcosystem ? t('header.closeEcosystem') : t('header.agentEcosystem')}
              </button>
              <button type="button" className="app-action-btn" onClick={reconnectAll}>
                {t('header.reconnect')}
              </button>
              <button type="button" className="app-action-btn" onClick={disconnectAll}>
                {t('header.disconnect')}
              </button>
            </div>
          </div>

          <div className="app-channel-strip" aria-label="Channel health">
            {channelHealth.map((ch) => (
              <span key={ch.id} className={`app-channel-pill ${ch.connected ? 'is-up' : 'is-down'}`}>
                {ch.id}
              </span>
            ))}
          </div>

          <div className="app-runbar">
            <input
              className="app-runbar-input"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder={t('runbar.placeholder')}
            />
            <button type="button" className="app-action-btn" onClick={() => void runSwarm()} disabled={runPending}>
              {runPending ? t('runbar.running') : t('runbar.run')}
            </button>
            {runError && <span className="app-runbar-error">{runError}</span>}
          </div>
        </>
      )}

      {/* Tab content */}
      {appMode === 'observe' && (
        <ObserveTab
          eventsConnected={eventsConnected}
          followLatest={followLatest}
          onToggleFollowLatest={() => setFollowLatest((c) => !c)}
          tenantId={scopedTenantId}
          appId={scopedAppId}
        />
      )}
      {appMode === 'visualize' && <VisualizeTab />}
      {appMode === 'command'   && <CommandTab />}

      <EventDetailsDrawer />

      {showEcosystem && (
        <div className="app-ecosystem-overlay">
          <AgentEcosystemPanel
            apiBaseUrl={API_BASE_URL}
            onClose={() => setShowEcosystem(false)}
          />
        </div>
      )}
    </div>
  )
}
