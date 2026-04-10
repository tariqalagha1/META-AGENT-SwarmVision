import { EventEmitter } from './EventEmitter.js'
import { WebSocketConnector, type WebSocketConfig } from './WebSocketConnector.js'
import type {
  AppContext,
  Event,
  EventInput,
  SDKConnectionState,
  SwarmVisionClientConfig,
} from '@swarmvision/shared-types'

export interface SubscriptionOptions {
  tenantId?: string
  appId?: string
  eventType?: string
}

export type EventSubscriber = (event: Event) => void | Promise<void>

export class SwarmVisionClient {
  private readonly emitter = new EventEmitter()
  private readonly connector: WebSocketConnector
  private readonly apiBaseUrl: string
  private tenantId?: string
  private appContext?: AppContext

  constructor(config: SwarmVisionClientConfig) {
    this.apiBaseUrl = config.apiBaseUrl.replace(/\/$/, '')
    this.tenantId = config.tenantId
    this.appContext = config.appContext

    const wsUrl =
      config.wsUrl ?? this.apiBaseUrl.replace(/^http/i, 'ws').replace(/\/$/, '') + '/ws/events'

    const wsConfig: WebSocketConfig = {
      url: wsUrl,
      reconnectAttempts: config.reconnectAttempts,
      reconnectDelay: config.reconnectDelay,
      pingInterval: config.pingInterval,
    }

    this.connector = new WebSocketConnector(wsConfig)
    this.connector.on('event', async (data) => {
      const event = data as Event
      await this.emitter.emit('event', event)
      await this.emitter.emit(`event:${event.type}`, event)
    })
  }

  async connect(): Promise<SDKConnectionState> {
    await this.connector.connect()
    return this.getState()
  }

  async publishEvent(event: EventInput): Promise<Event> {
    const payload = this.enrichEvent(event)
    const response = await fetch(`${this.apiBaseUrl}/events/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(`Failed to publish event: ${message}`)
    }

    const result = (await response.json()) as { event: Event }
    await this.emitter.emit('event', result.event)
    await this.emitter.emit(`event:${result.event.type}`, result.event)
    return result.event
  }

  subscribe(listener: EventSubscriber, options?: SubscriptionOptions): () => void {
    const wrapped = async (data: unknown) => {
      const event = data as Event
      if (options?.tenantId && event.context?.tenant_id !== options.tenantId) return
      if (options?.appId && event.context?.app_id !== options.appId) return
      if (options?.eventType && event.type !== options.eventType) return
      await listener(event)
    }

    this.emitter.on('event', wrapped)
    return () => this.emitter.off('event', wrapped)
  }

  setTenant(tenantId: string | undefined): void {
    this.tenantId = tenantId
  }

  setAppContext(appContext: AppContext | undefined): void {
    this.appContext = appContext
  }

  disconnect(): void {
    this.connector.disconnect()
    this.emitter.removeAllListeners()
  }

  getState(): SDKConnectionState {
    return {
      connected: this.connector.isConnected(),
      tenantId: this.tenantId,
      appContext: this.appContext,
    }
  }

  private enrichEvent(event: EventInput): Event {
    const context = {
      ...this.appContext,
      ...event.context,
      tenant_id: event.context?.tenant_id ?? this.tenantId,
    }

    return {
      id: event.id ?? this.generateEventId(),
      type: event.type,
      timestamp: event.timestamp ?? new Date().toISOString(),
      source: event.source ?? 'sdk',
      payload: event.payload ?? {},
      context,
    }
  }

  private generateEventId(): string {
    if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
      return globalThis.crypto.randomUUID()
    }
    return `sdk-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}
