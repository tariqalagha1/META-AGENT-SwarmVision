import {
  AnalyticsBottlenecksResponse,
  AnalyticsFailuresResponse,
} from '../../hooks/useAnalytics'
import './RootCausePanel.css'

interface RootCausePanelProps {
  selectedAgentId: string | null
  failures: AnalyticsFailuresResponse
  bottlenecks: AnalyticsBottlenecksResponse
}

function formatSeverity(value?: string) {
  if (!value) return 'healthy'
  return value.replace('_', ' ')
}

export function RootCausePanel({
  selectedAgentId,
  failures,
  bottlenecks,
}: RootCausePanelProps) {
  if (!selectedAgentId) {
    return (
      <aside className="root-cause-panel">
        <div className="root-cause-header">
          <h3>Root Cause Intelligence</h3>
        </div>
        <p className="root-cause-empty">
          Select an agent to inspect likely sources, upstream chain, and failure correlation.
        </p>
      </aside>
    )
  }

  const incident = failures.incidents.find((item) => item.agent_id === selectedAgentId)
  const diagnosis =
    bottlenecks.suspected_root_causes.find((item) => item.agent_id === selectedAgentId) ??
    bottlenecks.suspected_root_causes.find((item) =>
      item.upstream_chain.includes(selectedAgentId)
    ) ??
    null

  const upstreamChain =
    incident?.upstream_chain.length ? incident.upstream_chain : diagnosis?.upstream_chain ?? []

  return (
    <aside className="root-cause-panel" data-testid="root-cause-panel">
      <div className="root-cause-header">
        <div>
          <h3>Root Cause Intelligence</h3>
          <p>{selectedAgentId}</p>
        </div>
        <span className={`root-cause-severity ${diagnosis?.severity ?? 'healthy'}`}>
          {formatSeverity(diagnosis?.severity)}
        </span>
      </div>

      <div className="root-cause-section">
        <h4>Suspected Source Node</h4>
        <p data-testid="rca-source-node">
          {incident?.suspected_source_node ?? diagnosis?.agent_id ?? 'No elevated source detected'}
        </p>
      </div>

      <div className="root-cause-section">
        <h4>Upstream Chain</h4>
        <div className="root-cause-tags">
          {upstreamChain.length > 0 ? (
            upstreamChain.map((node) => (
              <span className="root-cause-tag" key={node}>
                {node}
              </span>
            ))
          ) : (
            <span className="root-cause-muted">No upstream chain recorded</span>
          )}
        </div>
      </div>

      <div className="root-cause-grid">
        <div>
          <span className="root-cause-label">Related Recent Failures</span>
          <strong>{incident?.related_recent_failures ?? diagnosis?.recent_failure_count ?? 0}</strong>
        </div>
        <div>
          <span className="root-cause-label">Latency Spike Correlation</span>
          <strong>{incident?.latency_spike_correlation || diagnosis?.latency_spike_correlation ? 'Yes' : 'No'}</strong>
        </div>
      </div>

      <div className="root-cause-section">
        <h4>Diagnosis</h4>
        <p>{incident?.message ?? diagnosis?.summary ?? 'No active diagnosis for this node.'}</p>
      </div>
    </aside>
  )
}
