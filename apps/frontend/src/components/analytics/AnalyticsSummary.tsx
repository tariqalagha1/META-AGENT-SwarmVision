import { AnalyticsSummaryResponse } from '../../hooks/useAnalytics'
import './AnalyticsSummary.css'

interface AnalyticsSummaryProps {
  summary: AnalyticsSummaryResponse
  loading: boolean
  error: string | null
  mode: 'live' | 'replay'
}

function formatDuration(ms: number) {
  if (!ms) return '0 ms'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export function AnalyticsSummary({
  summary,
  loading,
  error,
  mode,
}: AnalyticsSummaryProps) {
  const cards = [
    { label: 'Total Events', value: summary.metrics.total_events },
    { label: 'Active Agents', value: summary.metrics.active_agents },
    { label: 'Failed Tasks', value: summary.metrics.failed_tasks },
    { label: 'Successful Tasks', value: summary.metrics.successful_tasks },
    {
      label: 'Avg Handoff Latency',
      value: formatDuration(summary.metrics.average_handoff_latency_ms),
    },
    {
      label: 'Peak Concurrent Agents',
      value: summary.metrics.peak_concurrent_agents,
    },
    {
      label: 'Avg Task Completion',
      value: formatDuration(summary.metrics.average_task_completion_time_ms),
    },
  ]

  return (
    <section className="analytics-summary">
      <div className="analytics-summary-header">
        <div>
          <h3>Operational Summary</h3>
          <p>
            {mode === 'live'
              ? 'Live telemetry over the active analytics window'
              : 'Replay analytics for the selected historical range'}
          </p>
        </div>
        {loading && <span className="analytics-pill">Refreshing…</span>}
        {!loading && error && <span className="analytics-pill analytics-pill-error">{error}</span>}
      </div>

      <div className="analytics-summary-grid">
        {cards.map((card) => (
          <article className="analytics-card" key={card.label}>
            <span className="analytics-card-label">{card.label}</span>
            <strong className="analytics-card-value">{card.value}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}
