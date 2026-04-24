import { memo, type MouseEventHandler } from 'react'
import { formatTimestamp } from '../../utils/formatTimestamp'
import { getDecisionFields, type DecisionEvent } from '../../utils/decision'
import { DECISION_FLAG_TOKENS } from '../../design/decisionFlagTokens'
import { DecisionFlagBadge } from './DecisionFlagBadge'
import { AgentIdChip } from './AgentIdChip'
import './ObservabilityPanels.css'

type DecisionRowProps = {
  event: DecisionEvent
  onSelect: (event: DecisionEvent) => void
}

const truncateReason = (reason: string) => {
  if (reason.length <= 120) return reason
  return `${reason.slice(0, 120)}...`
}

function formatConfidence(value: number | null) {
  if (value === null) return '—'
  return `${(value * 100).toFixed(0)}%`
}

function DecisionRowComponent({ event, onSelect }: DecisionRowProps) {
  const fields = getDecisionFields(event)
  const token = DECISION_FLAG_TOKENS[fields.flag]
  const confidenceLabel = formatConfidence(fields.confidence)
  const reasonLabel = truncateReason(fields.reason)

  const handleClick: MouseEventHandler<HTMLButtonElement> = () => {
    onSelect(event)
  }

  return (
    <button
      type="button"
      className="ov-decision-row"
      onClick={handleClick}
      style={{ borderLeftColor: token.bg }}
    >
      <DecisionFlagBadge flag={fields.flag} />
      <span className="ov-decision-point" title={fields.decisionPoint}>{fields.decisionPoint}</span>
      <span className="ov-decision-reason" title={fields.reason}>{reasonLabel}</span>
      <span className="ov-decision-agent">
        {event.agent_id ? <AgentIdChip agentId={event.agent_id} /> : null}
      </span>
      <span className="ov-decision-confidence">{confidenceLabel}</span>
      <span className="ov-decision-time">{formatTimestamp(event.timestamp, 'relative')}</span>
    </button>
  )
}

export const DecisionRow = memo(DecisionRowComponent)
