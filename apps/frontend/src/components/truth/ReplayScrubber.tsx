import { useObservabilityStore } from '../../store'
import './TruthUI.css'

export function ReplayScrubber() {
  const replaySession = useObservabilityStore((s) => s.replaySession)
  const setReplaySession = useObservabilityStore((s) => s.setReplaySession)
  const lockReplaySession = useObservabilityStore((s) => s.lockReplaySession)
  const unlockReplaySession = useObservabilityStore((s) => s.unlockReplaySession)

  return (
    <section className="truth-widget" aria-label="Replay scrubber">
      <h4>Replay Scrubber</h4>
      <div className="truth-widget-row">
        <span>Play</span>
        <button
          type="button"
          className="ov-alert-count-pill"
          onClick={() => setReplaySession({ is_playing: !replaySession.is_playing })}
        >
          {replaySession.is_playing ? 'Pause' : 'Play'}
        </button>
      </div>
      <div className="truth-widget-row">
        <span>Lock</span>
        <button
          type="button"
          className="ov-alert-count-pill"
          onClick={() => (replaySession.locked ? unlockReplaySession() : lockReplaySession())}
        >
          {replaySession.locked ? 'Unlock' : 'Lock'}
        </button>
      </div>
    </section>
  )
}
