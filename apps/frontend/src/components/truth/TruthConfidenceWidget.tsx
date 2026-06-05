import { useObservabilityStore } from '../../store'
import { selectTruthMixSummary } from '../../store/selectors'
import './TruthUI.css'

export function TruthConfidenceWidget() {
  const summary = selectTruthMixSummary(useObservabilityStore((s) => s))

  return (
    <section className="truth-widget" aria-label="Truth confidence widget">
      <h4>Truth Confidence</h4>
      <div className="truth-widget-grid">
        {Object.entries(summary).map(([key, value]) => (
          <div key={key} className="truth-widget-row">
            <span>{key}</span>
            <span>{value}%</span>
          </div>
        ))}
      </div>
    </section>
  )
}
