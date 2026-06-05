import { useObservabilityStore } from '../../store'
import { RuntimeFocusToggle } from './RuntimeFocusToggle'
import { ContaminationWidget } from './ContaminationWidget'
import { ReplayIntegrityWidget } from './ReplayIntegrityWidget'
import { ReplayScopeBanner } from './ReplayScopeBanner'
import './TruthUI.css'

export function EngineeringModePanel() {
  const ledger = useObservabilityStore((s) => s.isolationLedger)

  return (
    <section className="truth-panel" aria-label="Engineering mode panel">
      <h3>Engineering Mode</h3>
      <p>Trace-centric visibility with provenance and isolation context.</p>
      <ReplayScopeBanner />
      <div className="truth-mode-panels">
        <RuntimeFocusToggle />
        <ContaminationWidget />
        <ReplayIntegrityWidget />
      </div>
      <div className="truth-widget" style={{ marginTop: '0.65rem' }}>
        <h4>Recent Isolation Events</h4>
        {ledger.slice(-5).map((item) => (
          <div key={`${item.event_id}-${item.timestamp}`} className="truth-widget-row">
            <span>{item.reason}</span>
            <span>{item.trace_id}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
