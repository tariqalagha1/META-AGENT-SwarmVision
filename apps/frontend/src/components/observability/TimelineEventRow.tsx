import { memo, type MouseEventHandler } from 'react'
import type { WebSocketEvent } from '../../types/observability'
import { AgentIdChip } from './AgentIdChip'
import { EventTypePill } from './EventTypePill'
import { formatTimestamp } from '../../utils/formatTimestamp'
import { setLastDrawerTriggerElement } from './focusReturn'
import './ObservabilityPanels.css'

type TimelineEventRowProps = {
  event: WebSocketEvent
  onSelectEvent: (eventId: string) => void
}

const summarizePayload = (payload: Record<string, unknown>) => {
  const summary = JSON.stringify(payload)
  if (summary.length <= 80) return summary
  return `${summary.slice(0, 80)}…`
}

function TimelineEventRowComponent({ event, onSelectEvent }: TimelineEventRowProps) {
  const eventId = event.event_id ?? event.id
  const eventType = event.type ?? event.event_type ?? 'UNKNOWN'
  const payloadSummary = summarizePayload(event.payload ?? {})

  const handleClick: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setLastDrawerTriggerElement(evt.currentTarget)
    onSelectEvent(eventId)
  }

  return (
    <button
      type="button"
      className="ov-timeline-row"
      onClick={handleClick}
      data-event-id={eventId}
    >
      <span className="ov-timeline-row-time">{formatTimestamp(event.timestamp, 'relative')}</span>
      <EventTypePill eventType={eventType} />
      <AgentIdChip agentId={event.agent_id} />
      <span className="ov-timeline-row-summary" title={payloadSummary}>
        {payloadSummary}
      </span>
    </button>
  )
}

export const TimelineEventRow = memo(TimelineEventRowComponent)
