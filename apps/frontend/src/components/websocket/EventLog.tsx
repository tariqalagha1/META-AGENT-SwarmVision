/**
 * EventLog Component
 * 
 * Displays a scrolling log of recent events
 */

import React from 'react'
import type { WebSocketEvent } from '../../hooks/useWebSocket'
import './EventLog.css'

export interface EventLogProps {
  events: WebSocketEvent[]
  maxItems?: number
  title?: string
}

export const EventLog: React.FC<EventLogProps> = ({
  events,
  maxItems = 50,
  title = 'Live Event Stream',
}) => {
  const displayedEvents = events.slice(-maxItems)
  const logEndRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new events arrive
  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  return (
    <div className="event-log">
      <div className="event-log-header">
        <h3>{title}</h3>
        <span className="event-count">{events.length} events</span>
      </div>
      
      <div className="event-log-container">
        {displayedEvents.length === 0 ? (
          <div className="event-log-empty">
            <p>Waiting for events...</p>
          </div>
        ) : (
          <div className="event-log-items">
            {displayedEvents.map((event, idx) => (
              <div key={idx} className={`event-log-item event-type-${event.type.toLowerCase()}`}>
                <div className="event-log-header-line">
                  <span className="event-type-badge">{event.type}</span>
                  <span className="event-source">{event.source}</span>
                  {event.context?.tenant_id && (
                    <span className="event-context-chip">Tenant {event.context.tenant_id}</span>
                  )}
                  {event.context?.app_name && (
                    <span className="event-context-chip">{event.context.app_name}</span>
                  )}
                  <span className="event-time">{new Date(event.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="event-log-content">
                  <code>{JSON.stringify(event.payload, null, 2)}</code>
                </div>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  )
}

export default EventLog
