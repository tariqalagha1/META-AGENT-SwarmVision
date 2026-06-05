import type { TruthClass } from './truthTokens'
import { truthIcons, truthLabels } from './truthTokens'
import './TruthUI.css'

type TruthBadgeProps = {
  truthClass: TruthClass
  showIcon?: boolean
  showLabel?: boolean
}

export function TruthBadge({ truthClass, showIcon = true, showLabel = true }: TruthBadgeProps) {
  return (
    <span className={`truth-badge truth-${truthClass}`}>
      {showIcon ? <span className="truth-icon">{truthIcons[truthClass]}</span> : null}
      {showLabel ? <span>{truthLabels[truthClass]}</span> : null}
    </span>
  )
}
