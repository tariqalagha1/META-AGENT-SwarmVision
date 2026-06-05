import { selectReplayEventCount, selectReplayIntegrity, selectReplayScope, useObservabilityStore } from '../../store'
import './TruthUI.css'

export function ReplayIntegrityWidget() {
  const state = useObservabilityStore((s) => s)
  const scope = selectReplayScope(state)
  const eventCount = selectReplayEventCount(state)
  const integrity = selectReplayIntegrity(state)

  return (
    <section className="truth-widget" aria-label="Replay integrity widget">
      <h4>Replay Integrity</h4>
      <div className="truth-widget-row"><span>Replay Source</span><span>{scope.source}</span></div>
      <div className="truth-widget-row">
        <span>Recording Time</span>
        <span>{scope.cursor_ts ? new Date(scope.cursor_ts).toISOString() : 'n/a'}</span>
      </div>
      <div className="truth-widget-row"><span>Trace ID</span><span>{scope.trace_id ?? 'n/a'}</span></div>
      <div className="truth-widget-row"><span>Event Count</span><span>{eventCount}</span></div>
      <div className="truth-widget-row"><span>Integrity Status</span><span>{integrity}</span></div>
    </section>
  )
}
