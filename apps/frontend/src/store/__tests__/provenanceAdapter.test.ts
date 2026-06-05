import { describe, expect, it } from 'vitest'
import { normalizeProvenanceEvent, type WebSocketEvent } from '../../types/observability'

describe('normalizeProvenanceEvent', () => {
  it('keeps legacy events compatible by normalizing provenance', () => {
    const legacy: WebSocketEvent = {
      id: 'evt-legacy-1',
      type: 'SWARM_STARTED',
      timestamp: '2026-01-01T00:00:00Z',
      source: 'swarm-runner',
      trace_id: 'trace-legacy-1',
      payload: {},
    }
    const normalized = normalizeProvenanceEvent(legacy)
    expect(normalized.provenance).toBeDefined()
    expect(normalized.provenance.event_id).toBe('evt-legacy-1')
    expect(normalized.provenance.trace_id).toBe('trace-legacy-1')
    expect(normalized.provenance.source_type).toBe('runtime')
  })

  it('accepts backend provenance events without breaking fields', () => {
    const incoming: WebSocketEvent = {
      id: 'evt-prov-1',
      event_id: 'evt-prov-1',
      type: 'AGENT_STEP_STARTED',
      event_type: 'AGENT_STEP_STARTED',
      timestamp: '2026-01-01T00:00:01Z',
      source: 'swarm-runner',
      trace_id: 'trace-prov-1',
      payload: { step_name: 'fetch' },
      provenance: {
        event_id: 'evt-prov-1',
        trace_id: 'trace-prov-1',
        sequence_no: 3,
        source_type: 'runtime',
        source_component: 'swarm_runner',
        trust_level: 'verified',
        persistence_status: 'live_unpersisted',
        timestamp: '2026-01-01T00:00:01Z',
      },
    }
    const normalized = normalizeProvenanceEvent(incoming)
    expect(normalized.provenance.sequence_no).toBe(3)
    expect(normalized.provenance.source_component).toBe('swarm_runner')
    expect(normalized.event_id).toBe('evt-prov-1')
  })

  it('normalizes missing provenance values safely', () => {
    const partial: WebSocketEvent = {
      id: 'evt-partial-1',
      type: 'TASK_START',
      timestamp: '2026-01-01T00:00:02Z',
      source: 'system',
      trace_id: 'trace-partial-1',
      step_index: 7,
      payload: {},
      provenance: {
        event_id: '',
        trace_id: '',
        sequence_no: 0,
        source_type: 'derived',
        source_component: '',
        trust_level: 'derived',
        persistence_status: 'live_unpersisted',
        timestamp: '',
      },
    }
    const normalized = normalizeProvenanceEvent(partial)
    expect(normalized.provenance.event_id).toBe('evt-partial-1')
    expect(normalized.provenance.trace_id).toBe('trace-partial-1')
    expect(normalized.provenance.sequence_no).toBe(8)
    expect(normalized.provenance.source_component).toBe('frontend.compat')
  })
})
