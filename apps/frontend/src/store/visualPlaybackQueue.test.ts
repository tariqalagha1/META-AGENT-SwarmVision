import { describe, expect, it } from 'vitest'
import type { NormalizedEcosystemEvent } from '../lib/ecosystemEventNormalizer'
import {
  createVisualEventId,
  shouldQueueForVisualPlayback,
  VISUAL_EVENT_TYPES,
} from './visualPlaybackQueue'

const traceId = 'trace-q-1'
const baseTs = '2026-05-01T19:06:35.900Z'

const ev = (type: string, step_name: string): NormalizedEcosystemEvent => ({
  trace_id: traceId,
  type,
  step_name,
  timestamp: baseTs,
  payload: {},
})

describe('visualPlaybackQueue', () => {
  it('preserves queue order and stable event ids for burst sequence', () => {
    const burst = [
      ev('SWARM_STARTED', 'unknown_step'),
      ev('AGENT_STEP_STARTED', 'fetch'),
      ev('AGENT_STEP_COMPLETED', 'fetch'),
      ev('AGENT_STEP_STARTED', 'normalize'),
      ev('AGENT_STEP_COMPLETED', 'normalize'),
      ev('AGENT_STEP_STARTED', 'quality'),
      ev('AGENT_STEP_COMPLETED', 'quality'),
      ev('SWARM_COMPLETED', 'unknown_step'),
      ev('SWARM_RESULT', 'unknown_step'),
    ]

    const ids = burst.map((event, index) => createVisualEventId(event, index))
    const unique = new Set(ids)

    expect(unique.size).toBe(burst.length)
    expect(ids[1]).toContain('|AGENT_STEP_STARTED|fetch|')
    expect(ids[3]).toContain('|AGENT_STEP_STARTED|normalize|')
    expect(ids[5]).toContain('|AGENT_STEP_STARTED|quality|')
  })

  it('queues only visual runtime event types', () => {
    const queuedTypes = Array.from(VISUAL_EVENT_TYPES)
    expect(queuedTypes).toContain('AGENT_STEP_STARTED')
    expect(queuedTypes).toContain('PLANNER_DECISION')
    expect(shouldQueueForVisualPlayback(ev('AGENT_STEP_STARTED', 'fetch'))).toBe(true)
    expect(shouldQueueForVisualPlayback(ev('PLANNER_DECISION', 'unknown_step'))).toBe(true)
    expect(shouldQueueForVisualPlayback(ev('DECISION', 'unknown_step'))).toBe(false)
  })

  it('applies burst events sequentially in original order', () => {
    const burst = [
      ev('SWARM_STARTED', 'unknown_step'),
      ev('PLANNER_DECISION', 'unknown_step'),
      ev('AGENT_STEP_STARTED', 'fetch'),
      ev('AGENT_STEP_COMPLETED', 'fetch'),
      ev('AGENT_STEP_STARTED', 'normalize'),
      ev('AGENT_STEP_COMPLETED', 'normalize'),
      ev('AGENT_STEP_STARTED', 'quality'),
      ev('AGENT_STEP_COMPLETED', 'quality'),
      ev('SWARM_COMPLETED', 'unknown_step'),
      ev('SWARM_RESULT', 'unknown_step'),
    ]

    const queue = burst.map((event, index) => ({
      id: createVisualEventId(event, index),
      event,
    }))
    const applied: string[] = []
    while (queue.length > 0) {
      const next = queue.shift()
      if (!next) break
      applied.push(`${next.event.type}:${next.event.step_name}`)
    }

    expect(applied).toEqual([
      'SWARM_STARTED:unknown_step',
      'PLANNER_DECISION:unknown_step',
      'AGENT_STEP_STARTED:fetch',
      'AGENT_STEP_COMPLETED:fetch',
      'AGENT_STEP_STARTED:normalize',
      'AGENT_STEP_COMPLETED:normalize',
      'AGENT_STEP_STARTED:quality',
      'AGENT_STEP_COMPLETED:quality',
      'SWARM_COMPLETED:unknown_step',
      'SWARM_RESULT:unknown_step',
    ])
  })
})
