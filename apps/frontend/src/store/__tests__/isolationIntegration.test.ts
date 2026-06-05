import { describe, expect, it } from 'vitest'
import { runtimeConfig } from '../../config/runtime'
import { observabilityStore } from '../useObservabilityStore'

describe('synthetic isolation integration', () => {
  it('denies spoofed runtime from vizBridge/mock producer and records violation', () => {
    const prevSplit = runtimeConfig.truth.store_split_enabled
    const prevIsolation = runtimeConfig.truth.synthetic_isolation_enabled
    runtimeConfig.truth.store_split_enabled = true
    runtimeConfig.truth.synthetic_isolation_enabled = true

    try {
      const eventId = `evt-spoof-${Date.now()}`
      const beforeViolations = observabilityStore.getState().isolationLedger.length
      observabilityStore.getState().addEvent({
        id: eventId,
        event_id: eventId,
        type: 'TASK_HANDOFF',
        event_type: 'TASK_HANDOFF',
        timestamp: new Date().toISOString(),
        source: 'viz-mock',
        trace_id: 'trace-spoof-viz',
        payload: { source: 'viz-mock' },
        provenance: {
          event_id: eventId,
          trace_id: 'trace-spoof-viz',
          sequence_no: 1,
          source_type: 'runtime',
          source_component: 'vizBridge.mock',
          trust_level: 'verified',
          persistence_status: 'live_unpersisted',
          timestamp: new Date().toISOString(),
        },
      })

      const state = observabilityStore.getState()
      expect(state.scaffolds.verifiedRuntime[eventId]).toBeUndefined()
      expect(state.scaffolds.syntheticDemo[eventId]).toBeUndefined()
      expect(state.isolationLedger.length).toBe(beforeViolations + 1)
      expect(state.isolationLedger[state.isolationLedger.length - 1]?.reason).toBe(
        'SPOOFED_RUNTIME_SOURCE_COMPONENT'
      )
    } finally {
      runtimeConfig.truth.store_split_enabled = prevSplit
      runtimeConfig.truth.synthetic_isolation_enabled = prevIsolation
    }
  })

  it('allows runtime backend event into verifiedRuntime when isolation enabled', () => {
    const prevSplit = runtimeConfig.truth.store_split_enabled
    const prevIsolation = runtimeConfig.truth.synthetic_isolation_enabled
    runtimeConfig.truth.store_split_enabled = true
    runtimeConfig.truth.synthetic_isolation_enabled = true

    try {
      const eventId = `evt-runtime-ok-${Date.now()}`
      observabilityStore.getState().addEvent({
        id: eventId,
        event_id: eventId,
        type: 'TASK_HANDOFF',
        event_type: 'TASK_HANDOFF',
        timestamp: new Date().toISOString(),
        source: 'swarm-runner',
        trace_id: 'trace-runtime-ok',
        payload: {},
        provenance: {
          event_id: eventId,
          trace_id: 'trace-runtime-ok',
          sequence_no: 1,
          source_type: 'runtime',
          source_component: 'swarm_runner',
          trust_level: 'verified',
          persistence_status: 'live_unpersisted',
          timestamp: new Date().toISOString(),
        },
      })

      const state = observabilityStore.getState()
      expect(state.scaffolds.verifiedRuntime[eventId]).toBeDefined()
    } finally {
      runtimeConfig.truth.store_split_enabled = prevSplit
      runtimeConfig.truth.synthetic_isolation_enabled = prevIsolation
    }
  })

  it('denies runtime source_type with inconsistent source_component when isolation enabled', () => {
    const prevSplit = runtimeConfig.truth.store_split_enabled
    const prevIsolation = runtimeConfig.truth.synthetic_isolation_enabled
    runtimeConfig.truth.store_split_enabled = true
    runtimeConfig.truth.synthetic_isolation_enabled = true

    try {
      const eventId = `evt-inconsistent-${Date.now()}`
      const before = observabilityStore.getState().isolationCounters.SPOOFED_RUNTIME_SOURCE_COMPONENT
      observabilityStore.getState().addEvent({
        id: eventId,
        event_id: eventId,
        type: 'TASK_HANDOFF',
        event_type: 'TASK_HANDOFF',
        timestamp: new Date().toISOString(),
        source: 'swarm-runner',
        trace_id: 'trace-inconsistent',
        payload: {},
        provenance: {
          event_id: eventId,
          trace_id: 'trace-inconsistent',
          sequence_no: 2,
          source_type: 'runtime',
          source_component: 'frontend.compat',
          trust_level: 'verified',
          persistence_status: 'live_unpersisted',
          timestamp: new Date().toISOString(),
        },
      })
      const state = observabilityStore.getState()
      expect(state.scaffolds.verifiedRuntime[eventId]).toBeUndefined()
      expect(state.isolationCounters.SPOOFED_RUNTIME_SOURCE_COMPONENT).toBe(before + 1)
    } finally {
      runtimeConfig.truth.store_split_enabled = prevSplit
      runtimeConfig.truth.synthetic_isolation_enabled = prevIsolation
    }
  })
})
