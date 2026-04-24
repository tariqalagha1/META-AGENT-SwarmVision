import type { WebSocketEvent } from '../hooks/useWebSocket'
import type { SeverityLevel } from '../design/severityTokens'

export type AnomalyEvent = WebSocketEvent

const VALID_SEVERITIES: ReadonlySet<string> = new Set(['LOW', 'MEDIUM', 'HIGH'])

export function getSeverity(event: AnomalyEvent): SeverityLevel {
  const rawSeverity = String(event.payload?.severity ?? '').toUpperCase()

  if (VALID_SEVERITIES.has(rawSeverity)) {
    return rawSeverity as SeverityLevel
  }

  if (import.meta.env.DEV) {
    console.warn('[AlertsPanel] Missing severity on event:', event.event_id ?? event.id)
  }

  return 'LOW'
}
