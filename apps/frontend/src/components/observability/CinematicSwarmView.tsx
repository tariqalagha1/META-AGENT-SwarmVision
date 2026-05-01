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

type CinematicSwarmViewProps = {
  traceId: string | null
  runtimeTraceState: RuntimeTraceState | null
}

type EcosystemNode = {
  id: string
  title: string
  subtitle: string
  role: string
  zone: 'left' | 'center' | 'mid' | 'right' | 'far-right'
  planned?: boolean
}

const NODES: EcosystemNode[] = [
  {
    id: 'fetch_agent',
    title: 'Data Collection Swarm',
    subtitle: 'fetch_agent',
    role: 'Fetching source data',
    zone: 'left',
  },
  {
    id: 'orchestrator',
    title: 'Orchestrator',
    subtitle: 'controller',
    role: 'Coordinating execution',
    zone: 'center',
  },
  {
    id: 'normalize_agent',
    title: 'Validation / Normalization Swarm',
    subtitle: 'normalize_agent',
    role: 'Cleaning and structuring data',
    zone: 'mid',
  },
  {
    id: 'quality_agent',
    title: 'Quality Intelligence Swarm',
    subtitle: 'quality_agent',
    role: 'Scoring and validating output',
    zone: 'right',
  },
  {
    id: 'output',
    title: 'Final Output',
    subtitle: 'result',
    role: 'Completed result',
    zone: 'far-right',
  },
]

const stepNameToNodeId = (stepName: string | null): string | null => {
  if (!stepName) return null
  if (stepName === 'fetch') return 'fetch_agent'
  if (stepName === 'normalize') return 'normalize_agent'
  if (stepName === 'quality') return 'quality_agent'
  return stepName
}

const stateClass = (state: RuntimeNodeState) => {
  if (state === 'active') return 'ov-v3-node-active'
  if (state === 'completed') return 'ov-v3-node-completed'
  if (state === 'failed') return 'ov-v3-node-failed'
  if (state === 'degraded') return 'ov-v3-node-degraded'
  return 'ov-v3-node-idle'
}

const nodeState = (nodeId: string, runtime: RuntimeTraceState | null): RuntimeNodeState => {
  if (!runtime) return 'idle'
  if (nodeId === 'orchestrator') {
    if (Object.values(runtime.nodes).some((n) => n.state === 'failed')) return 'failed'
    if (runtime.currentStep) return 'active'
    const quality = runtime.nodes.quality_agent?.state
    if (quality === 'completed') return 'completed'
    return 'idle'
  }
  if (nodeId === 'output') {
    const quality = runtime.nodes.quality_agent?.state
    if (quality === 'failed') return 'failed'
    if (quality === 'completed') return 'completed'
    return 'idle'
  }
  return runtime.nodes[nodeId]?.state ?? 'idle'
}

const linkState = (
  source: string,
  target: string,
  runtime: RuntimeTraceState | null,
  currentNodeId: string | null
) => {
  if (!runtime) return 'idle'
  const mapped = runtime.edges[`${source}->${target}`]?.state
  if (mapped) return mapped
  if (target === currentNodeId || source === currentNodeId) return 'flowing'
  if (nodeState(target, runtime) === 'completed') return 'completed'
  if (nodeState(target, runtime) === 'failed') return 'failed'
  return 'idle'
}

