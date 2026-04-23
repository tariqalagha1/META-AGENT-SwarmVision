import { memo, type MouseEventHandler } from 'react'
import type { WebSocketEvent } from '../../types/observability'
import { formatTimestamp } from '../../utils/formatTimestamp'
import { getSeverity } from '../../utils/severity'
import { SEVERITY_TOKENS } from '../../design/severityTokens'
import { SeverityBadge } from './SeverityBadge'
import { AgentIdChip } from './AgentIdChip'
import './ObservabilityPanels.css'

type AlertRowProps = {
  alert: WebSocketEvent
  onSelect: (alert: WebSocketEvent) => void
}

const getAnomalyType = (event: WebSocketEvent) => {
  const fromEventType = event.event_type ?? event.type
  if (fromEventType && fromEventType.trim().length > 0) return fromEventType
  const anomalyType = String(event.payload?.anomaly_type ?? '').trim()
  if (anomalyType.length > 0) return anomalyType
  return 'ANOMALY'
}

const getMessageSummary = (event: WebSocketEvent) => {
  const payloadMessage = String(event.payload?.message ?? '').trim()
  const fallback = payloadMessage.length > 0 ? payloadMessage : JSON.stringify(event.payload ?? {})
  if (fallback.length <= 80) return fallback
  return `${fallback.slice(0, 80)}...`
}

function AlertRowComponent({ alert, onSelect }: AlertRowProps) {
  const severity = getSeverity(alert)
  const token = SEVERITY_TOKENS[severity]
  const anomalyType = getAnomalyType(alert)
  const message = getMessageSummary(alert)

  const handleClick: MouseEventHandler<HTMLButtonElement> = () => {
    onSelect(alert)
  }

  return (
    <button
      type="button"
      className="ov-alert-row"
      onClick={handleClick}
      style={{ borderLeftColor: token.bg }}
    >
      <SeverityBadge severity={severity} />
      <span className="ov-alert-type" title={anomalyType}>{anomalyType}</span>
      <span className="ov-alert-agent">
        {alert.agent_id ? <AgentIdChip agentId={alert.agent_id} /> : null}
      </span>
      <span className="ov-alert-time">{formatTimestamp(alert.timestamp, 'relative')}</span>
      <span className="ov-alert-message" title={message}>{message}</span>
    </button>
  )
}

export const AlertRow = memo(AlertRowComponent)
