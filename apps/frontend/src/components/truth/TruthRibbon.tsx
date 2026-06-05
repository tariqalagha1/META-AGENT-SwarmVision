import type { TruthClass } from './truthTokens'
import { TruthBadge } from './TruthBadge'
import './TruthUI.css'

type TruthRibbonProps = {
  title: string
  primaryTruth: TruthClass
  subtitle?: string
}

export function TruthRibbon({ title, primaryTruth, subtitle }: TruthRibbonProps) {
  return (
    <div className="truth-ribbon" role="status" aria-live="polite">
      <div>
        <div className="truth-ribbon-title">{title}</div>
        {subtitle ? <div>{subtitle}</div> : null}
      </div>
      <TruthBadge truthClass={primaryTruth} />
    </div>
  )
}
