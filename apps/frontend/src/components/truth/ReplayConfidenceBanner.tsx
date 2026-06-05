import { selectReplayConfidence, useObservabilityStore } from '../../store'
import './TruthUI.css'

export function ReplayConfidenceBanner() {
  const state = useObservabilityStore((s) => s)
  const confidence = selectReplayConfidence(state)
  return (
    <div className="truth-banner" aria-label="Replay confidence banner">
      Replay Confidence: {confidence}%
    </div>
  )
}
