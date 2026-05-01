import { useMemo } from 'react'
import { useObservabilityStore } from '../../store'

type RuntimeNodeState = 'idle' | 'active' | 'completed' | 'failed' | 'degraded'

type RuntimeNode = {
  state: RuntimeNodeState
  retrying?: boolean
}

type RuntimeTraceState = {
  nodes: Record<string, RuntimeNode>
  edges: Record<string, { state: 'idle' | 'flowing' | 'completed' | 'failed' | 'retrying' }>
  currentStep: string | null
}

type PipelineExecutionViewProps = {
  traceId: string | null
  runtimeTraceState: RuntimeTraceState | null
}

type StepMeta = {
  id: string
  label: string
  role: string
}

const PIPELINE_STEPS: StepMeta[] = [
  { id: 'fetch_agent', label: 'Fetch', role: 'Data collection' },
  { id: 'normalize_agent', label: 'Normalize', role: 'Validation / structuring' },
  { id: 'quality_agent', label: 'Quality', role: 'Scoring and final validation' },
]

const NODE_ORDER = ['user_input', 'orchestrator', ...PIPELINE_STEPS.map((s) => s.id), 'output']

const stepNameToNodeId = (stepName: string | null): string | null => {
  if (!stepName) return null
  if (stepName === 'fetch') return 'fetch_agent'
  if (stepName === 'normalize') return 'normalize_agent'
  if (stepName === 'quality') return 'quality_agent'
  return stepName
}

const runtimeNodeClass = (state: RuntimeNodeState) => {
  if (state === 'active') return 'ov-v3-node-active'
  if (state === 'completed') return 'ov-v3-node-completed'
  if (state === 'failed') return 'ov-v3-node-failed'
  if (state === 'degraded') return 'ov-v3-node-degraded'
  return 'ov-v3-node-idle'
}

const resolveNodeState = (nodeId: string, runtime: RuntimeTraceState | null): RuntimeNodeState => {
  if (!runtime) return 'idle'
  if (nodeId === 'orchestrator') {
    const step = runtime.currentStep
    const anyFailure = Object.values(runtime.nodes).some((node) => node.state === 'failed')
    const allCompleted =
      PIPELINE_STEPS.every((stepMeta) => runtime.nodes[stepMeta.id]?.state === 'completed') &&
      PIPELINE_STEPS.some((stepMeta) => runtime.nodes[stepMeta.id])
    if (anyFailure) return 'failed'
    if (allCompleted) return 'completed'
    if (step) return 'active'
    return 'idle'
  }
  if (nodeId === 'output') {
    const qualityState = runtime.nodes.quality_agent?.state
    if (qualityState === 'failed') return 'failed'
    if (qualityState === 'completed') return 'completed'
    return 'idle'
  }
  if (nodeId === 'user_input') return runtime?.currentStep ? 'completed' : 'idle'
  return runtime.nodes[nodeId]?.state ?? 'idle'
}

const resolveEdgeState = (
  source: string,
  target: string,
  runtime: RuntimeTraceState | null,
  currentNodeId: string | null
) => {
  if (!runtime) return 'idle'
  const mapped = runtime.edges[`${source}->${target}`]?.state
  if (mapped) return mapped
  if (currentNodeId === target) return 'flowing'
  if (resolveNodeState(target, runtime) === 'completed') return 'completed'
  if (resolveNodeState(target, runtime) === 'failed') return 'failed'
  return 'idle'
}

