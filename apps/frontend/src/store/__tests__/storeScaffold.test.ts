import { describe, expect, it } from 'vitest'
import { runtimeConfig } from '../../config/runtime'
import { observabilityStore } from '../useObservabilityStore'

describe('Sprint 1 store scaffolding', () => {
  it('initializes scaffold slices', () => {
    const state = observabilityStore.getState()
    expect(state.scaffolds).toBeDefined()
    expect(state.scaffolds.verifiedRuntime).toBeDefined()
    expect(state.scaffolds.replay).toBeDefined()
    expect(state.scaffolds.derivedInsight).toBeDefined()
    expect(state.scaffolds.syntheticDemo).toBeDefined()
    expect(state.scaffolds.digitalTwinProjection).toBeDefined()
    expect(state.compatibilityAggregate).toBeDefined()
    expect(state.compatibilityAggregate.events).toBeDefined()
    expect(state.compatibilityAggregate.eventOrder).toBeDefined()
  })

  it('keeps store_split_enabled false by default', () => {
    expect(runtimeConfig.truth.store_split_enabled).toBe(false)
  })

  it('preserves legacy ingestion path when store split is disabled', () => {
    const eventId = `evt-legacy-path-${Date.now()}`
    const before = observabilityStore.getState().eventOrder.length
    observabilityStore.getState().addEvent({
      id: eventId,
      type: 'SWARM_STARTED',
      timestamp: new Date().toISOString(),
      source: 'test-suite',
      trace_id: 'trace-legacy-path',
      payload: { task: 'legacy path' },
    })
    const afterState = observabilityStore.getState()
    expect(afterState.eventOrder.length).toBe(before + 1)
    expect(afterState.events[eventId]).toBeDefined()
    expect(afterState.events[eventId].provenance).toBeDefined()
  })
})
