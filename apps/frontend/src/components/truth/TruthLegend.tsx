import { TruthBadge } from './TruthBadge'
import type { TruthClass } from './truthTokens'
import './TruthUI.css'

const truthOrder: TruthClass[] = ['runtime', 'replay', 'derived', 'synthetic', 'mock', 'unknown']

export function TruthLegend() {
  return (
    <div className="truth-legend" aria-label="Truth legend">
      {truthOrder.map((truthClass) => (
        <TruthBadge key={truthClass} truthClass={truthClass} />
      ))}
    </div>
  )
}
