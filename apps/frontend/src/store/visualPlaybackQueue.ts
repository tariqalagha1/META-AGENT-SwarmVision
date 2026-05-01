import type { NormalizedEcosystemEvent } from '../lib/ecosystemEventNormalizer'

export const VISUAL_EVENT_STEP_DELAY_MS = 300

export type VisualQueueEvent = {
  id: string
  event: NormalizedEcosystemEvent
}

export const VISUAL_EVENT_TYPES = new Set<string>([
  'SWARM_STARTED',
  'PLANNER_DECISION',
  'AGENT_STEP_STARTED',
  'AGENT_STEP_COMPLETED',
  'AGENT_STEP_FAILED',
  'AGENT_STEP_RETRY',
  'SWARM_COMPLETED',
  'SWARM_FAILED',
  'SWARM_RESULT',
  // Generic DECISION events intentionally excluded pending schema review.
])

const toText = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value : fallback

export const createVisualEventId = (
  event: NormalizedEcosystemEvent,
  index: number
): string => {
  const traceId = toText(event.trace_id, '__unknown_trace__')
  const eventType = toText(event.type, 'UNKNOWN_EVENT')
  const stepName = toText(event.step_name, 'unknown_step')
  const timestamp = toText(event.timestamp, new Date(0).toISOString())
  return `${traceId}|${eventType}|${stepName}|${timestamp}|${index}`
}

export const shouldQueueForVisualPlayback = (event: NormalizedEcosystemEvent): boolean =>
  VISUAL_EVENT_TYPES.has(toText(event.type, ''))
