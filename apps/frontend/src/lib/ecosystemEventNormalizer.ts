export type EcosystemRawEvent = Record<string, unknown>

export type NormalizedEcosystemEvent = {
  trace_id: string
  type: string
  step_name: string
  timestamp: string
  payload: Record<string, unknown>
}

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const toText = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

const toIsoTimestamp = (value: unknown): string => {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  return new Date().toISOString()
}

export function normalizeEcosystemEvent(raw: EcosystemRawEvent): NormalizedEcosystemEvent {
  const input = toRecord(raw)
  const payload = toRecord(input.payload)
  const context = toRecord(input.context)

  const traceId = toText(input.trace_id ?? context.trace_id, '__unknown_trace__')
  const type = toText(input.type ?? input.event_type, 'UNKNOWN_EVENT')
  const stepName = toText(
    payload.step_name ?? input.step_name ?? context.step_name,
    'unknown_step'
  )
  const timestamp = toIsoTimestamp(input.timestamp)

  return {
    trace_id: traceId,
    type,
    step_name: stepName,
    timestamp,
    payload,
  }
}

