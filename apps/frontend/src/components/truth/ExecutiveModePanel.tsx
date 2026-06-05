import { TruthConfidenceWidget } from './TruthConfidenceWidget'
import { ContaminationWidget } from './ContaminationWidget'
import { ReplayIntegrityWidget } from './ReplayIntegrityWidget'
import { ReplayConfidenceBanner } from './ReplayConfidenceBanner'
import './TruthUI.css'

export function ExecutiveModePanel() {
  return (
    <section className="truth-panel" aria-label="Executive mode panel">
      <h3>Executive Mode</h3>
      <p>Operational summary focused on outcomes, risk, and throughput.</p>
      <ReplayConfidenceBanner />
      <div className="truth-mode-panels">
        <TruthConfidenceWidget />
        <ContaminationWidget />
        <ReplayIntegrityWidget />
      </div>
    </section>
  )
}
