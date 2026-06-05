import { selectReplayEventCount, useObservabilityStore } from '../../store'
import './TruthUI.css'

export function ReplayCompareView() {
  const state = useObservabilityStore((s) => s)
  const replayCount = selectReplayEventCount(state)
  const liveCount = state.eventOrder.length
  const delta = liveCount - replayCount

  return (
    <section className="truth-widget" aria-label="Replay compare view">
      <h4>Replay Compare</h4>
      <div className="truth-widget-row">
        <span>Live Events</span>
        <span>{liveCount}</span>
      </div>
      <div className="truth-widget-row">
        <span>Replay Events</span>
        <span>{replayCount}</span>
      </div>
      <div className="truth-widget-row">
        <span>Delta</span>
        <span>{delta}</span>
      </div>
    </section>
  )
}
