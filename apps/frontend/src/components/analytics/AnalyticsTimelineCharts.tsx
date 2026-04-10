import {
  AnalyticsFailuresResponse,
  AnalyticsLatencyResponse,
  TimeBucketMetric,
} from '../../hooks/useAnalytics'
import './AnalyticsTimelineCharts.css'

interface AnalyticsTimelineChartsProps {
  latency: AnalyticsLatencyResponse
  failures: AnalyticsFailuresResponse
}

function chartPoints(values: number[], width: number, height: number) {
  if (values.length === 0) return ''
  const maxValue = Math.max(...values, 1)
  const step = values.length > 1 ? width / (values.length - 1) : width

  return values
    .map((value, index) => {
      const x = index * step
      const y = height - (value / maxValue) * height
      return `${x},${y}`
    })
    .join(' ')
}

function latestLabel(bucket: string | undefined) {
  if (!bucket) return 'No data'
  return new Date(bucket).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function SparklineCard({
  title,
  subtitle,
  data,
  color,
  testId,
}: {
  title: string
  subtitle: string
  data: TimeBucketMetric[]
  color: string
  testId: string
}) {
  const values = data.map((item) => item.value)
  const total = values.reduce((sum, value) => sum + value, 0)
  const latest = data[data.length - 1]

  return (
    <article className="timeline-chart-card" data-testid={testId}>
      <div className="timeline-chart-header">
        <div>
          <h4>{title}</h4>
          <p>{subtitle}</p>
        </div>
        <strong>{Math.round(total)}</strong>
      </div>
      <svg viewBox="0 0 240 72" className="timeline-chart-svg" aria-hidden="true">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={chartPoints(values, 240, 72)}
        />
      </svg>
      <span className="timeline-chart-footnote">Latest bucket {latestLabel(latest?.bucket)}</span>
    </article>
  )
}

export function AnalyticsTimelineCharts({
  latency,
  failures,
}: AnalyticsTimelineChartsProps) {
  const latencySeries = latency.latency_over_time.map((item) => ({
    bucket: item.bucket,
    value: item.average_handoff_latency_ms,
  }))

  return (
    <section className="timeline-chart-grid">
      <SparklineCard
        title="Events Per Minute"
        subtitle="Operational throughput"
        data={latency.events_per_minute}
        color="#38bdf8"
        testId="events-per-minute-chart"
      />
      <SparklineCard
        title="Failures Over Time"
        subtitle="Error spikes across the selected range"
        data={failures.failures_over_time}
        color="#f87171"
        testId="failures-over-time-chart"
      />
      <SparklineCard
        title="Latency Over Time"
        subtitle="Average handoff latency trend"
        data={latencySeries}
        color="#fbbf24"
        testId="latency-over-time-chart"
      />
    </section>
  )
}
