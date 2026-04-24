import { afterEach, describe, expect, it } from 'vitest'
import { normalizeEvent } from '../lib/normalizeEvent'
import {
  __resetGraphEngineForTests,
  applyNodePosition,
  applyNormalizedEvents,
  createGraphState,
  graphStateToGraphData,
} from './graphEngine'

type EventOverrides = Record<string, unknown>

const makeEvent = (overrides: EventOverrides = {}) => ({
  event_id: `event-${Math.random().toString(36).slice(2)}`,
  event_type: 'AGENT_SPAWN',
  timestamp: Date.now(),
  trace_id: 'trace-1',
  ...overrides,
})

afterEach(() => {
  __resetGraphEngineForTests()
})

describe('graphEngine incremental normalized updates', () => {
  it('creates TASK_HANDOFF edge when source and target nodes exist', () => {
    let state = createGraphState()
    state = applyNormalizedEvents(state, [
      makeEvent({ event_id: 'spawn-a', event_type: 'AGENT_SPAWN', agent_id: 'agent-a' }),
      makeEvent({ event_id: 'spawn-b', event_type: 'AGENT_SPAWN', agent_id: 'agent-b' }),
      makeEvent({
        event_id: 'handoff-1',
        event_type: 'TASK_HANDOFF',
        source_agent_id: 'agent-a',
        target_agent_id: 'agent-b',
      }),
    ])

    expect(state.edges.has('agent-a|agent-b|TASK_HANDOFF')).toBe(true)
  })

  it('creates FLOW_EVENT edge for normalized pipeline updates', () => {
    let state = createGraphState()
    state = applyNormalizedEvents(state, [
      makeEvent({ event_id: 'spawn-a', event_type: 'AGENT_SPAWN', agent_id: 'agent-a' }),
      makeEvent({ event_id: 'spawn-b', event_type: 'AGENT_SPAWN', agent_id: 'agent-b' }),
      makeEvent({
        event_id: 'flow-1',
        event_type: 'FLOW_EVENT',
        source_agent_id: 'agent-a',
        target_agent_id: 'agent-b',
      }),
    ])

    expect(state.edges.has('agent-a|agent-b|FLOW_EVENT')).toBe(true)
  })

  it('maps from_agent/to_agent through normalizeEvent and creates graph edges', () => {
    let state = createGraphState()
    state = applyNormalizedEvents(state, [
      makeEvent({ event_id: 'spawn-a', event_type: 'AGENT_SPAWN', agent_id: 'agent-a' }),
      makeEvent({ event_id: 'spawn-b', event_type: 'AGENT_SPAWN', agent_id: 'agent-b' }),
    ])

    const normalized = normalizeEvent({
      event_id: 'pipeline-1',
      event_type: 'PIPELINE_UPDATE',
      timestamp: Date.now(),
      trace_id: 'trace-1',
      from_agent: 'agent-a',
      to_agent: 'agent-b',
      payload: {},
    })

    state = applyNormalizedEvents(state, [normalized])

    expect(normalized.event_type).toBe('FLOW_EVENT')
    expect(state.edges.has('agent-a|agent-b|FLOW_EVENT')).toBe(true)
  })

  it('does not clear graph on empty batch', () => {
    let state = createGraphState()
    state = applyNormalizedEvents(state, [
      makeEvent({ event_id: 'spawn-a', event_type: 'AGENT_SPAWN', agent_id: 'agent-a' }),
    ])

    const next = applyNormalizedEvents(state, [])
    expect(next).toBe(state)
  })

  it('stores unresolved edge when target is missing', () => {
    let state = createGraphState()
    state = applyNormalizedEvents(state, [
      makeEvent({ event_id: 'spawn-a', event_type: 'AGENT_SPAWN', agent_id: 'agent-a' }),
      makeEvent({
        event_id: 'handoff-unresolved',
        event_type: 'TASK_HANDOFF',
        source_agent_id: 'agent-a',
        target_agent_id: 'agent-b',
      }),
    ])

    expect(state.unresolvedEdges.has('handoff-unresolved')).toBe(true)
    expect(state.edges.size).toBe(0)
  })

  it('resolves previously unresolved edge once missing node appears', () => {
    let state = createGraphState()
    state = applyNormalizedEvents(state, [
      makeEvent({ event_id: 'spawn-a', event_type: 'AGENT_SPAWN', agent_id: 'agent-a' }),
      makeEvent({
        event_id: 'handoff-unresolved',
        event_type: 'TASK_HANDOFF',
        source_agent_id: 'agent-a',
        target_agent_id: 'agent-b',
      }),
    ])

    state = applyNormalizedEvents(state, [
      makeEvent({ event_id: 'spawn-b', event_type: 'AGENT_SPAWN', agent_id: 'agent-b' }),
    ])

    expect(state.unresolvedEdges.has('handoff-unresolved')).toBe(false)
    expect(state.edges.has('agent-a|agent-b|TASK_HANDOFF')).toBe(true)
  })

  it('reuses previous references when there is no semantic graph change', () => {
    let state = createGraphState()
    state = applyNormalizedEvents(state, [
      makeEvent({ event_id: 'spawn-a', event_type: 'AGENT_SPAWN', agent_id: 'agent-a' }),
    ])

    const graphDataBefore = graphStateToGraphData(state)
    const nextState = applyNormalizedEvents(state, [
      makeEvent({ event_id: 'metrics-1', event_type: 'OBSERVABILITY_EVENT' }),
    ])
    const graphDataAfter = graphStateToGraphData(nextState)

    expect(nextState).toBe(state)
    expect(graphDataAfter).toBe(graphDataBefore)
  })

  it('keeps user-dragged node position across subsequent updates', () => {
    let state = createGraphState()
    state = applyNormalizedEvents(state, [
      makeEvent({ event_id: 'spawn-a', event_type: 'AGENT_SPAWN', agent_id: 'agent-a' }),
    ])

    state = applyNodePosition(state, 'agent-a', { x: 321, y: 123 })
    state = applyNormalizedEvents(state, [
      makeEvent({ event_id: 'task-start-a', event_type: 'TASK_START', agent_id: 'agent-a' }),
    ])

    expect(state.nodes.get('agent-a')?.position).toEqual({ x: 321, y: 123 })
  })
})
