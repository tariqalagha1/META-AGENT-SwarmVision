import { useSyncExternalStore } from 'react'

export type NodeRuntimeState = 'idle' | 'active' | 'completed' | 'failed' | 'degraded'
export type EdgeRuntimeState = 'idle' | 'flowing' | 'completed' | 'failed' | 'retrying'

export type TraceState = {
  nodes: Record<string, { state: NodeRuntimeState; retrying?: boolean }>
  edges: Record<string, { state: EdgeRuntimeState }>
  currentStep: string | null
  lastPlannerDecision?: Record<string, unknown> | null
}

export type EcosystemRuntimeState = {
  traces: Record<string, TraceState>
}

const createEmptyTraceState = (): TraceState => ({
  nodes: {},
  edges: {},
  currentStep: null,
  lastPlannerDecision: null,
})

type EcoStoreSingleton = {
  state: EcosystemRuntimeState
  listeners: Set<() => void>
}

const globalStoreKey = '__ecoStore'
const globalRef = globalThis as typeof globalThis & {
  [globalStoreKey]?: EcoStoreSingleton
  __ecoStoreRefLogged?: boolean
}

const singleton: EcoStoreSingleton =
  globalRef[globalStoreKey] ??
  (() => {
    const created: EcoStoreSingleton = {
      state: { traces: {} },
      listeners: new Set<() => void>(),
    }
    globalRef[globalStoreKey] = created
    return created
  })()

const state = singleton.state
const listeners = singleton.listeners

export const ecosystemRuntimeStore = singleton

const emit = () => {
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => state

export const __resetEcosystemRuntimeStoreForTests = () => {
  state.traces = {}
  emit()
}

export const initializeTrace = (trace_id: string): TraceState => {
  if (!trace_id) return createEmptyTraceState()
  if (!state.traces[trace_id]) {
    state.traces[trace_id] = createEmptyTraceState()
    emit()
  }
  return state.traces[trace_id]
}

export const updateNodeState = (
  trace_id: string,
  nodeId: string,
  nodeState: NodeRuntimeState
): TraceState => {
  const trace = initializeTrace(trace_id)
  if (!nodeId) return trace
  trace.nodes[nodeId] = {
    state: nodeState,
    retrying: trace.nodes[nodeId]?.retrying ?? false,
  }
  emit()
  return trace
}

export const updateEdgeState = (
  trace_id: string,
  edgeId: string,
  edgeState: EdgeRuntimeState
): TraceState => {
  const trace = initializeTrace(trace_id)
  if (!edgeId) return trace
  trace.edges[edgeId] = { state: edgeState }
  emit()
  return trace
}

export const setCurrentStep = (trace_id: string, stepName: string | null): TraceState => {
  const trace = initializeTrace(trace_id)
  trace.currentStep = stepName
  emit()
  return trace
}

export const getTraceState = (trace_id: string): TraceState => {
  return initializeTrace(trace_id)
}

export const setLastPlannerDecision = (
  trace_id: string,
  decisionPayload: Record<string, unknown> | null
): TraceState => {
  const trace = initializeTrace(trace_id)
  trace.lastPlannerDecision = decisionPayload
  emit()
  return trace
}

export const setNodeRetrying = (
  trace_id: string,
  nodeId: string,
  retrying: boolean
): TraceState => {
  const trace = initializeTrace(trace_id)
  if (!nodeId) return trace
  const existing = trace.nodes[nodeId]
  trace.nodes[nodeId] = {
    state: existing?.state ?? 'idle',
    retrying,
  }
  emit()
  return trace
}

export const isNodeRetrying = (trace_id: string, nodeId: string): boolean => {
  const trace = initializeTrace(trace_id)
  if (!nodeId) return false
  return Boolean(trace.nodes[nodeId]?.retrying)
}

export const getEcosystemRuntimeState = (): EcosystemRuntimeState => state

export const useEcosystemTraceState = (trace_id: string | null): TraceState | null =>
  useSyncExternalStore(subscribe, () => {
    if (import.meta.env.DEV && !globalRef.__ecoStoreRefLogged) {
      globalRef.__ecoStoreRefLogged = true
      console.log('STORE REF', ecosystemRuntimeStore)
    }
    if (import.meta.env.DEV) {
      ;(globalThis as typeof globalThis & { __ecoStoreHookRef?: unknown }).__ecoStoreHookRef =
        ecosystemRuntimeStore
    }
    return trace_id ? getSnapshot().traces[trace_id] ?? null : null
  }, () => (trace_id ? getSnapshot().traces[trace_id] ?? null : null))
