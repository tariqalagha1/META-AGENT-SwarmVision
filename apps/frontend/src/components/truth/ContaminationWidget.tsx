import { useObservabilityStore } from '../../store'
import './TruthUI.css'

export function ContaminationWidget() {
  const ledger = useObservabilityStore((s) => s.isolationLedger)
  const counters = useObservabilityStore((s) => s.isolationCounters)
  const blocked = Object.values(counters).reduce((sum, value) => sum + value, 0)

  return (
    <section className="truth-widget" aria-label="Contamination visibility widget">
      <h4>Contamination</h4>
      <div className="truth-widget-row">
        <span>Blocked attempts</span>
        <span>{blocked}</span>
      </div>
      <div className="truth-widget-row">
        <span>Last reason</span>
        <span>{ledger[ledger.length - 1]?.reason ?? 'none'}</span>
      </div>
    </section>
  )
}
