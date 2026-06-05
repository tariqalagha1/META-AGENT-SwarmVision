import { useMemo } from 'react'
import { useObservabilityStore } from '../../store'
import { TruthBadge } from './TruthBadge'
import { selectTruthMixSummary } from '../../store/selectors'
import './TruthUI.css'

export function SwarmStatusBanner() {
  const connection = useObservabilityStore((s) => s.connection)
  const summary = selectTruthMixSummary(useObservabilityStore((s) => s))

  const primary = useMemo(() => {
    const pairs = Object.entries(summary).sort((a, b) => b[1] - a[1])
    return (pairs[0]?.[0] as 'runtime' | 'replay' | 'derived' | 'synthetic' | 'mock' | 'unknown') ?? 'unknown'
  }, [summary])

  return (
    <div className="truth-banner">
      <div>
        <strong>Swarm Status</strong>
        <div>{connection === 'CONNECTED' ? 'Streaming active' : 'Streaming degraded'}</div>
      </div>
      <TruthBadge truthClass={primary} />
    </div>
  )
}
