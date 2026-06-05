import type { ProvenanceEvent, SourceType, TrustLevel } from '../types/observability'

export type TruthLane = 'verifiedRuntime' | 'replay' | 'derivedInsight' | 'syntheticDemo'

export type LaneStores = Record<TruthLane, Record<string, ProvenanceEvent>>

export type RouterResult = {
  lane: TruthLane
  accepted: boolean
  reason?: string
}

export type IsolationDenialReason =
  | 'SOURCE_TYPE_SYNTHETIC'
  | 'SOURCE_TYPE_MOCK'
  | 'SOURCE_TYPE_UNKNOWN'
  | 'MISSING_PROVENANCE'
  | 'LANE_MISMATCH'
  | 'TRUST_LEVEL_NON_RUNTIME'
  | 'SPOOFED_RUNTIME_SOURCE_COMPONENT'
  | 'SPOOFED_RUNTIME_SOURCE'

export type GuardRuntimeLaneWriteInput = {
  event: ProvenanceEvent
  attemptedLane: 'verifiedRuntime'
  isolationEnabled: boolean
}

export type GuardRuntimeLaneWriteResult = {
  allowed: boolean
  reason?: IsolationDenialReason
  normalizedSourceType?: SourceType | 'unknown'
}

const runtimeSources: SourceType[] = ['runtime', 'persisted']
const replaySources: SourceType[] = ['replay']
const derivedSources: SourceType[] = ['derived']
const syntheticSources: SourceType[] = ['synthetic', 'mock']

const laneSourceMap: Record<TruthLane, SourceType[]> = {
  verifiedRuntime: runtimeSources,
  replay: replaySources,
  derivedInsight: derivedSources,
  syntheticDemo: syntheticSources,
}

export const classifyTruthLane = (event: ProvenanceEvent): TruthLane => {
  const sourceType = event.provenance?.source_type
  if (sourceType && laneSourceMap.replay.includes(sourceType)) return 'replay'
  if (sourceType && laneSourceMap.derivedInsight.includes(sourceType)) return 'derivedInsight'
  if (sourceType && laneSourceMap.syntheticDemo.includes(sourceType)) return 'syntheticDemo'
  return 'verifiedRuntime'
}

export const isEventAllowedInLane = (event: ProvenanceEvent, lane: TruthLane) => {
  const sourceType = event.provenance?.source_type
  if (!sourceType) return lane === 'verifiedRuntime'
  return laneSourceMap[lane].includes(sourceType)
}

export const routeToTruthLane = (event: ProvenanceEvent): RouterResult => {
  const lane = classifyTruthLane(event)
  if (!isEventAllowedInLane(event, lane)) {
    return { lane, accepted: false, reason: 'SOURCE_TYPE_NOT_ALLOWED_FOR_LANE' }
  }
  return { lane, accepted: true }
}

export const writeLaneEvent = (
  lanes: LaneStores,
  lane: TruthLane,
  event: ProvenanceEvent
): { lanes: LaneStores; accepted: boolean; reason?: string } => {
  const route = routeToTruthLane(event)
  if (!route.accepted || route.lane !== lane) {
    return { lanes, accepted: false, reason: route.reason ?? 'LANE_MISMATCH' }
  }
  return {
    lanes: {
      ...lanes,
      [lane]: {
        ...lanes[lane],
        [event.event_id]: event,
      },
    },
    accepted: true,
  }
}

const isSpoofedRuntimeSourceComponent = (sourceComponent: string) => {
  const value = sourceComponent.toLowerCase()
  return (
    value.startsWith('viz') ||
    value.includes('mock') ||
    value.includes('demo') ||
    value.includes('synthetic') ||
    value === 'frontend.compat'
  )
}

const isSpoofedRuntimeSource = (source: string) => {
  const value = source.toLowerCase()
  return value.includes('viz') || value.includes('mock') || value.includes('demo')
}

export const guardRuntimeLaneWrite = ({
  event,
  attemptedLane,
  isolationEnabled,
}: GuardRuntimeLaneWriteInput): GuardRuntimeLaneWriteResult => {
  if (!isolationEnabled) {
    return { allowed: true, normalizedSourceType: event.provenance?.source_type ?? 'unknown' }
  }
  if (attemptedLane !== 'verifiedRuntime') {
    return { allowed: false, reason: 'LANE_MISMATCH', normalizedSourceType: event.provenance?.source_type ?? 'unknown' }
  }

  const provenance = event.provenance
  if (!provenance) {
    return { allowed: false, reason: 'MISSING_PROVENANCE', normalizedSourceType: 'unknown' }
  }

  const sourceType = provenance.source_type ?? 'unknown'
  if (sourceType === 'synthetic') return { allowed: false, reason: 'SOURCE_TYPE_SYNTHETIC', normalizedSourceType: sourceType }
  if (sourceType === 'mock') return { allowed: false, reason: 'SOURCE_TYPE_MOCK', normalizedSourceType: sourceType }
  if (sourceType !== 'runtime' && sourceType !== 'persisted' && sourceType !== 'replay') {
    return { allowed: false, reason: 'SOURCE_TYPE_UNKNOWN', normalizedSourceType: sourceType }
  }
  if (provenance.trust_level !== 'verified') {
    return { allowed: false, reason: 'TRUST_LEVEL_NON_RUNTIME', normalizedSourceType: sourceType }
  }

  const sourceComponent = String(provenance.source_component ?? '')
  if (sourceType === 'runtime' && isSpoofedRuntimeSourceComponent(sourceComponent)) {
    return {
      allowed: false,
      reason: 'SPOOFED_RUNTIME_SOURCE_COMPONENT',
      normalizedSourceType: sourceType,
    }
  }

  const source = String(event.source ?? '')
  if (sourceType === 'runtime' && isSpoofedRuntimeSource(source)) {
    return {
      allowed: false,
      reason: 'SPOOFED_RUNTIME_SOURCE',
      normalizedSourceType: sourceType,
    }
  }

  return { allowed: true, normalizedSourceType: sourceType }
}

const precedence: TruthLane[] = ['verifiedRuntime', 'replay', 'derivedInsight', 'syntheticDemo']

const trustRank: Record<TrustLevel, number> = {
  verified: 4,
  derived: 3,
  synthetic: 2,
  mock: 1,
  unknown: 0,
}

const getEventTimestamp = (event: ProvenanceEvent) => {
  const parsed = Date.parse(String(event.timestamp ?? event.provenance?.timestamp ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export const buildCompatibilityAggregate = (lanes: LaneStores) => {
  const merged: Record<string, ProvenanceEvent> = {}

  for (const lane of precedence) {
    const laneEvents = lanes[lane]
    for (const [eventId, event] of Object.entries(laneEvents)) {
      const existing = merged[eventId]
      if (!existing) {
        merged[eventId] = event
        continue
      }
      const incomingRank = trustRank[event.provenance?.trust_level ?? 'unknown']
      const existingRank = trustRank[existing.provenance?.trust_level ?? 'unknown']
      if (incomingRank > existingRank) {
        merged[eventId] = event
        continue
      }
      if (incomingRank === existingRank && getEventTimestamp(event) >= getEventTimestamp(existing)) {
        merged[eventId] = event
      }
    }
  }

  const eventOrder = Object.values(merged)
    .sort((a, b) => {
      const seqA = Number(a.provenance?.sequence_no ?? 0)
      const seqB = Number(b.provenance?.sequence_no ?? 0)
      if (seqA !== seqB) return seqA - seqB
      return getEventTimestamp(a) - getEventTimestamp(b)
    })
    .map((event) => event.event_id)

  return {
    events: merged,
    eventOrder,
  }
}
