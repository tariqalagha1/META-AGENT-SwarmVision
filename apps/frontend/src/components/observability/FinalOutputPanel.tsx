import { useMemo } from 'react'
import { useObservabilityStore } from '../../store'
import { EmptyStateCard } from './EmptyStateCard'
import './ObservabilityPanels.css'

const STEP_EVENT_TYPES = new Set(['AGENT_STEP_COMPLETED', 'AGENT_STEP_FAILED', 'AGENT_STEP_RETRY'])

export function FinalOutputPanel() {
  const selectedTraceId = useObservabilityStore((s) => s.selectedTraceId)
  const traces = useObservabilityStore((s) => s.traces)
  const events = useObservabilityStore((s) => s.events)
  const runHistory = useObservabilityStore((s) => s.runHistory)

  const summary = useMemo(() => {
    if (!selectedTraceId) return null
    const history = runHistory[selectedTraceId]
    if (history) {
      const completedSteps = history.steps.filter((step) => step.status === 'completed').length
      const failedSteps = history.steps.filter((step) => step.status === 'failed').length
      const retrySteps = history.steps.filter((step) => step.status === 'retry').length
      return {
        status: history.status,
        completedSteps,
        failedSteps,
        retrySteps,
        degraded: history.degraded,
        finalPayload: history.final_output,
      }
    }
    const ids = traces[selectedTraceId] ?? []
    const traceEvents = ids.map((id) => events[id]).filter(Boolean)
    const completed = traceEvents.find((e) => e.event_type === 'SWARM_COMPLETED')
    const failed = traceEvents.find((e) => e.event_type === 'SWARM_FAILED')
    const stepEvents = traceEvents.filter((e) => STEP_EVENT_TYPES.has(String(e.event_type)))
    const completedSteps = stepEvents.filter((e) => e.event_type === 'AGENT_STEP_COMPLETED').length
    const failedSteps = stepEvents.filter((e) => e.event_type === 'AGENT_STEP_FAILED').length
    const retrySteps = stepEvents.filter((e) => e.event_type === 'AGENT_STEP_RETRY').length

    const latestCompletedStep = [...stepEvents]
      .reverse()
      .find((e) => e.event_type === 'AGENT_STEP_COMPLETED')
    const latestPayload = (latestCompletedStep?.payload ?? {}) as Record<string, unknown>
    const finalPayload = (latestPayload.output ?? null) as unknown

    return {
      status: failed ? 'failed' : completed ? 'completed' : 'running',
      completedSteps,
      failedSteps,
      retrySteps,
      degraded: retrySteps > 0 && !failed,
      finalPayload,
    }
  }, [events, runHistory, selectedTraceId, traces])

  return (
    <section className="ov-panel ov-panel-final-output" aria-label="Final output panel">
      <header className="ov-panel-header">
        <div>
          <h2>Final Output</h2>
          <p>{selectedTraceId ? `Trace ${selectedTraceId}` : 'No trace selected'}</p>
        </div>
      </header>

      <div className="ov-final-output-body">
        {!selectedTraceId || !summary ? (
          <EmptyStateCard title="No run selected" description="Run a task to inspect final output." />
        ) : (
          <>
            <div className="ov-final-output-grid">
              <div><span>Status</span><strong className={`is-${summary.status}`}>{summary.status.toUpperCase()}</strong></div>
              <div><span>Completed Steps</span><strong>{summary.completedSteps}</strong></div>
              <div><span>Failed Steps</span><strong>{summary.failedSteps}</strong></div>
              <div><span>Degraded</span><strong>{summary.degraded ? 'YES' : 'NO'}</strong></div>
            </div>
            <pre className="ov-final-output-pre">{JSON.stringify(summary.finalPayload, null, 2)}</pre>
          </>
        )}
      </div>
    </section>
  )
}
