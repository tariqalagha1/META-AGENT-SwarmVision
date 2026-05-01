import type { NormalizedEcosystemEvent } from '../lib/ecosystemEventNormalizer'
import {
  ecosystemRuntimeStore,
  getTraceState,
  isNodeRetrying,
  initializeTrace,
  setLastPlannerDecision,
  setNodeRetrying,
  setCurrentStep,
  updateEdgeState,
  updateNodeState,
} from './ecosystemRuntimeStore'

const STEP_TO_NODE_ID: Record<string, string> = {
  fetch: 'fetch_agent',
  normalize: 'normalize_agent',
  quality: 'quality_agent',
}

const resolveNodeId = (stepName: string) => STEP_TO_NODE_ID[stepName] ?? stepName
const edgeId = (fromNode: string, toNode: string) => `${fromNode}->${toNode}`
const mapperLogRef = globalThis as typeof globalThis & { __ecoMapperRefLogged?: boolean }
const findIncomingEdgeId = (trace_id: string, nodeId: string): string | null => {
  if (!trace_id || !nodeId) return null
  const trace = getTraceState(trace_id)
  for (const id of Object.keys(trace.edges)) {
    if (id.endsWith(`->${nodeId}`)) return id
  }
  return null
}

export const markAllNodesCompleted = (trace_id: string) => {
  if (!trace_id) return
  const trace = getTraceState(trace_id)
  const nodeIds = Object.keys(trace.nodes)
  for (const nodeId of nodeIds) {
    updateNodeState(trace_id, nodeId, 'completed')
  }
}

export const handleNormalizedEvent = (event: NormalizedEcosystemEvent) => {
  if (import.meta.env.DEV && !mapperLogRef.__ecoMapperRefLogged) {
    mapperLogRef.__ecoMapperRefLogged = true
    console.log('STORE REF', ecosystemRuntimeStore)
  }
  if (import.meta.env.DEV) {
    ;(globalThis as typeof globalThis & { __ecoStoreMapperRef?: unknown }).__ecoStoreMapperRef =
      ecosystemRuntimeStore
  }
  const trace_id = event?.trace_id
  if (!trace_id) return

  const step_name = event.step_name || 'unknown_step'
  const nodeId = resolveNodeId(step_name)
  const eventType = event.type

  switch (eventType) {
    case 'SWARM_STARTED': {
      initializeTrace(trace_id)
      break
    }

    case 'AGENT_STEP_STARTED': {
      initializeTrace(trace_id)
      const trace = getTraceState(trace_id)
      const previousNodeId = trace.currentStep ? resolveNodeId(trace.currentStep) : null
      if (isNodeRetrying(trace_id, nodeId)) {
        setNodeRetrying(trace_id, nodeId, false)
      }
      if (previousNodeId && previousNodeId !== nodeId) {
        updateNodeState(trace_id, previousNodeId, 'completed')
      }
      updateNodeState(trace_id, nodeId, 'active')
      if (previousNodeId && previousNodeId !== nodeId) {
        updateEdgeState(trace_id, edgeId(previousNodeId, nodeId), 'flowing')
      }
      setCurrentStep(trace_id, nodeId)
      break
    }

    case 'AGENT_STEP_COMPLETED': {
      initializeTrace(trace_id)
      updateNodeState(trace_id, nodeId, 'completed')
      setNodeRetrying(trace_id, nodeId, false)
      const incomingEdgeId = findIncomingEdgeId(trace_id, nodeId)
      if (incomingEdgeId) {
        updateEdgeState(trace_id, incomingEdgeId, 'completed')
      }
      break
    }

    case 'AGENT_STEP_FAILED': {
      initializeTrace(trace_id)
      const trace = getTraceState(trace_id)
      const previousStep = trace.currentStep
      const previousNodeId = previousStep ? resolveNodeId(previousStep) : null
      updateNodeState(trace_id, nodeId, 'failed')
      if (previousNodeId && previousNodeId !== nodeId) {
        updateEdgeState(trace_id, edgeId(previousNodeId, nodeId), 'failed')
      }
      break
    }

    case 'AGENT_STEP_RETRY': {
      initializeTrace(trace_id)
      updateNodeState(trace_id, nodeId, 'active')
      setNodeRetrying(trace_id, nodeId, true)
      break
    }

    case 'PLANNER_DECISION': {
      initializeTrace(trace_id)
      setLastPlannerDecision(trace_id, event.payload ?? null)
      break
    }

    case 'SWARM_COMPLETED': {
      initializeTrace(trace_id)
      markAllNodesCompleted(trace_id)
      break
    }

    case 'SWARM_FAILED': {
      initializeTrace(trace_id)
      const trace = getTraceState(trace_id)
      const current = trace.currentStep
      if (current) {
        updateNodeState(trace_id, resolveNodeId(current), 'failed')
      }
      break
    }

    default:
      break
  }
}
