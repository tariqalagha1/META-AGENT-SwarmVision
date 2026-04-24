import { useEffect, useMemo, useRef, useState } from 'react'
import { useObservabilityStore } from '../../store/useObservabilityStore'
import { usePausedSnapshot, useSelectedEvent } from '../../store'
import { EventTypePill } from './EventTypePill'
import { AgentIdChip } from './AgentIdChip'
import { formatTimestamp, useRelativeTimeTicker } from '../../utils/formatTimestamp'
import { focusLastDrawerTriggerElement } from './focusReturn'
import './ObservabilityPanels.css'

type JsonTreeProps = {
  label: string
  value: unknown
  depth?: number
  path?: string
}

function JsonTree({ label, value, depth = 0, path = '$' }: JsonTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set())

  const renderValue = (nextValue: unknown, currentPath: string, currentDepth: number, seen: WeakSet<object>) => {
    const shouldCollapseByDefault = currentDepth >= 2
    const isExpanded = expandedPaths.has(currentPath) || !shouldCollapseByDefault

    if (nextValue === null || typeof nextValue !== 'object') {
      return <span className="ov-json-value">{JSON.stringify(nextValue)}</span>
    }

    if (seen.has(nextValue)) {
      return <span className="ov-json-circular">[Circular]</span>
    }

    seen.add(nextValue)

    if (Array.isArray(nextValue)) {
      return (
        <div className="ov-json-group">
          <button
            type="button"
            className="ov-json-toggle"
            onClick={() => {
              setExpandedPaths((previous) => {
                const next = new Set(previous)
                if (next.has(currentPath)) next.delete(currentPath)
                else next.add(currentPath)
                return next
              })
            }}
          >
            {isExpanded ? '▾' : '▸'} [{nextValue.length}]
          </button>
          {isExpanded ? (
            <ul>
              {nextValue.map((entry, index) => (
                <li key={`${currentPath}-${index}`}>
                  {renderValue(entry, `${currentPath}[${index}]`, currentDepth + 1, seen)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )
    }

    const entries = Object.entries(nextValue)
    return (
      <div className="ov-json-group">
        <button
          type="button"
          className="ov-json-toggle"
          onClick={() => {
            setExpandedPaths((previous) => {
              const next = new Set(previous)
              if (next.has(currentPath)) next.delete(currentPath)
              else next.add(currentPath)
              return next
            })
          }}
        >
          {isExpanded ? '▾' : '▸'} {'{'}{entries.length}{'}'}
        </button>
        {isExpanded ? (
          <ul>
            {entries.map(([key, entryValue]) => (
              <li key={`${currentPath}-${key}`}>
                <span className="ov-json-key">{key}: </span>
                {renderValue(entryValue, `${currentPath}.${key}`, currentDepth + 1, seen)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

  return (
    <div className="ov-json-tree">
      <h4>{label}</h4>
      {renderValue(value, path, depth, new WeakSet<object>())}
    </div>
  )
}

export function EventDetailsDrawer() {
  const selectedEventId = useObservabilityStore((s) => s.selectedEventId)
  const clearSelectedEvent = useObservabilityStore((s) => s.clearSelectedEvent)
  const selectEvent = useObservabilityStore((s) => s.selectEvent)
  const streamMode = useObservabilityStore((s) => s.mode)
  const selectedEvent = usePausedSnapshot(useSelectedEvent(), streamMode === 'PAUSED')
  const isOpen = selectedEventId !== null

  useRelativeTimeTicker()

  const drawerRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  const closeDrawer = () => {
    clearSelectedEvent()
    focusLastDrawerTriggerElement()
  }

  useEffect(() => {
    if (!isOpen) return
    closeButtonRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDrawer()
        return
      }

      if (event.key !== 'Tab') return
      const container = drawerRef.current
      if (!container) return

      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [isOpen])

  const display = useMemo(() => {
    if (!selectedEvent) return null

    return {
      eventId: selectedEvent.event_id ?? selectedEvent.id ?? '—',
      traceId: selectedEvent.trace_id ?? '—',
      eventType: selectedEvent.type ?? selectedEvent.event_type ?? 'UNKNOWN',
      stepIndex:
        typeof selectedEvent.step_index === 'number' ? String(selectedEvent.step_index) : '—',
      parentEventId: selectedEvent.parent_event_id ?? null,
      decisionFlag: Boolean(selectedEvent.decision_flag),
      timestamp: selectedEvent.timestamp,
      agentId: selectedEvent.agent_id ?? null,
      payload: selectedEvent.payload ?? {},
      context: selectedEvent.context ?? {},
    }
  }, [selectedEvent])

  if (!isOpen || !display) return null

  return (
    <>
      <button type="button" className="ov-drawer-backdrop" onClick={closeDrawer} aria-label="Close event details" />
      <aside className="ov-drawer" ref={drawerRef} aria-label="Event details drawer">
        <header className="ov-drawer-header">
          <h3>Event Details</h3>
          <button
            type="button"
            className="ov-drawer-close"
            onClick={closeDrawer}
            ref={closeButtonRef}
          >
            Close
          </button>
        </header>

        <div className="ov-drawer-body">
          <div className="ov-field-row">
            <label>event_id</label>
            <code>{display.eventId}</code>
          </div>
          <div className="ov-field-row">
            <label>trace_id</label>
            <code>{display.traceId}</code>
          </div>
          <div className="ov-field-row">
            <label>event_type</label>
            <EventTypePill eventType={display.eventType} />
          </div>
          <div className="ov-field-row">
            <label>agent_id</label>
            <AgentIdChip agentId={display.agentId} />
          </div>
          <div className="ov-field-row">
            <label>timestamp</label>
            <div className="ov-time-display">
              <span>{formatTimestamp(display.timestamp, 'relative')}</span>
              <span>{formatTimestamp(display.timestamp, 'absolute')}</span>
            </div>
          </div>
          <div className="ov-field-row">
            <label>step_index</label>
            <span>{display.stepIndex}</span>
          </div>
          <div className="ov-field-row">
            <label>parent_event_id</label>
            {display.parentEventId ? (
              <button
                type="button"
                className="ov-link-button"
                onClick={() => selectEvent(display.parentEventId)}
              >
                {display.parentEventId}
              </button>
            ) : (
              <span>—</span>
            )}
          </div>
          <div className="ov-field-row">
            <label>decision_flag</label>
            <span className={`ov-boolean-pill ${display.decisionFlag ? 'is-true' : 'is-false'}`}>
              {display.decisionFlag ? 'true' : 'false'}
            </span>
          </div>

          <JsonTree label="payload" value={display.payload} path="$.payload" />
          <JsonTree label="context" value={display.context} path="$.context" />
        </div>
      </aside>
    </>
  )
}