export function PipelineExecutionView({ traceId, runtimeTraceState }: PipelineExecutionViewProps) {
  const events = useObservabilityStore((s) => s.events)
  const traces = useObservabilityStore((s) => s.traces)
  const selectedEventId = useObservabilityStore((s) => s.selectedEventId)
  const runHistory = useObservabilityStore((s) => s.runHistory)

  const traceEvents = useMemo(() => {
    if (!traceId) return []
    const ids = traces[traceId] ?? []
    return ids.map((id) => events[id]).filter((e) => Boolean(e))
  }, [events, traceId, traces])

  const selectedEventNodeId = useMemo(() => {
    if (!selectedEventId) return null
    const selected = events[selectedEventId]
    if (!selected) return null
    const payload = (selected.payload ?? {}) as Record<string, unknown>
    const stepName = typeof payload.step_name === 'string' ? payload.step_name : null
    const mappedByStep = stepNameToNodeId(stepName)
    if (mappedByStep) return mappedByStep
    if (selected.agent_id) return String(selected.agent_id)
    return null
  }, [events, selectedEventId])

  const plannerRetryReasons = useMemo(() => {
    return traceEvents
      .filter((event) => {
        const type = String(event.event_type ?? '')
        return type === 'PLANNER_DECISION' || type === 'AGENT_STEP_RETRY'
      })
      .slice(-4)
      .map((event) => {
        const payload = (event.payload ?? {}) as Record<string, unknown>
        const type = String(event.event_type ?? '')
        if (type === 'AGENT_STEP_RETRY') {
          return {
            id: event.event_id,
            label: 'Retry',
            reason: String(payload.error ?? payload.reason ?? 'retry requested'),
          }
        }
        return {
          id: event.event_id,
          label: 'Planner',
          reason: String(payload.reason ?? payload.decision ?? 'plan adaptation'),
        }
      })
  }, [traceEvents])

  const diagnosticSeverity = useMemo<'FAIL' | 'WARNING' | null>(() => {
    for (let i = traceEvents.length - 1; i >= 0; i -= 1) {
      const event = traceEvents[i]
      if (!event || event.event_type !== 'DIAGNOSTIC_RESULT') continue
      const payload = (event.payload ?? {}) as Record<string, unknown>
      const unified = (payload.unified ?? {}) as Record<string, unknown>
      const enforcement = (payload.enforcement ?? {}) as Record<string, unknown>
      const verdict = String(unified.verdict ?? '').toUpperCase()
      const blocked = Boolean(enforcement.block)
      const warned = Boolean(enforcement.warn)
      if (blocked || verdict === 'FAIL') return 'FAIL'
      if (warned || verdict === 'WARNING') return 'WARNING'
      return null
    }
    return null
  }, [traceEvents])

  const runContext = useMemo(() => {
    if (!traceId) return null
    const history = runHistory[traceId]
    if (history) {
      return {
        task: history.task || '-',
        status: history.status,
      }
    }
    return null
  }, [runHistory, traceId])

  const currentNodeId = stepNameToNodeId(runtimeTraceState?.currentStep ?? null)
  const inferredActiveNodeId =
    currentNodeId ??
    (runtimeTraceState
      ? Object.entries(runtimeTraceState.nodes).find(([, node]) => node.state === 'active')?.[0] ?? null
      : null)
  const currentStepLabel = runtimeTraceState?.currentStep ?? (inferredActiveNodeId ? inferredActiveNodeId : 'idle')
  const executionNarrative = useMemo(() => {
    if (!runContext) return 'Waiting for swarm run context.'
    if (diagnosticSeverity === 'FAIL') {
      return `Run ${runContext.status}: execution completed with critical diagnostic failure.`
    }
    if (diagnosticSeverity === 'WARNING') {
      return `Run ${runContext.status}: execution completed with warning diagnostics.`
    }
    if (currentStepLabel !== 'idle') {
      return `Executing step ${currentStepLabel} for task "${runContext.task}".`
    }
    return `Run ${runContext.status}: awaiting next execution events.`
  }, [currentStepLabel, diagnosticSeverity, runContext])

  const edges = NODE_ORDER.slice(0, -1).map((source, index) => {
    const target = NODE_ORDER[index + 1]
    const state = resolveEdgeState(source, target, runtimeTraceState, currentNodeId)
    return { source, target, state }
  })

  return (
    <div
      className={`ov-v3-canvas ov-v3-pipeline ${diagnosticSeverity === 'FAIL' ? 'ov-v3-diagnostic-fail' : ''} ${diagnosticSeverity === 'WARNING' ? 'ov-v3-diagnostic-warning' : ''}`}
    >
      <div className="ov-v3-header-bar">
        <span className="ov-v3-badge">Trace: {traceId ?? 'unselected'}</span>
        <span className="ov-v3-badge ov-v3-badge-step">Current Step: {currentStepLabel}</span>
        {runContext ? (
          <span className={`ov-v3-badge ov-v3-badge-status is-${runContext.status}`}>Status: {runContext.status}</span>
        ) : null}
      </div>
      {runContext ? (
        <div className="ov-v3-run-context">
          <span>Task: {runContext.task}</span>
          <span>Trace: {traceId}</span>
        </div>
      ) : null}

      <div className="ov-v3-pipeline-track">
        <div className={`ov-v3-node ov-v3-node-terminal ${runtimeNodeClass(resolveNodeState('user_input', runtimeTraceState))}`}>
          <h4>User Input</h4>
          <p>Task request</p>
        </div>

        <div className={`ov-v3-edge ov-v3-edge-${edges[0]?.state ?? 'idle'}`} />

        <div className={`ov-v3-node ov-v3-node-orchestrator ov-v3-node-largest ${runtimeNodeClass(resolveNodeState('orchestrator', runtimeTraceState))} ${inferredActiveNodeId === 'orchestrator' ? 'ov-v3-node-focus' : ''}`}>
          <h4>Orchestrator</h4>
          <p>Coordinates execution</p>
        </div>

        <div className={`ov-v3-edge ov-v3-edge-${edges[1]?.state ?? 'idle'}`} style={{ ['--flow-delay' as string]: '80ms' }} />

        {PIPELINE_STEPS.map((step, idx) => {
          const state = resolveNodeState(step.id, runtimeTraceState)
          const retrying = runtimeTraceState?.nodes[step.id]?.retrying
          const edgeState = edges[idx + 2]?.state ?? 'idle'
          const isFocused = inferredActiveNodeId === step.id || selectedEventNodeId === step.id
          const isMuted = Boolean(inferredActiveNodeId && !isFocused && state === 'idle')

          return (
            <div key={step.id} className="ov-v3-step-group">
              <div
                className={`ov-v3-node ${runtimeNodeClass(state)} ${isFocused ? 'ov-v3-node-focus' : ''} ${isMuted ? 'ov-v3-node-muted' : ''} ${state === 'completed' && !isFocused ? 'ov-v3-node-collapsed' : ''} ${retrying ? 'ov-v3-node-retrying' : ''}`}
              >
                <h4>{step.label}</h4>
                <p>{step.role}</p>
                {retrying ? <span className="ov-v3-inline-badge ov-v3-inline-retry">Retrying</span> : null}
                {isFocused && plannerRetryReasons[0]?.label === 'Planner' ? (
                  <span className="ov-v3-inline-badge ov-v3-inline-planner">Planner: {plannerRetryReasons[0].reason}</span>
                ) : null}
              </div>
              {idx < PIPELINE_STEPS.length - 1 ? (
                <div className="ov-v3-edge-wrap">
                  <div
                    className={`ov-v3-edge ov-v3-edge-${edgeState} ${edgeState === 'flowing' ? 'ov-v3-edge-focus ov-v3-edge-primary' : ''} ${edgeState === 'completed' ? 'ov-v3-edge-primary' : 'ov-v3-edge-secondary'} ${edgeState !== 'flowing' ? 'ov-v3-edge-dimmed' : ''}`}
                    style={{ ['--flow-delay' as string]: `${180 + idx * 120}ms` }}
                  />
                  {edgeState === 'flowing' ? <div className="ov-v3-edge-ghost" /> : null}
                </div>
              ) : null}
            </div>
          )
        })}

        <div className={`ov-v3-edge ov-v3-edge-${edges[edges.length - 1]?.state ?? 'idle'}`} style={{ ['--flow-delay' as string]: '520ms' }} />

        <div className={`ov-v3-node ov-v3-node-terminal ov-v3-node-destination ${runtimeNodeClass(resolveNodeState('output', runtimeTraceState))}`}>
          <h4>Final Output</h4>
          <p>Validated result</p>
        </div>
      </div>
      {plannerRetryReasons.length > 0 ? (
        <aside className="ov-v3-decision-overlay ov-v3-decision-overlay-pipeline" aria-label="Planner and retry decisions">
          <h5>Decisions</h5>
          {plannerRetryReasons.map((item) => (
            <div key={item.id} className="ov-v3-decision-row">
              <strong>{item.label}</strong>
              <span>{item.reason}</span>
            </div>
          ))}
        </aside>
      ) : null}
      <aside className="ov-v3-narrative-panel" aria-label="Execution narrative">
        <h5>Execution Narrative</h5>
        <p>{executionNarrative}</p>
      </aside>
    </div>
  )
}
