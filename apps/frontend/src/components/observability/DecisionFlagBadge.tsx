import { DECISION_FLAG_TOKENS, type DecisionFlag } from '../../design/decisionFlagTokens'
import './ObservabilityPanels.css'

type DecisionFlagBadgeProps = {
  flag: string
}

export function DecisionFlagBadge({ flag }: DecisionFlagBadgeProps) {
  const normalizedFlag = flag.trim().toUpperCase() as DecisionFlag
  const token = DECISION_FLAG_TOKENS[normalizedFlag] ?? DECISION_FLAG_TOKENS.UNKNOWN

  return (
    <span
      className="ov-decision-flag-badge"
      style={{
        backgroundColor: token.bg,
        color: token.text,
      }}
      title={token.label}
    >
      {token.label}
    </span>
  )
}
