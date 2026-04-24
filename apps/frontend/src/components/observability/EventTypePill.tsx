import { defaultEventTypeToken, eventTypeTokens } from '../../design/eventTypeTokens'
import './ObservabilityPanels.css'

type EventTypePillProps = {
  eventType: string
}

export function EventTypePill({ eventType }: EventTypePillProps) {
  const token = eventTypeTokens[eventType] ?? defaultEventTypeToken
  const label = eventType || 'UNKNOWN'

  return (
    <span
      className="ov-event-type-pill"
      style={{
        backgroundColor: token.background,
        color: token.color,
      }}
      title={label}
    >
      {token.icon ? <span className="ov-event-type-pill-icon">{token.icon}</span> : null}
      <span>{label}</span>
    </span>
  )
}