export function CinematicSwarmView({ traceId, runtimeTraceState }: CinematicSwarmViewProps) {
  const events = useObservabilityStore((s) => s.events)
  const traces = useObservabilityStore((s) => s.traces)
  const selectedEventId = useObservabilityStore((s) => s.selectedEventId)
  const runHistory = useObservabilityStore((s) => s.runHistory)

  const traceEvents = useMemo(() => {
    if (!traceId) return []
    const ids = traces[traceId] ?? []
    return ids.map((id) => events[id]).filter((e) => Boolean(e))
  }, [events, traceId, traces])

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

  const dynamicLinks = useMemo(() => {
    const nodes: Array<{ source: string; target: string }> = []
    if (traceEvents.length === 0) return nodes

    const stepEvents = traceEvents.filter(
      (event) =>
        String(event.event_type ?? '') === 'AGENT_STEP_STARTED' ||
        String(event.event_type ?? '') === 'AGENT_STEP_COMPLETED' ||
        String(event.event_type ?? '') === 'AGENT_STEP_FAILED'
    )

    const sequence = stepEvents
      .map((event) => String(event.agent_id ?? ''))
      .filter((agentId) => Boolean(agentId))

    if (sequence.length > 0) {
      nodes.push({ source: 'orchestrator', target: sequence[0] })
      for (let i = 1; i < sequence.length; i += 1) {
        if (sequence[i - 1] === sequence[i]) continue
        nodes.push({ source: sequence[i - 1], target: sequence[i] })
      }
      nodes.push({ source: sequence[sequence.length - 1], target: 'output' })
    }

    const dedup = new Set<string>()
    return nodes.filter((link) => {
      const key = `${link.source}->${link.target}`
      if (dedup.has(key)) return false
      dedup.add(key)
      return true
    })
  }, [traceEvents])

  const swarmAgentInstances = useMemo(() => {
    const byAgent: Record<string, string[]> = {}
    for (const event of traceEvents) {
      if (String(event.event_type ?? '') !== 'AGENT_STEP_STARTED') continue
      const agentId = String(event.agent_id ?? '')
      if (!agentId) continue
      const nextIndex = (byAgent[agentId]?.length ?? 0) + 1
      byAgent[agentId] = [...(byAgent[agentId] ?? []), `${agentId}#${nextIndex}`]
    }
    return byAgent
  }, [traceEvents])

  const currentNodeId = stepNameToNodeId(runtimeTraceState?.currentStep ?? null)
  const inferredActiveNodeId =
    currentNodeId ??
    (runtimeTraceState
      ? Object.entries(runtimeTraceState.nodes).find(([, node]) => node.state === 'active')?.[0] ?? null
      : null)
  const currentStepLabel = runtimeTraceState?.currentStep ?? (inferredActiveNodeId ? inferredActiveNodeId : 'idle')
  const cameraFollowClass = inferredActiveNodeId ? `ov-camera-follow-${inferredActiveNodeId}` : 'ov-camera-follow-idle'
  const executionNarrative = useMemo(() => {
    if (!runContext) return 'Waiting for swarm run context.'
    if (diagnosticSeverity === 'FAIL') {
      return `Run ${runContext.status}: diagnostic failure detected after execution.`
    }
    if (diagnosticSeverity === 'WARNING') {
      return `Run ${runContext.status}: diagnostics raised a warning.`
    }
    if (currentStepLabel !== 'idle') {
      return `Swarm is processing ${currentStepLabel} for task "${runContext.task}".`
    }
    return `Run ${runContext.status}: monitoring finalization state.`
  }, [currentStepLabel, diagnosticSeverity, runContext])

  return (
    <div className="ov-v3-canvas ov-v3-cinematic">
      <div className="ov-v3-header-bar">
        <span className="ov-v3-badge">Trace: {traceId ?? 'unselected'}</span>
        <span className="ov-v3-badge ov-v3-badge-step">
          Current Step: {currentStepLabel}
        </span>
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

      <div
        className={`ov-v3-cinematic-stage ${cameraFollowClass} ${diagnosticSeverity === 'FAIL' ? 'ov-v3-diagnostic-fail' : ''} ${diagnosticSeverity === 'WARNING' ? 'ov-v3-diagnostic-warning' : ''}`}
      >
        {dynamicLinks.map((link, index) => (
          <div
            key={`${link.source}->${link.target}`}
            className={`ov-v3-link ov-v3-link-${linkState(link.source, link.target, runtimeTraceState, inferredActiveNodeId)} ${linkState(link.source, link.target, runtimeTraceState, inferredActiveNodeId) === 'flowing' ? 'ov-v3-edge-primary' : ''} ${linkState(link.source, link.target, runtimeTraceState, inferredActiveNodeId) === 'completed' ? 'ov-v3-edge-primary' : 'ov-v3-edge-secondary'}`}
            data-source={link.source}
            data-target={link.target}
            style={{ ['--flow-delay' as string]: `${index * 120}ms` }}
          />
        ))}
        {dynamicLinks.map((link) =>
          linkState(link.source, link.target, runtimeTraceState, inferredActiveNodeId) === 'flowing' ? (
            <div
              key={`ghost-${link.source}->${link.target}`}
              className="ov-v3-link ov-v3-link-ghost"
              data-source={link.source}
              data-target={link.target}
            />
          ) : null
        )}

        {NODES.map((node) => {
          const state = nodeState(node.id, runtimeTraceState)
          const retrying = runtimeTraceState?.nodes[node.id]?.retrying
          const isFocused = inferredActiveNodeId === node.id || selectedEventNodeId === node.id
          const isMuted = Boolean(inferredActiveNodeId && !isFocused && state === 'idle')
          const instances = (swarmAgentInstances[node.id] ?? []).slice(0, 3)
          const hiddenCount = Math.max((swarmAgentInstances[node.id] ?? []).length - 3, 0)
          return (
            <article
              key={node.id}
              className={`ov-v3-card ov-v3-zone-${node.zone} ${node.id === 'orchestrator' ? 'ov-v3-node-largest ov-v3-node-gravity-core' : ''} ${node.id === 'output' ? 'ov-v3-node-destination' : ''} ${stateClass(state)} ${isFocused ? 'ov-v3-node-focus ov-v3-step-dominant' : ''} ${isMuted ? 'ov-v3-node-muted' : ''} ${state === 'completed' && !isFocused ? 'ov-v3-node-collapsed' : ''} ${retrying ? 'ov-v3-node-retrying' : ''}`}
            >
              <h4>{node.title}</h4>
              <p className="ov-v3-subtitle">{node.subtitle}</p>
              <p>{node.role}</p>
              {retrying ? <span className="ov-v3-inline-badge ov-v3-inline-retry">Retrying</span> : null}
              {isFocused && plannerRetryReasons[0]?.label === 'Planner' ? (
                <span className="ov-v3-inline-badge ov-v3-inline-planner">Planner: {plannerRetryReasons[0].reason}</span>
              ) : null}
              {instances.length > 0 ? (
                <div className="ov-v3-agent-instance-list">
                  {instances.map((instance) => (
                    <span key={instance} className="ov-v3-agent-instance-chip">
                      {instance}
                    </span>
                  ))}
                  {hiddenCount > 0 ? <span className="ov-v3-agent-instance-chip">+{hiddenCount} more</span> : null}
                </div>
              ) : null}
              {node.planned ? <span className="ov-v3-planned">planned/inactive</span> : null}
            </article>
          )
        })}
        {plannerRetryReasons.length > 0 ? (
          <aside className="ov-v3-decision-overlay" aria-label="Planner and retry decisions">
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
    </div>
  )
}
