import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import { useWebSocket, type WebSocketEvent } from './hooks/useWebSocket'
import { useBufferedStream } from './hooks/useBufferedStream'
import { runtimeConfig } from './config/runtime'
import { buildAuthHeaders, getRequestScope, withRequestScope } from './lib/requestContext'
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
import { useVizStore } from './viz/useVizStore'
import { TopNav } from './components/TopNav/TopNav'
import { TruthRibbon } from './components/truth/TruthRibbon'
import { SwarmStatusBanner } from './components/truth/SwarmStatusBanner'
import { selectTruthMixSummary } from './store'
import { ReplayRibbon } from './components/truth/ReplayRibbon'
import { ReplayWatermark } from './components/truth/ReplayWatermark'
import { ReplayConfidenceBanner } from './components/truth/ReplayConfidenceBanner'
import { ReplayScopeBanner } from './components/truth/ReplayScopeBanner'

export type AppMode = 'observe' | 'visualize' | 'command'

const SwarmDAG = lazy(() => import('./viz/tier2/SwarmDAG'))
const PixelSim = lazy(() => import('./viz/tier3/PixelSim'))
const TruthLegend = lazy(() => import('./components/truth/TruthLegend').then((m) => ({ default: m.TruthLegend })))
const ExecutiveModePanel = lazy(() => import('./components/truth/ExecutiveModePanel').then((m) => ({ default: m.ExecutiveModePanel })))
const EngineeringModePanel = lazy(() => import('./components/truth/EngineeringModePanel').then((m) => ({ default: m.EngineeringModePanel })))
const TruthConfidenceWidget = lazy(() => import('./components/truth/TruthConfidenceWidget').then((m) => ({ default: m.TruthConfidenceWidget })))
const ContaminationWidget = lazy(() => import('./components/truth/ContaminationWidget').then((m) => ({ default: m.ContaminationWidget })))
const ReplayTimeline = lazy(() => import('./components/truth/ReplayTimeline').then((m) => ({ default: m.ReplayTimeline })))
const ReplayScrubber = lazy(() => import('./components/truth/ReplayScrubber').then((m) => ({ default: m.ReplayScrubber })))
const ReplayCompareView = lazy(() => import('./components/truth/ReplayCompareView').then((m) => ({ default: m.ReplayCompareView })))
const ReplayIntegrityWidget = lazy(() => import('./components/truth/ReplayIntegrityWidget').then((m) => ({ default: m.ReplayIntegrityWidget })))
const AgentEcosystemPanel = lazy(() => import('./components/observability/AgentEcosystemPanel').then((m) => ({ default: m.AgentEcosystemPanel })))

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
  scopeLabel: string
  eventsConnected: boolean
  followLatest: boolean
  onToggleFollowLatest: () => void
  streamMode: string
  onToggleStreamMode: () => void
  onReconnectAll: () => void
  onDisconnectAll: () => void
  showEcosystem: boolean
  onToggleEcosystem: () => void
  taskInput: string
  onTaskInputChange: (value: string) => void
  runPending: boolean
  runError: string | null
  onRunSwarm: () => void
  channelHealth: Array<{ id: string; connected: boolean }>
  tenantId?: string
  appId?: string
  appName?: string
  authHeaders: Record<string, string>
}

