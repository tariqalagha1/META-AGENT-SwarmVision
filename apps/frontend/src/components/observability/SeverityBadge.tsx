import { SEVERITY_TOKENS, type SeverityLevel } from '../../design/severityTokens'
import './ObservabilityPanels.css'

type SeverityBadgeProps = {
  severity: SeverityLevel
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const token = SEVERITY_TOKENS[severity] ?? SEVERITY_TOKENS.LOW

  return (
    <span
      className="ov-severity-badge"
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
