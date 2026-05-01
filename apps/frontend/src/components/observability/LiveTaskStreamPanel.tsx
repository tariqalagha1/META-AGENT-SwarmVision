import { useMemo } from 'react'
import { useObservabilityStore } from '../../store'
import { formatTimestamp } from '../../utils/formatTimestamp'
import { EmptyStateCard } from './EmptyStateCard'
import './ObservabilityPanels.css'

const STREAM_TYPES = new Set([
  'SWARM_STARTED',
  'PLANNER_DECISION',
  'AGENT_STEP_STARTED',
  'AGENT_STEP_COMPLETED',
  'AGENT_STEP_FAILED',
  'AGENT_STEP_RETRY',
  'SWARM_COMPLETED',
  'SWARM_FAILED',
  'SWARM_RESULT',
])

const summarizeStatus = (eventType: string) => {
  if (eventType.includes('FAILED')) return 'FAILED'
  if (eventType.includes('RETRY')) return 'RETRY'
  if (eventType.includes('COMPLETED')) return 'COMPLETED'
  if (eventType.includes('STARTED')) return 'ACTIVE'
  return 'INFO'
}

export function LiveTaskStreamPanel() {
  const selectedTraceId = useObservabilityStore((s) => s.selectedTraceId)
  const traces = useObservabilityStore((s) => s.traces)
  const events = useObservabilityStore((s) => s.events)
  const runHistory = useObservabilityStore((s) => s.runHistory)

  const streamEvents = useMemo(() => {
    if (!selectedTraceId) return []
    const history = runHistory[selectedTraceId]
    if (history && history.steps.length > 0) {
      return history.steps.map((step, index) => ({
        event_id: `${selectedTraceId}-step-${index}`,
        event_type: `AGENT_STEP_${step.status.toUpperCase()}`,
        timestamp: step.timestamp,
        payload: { step_name: step.step_name },
      }))
    }
    const ids = traces[selectedTraceId] ?? []
    return ids
      .map((id) => events[id])
      .filter((event) => Boolean(event) && STREAM_TYPES.has(String(event.event_type)))
  }, [events, runHistory, selectedTraceId, traces])

  return (
    <section className="ov-panel ov-panel-task-stream" aria-label="Live task stream panel">
      <header className="ov-panel-header">
        <div>
          <h2>Live Task Stream</h2>
          <p>{selectedTraceId ? `Trace ${selectedTraceId}` : 'Select a trace to stream events'}</p>
        </div>
        <span className="ov-alert-count-pill">{streamEvents.length}</span>
      </header>

      <div className="ov-task-stream-list">
        {!selectedTraceId ? (
          <EmptyStateCard title="No active trace selected" description="Run a swarm task or select a trace." />
        ) : streamEvents.length === 0 ? (
          <EmptyStateCard title="No swarm events yet" description="Waiting for live step events..." />
        ) : (
          streamEvents.map((event) => {
            const payload = (event.payload ?? {}) as Record<string, unknown>
            const stepName = String(payload.step_name ?? '-')
            const status = summarizeStatus(String(event.event_type ?? ''))
            const reason = String(payload.reason ?? payload.error ?? payload.decision ?? '')
            return (
              <div key={event.event_id} className="ov-task-stream-row">
                <div>{event.event_type}</div>
                <div>{stepName}</div>
                <div className="ov-task-stream-reason">{reason || '-'}</div>
                <div>{formatTimestamp(String(event.timestamp), 'relative')}</div>
                <div className={`ov-task-stream-status is-${status.toLowerCase()}`}>{status}</div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
