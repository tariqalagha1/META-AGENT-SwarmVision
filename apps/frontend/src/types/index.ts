// TypeScript type definitions for frontend
// Re-export types from hooks and components

export type { UseWebSocketOptions, UseWebSocketState } from '../hooks/useWebSocket'
export type {
  AgentPanelPayload,
  AlertPanelPayload,
  MetaInsightEvent,
  SystemGraphPayload,
  TimelineEventPayload,
  WebSocketEvent,
} from './observability'
