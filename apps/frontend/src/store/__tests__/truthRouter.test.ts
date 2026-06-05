import { describe, expect, it } from 'vitest'
import type { ProvenanceEvent } from '../../types/observability'
import {
  buildCompatibilityAggregate,
  classifyTruthLane,
  guardRuntimeLaneWrite,
  routeToTruthLane,
  writeLaneEvent,
} from '../truthRouter'

const mkEvent = (
  id: string,
  sourceType: ProvenanceEvent['provenance']['source_type'],
  trust: ProvenanceEvent['provenance']['trust_level'] = 'verified',
  sequence = 1
): ProvenanceEvent => ({
  id,
  event_id: id,
  type: 'SWARM_STARTED',
  event_type: 'SWARM_STARTED',
  timestamp: new Date().toISOString(),
  source: 'test-suite',
  trace_id: 'trace-1',
  payload: {},
  provenance: {
    event_id: id,
    trace_id: 'trace-1',
    sequence_no: sequence,
    source_type: sourceType,
    source_component: 'test',
    trust_level: trust,
    persistence_status: 'live_unpersisted',
    timestamp: new Date().toISOString(),
  },
})

describe('truthRouter', () => {
  it('classifies events into expected truth lanes', () => {
    expect(classifyTruthLane(mkEvent('evt-runtime', 'runtime'))).toBe('verifiedRuntime')
    expect(classifyTruthLane(mkEvent('evt-replay', 'replay'))).toBe('replay')
    expect(classifyTruthLane(mkEvent('evt-derived', 'derived', 'derived'))).toBe('derivedInsight')
    expect(classifyTruthLane(mkEvent('evt-synthetic', 'synthetic', 'synthetic'))).toBe('syntheticDemo')
    expect(classifyTruthLane(mkEvent('evt-mock', 'mock', 'mock'))).toBe('syntheticDemo')
  })

  it('enforces write guards by source/lane ownership', () => {
    const lanes = {
      verifiedRuntime: {},
      replay: {},
      derivedInsight: {},
      syntheticDemo: {},
    }
    const runtime = mkEvent('evt-runtime-ok', 'runtime')
    const replay = mkEvent('evt-replay-ok', 'replay')

    const runtimeRoute = routeToTruthLane(runtime)
    const replayRoute = routeToTruthLane(replay)
    expect(runtimeRoute.accepted).toBe(true)
    expect(runtimeRoute.lane).toBe('verifiedRuntime')
    expect(replayRoute.accepted).toBe(true)
    expect(replayRoute.lane).toBe('replay')

    const writeRuntime = writeLaneEvent(lanes, 'verifiedRuntime', runtime)
    expect(writeRuntime.accepted).toBe(true)
    const writeWrongLane = writeLaneEvent(writeRuntime.lanes, 'verifiedRuntime', replay)
    expect(writeWrongLane.accepted).toBe(false)
  })

  it('builds compatibility aggregate with deterministic order', () => {
    const runtimeA = mkEvent('evt-1', 'runtime', 'verified', 1)
    const replayA = mkEvent('evt-2', 'replay', 'verified', 2)
    const derivedA = mkEvent('evt-3', 'derived', 'derived', 3)
    const syntheticA = mkEvent('evt-4', 'synthetic', 'synthetic', 4)

    const aggregate = buildCompatibilityAggregate({
      verifiedRuntime: { [runtimeA.event_id]: runtimeA },
      replay: { [replayA.event_id]: replayA },
      derivedInsight: { [derivedA.event_id]: derivedA },
      syntheticDemo: { [syntheticA.event_id]: syntheticA },
    })

    expect(Object.keys(aggregate.events)).toHaveLength(4)
    expect(aggregate.eventOrder).toEqual(['evt-1', 'evt-2', 'evt-3', 'evt-4'])
  })

  it('denies spoofed runtime events from viz/mock sources when isolation is enabled', () => {
    const spoofedRuntime = {
      ...mkEvent('evt-spoof-runtime', 'runtime', 'verified', 1),
      source: 'viz-mock',
      provenance: {
        ...mkEvent('evt-spoof-runtime', 'runtime', 'verified', 1).provenance,
        source_component: 'vizBridge.mock',
      },
    }
    const guarded = guardRuntimeLaneWrite({
      event: spoofedRuntime,
      attemptedLane: 'verifiedRuntime',
      isolationEnabled: true,
    })
    expect(guarded.allowed).toBe(false)
    expect(guarded.reason).toBe('SPOOFED_RUNTIME_SOURCE_COMPONENT')
  })

  it('allows verified runtime backend events when isolation is enabled', () => {
    const runtimeEvent = {
      ...mkEvent('evt-runtime-verified', 'runtime', 'verified', 1),
      source: 'swarm-runner',
      provenance: {
        ...mkEvent('evt-runtime-verified', 'runtime', 'verified', 1).provenance,
        source_component: 'swarm_runner',
      },
    }
    const guarded = guardRuntimeLaneWrite({
      event: runtimeEvent,
      attemptedLane: 'verifiedRuntime',
      isolationEnabled: true,
    })
    expect(guarded.allowed).toBe(true)
  })

  it('denies source_type runtime when source indicates mock producer', () => {
    const spoofed = {
      ...mkEvent('evt-runtime-mock-source', 'runtime', 'verified', 1),
      source: 'mock-producer',
      provenance: {
        ...mkEvent('evt-runtime-mock-source', 'runtime', 'verified', 1).provenance,
        source_component: 'backend.pipeline',
      },
    }
    const guarded = guardRuntimeLaneWrite({
      event: spoofed,
      attemptedLane: 'verifiedRuntime',
      isolationEnabled: true,
    })
    expect(guarded.allowed).toBe(false)
    expect(guarded.reason).toBe('SPOOFED_RUNTIME_SOURCE')
  })
})
