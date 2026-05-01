import { useMemo } from 'react'
import { useObservabilityStore } from '../../store'
import './ObservabilityPanels.css'

export function FailureCauseCard() {
  const selectedTraceId = useObservabilityStore((s) => s.selectedTraceId)
  const selectedRequestId = useObservabilityStore((s) => s.selectedRequestId)
  const traces = useObservabilityStore((s) => s.traces)
  const events = useObservabilityStore((s) => s.events)

  const traceId = selectedRequestId ?? selectedTraceId

  const cause = useMemo(() => {
    if (!traceId) {
      return {
        title: 'Failure / Diagnostic Cause',
        summary: 'No trace selected',
        detail: 'Select a trace to inspect failures and diagnostics.',
        impact: 'none',
      }
    }
    const ids = traces[traceId] ?? []
    const traceEvents = ids.map((id) => events[id]).filter((event) => Boolean(event))
    const failedStep = [...traceEvents].reverse().find((event) => String(event.event_type) === 'AGENT_STEP_FAILED')
    const diagnostic = [...traceEvents].reverse().find((event) => String(event.event_type) === 'DIAGNOSTIC_RESULT')

    if (failedStep) {
      const payload = (failedStep.payload ?? {}) as Record<string, unknown>
      return {
        title: 'Failure detected',
        summary: `Failure: ${String(payload.step_name ?? failedStep.agent_id ?? 'unknown step')} failed`,
        detail: `Cause: ${String(payload.error ?? payload.reason ?? 'unknown error')}`,
        impact: 'Impact: pipeline failed',
      }
    }

    if (diagnostic) {
      const payload = (diagnostic.payload ?? {}) as Record<string, unknown>
      const unified = (payload.unified ?? {}) as Record<string, unknown>
      const enforcement = (payload.enforcement ?? {}) as Record<string, unknown>
      const verdict = String(unified.verdict ?? 'unknown')
      const block = Boolean(enforcement.block)
      const warn = Boolean(enforcement.warn)
      const trigger = String(enforcement.trigger ?? 'none')
      return {
        title: 'Diagnostics status',
        summary: `Diagnostics: ${verdict}`,
        detail: `Reason: trigger=${trigger}`,
        impact: block ? 'Impact: blocked' : warn ? 'Impact: warning' : 'Impact: no enforcement',
      }
    }

    return {
      title: 'Failure / Diagnostic Cause',
      summary: 'No failure or diagnostic issue detected',
      detail: 'System is waiting for failure or diagnostic events.',
      impact: 'none',
    }
  }, [events, traceId, traces])

  return (
    <section className="ov-panel ov-panel-cause" aria-label="Failure cause card">
      <header className="ov-panel-header">
        <h2>{cause.title}</h2>
        <p>{traceId ? `Trace ${traceId}` : 'No active trace'}</p>
      </header>
      <div className="ov-cause-body">
        <p>{cause.summary}</p>
        <p>{cause.detail}</p>
        <p>{cause.impact}</p>
      </div>
    </section>
  )
}

