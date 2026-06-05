import { describe, expect, it } from 'vitest'
import { observabilityStore } from '../useObservabilityStore'
import { selectReplayEventCount } from '../selectors'

describe('replay session lock', () => {
  it('replay active + live events arriving keeps replay view unchanged when locked', () => {
    const state = observabilityStore.getState()
    const baseTs = Date.now()

    const replayEventId = `evt-replay-lock-${baseTs}`
    state.addEvent({
      id: replayEventId,
      event_id: replayEventId,
      type: 'TASK_HANDOFF',
      event_type: 'TASK_HANDOFF',
      timestamp: new Date(baseTs).toISOString(),
      source: 'swarm-runner',
      trace_id: 'trace-replay-lock',
      payload: {},
      provenance: {
        event_id: replayEventId,
        trace_id: 'trace-replay-lock',
        sequence_no: 1,
        source_type: 'runtime',
        source_component: 'swarm_runner',
        trust_level: 'verified',
        persistence_status: 'live_unpersisted',
        timestamp: new Date(baseTs).toISOString(),
      },
    })

    state.setReplay({ enabled: true, cursorTs: baseTs })
    state.setReplaySession({
      view_mode: 'replay',
      cursor_ts: baseTs,
    })
    state.lockReplaySession()

    const before = selectReplayEventCount(observabilityStore.getState())

    const liveEventId = `evt-live-after-lock-${baseTs + 60000}`
    state.addEvent({
      id: liveEventId,
      event_id: liveEventId,
      type: 'TASK_HANDOFF',
      event_type: 'TASK_HANDOFF',
      timestamp: new Date(baseTs + 60000).toISOString(),
      source: 'swarm-runner',
      trace_id: 'trace-replay-lock',
      payload: {},
      provenance: {
        event_id: liveEventId,
        trace_id: 'trace-replay-lock',
        sequence_no: 2,
        source_type: 'runtime',
        source_component: 'swarm_runner',
        trust_level: 'verified',
        persistence_status: 'live_unpersisted',
        timestamp: new Date(baseTs + 60000).toISOString(),
      },
    })

    const after = selectReplayEventCount(observabilityStore.getState())
    expect(after).toBe(before)
  })
})
