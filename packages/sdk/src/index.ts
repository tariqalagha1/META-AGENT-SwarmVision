export { EventEmitter } from './EventEmitter.js'
export { WebSocketConnector, type WebSocketConfig } from './WebSocketConnector.js'
export {
  SwarmVisionClient,
  type EventSubscriber,
  type SubscriptionOptions,
} from './SwarmVisionClient.js'
export {
  SwarmVisionWidget,
  mountSwarmVisionWidget,
  type SwarmVisionWidgetProps,
} from './SwarmVisionWidget.js'

export type {
  AppContext,
  Event,
  EventContext,
  EventInput,
  SDKConnectionState,
  SwarmVisionClientConfig,
  SwarmVisionWidgetConfig,
  TenantQuery,
} from '@swarmvision/shared-types'
export { EventType, AgentState, TaskState } from '@swarmvision/shared-types'
