import './TruthUI.css'

type ReplayWatermarkProps = {
  active: boolean
}

export function ReplayWatermark({ active }: ReplayWatermarkProps) {
  if (!active) return null
  return <div className="truth-banner">REPLAY MODE - HISTORICAL DATA</div>
}
