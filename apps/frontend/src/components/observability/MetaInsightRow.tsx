import { memo } from 'react'
import type { ObservabilityEvent } from '../../store'
import { formatTimestamp } from '../../utils/formatTimestamp'
import { MetaCategoryBadge } from './MetaCategoryBadge'
import { SeverityBadge } from './SeverityBadge'
import type { SeverityLevel } from '../../design/severityTokens'

const SEVERITY_LEVELS = new Set<string>(['LOW', 'MEDIUM', 'HIGH'])

const isSeverityLevel = (value: unknown): value is SeverityLevel =>
  typeof value === 'string' && SEVERITY_LEVELS.has(value)

type MetaInsightRowProps = {
  insight: ObservabilityEvent
}

function MetaInsightRowComponent({ insight }: MetaInsightRowProps) {
  const payload = insight.payload ?? {}
  const category = String(payload.category ?? '')
  const summary = String(payload.summary ?? '')
  const affectedAgents = Array.isArray(payload.affected_agents)
    ? (payload.affected_agents as string[])
    : undefined
  const severity = isSeverityLevel(payload.severity) ? payload.severity : undefined

  return (
    <div className="meta-insight-card" style={{ height: 72, boxSizing: 'border-box' }}>
      <div className="meta-insight-card-header">
        <MetaCategoryBadge category={category} />
        {severity ? <SeverityBadge severity={severity} /> : null}
        <span className="meta-insight-timestamp">{formatTimestamp(insight.timestamp, 'absolute')}</span>
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

export const MetaInsightRow = memo(MetaInsightRowComponent)
