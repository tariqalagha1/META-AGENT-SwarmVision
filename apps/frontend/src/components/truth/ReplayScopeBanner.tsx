import { selectReplayScope, useObservabilityStore } from '../../store'
import './TruthUI.css'

export function ReplayScopeBanner() {
  const scope = selectReplayScope(useObservabilityStore((s) => s))
  if (scope.mode === 'live') return null
  return (
    <div className="truth-banner" aria-label="Replay scope banner">
      Replay Scope: {scope.trace_id ?? 'all traces'} · source: {scope.source} · {scope.locked ? 'LOCKED' : 'UNLOCKED'}
    </div>
  )
}
