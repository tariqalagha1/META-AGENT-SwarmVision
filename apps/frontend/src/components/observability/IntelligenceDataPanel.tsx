import { useMemo } from 'react'
import { useObservabilityStore } from '../../store'
import { EmptyStateCard } from './EmptyStateCard'
import './ObservabilityPanels.css'

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const readStepName = (payload: Record<string, unknown>, fallback: string | null | undefined) =>
  String(payload.step_name ?? payload.step ?? fallback ?? '-')

export function IntelligenceDataPanel() {
  const selectedTraceId = useObservabilityStore((s) => s.selectedTraceId)
  const selectedEventId = useObservabilityStore((s) => s.selectedEventId)
  const traces = useObservabilityStore((s) => s.traces)
  const events = useObservabilityStore((s) => s.events)
  const runHistory = useObservabilityStore((s) => s.runHistory)

  const model = useMemo(() => {
    if (!selectedTraceId) return null
    const ids = traces[selectedTraceId] ?? []
    const traceEvents = ids.map((id) => events[id]).filter(Boolean)
    const history = runHistory[selectedTraceId]
    const selectedEvent = selectedEventId ? events[selectedEventId] : null

    const plannerEvent = [...traceEvents].reverse().find((e) => String(e.event_type) === 'PLANNER_DECISION')
    const retryEvents = traceEvents.filter((e) => String(e.event_type) === 'AGENT_STEP_RETRY')
    const diagnosticEvent = [...traceEvents].reverse().find((e) => String(e.event_type) === 'DIAGNOSTIC_RESULT')
    const resultEvent = [...traceEvents].reverse().find((e) => String(e.event_type) === 'SWARM_RESULT')
    const failedStepEvent = [...traceEvents].reverse().find((e) => String(e.event_type) === 'AGENT_STEP_FAILED')

    const plannerPayload = (plannerEvent?.payload ?? {}) as Record<string, unknown>
    const latestRetryPayload = ((retryEvents[retryEvents.length - 1]?.payload ?? {}) as Record<string, unknown>)
    const diagnosticPayload = (diagnosticEvent?.payload ?? {}) as Record<string, unknown>
    const resultPayload = (resultEvent?.payload ?? {}) as Record<string, unknown>
    const selectedPayload = ((selectedEvent?.payload ?? {}) as Record<string, unknown>)

    const stages = ((diagnosticPayload.diagnostic as Record<string, unknown> | undefined)?.stages as Array<Record<string, unknown>> | undefined) ?? []
    const failedStage = stages.find((stage) => String(stage.status ?? '').toLowerCase() === 'failed')
    const enforcement = (diagnosticPayload.enforcement ?? {}) as Record<string, unknown>
    const affectedFields = (failedStage?.affected_fields as unknown[]) ?? (failedStage?.fields as unknown[]) ?? []

    const quality = (resultPayload.quality ?? diagnosticPayload.unified ?? {}) as Record<string, unknown>
    const coverage = num(quality.coverage ?? (diagnosticPayload.unified as Record<string, unknown> | undefined)?.coverage)
    const confidence = num(quality.confidence ?? quality.confidence_score ?? plannerPayload.confidence)
    const penalties = quality.penalties ?? quality.penalty ?? null

    const stepStarts = new Map<string, number>()
    const stepDurations = new Map<string, number>()
    for (const event of traceEvents) {
      const payload = (event.payload ?? {}) as Record<string, unknown>
      const stepName = readStepName(payload, event.agent_id)
      const ts = Date.parse(String(event.timestamp))
      if (!Number.isFinite(ts) || stepName === '-') continue
      const eventType = String(event.event_type)
      if (eventType === 'AGENT_STEP_STARTED') stepStarts.set(stepName, ts)
      if (eventType === 'AGENT_STEP_COMPLETED' || eventType === 'AGENT_STEP_FAILED') {
        const started = stepStarts.get(stepName)
        const explicit = num(payload.duration_ms ?? payload.latency_ms)
        if (explicit !== null) stepDurations.set(stepName, explicit)
        else if (started) stepDurations.set(stepName, Math.max(0, ts - started))
      }
    }

    const firstTs = traceEvents.length ? Date.parse(String(traceEvents[0].timestamp)) : NaN
    const lastTs = traceEvents.length ? Date.parse(String(traceEvents[traceEvents.length - 1].timestamp)) : NaN
    const totalDurationMs = Number.isFinite(firstTs) && Number.isFinite(lastTs) ? Math.max(0, lastTs - firstTs) : null

    const hasFailure = Boolean(failedStepEvent) || String(history?.status ?? '').toLowerCase() === 'failed'
    const hasDegraded = Boolean(history?.degraded) || retryEvents.length > 0
    const diagnosticsVerdict = String(((diagnosticPayload.unified as Record<string, unknown> | undefined)?.verdict ?? '')).toLowerCase()
    const health = hasFailure || diagnosticsVerdict === 'fail' ? 'critical' : hasDegraded || diagnosticsVerdict === 'warning' ? 'degraded' : 'healthy'

    const previousCompleted = [...traceEvents]
      .reverse()
      .find((e) => String(e.event_type) === 'AGENT_STEP_COMPLETED' && e.event_id !== selectedEvent?.event_id)
    const previousOutput = ((previousCompleted?.payload ?? {}) as Record<string, unknown>).output
    const currentOutput = selectedPayload.output

    return {
      planner: {
        reason: String(plannerPayload.reason ?? plannerPayload.decision ?? 'n/a'),
        inputs: plannerPayload.inputs ?? plannerPayload.decision_inputs ?? null,
        confidence: num(plannerPayload.confidence ?? plannerPayload.decision_confidence),
      },
      retry: {
        count: retryEvents.length,
        reason: String(latestRetryPayload.reason ?? latestRetryPayload.error ?? 'n/a'),
        delta: latestRetryPayload.delta ?? latestRetryPayload.changed ?? latestRetryPayload.retry_delta ?? null,
      },
      diagnostic: {
        failedStage: String(failedStage?.stage ?? failedStage?.name ?? 'n/a'),
        rule: String(enforcement.trigger ?? failedStage?.rule ?? 'n/a'),
        affectedFields: Array.isArray(affectedFields) ? affectedFields.map((x) => String(x)) : [],
      },
      stepInspection: {
        step: readStepName(selectedPayload, selectedEvent?.agent_id),
        input: selectedPayload.input ?? selectedPayload.step_input ?? null,
        output: selectedPayload.output ?? selectedPayload.step_output ?? null,
        diff: previousOutput !== undefined || currentOutput !== undefined ? { previous_output: previousOutput ?? null, current_output: currentOutput ?? null } : null,
      },
      agent: {
        action: String(selectedPayload.action ?? selectedPayload.step_name ?? selectedEvent?.event_type ?? 'n/a'),
        result: String(selectedPayload.result ?? selectedPayload.status ?? 'n/a'),
        latencyMs: num(selectedEvent?.latency_ms ?? selectedPayload.latency_ms ?? selectedPayload.duration_ms),
      },
      quality: {
        coverage,
        confidence,
        penalties,
      },
      timing: {
        stepDurations: Object.fromEntries(stepDurations.entries()),
        totalDurationMs,
      },
      health,
    }
  }, [events, runHistory, selectedEventId, selectedTraceId, traces])

  return (
    <section className="ov-panel ov-panel-intelligence" aria-label="Intelligence data panel">
      <header className="ov-panel-header">
        <div>
          <h2>Execution Intelligence</h2>
          <p>{selectedTraceId ? `Trace ${selectedTraceId}` : 'No trace selected'}</p>
        </div>
      </header>
      {!model ? (
        <EmptyStateCard title="No intelligence data" description="Select a trace and event to inspect planner/retry/diagnostic details." />
      ) : (
        <div className="ov-intel-grid">
          <div><h4>Planner Data</h4><p>Reason: {model.planner.reason}</p><p>Confidence: {model.planner.confidence ?? 'n/a'}</p><pre>{JSON.stringify(model.planner.inputs, null, 2)}</pre></div>
          <div><h4>Retry Data</h4><p>Count: {model.retry.count}</p><p>Reason: {model.retry.reason}</p><pre>{JSON.stringify(model.retry.delta, null, 2)}</pre></div>
          <div><h4>Diagnostic Root Cause</h4><p>Failed Stage: {model.diagnostic.failedStage}</p><p>Rule: {model.diagnostic.rule}</p><p>Affected: {model.diagnostic.affectedFields.length ? model.diagnostic.affectedFields.join(', ') : 'n/a'}</p></div>
          <div><h4>Step Inspection</h4><p>Step: {model.stepInspection.step}</p><pre>{JSON.stringify({ input: model.stepInspection.input, output: model.stepInspection.output, diff: model.stepInspection.diff }, null, 2)}</pre></div>
          <div><h4>Agent Detail</h4><p>Action: {model.agent.action}</p><p>Result: {model.agent.result}</p><p>Latency: {model.agent.latencyMs ?? 'n/a'} ms</p></div>
          <div><h4>Quality Breakdown</h4><p>Coverage: {model.quality.coverage ?? 'n/a'}</p><p>Confidence: {model.quality.confidence ?? 'n/a'}</p><pre>{JSON.stringify(model.quality.penalties, null, 2)}</pre></div>
          <div><h4>Timing Layer</h4><p>Total: {model.timing.totalDurationMs ?? 'n/a'} ms</p><pre>{JSON.stringify(model.timing.stepDurations, null, 2)}</pre></div>
          <div><h4>Execution Health</h4><p className={`ov-intel-health is-${model.health}`}>{model.health.toUpperCase()}</p></div>
        </div>
      )}
    </section>
  )
}

