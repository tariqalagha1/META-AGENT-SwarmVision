import { useState, useMemo } from 'react'
import { FixedSizeList, type ListChildComponentProps } from 'react-window'
import { useAnomalyEvents, useObservabilityStore, usePausedSnapshot } from '../../store'
import type { WebSocketEvent } from '../../types/observability'
import { EmptyStateCard } from './EmptyStateCard'
import { AlertRow } from './AlertRow'
import './ObservabilityPanels.css'

const VIRTUALIZATION_THRESHOLD = 150
const ALERT_ROW_HEIGHT = 48
const ALERT_CAP = 500

type AlertRowData = {
  alerts: WebSocketEvent[]
  onSelectAlert: (alert: WebSocketEvent) => void
}

function VirtualizedAlertRow({ index, style, data }: ListChildComponentProps<AlertRowData>) {
  const alert = data.alerts[index]
  if (!alert) return null

  return (
    <div style={style}>
      <AlertRow alert={alert} onSelect={data.onSelectAlert} />
    </div>
  )
}

export function AlertsPanel() {
  const [showEmptyDetails, setShowEmptyDetails] = useState(false)
  const connection = useObservabilityStore((s) => s.connection)
  const streamMode = useObservabilityStore((s) => s.mode)
  const selectEvent = useObservabilityStore((s) => s.selectEvent)
  const selectTrace = useObservabilityStore((s) => s.selectTrace)
  const selectAgent = useObservabilityStore((s) => s.selectAgent)

  const rawAlerts = useAnomalyEvents()
  const alerts = usePausedSnapshot(rawAlerts, streamMode === 'PAUSED')

  const visibleAlerts = useMemo(
    () =>
      alerts
        .slice()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, ALERT_CAP),
    [alerts]
  )

  const hasAlerts = visibleAlerts.length > 0
  const disconnected = connection !== 'CONNECTED'

  const handleSelectAlert = (event: WebSocketEvent) => {
    const eventId = event.event_id ?? event.id
    selectEvent(eventId)

    if (event.trace_id) {
      selectTrace(event.trace_id)
    }

    if (event.agent_id) {
      selectAgent(event.agent_id)
    }
  }

  if (disconnected && !hasAlerts) {
    return (
      <section className="ov-panel ov-panel-alerts" aria-label="Alerts panel">
        <header className="ov-panel-header ov-alerts-header">
          <h2>Alerts</h2>
          <span className="ov-alert-count-pill">0</span>
        </header>
        <EmptyStateCard
          title="Alerts unavailable — connection lost"
          description="Reconnect to resume anomaly monitoring."
        />
      </section>
    )
  }

  if (!hasAlerts) {
    return (
      <section
        className={`ov-panel ov-panel-alerts ${showEmptyDetails ? '' : 'ov-panel-alerts-collapsed'}`}
        aria-label="Alerts panel"
      >
        <header className="ov-panel-header ov-alerts-header">
          <button
            type="button"
            className="ov-alerts-toggle"
            onClick={() => setShowEmptyDetails((current) => !current)}
          >
            Alerts
          </button>
          <span className="ov-alert-count-pill">0</span>
        </header>

        {showEmptyDetails ? (
          <EmptyStateCard
            title="No anomalies detected"
            description="Alerts will appear here when anomaly events are emitted."
          />
        ) : null}
      </section>
    )
  }

  const rowData: AlertRowData = {
    alerts: visibleAlerts,
    onSelectAlert: handleSelectAlert,
  }

  return (
    <section className="ov-panel ov-panel-alerts" aria-label="Alerts panel">
      <header className="ov-panel-header ov-alerts-header">
        <h2>Alerts</h2>
        <div className="ov-alerts-header-right">
          {disconnected ? <span className="ov-alerts-disconnected">Disconnected</span> : null}
          <span className="ov-alert-count-pill">{visibleAlerts.length}</span>
        </div>
      </header>

      <div className="ov-alert-list" role="list">
        {visibleAlerts.length > VIRTUALIZATION_THRESHOLD ? (
          <FixedSizeList
            height={Math.min(336, visibleAlerts.length * ALERT_ROW_HEIGHT)}
            width="100%"
            itemCount={visibleAlerts.length}
            itemData={rowData}
            itemSize={ALERT_ROW_HEIGHT}
          >
            {VirtualizedAlertRow}
          </FixedSizeList>
        ) : (
          <>
            {visibleAlerts.map((alert) => {
              const eventId = alert.event_id ?? alert.id
              return <AlertRow key={eventId} alert={alert} onSelect={handleSelectAlert} />
            })}
          </>
        )}
      </div>
    </section>
  )
}
