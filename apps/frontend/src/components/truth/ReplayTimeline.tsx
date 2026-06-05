import { useMemo } from 'react'
import { useObservabilityStore } from '../../store'
import './TruthUI.css'

export function ReplayTimeline() {
  const eventOrder = useObservabilityStore((s) => s.eventOrder)
  const events = useObservabilityStore((s) => s.events)
  const replaySession = useObservabilityStore((s) => s.replaySession)

  const range = useMemo(() => {
    const ts = eventOrder
      .map((id) => Date.parse(String(events[id]?.timestamp ?? '')))
      .filter((value) => Number.isFinite(value))
    if (ts.length === 0) return { start: null as number | null, end: null as number | null }
    return { start: Math.min(...ts), end: Math.max(...ts) }
  }, [eventOrder, events])

  return (
    <section className="truth-widget" aria-label="Replay timeline">
      <h4>Replay Timeline</h4>
      <div className="truth-widget-row">
        <span>Window</span>
        <span>
          {range.start ? new Date(range.start).toISOString() : 'n/a'} {'->'}{' '}
          {range.end ? new Date(range.end).toISOString() : 'n/a'}
        </span>
      </div>
      <div className="truth-widget-row">
        <span>Cursor</span>
        <span>{replaySession.cursor_ts ? new Date(replaySession.cursor_ts).toISOString() : 'n/a'}</span>
      </div>
    </section>
  )
}
