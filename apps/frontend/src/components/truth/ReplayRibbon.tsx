import './TruthUI.css'

type ReplayRibbonProps = {
  timestamp: number | null
  mode: 'live' | 'replay' | 'split_compare'
}

export function ReplayRibbon({ timestamp, mode }: ReplayRibbonProps) {
  if (mode === 'live') return null
  const ts = timestamp ? new Date(timestamp).toISOString() : 'n/a'
  return (
    <div className="truth-ribbon" aria-label="Replay ribbon">
      <div className="truth-ribbon-title">
        {mode === 'split_compare' ? 'SPLIT COMPARE: LIVE vs REPLAY' : `REPLAY @ ${ts}`}
      </div>
    </div>
  )
}
