import { useState } from 'react'
import { useMetaInsightEvents } from '../../store'
import type { ObservabilityEvent } from '../../store'
import { formatTimestamp } from '../../utils/formatTimestamp'
import { MetaCategoryBadge } from './MetaCategoryBadge'
import { SeverityBadge } from './SeverityBadge'
import type { SeverityLevel } from '../../design/severityTokens'
import './ObservabilityPanels.css'

const SEVERITY_LEVELS = new Set<string>(['LOW', 'MEDIUM', 'HIGH'])

const isSeverityLevel = (value: unknown): value is SeverityLevel =>
  typeof value === 'string' && SEVERITY_LEVELS.has(value)

function InsightCard({ event }: { event: ObservabilityEvent }) {
  const payload = event.payload ?? {}
  const category = String(payload.category ?? '')
  const summary = String(payload.summary ?? '')
  const affectedAgents = Array.isArray(payload.affected_agents)
    ? (payload.affected_agents as string[])
    : undefined
  const severity = isSeverityLevel(payload.severity) ? payload.severity : undefined

  return (
    <div className="meta-insight-card">
      <div className="meta-insight-card-header">
        <MetaCategoryBadge category={category} />
        {severity ? <SeverityBadge severity={severity} /> : null}
        <span className="meta-insight-timestamp">{formatTimestamp(event.timestamp, 'absolute')}</span>
      </div>
      <p className="meta-insight-summary">{summary}</p>
      {affectedAgents && affectedAgents.length > 0 ? (
        <p className="meta-insight-agents">
          <span className="meta-insight-agents-label">Agents: </span>
          {affectedAgents.join(', ')}
        </p>
      ) : null}
    </div>
  )
}

export function MetaInsightsPanel() {
  const [expanded, setExpanded] = useState(false)
  const insights = useMetaInsightEvents()

  return (
    <section className="meta-insights-drawer" aria-label="Meta insights panel">
      <header className="meta-insights-drawer-header">
        <button
          type="button"
          className="meta-insights-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          Meta Insights
        </button>
        <span className="meta-insights-count-pill">{insights.length}</span>
      </header>

      {expanded ? (
        <div className="meta-insights-body">
          {insights.length === 0 ? (
            <p className="meta-insights-empty">
              No meta insights yet — analysis begins when events start streaming.
            </p>
          ) : (
            <div className="meta-insights-list">
              {insights.map((event) => (
                <InsightCard key={event.event_id} event={event} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