function ObserveTab({
  scopeLabel,
  eventsConnected,
  followLatest,
  onToggleFollowLatest,
  streamMode,
  onToggleStreamMode,
  onReconnectAll,
  onDisconnectAll,
  showEcosystem,
  onToggleEcosystem,
  taskInput,
  onTaskInputChange,
  runPending,
  runError,
  onRunSwarm,
  channelHealth,
  tenantId,
  appId,
  appName,
  authHeaders,
}: ObserveTabProps) {
  const eventCount = useObservabilityStore((s) => s.eventOrder.length)
  const hasMockData = eventCount > 0

  return (
    <div className="app-tab-content observe-content">
      <div className="app-subheader">
        <span className="app-scope-label">{scopeLabel}</span>
      </div>
      <div className="command-center-shell">
        <aside className={`left-rail command-center-rail command-center-rail--left ${showEcosystem ? '' : 'is-collapsed'}`}>
          <div className="command-center-rail-head">
            <span>Left Swarm Rail</span>
            <button type="button" className="app-action-btn" onClick={onToggleEcosystem}>
              {showEcosystem ? 'Collapse' : 'Expand'}
            </button>
          </div>
          <div className="command-center-rail-body">
            <div className="swarm-rail-container">
              <section className="swarm-rail-slot swarm-rail-slot--primary">
                <div className="rail-slot-head">
                  <span>Primary</span>
                  <span>Unit hierarchy</span>
                </div>
                <div className="rail-slot-body">
                  {showEcosystem ? (
                    <Suspense fallback={<div className="viz-tab-empty"><p>Loading ecosystem...</p></div>}>
                      <AgentEcosystemPanel
                        apiBaseUrl={API_BASE_URL}
                        tenantId={tenantId}
                        appId={appId}
                        appName={appName}
                        authHeaders={authHeaders}
                        onClose={onToggleEcosystem}
                      />
                    </Suspense>
                  ) : (
                    <div className="viz-tab-empty">
                      <span className="viz-tab-empty-hex">⬡</span>
                      <p>Swarm unit rail collapsed</p>
                    </div>
                  )}
                </div>
              </section>
              <section className="swarm-rail-slot swarm-rail-slot--secondary">
                <div className="rail-slot-head">
                  <span>Secondary</span>
                  <span>Scope</span>
                </div>
                <div className="rail-slot-grid">
                  <span className="rail-metric-pill">{tenantId ? `tenant:${tenantId}` : 'tenant:global'}</span>
                  <span className="rail-metric-pill">{appId ? `app:${appId}` : 'app:shared'}</span>
                  <span className="rail-metric-pill">{appName ? 'scoped viewer' : 'viewer shell'}</span>
                </div>
              </section>
              <section className="swarm-rail-slot swarm-rail-slot--status">
                <div className="rail-slot-head">
                  <span>Status</span>
                  <span>Runtime</span>
                </div>
                <div className="rail-status-list">
                  <span className={`rail-status-item ${eventsConnected ? 'is-up' : 'is-down'}`}>
                    Events {eventsConnected ? 'connected' : 'offline'}
                  </span>
                  <span className={`rail-status-item ${followLatest ? 'is-up' : 'is-idle'}`}>
                    {followLatest ? 'Follow latest enabled' : 'Manual inspection'}
                  </span>
                  <span className={`rail-status-item ${showEcosystem ? 'is-up' : 'is-idle'}`}>
                    {showEcosystem ? 'Rail expanded' : 'Rail collapsed'}
                  </span>
                </div>
              </section>
            </div>
          </div>
        </aside>

        <main className="center-map-zone command-center-map">
          <div className="map-companion-layer">
            <div className="map-companion-slot map-companion-slot--header">
              <div className="command-center-rail-head">
                <div className="map-title-block">
                  <span>Center Live Swarm Map</span>
                  <small className="map-title-subtext">Primary orchestration surface</small>
                </div>
                <div className="app-shell-controls map-head-controls">
                  <span className={`app-mode-pill ${streamMode === 'LIVE' ? 'is-live' : 'is-paused'}`}>
                    {streamMode === 'LIVE' ? 'LIVE' : 'PAUSED'}
                  </span>
                  <button type="button" className="app-action-btn" onClick={onToggleStreamMode}>
                    {streamMode === 'LIVE' ? 'Pause Visuals' : 'Resume Visuals'}
                  </button>
                  <button type="button" className="app-action-btn" onClick={onReconnectAll}>
                    Reconnect
                  </button>
                  <button type="button" className="app-action-btn" onClick={onDisconnectAll}>
                    Disconnect
                  </button>
                </div>
              </div>
            </div>
            <div className="command-center-map-body">
              <div className="map-companion-slot map-companion-slot--status">
                <div className="map-status-strip">
                  <RunIntelligenceStrip
                    followLatest={followLatest}
                    onToggleFollowLatest={onToggleFollowLatest}
                  />
                </div>
              </div>
              <div className="map-companion-slot map-companion-slot--overlay">
                {!eventsConnected && !hasMockData && (
                  <div className="app-disconnect-banner">
                    Disconnected from events channel. Panels are showing the last snapshot.
                  </div>
                )}
                <div className="map-companion-surface">
                  <SystemGraphPanel
                    tenantId={tenantId}
                    appId={appId}
                    disconnected={!eventsConnected}
                  />
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside className="right-rail command-center-rail command-center-rail--right">
          <div className="command-center-rail-head">
            <span>Right Telemetry</span>
            <span className={`app-mode-pill ${eventsConnected ? 'is-live' : 'is-paused'}`}>
              {eventsConnected ? 'Connected' : 'Offline'}
            </span>
          </div>
          <div className="telemetry-stack">
            <section className="telemetry-slot telemetry-slot--critical">
              <div className="telemetry-slot-head">
                <span>Critical</span>
                <span>Alerts</span>
              </div>
              <div className="telemetry-slot-body">
                <AlertsPanel />
              </div>
            </section>
            <section className="telemetry-slot telemetry-slot--live">
              <div className="telemetry-slot-head">
                <span>Live</span>
                <span>Diagnostics + stream</span>
              </div>
              <div className="telemetry-slot-body">
                <DiagnosticsPanel
                  apiBaseUrl={API_BASE_URL}
                  tenantId={tenantId}
                  appId={appId}
                  appName={appName}
                  authHeaders={authHeaders}
                />
                <LiveTaskStreamPanel />
              </div>
            </section>
            <section className="telemetry-slot telemetry-slot--analytics">
              <div className="telemetry-slot-head">
                <span>Analytics</span>
                <span>Execution + intelligence</span>
              </div>
              <div className="telemetry-slot-body">
                <FinalOutputPanel />
                <ExecutionNarrative />
                <FailureCauseCard />
                <IntelligenceDataPanel />
              </div>
            </section>
            <section className="telemetry-slot telemetry-slot--decision">
              <div className="telemetry-slot-head">
                <span>Decision</span>
                <span>Guidance</span>
              </div>
              <div className="telemetry-slot-body">
                <DecisionPanel />
              </div>
            </section>
          </div>
        </aside>

        <footer className="bottom-dock command-center-dock">
          <div className="command-dock">
            <section className="command-dock-slot command-dock-slot--timeline">
              <div className="telemetry-slot-head">
                <span>Timeline</span>
                <span>Replay aware</span>
              </div>
              <div className="command-center-dock-section command-center-dock-section--timeline">
                <div className="command-center-dock-section-body">
                  <ExecutionTimelinePanel disconnected={!eventsConnected} />
                </div>
              </div>
            </section>

            <section className="command-dock-slot command-dock-slot--actions">
              <div className="telemetry-slot-head">
                <span>Actions</span>
                <button type="button" className="app-action-btn" onClick={onReconnectAll}>
                  Reconnect All
                </button>
              </div>
              <div className="command-center-dock-section command-center-dock-section--run">
                <div className="command-center-dock-section-body">
                  <div className="app-runbar">
                    <input
                      className="app-runbar-input"
                      value={taskInput}
                      onChange={(e) => onTaskInputChange(e.target.value)}
                      placeholder="Describe the next swarm task"
                    />
                    <button type="button" className="app-action-btn" onClick={() => void onRunSwarm()} disabled={runPending}>
                      {runPending ? 'Running…' : 'Run'}
                    </button>
                    {runError && (
                      <span className={runError.includes('mock mode') ? 'app-runbar-offline' : 'app-runbar-error'}>
                        {runError}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="command-dock-slot command-dock-slot--status">
              <div className="telemetry-slot-head">
                <span>Status</span>
                <span>{followLatest ? 'Follow latest' : 'Manual inspect'}</span>
              </div>
              <div className="command-center-dock-section command-center-dock-section--controls">
                <div className="command-center-dock-section-body">
                  <div className="app-shell-controls">
                    <span className={`app-mode-pill ${streamMode === 'LIVE' ? 'is-live' : 'is-paused'}`}>
                      {streamMode === 'LIVE' ? 'LIVE' : 'PAUSED'}
                    </span>
                    <button type="button" className="app-action-btn" onClick={onToggleStreamMode}>
                      {streamMode === 'LIVE' ? 'Pause Visuals' : 'Resume Visuals'}
                    </button>
                    <button type="button" className="app-action-btn" onClick={onToggleEcosystem}>
                      {showEcosystem ? 'Hide Swarm Rail' : 'Show Swarm Rail'}
                    </button>
                  </div>
                  <div className="app-channel-strip" aria-label="Channel health">
                    {channelHealth.map((ch) => (
                      <span key={ch.id} className={`app-channel-pill ${ch.connected ? 'is-up' : 'is-down'}`}>
                        {ch.id}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ── Visualize tab ──────────────────────────────────────────────────────────────
interface SharedPanelScopeProps {
  apiBaseUrl: string
  tenantId?: string
  appId?: string
  appName?: string
  authHeaders: Record<string, string>
  eventsConnected?: boolean
}

function VisualizeTab({
  apiBaseUrl,
  tenantId,
  appId,
  appName,
  authHeaders,
  eventsConnected = true,
}: SharedPanelScopeProps) {
  const lazyFallback = <div className="viz-tab-empty"><p>Loading visualization module...</p></div>
  const { t, i18n } = useTranslation()
  const activeView = useVizStore((s) => s.activeView)
  const setView    = useVizStore((s) => s.setView)
  const [mode, setMode] = useState<'executive' | 'engineering'>('executive')
  const [showInsights, setShowInsights] = useState(false)
  const replaySession = useObservabilityStore((s) => s.replaySession)
  const setReplaySession = useObservabilityStore((s) => s.setReplaySession)
  const truthSummary = selectTruthMixSummary(useObservabilityStore((s) => s))
  const isRtl = i18n.language.startsWith('ar')
  const primaryTruth = (Object.entries(truthSummary).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown') as
    | 'runtime'
    | 'replay'
    | 'derived'
    | 'synthetic'
    | 'mock'
    | 'unknown'

  const ribbonTitle =
    activeView === 'ops'
      ? 'OPS VIEW'
      : activeView === 'demo'
        ? 'DEMO VIEW'
        : 'VISUALIZE'

  return (
    <div className="app-tab-content viz-tab viz-command-shell">
      <section className="viz-command-main">
        <TruthRibbon
          title={ribbonTitle}
          primaryTruth={primaryTruth}
          subtitle={activeView === 'demo' ? 'Synthetic or mock entities may be visible' : 'Mixed provenance visualization'}
        />
        <ReplayRibbon timestamp={replaySession.locked ? replaySession.lock_cursor_ts : replaySession.cursor_ts} mode={replaySession.view_mode} />
        <ReplayScopeBanner />
        <ReplayConfidenceBanner />
        <SwarmStatusBanner />
        <div className="viz-context-strip">
          <div className="viz-context-strip__item">
            <span>Decision Layer</span>
            <DecisionPanel />
          </div>
          <div className="viz-context-strip__item">
            <span>Alerts</span>
            <AlertsPanel />
          </div>
        </div>
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
            <button
              type="button"
              className={`viz-tab-btn ${replaySession.view_mode === 'live' ? 'is-active' : ''}`}
              onClick={() => setReplaySession({ view_mode: 'live' })}
            >
              Live
            </button>
            <button
              type="button"
              className={`viz-tab-btn ${replaySession.view_mode === 'replay' ? 'is-active' : ''}`}
              onClick={() => setReplaySession({ view_mode: 'replay' })}
            >
              Replay
            </button>
            <button
              type="button"
              className={`viz-tab-btn ${replaySession.view_mode === 'split_compare' ? 'is-active' : ''}`}
              onClick={() => setReplaySession({ view_mode: 'split_compare' })}
            >
              Compare
            </button>
          </div>
          <div className="viz-tab-bar-group">
            <SourceButtons />
          </div>
          <div className="viz-tab-bar-group">
            <button
              type="button"
              className={`viz-tab-btn ${showInsights ? 'is-active' : ''}`}
              onClick={() => setShowInsights((prev) => !prev)}
            >
              {showInsights ? 'Hide Insights' : 'Show Insights'}
            </button>
          </div>
          <div className="viz-tab-bar-group">
            <button
              type="button"
              className={`viz-tab-btn ${mode === 'executive' ? 'is-active' : ''}`}
              onClick={() => setMode('executive')}
            >
              Executive
            </button>
            <button
              type="button"
              className={`viz-tab-btn ${mode === 'engineering' ? 'is-active' : ''}`}
              onClick={() => setMode('engineering')}
            >
              Engineering
            </button>
          </div>
        </div>
        {showInsights ? (
          <Suspense fallback={lazyFallback}>
            <TruthLegend />
          </Suspense>
        ) : null}
        {showInsights ? (
          <Suspense fallback={lazyFallback}>
            <div className="truth-mode-panels">
              <TruthConfidenceWidget />
              <ContaminationWidget />
              <ReplayTimeline />
              <ReplayScrubber />
              <ReplayIntegrityWidget />
              <ReplayCompareView />
            </div>
          </Suspense>
        ) : null}
        <ReplayWatermark active={replaySession.view_mode !== 'live'} />
        {activeView === 'none' && (
          <div className="viz-tab-empty viz-tab-empty--shell" dir={isRtl ? 'rtl' : 'ltr'}>
            <span className="viz-tab-empty-hex">⬡</span>
            <p>{isRtl ? 'اختر طريقة العرض' : 'Select a view above to begin'}</p>
          </div>
        )}
        {activeView === 'ops' && (
          <Suspense fallback={lazyFallback}>
            <div className="viz-tab-canvas">
              <SwarmDAG />
            </div>
          </Suspense>
        )}
        {activeView === 'demo' && (
          <Suspense fallback={lazyFallback}>
            <div className="viz-tab-canvas">
              <PixelSim />
            </div>
          </Suspense>
        )}
        {showInsights ? (
          <Suspense fallback={lazyFallback}>
            {mode === 'executive' ? <ExecutiveModePanel /> : <EngineeringModePanel />}
          </Suspense>
        ) : null}
      </section>
      <aside className="viz-command-sidecar">
        <section className="viz-sidecar-slot">
          <div className="telemetry-slot-head">
            <span>Diagnostics</span>
            <span>{eventsConnected ? 'Live' : 'Offline'}</span>
          </div>
          <div className="telemetry-slot-body">
            <DiagnosticsPanel
              apiBaseUrl={apiBaseUrl}
              tenantId={tenantId}
              appId={appId}
              appName={appName}
              authHeaders={authHeaders}
            />
          </div>
        </section>
        <section className="viz-sidecar-slot">
          <div className="telemetry-slot-head">
            <span>Timeline</span>
            <span>Context</span>
          </div>
          <div className="telemetry-slot-body">
            <ExecutionTimelinePanel disconnected={!eventsConnected} />
          </div>
        </section>
        <section className="viz-sidecar-slot">
          <div className="telemetry-slot-head">
            <span>Insights</span>
            <span>Tactical</span>
          </div>
          <div className="telemetry-slot-body">
            <MetaInsightsPanel />
          </div>
        </section>
      </aside>
    </div>
  )
}

function SourceButtons() {
  const { t } = useTranslation()
  const [source, setSource] = useState<'live' | 'mock'>('mock')
  const connectLive = useVizStore((s) => s.connectLive)
  const activateMock = useVizStore((s) => s.useMock)

  const handleLive = () => { connectLive(); setSource('live') }
  const handleMock = () => { activateMock(); setSource('mock') }

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
function CommandTab({
  apiBaseUrl,
  tenantId,
  appId,
  appName,
  authHeaders,
  eventsConnected = true,
}: SharedPanelScopeProps) {
  return (
    <div className="app-tab-content command-tab command-executive-shell">
      <section className="command-executive-primary">
        <CommanderPanel />
      </section>
      <section className="command-executive-secondary">
        <div className="command-executive-slot">
          <div className="telemetry-slot-head">
            <span>Execution</span>
            <span>Timeline</span>
          </div>
          <div className="telemetry-slot-body">
            <ExecutionTimelinePanel disconnected={!eventsConnected} />
          </div>
        </div>
        <div className="command-executive-slot">
          <div className="telemetry-slot-head">
            <span>Status</span>
            <span>Run state</span>
          </div>
          <div className="telemetry-slot-body">
            <FinalOutputPanel />
            <ExecutionNarrative />
          </div>
        </div>
      </section>
      <aside className="command-executive-insights">
        <div className="command-executive-slot">
          <div className="telemetry-slot-head">
            <span>Diagnostics</span>
            <span>Operational</span>
          </div>
          <div className="telemetry-slot-body">
            <DiagnosticsPanel
              apiBaseUrl={apiBaseUrl}
              tenantId={tenantId}
              appId={appId}
              appName={appName}
              authHeaders={authHeaders}
            />
          </div>
        </div>
        <div className="command-executive-slot">
          <div className="telemetry-slot-head">
            <span>Intelligence</span>
            <span>Insights</span>
          </div>
          <div className="telemetry-slot-body">
            <IntelligenceDataPanel />
            <MetaInsightsPanel />
          </div>
        </div>
      </aside>
    </div>
  )
}

// ── Root App ───────────────────────────────────────────────────────────────────
export default function App() {
  const requestScope    = useMemo(() => getRequestScope(), [])
  const scopedTenantId  = requestScope.tenantId
  const scopedAppId     = requestScope.appId
  const scopedAppName   = requestScope.appName

  const [appMode, setAppMode]           = useState<AppMode>('observe')
  const [eventMessage, setEventMessage] = useState<WebSocketEvent | null>(null)
  const [metricsMessage, setMetricsMessage]   = useState<WebSocketEvent | null>(null)
  const [alertsMessage, setAlertsMessage]     = useState<WebSocketEvent | null>(null)
  const [agentsMessage, setAgentsMessage]     = useState<WebSocketEvent | null>(null)
  const [taskInput, setTaskInput]   = useState('test pipeline execution')
  const [runPending, setRunPending] = useState(false)
  const [runError, setRunError]     = useState<string | null>(null)
  const [followLatest, setFollowLatest] = useState(true)
  const [showEcosystem, setShowEcosystem] = useState(true)

  const streamMode    = useObservabilityStore((s) => s.mode)
  const toggleMode    = useObservabilityStore((s) => s.toggleMode)
  const setConnection = useObservabilityStore((s) => s.setConnection)
  const selectTrace   = useObservabilityStore((s) => s.selectTrace)
  const selectRequest = useObservabilityStore((s) => s.selectRequest)
  const setGraphMode  = useObservabilityStore((s) => s.setGraphMode)
  const upsertRunHistoryFromApiResponse = useObservabilityStore((s) => s.upsertRunHistoryFromApiResponse)
  const eventOrder = useObservabilityStore((s) => s.eventOrder)
  const events     = useObservabilityStore((s) => s.events)

  const eventsWsUrl  = useMemo(() => withRequestScope(getChannelUrl(WS_URL, 'events'), requestScope),  [requestScope])
  const metricsWsUrl = useMemo(() => withRequestScope(getChannelUrl(WS_URL, 'metrics'), requestScope), [requestScope])
  const alertsWsUrl  = useMemo(() => withRequestScope(getChannelUrl(WS_URL, 'alerts'), requestScope),  [requestScope])
  const agentsWsUrl  = useMemo(() => withRequestScope(getChannelUrl(WS_URL, 'agents'), requestScope),  [requestScope])
  const authHeaders  = useMemo(() => buildAuthHeaders(requestScope), [requestScope])

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
      const response = await fetch(withRequestScope(`${API_BASE_URL}/api/v1/swarm/run`, requestScope), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
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
      const msg = (error as Error).message
      // Suppress connection-refused noise when backend is not running
      if (msg.includes('fetch') || msg.includes('NetworkError') || msg.includes('Failed to fetch') || msg.includes('ERR_CONNECTION_REFUSED')) {
        setRunError('Backend offline — running in mock mode')
        setTimeout(() => setRunError(null), 3000)
      } else {
        setRunError(msg)
      }
    } finally {
      setRunPending(false)
    }
  }, [
    authHeaders,
    requestScope,
    setGraphMode,
    selectRequest,
    selectTrace,
    taskInput,
    upsertRunHistoryFromApiResponse,
  ])

  return (
    <div className="app-shell">
      <TopNav
        mode={appMode}
        onModeChange={setAppMode}
        streamStatus={streamMode === 'LIVE' ? 'Runtime live' : 'Runtime paused'}
        channelSummary={`${channelHealth.filter((item) => item.connected).length}/4 channels`}
        scopeLabel={
          `${scopedTenantId ? `tenant ${scopedTenantId}` : 'tenant global'}` +
          `${scopedAppId ? ` · app ${scopedAppId}` : ''}`
        }
      />
      {appMode === 'observe' && (
        <ObserveTab
          scopeLabel={
            `${scopedTenantId ? `Tenant ${scopedTenantId}` : 'Tenant global'}` +
            `${scopedAppId ? ` · App ${scopedAppId}` : ''}` +
            `${scopedAppName ? ` · ${scopedAppName}` : ''}`
          }
          eventsConnected={eventsConnected}
          followLatest={followLatest}
          onToggleFollowLatest={() => setFollowLatest((c) => !c)}
          streamMode={streamMode}
          onToggleStreamMode={toggleMode}
          onReconnectAll={reconnectAll}
          onDisconnectAll={disconnectAll}
          showEcosystem={showEcosystem}
          onToggleEcosystem={() => setShowEcosystem((e) => !e)}
          taskInput={taskInput}
          onTaskInputChange={setTaskInput}
          runPending={runPending}
          runError={runError}
          onRunSwarm={() => void runSwarm()}
          channelHealth={channelHealth}
          tenantId={scopedTenantId}
          appId={scopedAppId}
          appName={scopedAppName}
          authHeaders={authHeaders}
        />
      )}
      {appMode === 'visualize' && (
        <VisualizeTab
          apiBaseUrl={API_BASE_URL}
          tenantId={scopedTenantId}
          appId={scopedAppId}
          appName={scopedAppName}
          authHeaders={authHeaders}
          eventsConnected={eventsConnected}
        />
      )}
      {appMode === 'command'   && (
        <CommandTab
          apiBaseUrl={API_BASE_URL}
          tenantId={scopedTenantId}
          appId={scopedAppId}
          appName={scopedAppName}
          authHeaders={authHeaders}
          eventsConnected={eventsConnected}
        />
      )}

      <EventDetailsDrawer />
    </div>
  )
}

