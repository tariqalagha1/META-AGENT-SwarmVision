import { useMemo } from 'react'
import { useObservabilityStore } from '../../store'
import { getTraceState } from '../../store/ecosystemRuntimeStore'
import './ObservabilityPanels.css'

const STEP_ORDER = ['fetch', 'normalize', 'quality']

export function ExecutionNarrative() {
  const selectedTraceId = useObservabilityStore((s) => s.selectedTraceId)
  const selectedRequestId = useObservabilityStore((s) => s.selectedRequestId)
  const traces = useObservabilityStore((s) => s.traces)
  const events = useObservabilityStore((s) => s.events)
  const runHistory = useObservabilityStore((s) => s.runHistory)

  const traceId = selectedRequestId ?? selectedTraceId
  const runtime = useMemo(() => (traceId ? getTraceState(traceId) : null), [traceId])

  const narrative = useMemo(() => {
    if (!traceId) {
      return {
        now: 'No trace selected',
        next: 'Select a trace or run swarm',
        reason: 'Waiting for planner decision',
        retry: 'No retry required',
      }
    }

    const ids = traces[traceId] ?? []
    const traceEvents = ids.map((id) => events[id]).filter((event) => Boolean(event))
    const planner = [...traceEvents].reverse().find((event) => String(event.event_type) === 'PLANNER_DECISION')
    const retry = [...traceEvents].reverse().find((event) => String(event.event_type) === 'AGENT_STEP_RETRY')
    const currentStep = runtime?.currentStep ?? null
    const stepIndex = currentStep ? STEP_ORDER.indexOf(currentStep) : -1
    const nextStep = stepIndex >= 0 && stepIndex < STEP_ORDER.length - 1 ? STEP_ORDER[stepIndex + 1] : 'none'
    const plannerPayload = (planner?.payload ?? {}) as Record<string, unknown>
    const retryPayload = (retry?.payload ?? {}) as Record<string, unknown>
    const run = runHistory[traceId]

    return {
      now: currentStep ? `Now: executing ${currentStep}` : `Now: run ${run?.status ?? 'running'}`,
      next: nextStep === 'none' ? 'Next: finalize output' : `Next: ${nextStep}`,
      reason: `Reason: ${String(plannerPayload.reason ?? plannerPayload.decision ?? 'Planner selected default flow')}`,
      retry: retry ? `Retry: ${String(retryPayload.reason ?? retryPayload.error ?? 'retry requested')}` : 'Retry: No retry required',
    }
  }, [events, runHistory, runtime?.currentStep, traceId, traces])

  return (
    <section className="ov-panel ov-panel-narrative" aria-label="Execution narrative panel">
      <header className="ov-panel-header">
        <h2>Execution Narrative</h2>
        <p>{traceId ? `Trace ${traceId}` : 'No active trace'}</p>
      </header>
      <div className="ov-narrative-body">
        <p>{narrative.now}</p>
        <p>{narrative.next}</p>
        <p>{narrative.reason}</p>
        <p>{narrative.retry}</p>
      </div>
    </section>
  )
}
