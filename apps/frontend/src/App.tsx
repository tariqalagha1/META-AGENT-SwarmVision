import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { useWebSocket, type WebSocketEvent } from './hooks/useWebSocket'
import { useBufferedStream } from './hooks/useBufferedStream'
import { runtimeConfig } from './config/runtime'
import { useObservabilityStore } from './store'
import { SystemGraphPanel } from './components/observability/SystemGraphPanel'
import { AlertsPanel } from './components/observability/AlertsPanel'
import { ExecutionTimelinePanel } from './components/observability/ExecutionTimelinePanel'
import { DecisionPanel } from './components/observability/DecisionPanel'
import { EventDetailsDrawer } from './components/observability/EventDetailsDrawer'
import { MetaInsightsPanel } from './components/observability/MetaInsightsPanel'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8012/ws/events'

const getChannelUrl = (base: string, channel: 'events' | 'metrics' | 'alerts' | 'agents') => {
  if (base.endsWith('/ws/events')) {
    return base.replace('/ws/events', `/${channel}`)
  }
  if (base.endsWith('/events')) {
    return base.replace('/events', `/${channel}`)
  }
  return `${base.replace(/\/$/, '')}/${channel}`
}

export default function App() {
  const queryParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const scopedTenantId = queryParams.get('tenant_id') ?? undefined
  const scopedAppId = queryParams.get('app_id') ?? undefined
  const scopedAppName = queryParams.get('app_name') ?? undefined

  const [eventMessage, setEventMessage] = useState<WebSocketEvent | null>(null)
  const [metricsMessage, setMetricsMessage] = useState<WebSocketEvent | null>(null)
  const [alertsMessage, setAlertsMessage] = useState<WebSocketEvent | null>(null)
  const [agentsMessage, setAgentsMessage] = useState<WebSocketEvent | null>(null)

  const streamMode = useObservabilityStore((s) => s.mode)
  const toggleMode = useObservabilityStore((s) => s.toggleMode)
  const setConnection = useObservabilityStore((s) => s.setConnection)

  const eventsWsUrl = useMemo(() => getChannelUrl(WS_URL, 'events'), [])
  const metricsWsUrl = useMemo(() => getChannelUrl(WS_URL, 'metrics'), [])
  const alertsWsUrl = useMemo(() => getChannelUrl(WS_URL, 'alerts'), [])
  const agentsWsUrl = useMemo(() => getChannelUrl(WS_URL, 'agents'), [])

  const {
    state: eventsWsState,
    connect: connectEvents,
    disconnect: disconnectEvents,
  } = useWebSocket({
    url: eventsWsUrl,
    reconnectAttempts: runtimeConfig.websocket.reconnectAttempts,
    reconnectDelay: runtimeConfig.websocket.reconnectDelayMs,
    heartbeatIntervalMs: runtimeConfig.websocket.heartbeatIntervalMs,
    reconnectBackoffMultiplier: runtimeConfig.websocket.reconnectBackoffMultiplier,
    autoConnect: true,
    onEvent: setEventMessage,
  })

  const {
    state: metricsWsState,
    connect: connectMetrics,
    disconnect: disconnectMetrics,
  } = useWebSocket({
    url: metricsWsUrl,
    reconnectAttempts: runtimeConfig.websocket.reconnectAttempts,
    reconnectDelay: runtimeConfig.websocket.reconnectDelayMs,
    heartbeatIntervalMs: runtimeConfig.websocket.heartbeatIntervalMs,
    reconnectBackoffMultiplier: runtimeConfig.websocket.reconnectBackoffMultiplier,
    autoConnect: true,
    onEvent: setMetricsMessage,
  })

  const {
    state: alertsWsState,
    connect: connectAlerts,
    disconnect: disconnectAlerts,
  } = useWebSocket({
    url: alertsWsUrl,
    reconnectAttempts: runtimeConfig.websocket.reconnectAttempts,
    reconnectDelay: runtimeConfig.websocket.reconnectDelayMs,
    heartbeatIntervalMs: runtimeConfig.websocket.heartbeatIntervalMs,
    reconnectBackoffMultiplier: runtimeConfig.websocket.reconnectBackoffMultiplier,
    autoConnect: true,
    onEvent: setAlertsMessage,
  })

  const {
    state: agentsWsState,
    connect: connectAgents,
    disconnect: disconnectAgents,
  } = useWebSocket({
    url: agentsWsUrl,
    reconnectAttempts: runtimeConfig.websocket.reconnectAttempts,
    reconnectDelay: runtimeConfig.websocket.reconnectDelayMs,
    heartbeatIntervalMs: runtimeConfig.websocket.heartbeatIntervalMs,
    reconnectBackoffMultiplier: runtimeConfig.websocket.reconnectBackoffMultiplier,
    autoConnect: true,
    onEvent: setAgentsMessage,
  })

  useBufferedStream({
    eventMessage,
    metricsMessage,
    alertMessage: alertsMessage,
    agentMessage: agentsMessage,
    flushIntervalMs: 300,
  })

  const reconnectAll = useCallback(() => {
    connectEvents()
    connectMetrics()
    connectAlerts()
    connectAgents()
  }, [connectAgents, connectAlerts, connectEvents, connectMetrics])

  const disconnectAll = useCallback(() => {
    disconnectEvents()
    disconnectMetrics()
    disconnectAlerts()
    disconnectAgents()
  }, [disconnectAgents, disconnectAlerts, disconnectEvents, disconnectMetrics])

  const eventsConnected = eventsWsState.connected
  const channelHealth = [
    { id: 'events', connected: eventsWsState.connected },
    { id: 'metrics', connected: metricsWsState.connected },
    { id: 'alerts', connected: alertsWsState.connected },
    { id: 'agents', connected: agentsWsState.connected },
  ]

  useEffect(() => {
    if (eventsWsState.connected) {
      setConnection('CONNECTED')
      return
    }
    if (eventsWsState.reconnectAttempts > 0) {
      setConnection('RECONNECTING')
      return
    }
    setConnection('DISCONNECTED')
  }, [eventsWsState.connected, eventsWsState.reconnectAttempts, setConnection])

  return (
    <div className="app-shell">
      <header className="app-shell-header">
        <div className="app-shell-title-group">
          <h1>SwarmVision Observability</h1>
          <p>
            {scopedTenantId ? `Tenant ${scopedTenantId}` : 'Global'}
            {scopedAppId ? ` · App ${scopedAppId}` : ''}
            {scopedAppName ? ` · ${scopedAppName}` : ''}
          </p>
        </div>

        <div className="app-shell-controls">
          <span className={`app-mode-pill ${streamMode === 'LIVE' ? 'is-live' : 'is-paused'}`}>
            {streamMode}
          </span>
          <button type="button" className="app-action-btn" onClick={toggleMode}>
            {streamMode === 'LIVE' ? 'Pause visuals' : 'Resume visuals'}
          </button>
          <button type="button" className="app-action-btn" onClick={reconnectAll}>
            Reconnect
          </button>
          <button type="button" className="app-action-btn" onClick={disconnectAll}>
            Disconnect
          </button>
        </div>
      </header>

      <div className="app-channel-strip" aria-label="Channel health">
        {channelHealth.map((channel) => (
          <span key={channel.id} className={`app-channel-pill ${channel.connected ? 'is-up' : 'is-down'}`}>
            {channel.id}
          </span>
        ))}
      </div>

      {!eventsConnected ? (
        <div className="app-disconnect-banner">
          Disconnected from events channel. Panels are showing the last snapshot.
        </div>
      ) : null}

      <main className="app-main-layout">
        <section className="app-main-left app-main-graph">
          <SystemGraphPanel
            tenantId={scopedTenantId}
            appId={scopedAppId}
            disconnected={!eventsConnected}
          />
        </section>

        <section className="app-main-right app-main-right-stack">
          <AlertsPanel />
          <ExecutionTimelinePanel disconnected={!eventsConnected} />
          <DecisionPanel />
        </section>
      </main>

      <MetaInsightsPanel />

      <EventDetailsDrawer />
    </div>
  )
}
