import { DECISION_FLAG_TOKENS, type DecisionFlag } from '../design/decisionFlagTokens'
import type { ObservabilityEvent } from '../store'

export type DecisionEvent = ObservabilityEvent

export interface DecisionFields {
  flag: DecisionFlag
  decisionPoint: string
  reason: string
  output: unknown
  confidence: number | null
}

const DECISION_FLAG_SET: ReadonlySet<string> = new Set(Object.keys(DECISION_FLAG_TOKENS))

const normalizeConfidence = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value >= 0 && value <= 1) return value
  if (value > 1 && value <= 100) return value / 100
  return null
}

export function getDecisionFields(event: DecisionEvent): DecisionFields {
  const rawFlag = String(event.decision_flag ?? '').trim().toUpperCase()
  const hasFlag = rawFlag.length > 0
  const flag = DECISION_FLAG_SET.has(rawFlag) ? (rawFlag as DecisionFlag) : 'UNKNOWN'

  if (!hasFlag && import.meta.env.DEV) {
    console.warn('[DecisionPanel] Missing decision_flag on event:', event.event_id ?? event.id)
  }

  const payload = event.payload ?? {}
  const decisionPoint = String(payload.decision_point ?? '').trim() || '—'
  const reason = String(payload.reason ?? '').trim() || '—'
  const output = payload.decision_output
  const confidence = normalizeConfidence(payload.confidence)

  return {
    flag,
    decisionPoint,
    reason,
    output,
    confidence,
  }
}

export function applyFilters(
  decisions: DecisionEvent[],
  flagFilter: DecisionFlag[],
  searchText: string
): DecisionEvent[] {
  const normalizedSearch = searchText.trim().toLowerCase()
  const hasSearch = normalizedSearch.length > 0
  const hasFlagFilter = flagFilter.length > 0
  const activeFlags = hasFlagFilter ? new Set(flagFilter) : null

  if (!hasSearch && !hasFlagFilter) return decisions

  return decisions.filter((event) => {
    const fields = getDecisionFields(event)

    if (activeFlags && !activeFlags.has(fields.flag)) {
      return false
    }

    if (!hasSearch) {
      return true
    }

    const haystack = `${fields.decisionPoint} ${fields.reason}`.toLowerCase()
    return haystack.includes(normalizedSearch)
  })
}
