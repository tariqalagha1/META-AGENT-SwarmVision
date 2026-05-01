import { afterEach, describe, expect, it } from 'vitest'
import type { NormalizedEcosystemEvent } from '../lib/ecosystemEventNormalizer'
import {
  __resetEcosystemRuntimeStoreForTests,
  getTraceState,
} from './ecosystemRuntimeStore'
import { handleNormalizedEvent } from './eventToMotionMapper'

const traceId = 'trace-test-001'

const evt = (
  type: string,
  step_name: string = 'unknown_step',
  payload: Record<string, unknown> = {}
): NormalizedEcosystemEvent => ({
  trace_id: traceId,
  type,
  step_name,
  timestamp: new Date().toISOString(),
  payload,
})

afterEach(() => {
  __resetEcosystemRuntimeStoreForTests()
})

describe('eventToMotionMapper runtime progression', () => {
  it('accumulates nodes and edges across fetch->normalize->quality sequence', () => {
    const sequence: NormalizedEcosystemEvent[] = [
      evt('SWARM_STARTED'),
      evt('AGENT_STEP_STARTED', 'fetch'),
      evt('AGENT_STEP_COMPLETED', 'fetch'),
      evt('AGENT_STEP_STARTED', 'normalize'),
      evt('AGENT_STEP_COMPLETED', 'normalize'),
      evt('AGENT_STEP_STARTED', 'quality'),
      evt('AGENT_STEP_COMPLETED', 'quality'),
      evt('SWARM_RESULT'),
    ]

    for (const e of sequence) {
      handleNormalizedEvent(e)
    }

    const trace = getTraceState(traceId)

    expect(trace.nodes.fetch_agent?.state).toBe('completed')
    expect(trace.nodes.normalize_agent?.state).toBe('completed')
    expect(trace.nodes.quality_agent?.state).toBe('completed')

    expect(trace.edges['fetch_agent->normalize_agent']?.state).toBe('completed')
    expect(trace.edges['normalize_agent->quality_agent']?.state).toBe('completed')

    expect(trace.currentStep).toBe('quality_agent')
  })

  it('handles planner decision without mutating node progression state', () => {
    handleNormalizedEvent(evt('SWARM_STARTED'))
    handleNormalizedEvent(
      evt('PLANNER_DECISION', 'unknown_step', {
        reason: 'default_plan',
        planned_steps: ['fetch', 'normalize', 'quality'],
      })
    )
    handleNormalizedEvent(evt('AGENT_STEP_STARTED', 'fetch'))

    const trace = getTraceState(traceId)
    expect(trace.nodes.fetch_agent?.state).toBe('active')
    expect(Object.keys(trace.nodes).length).toBe(1)
    expect(trace.currentStep).toBe('fetch_agent')
    expect(trace.lastPlannerDecision?.reason).toBe('default_plan')
  })
})
