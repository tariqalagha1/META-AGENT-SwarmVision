import { useMemo } from 'react'
import { useObservabilityStore } from '../../store'
import { getTraceState } from '../../store/ecosystemRuntimeStore'
import './ObservabilityPanels.css'

type RunIntelligenceStripProps = {
  followLatest: boolean
  onToggleFollowLatest: () => void
}

const readStatus = (value: unknown) => {
  const status = String(value ?? '').toLowerCase()
  if (status === 'failed') return 'failed'
  if (status === 'completed') return 'completed'
  return 'running'
}

export function RunIntelligenceStrip({ followLatest, onToggleFollowLatest }: RunIntelligenceStripProps) {
  const selectedTraceId = useObservabilityStore((s) => s.selectedTraceId)
  const selectedRequestId = useObservabilityStore((s) => s.selectedRequestId)
  const traces = useObservabilityStore((s) => s.traces)
  const events = useObservabilityStore((s) => s.events)
  const runHistory = useObservabilityStore((s) => s.runHistory)

  const focusTraceId = selectedRequestId ?? selectedTraceId
  const runtime = useMemo(() => (focusTraceId ? getTraceState(focusTraceId) : null), [focusTraceId])

  const intelligence = useMemo(() => {
    if (!focusTraceId) {
      return {
        traceId: 'unselected',
        currentStep: 'idle',
        lastEvent: 'none',
        planner: 'none',
        retry: 'none',
        diagnostics: 'none',
        status: 'running',
      }
    }
    const ids = traces[focusTraceId] ?? []
    const traceEvents = ids.map((id) => events[id]).filter((event) => Boolean(event))
    const latest = traceEvents[traceEvents.length - 1]
    const planner = [...traceEvents].reverse().find((event) => String(event.event_type) === 'PLANNER_DECISION')
    const retry = [...traceEvents].reverse().find((event) => String(event.event_type) === 'AGENT_STEP_RETRY')
    const diagnostic = [...traceEvents].reverse().find((event) => String(event.event_type) === 'DIAGNOSTIC_RESULT')

    let diagnostics = 'none'
    if (diagnostic) {
      const payload = (diagnostic.payload ?? {}) as Record<string, unknown>
      const unified = (payload.unified ?? {}) as Record<string, unknown>
      const enforcement = (payload.enforcement ?? {}) as Record<string, unknown>
      const verdict = String(unified.verdict ?? '').toLowerCase()
      const blocked = Boolean(enforcement.block)
      const warned = Boolean(enforcement.warn)
      diagnostics = blocked || verdict === 'fail' ? 'fail' : warned || verdict === 'warning' ? 'warning' : 'pass'
    }

    const plannerPayload = (planner?.payload ?? {}) as Record<string, unknown>
    const retryPayload = (retry?.payload ?? {}) as Record<string, unknown>
    const history = runHistory[focusTraceId]

    return {
      traceId: focusTraceId,
      currentStep: runtime?.currentStep ?? 'idle',
      lastEvent: String(latest?.event_type ?? 'none'),
      planner: String(plannerPayload.reason ?? plannerPayload.decision ?? (planner ? 'planner decision' : 'none')),
      retry: String(retryPayload.reason ?? retryPayload.error ?? (retry ? 'retrying' : 'none')),
      diagnostics,
      status: readStatus(history?.status),
    }
  }, [events, focusTraceId, runHistory, runtime?.currentStep, traces])

  return (
    <section className="ov-run-intelligence-strip" aria-label="Run intelligence strip">
      <span className="ov-run-intel-item"><strong>Trace:</strong> {intelligence.traceId}</span>
      <span className="ov-run-intel-item"><strong>Current Step:</strong> {intelligence.currentStep}</span>
      <span className="ov-run-intel-item"><strong>Last Event:</strong> {intelligence.lastEvent}</span>
      <span className="ov-run-intel-item"><strong>Planner:</strong> {intelligence.planner}</span>
      <span className="ov-run-intel-item"><strong>Retry:</strong> {intelligence.retry}</span>
      <span className={`ov-run-intel-item is-${intelligence.diagnostics}`}><strong>Diagnostics:</strong> {intelligence.diagnostics}</span>
      <span className={`ov-run-intel-item is-${intelligence.status}`}><strong>Status:</strong> {intelligence.status}</span>
      <button type="button" className="ov-run-intel-toggle" onClick={onToggleFollowLatest}>
        {followLatest ? 'Follow latest: ON' : 'Follow latest: OFF'}
      </button>
      <span className="ov-run-intel-lock">{followLatest ? 'Trace mode: following' : 'Trace mode: locked'}</span>
    </section>
  )
}
