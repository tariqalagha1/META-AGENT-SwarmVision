import { act, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import type { UseWebSocketOptions, WebSocketEvent } from './hooks/useWebSocket'

let latestWebSocketOptions: UseWebSocketOptions | null = null

vi.mock('./hooks/useWebSocket', async () => {
  const actual = await vi.importActual<typeof import('./hooks/useWebSocket')>(
    './hooks/useWebSocket'
  )

  return {
    ...actual,
    useWebSocket: (options: UseWebSocketOptions) => {
      latestWebSocketOptions = options
      return {
        state: {
          connected: true,
          error: null,
          eventCount: 0,
          lastEvent: null,
          reconnectAttempts: 0,
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
        send: vi.fn(),
        ws: null,
      }
    },
  }
})

function emitEvent(event: Partial<WebSocketEvent> & Pick<WebSocketEvent, 'type'>) {
  if (!latestWebSocketOptions?.onEvent) {
    throw new Error('WebSocket hook not initialized')
  }

  const nextEvent: WebSocketEvent = {
    id: event.id ?? `event-${Math.random().toString(36).slice(2)}`,
    type: event.type,
    timestamp: event.timestamp ?? new Date().toISOString(),
    source: event.source ?? 'sdk',
    payload: event.payload ?? {},
    context: event.context,
  }

  act(() => {
    latestWebSocketOptions?.onEvent?.(nextEvent)
  })
}

describe('Phase 8 tenant-scoped embed mode', () => {
  it('shows tenant and app context while analytics requests stay scoped', async () => {
    const previousUrl = window.location.href
    window.history.pushState(
      {},
      '',
      '/?embed=1&tenant_id=tenant-a&app_id=host-app&app_name=Host%20Portal&environment=prod&version=1.4.2'
    )

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      expect(url).toContain('tenant_id=tenant-a')
      expect(url).toContain('app_id=host-app')

      if (url.includes('/analytics/summary')) {
        return new Response(
          JSON.stringify({
            available: true,
            from_timestamp: '2026-04-10T12:00:00.000Z',
            to_timestamp: '2026-04-10T12:05:00.000Z',
            metrics: {
              total_events: 1,
              active_agents: 1,
              failed_tasks: 0,
              successful_tasks: 0,
              average_handoff_latency_ms: 0,
              peak_concurrent_agents: 1,
              average_task_completion_time_ms: 0,
            },
          }),
          { status: 200 }
        )
      }

      if (url.includes('/analytics/failures')) {
        return new Response(
          JSON.stringify({
            available: true,
            from_timestamp: '2026-04-10T12:00:00.000Z',
            to_timestamp: '2026-04-10T12:05:00.000Z',
            total_failures: 0,
            failures_over_time: [],
            incidents: [],
          }),
          { status: 200 }
        )
      }

      if (url.includes('/analytics/latency')) {
        return new Response(
          JSON.stringify({
            available: true,
            from_timestamp: '2026-04-10T12:00:00.000Z',
            to_timestamp: '2026-04-10T12:05:00.000Z',
            events_per_minute: [],
            latency_over_time: [],
          }),
          { status: 200 }
        )
      }

      return new Response(
        JSON.stringify({
          available: true,
          from_timestamp: '2026-04-10T12:00:00.000Z',
          to_timestamp: '2026-04-10T12:05:00.000Z',
          agents: [],
          suspected_root_causes: [],
        }),
        { status: 200 }
      )
    }) as typeof fetch

    render(<App />)

    emitEvent({
      type: 'AGENT_SPAWN',
      payload: { agent_id: 'tenant-node', agent_name: 'TenantNode' },
      context: {
        tenant_id: 'tenant-a',
        app_id: 'host-app',
        app_name: 'Host Portal',
        environment: 'prod',
        version: '1.4.2',
      },
    })
    emitEvent({
      type: 'AGENT_SPAWN',
      payload: { agent_id: 'other-node', agent_name: 'OtherNode' },
      context: {
        tenant_id: 'tenant-b',
        app_id: 'host-app',
        app_name: 'Host Portal',
        environment: 'prod',
        version: '1.4.2',
      },
    })

    expect(await screen.findByTestId('app-scope-bar')).toHaveTextContent('Tenant tenant-a')
    expect(screen.getByTestId('app-scope-bar')).toHaveTextContent('Host Portal')

    await waitFor(() => {
      expect(screen.getByTestId('flow-node-tenant-node')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('flow-node-other-node')).not.toBeInTheDocument()

    act(() => {
      screen.getByTestId('flow-node-tenant-node').dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })

    const inspector = screen.getByText('Swarm Inspector').closest('.swarm-inspector')
    const scoped = within(inspector as HTMLElement)
    expect(scoped.getByText('tenant-a')).toBeInTheDocument()
    expect(scoped.getByText('Host Portal')).toBeInTheDocument()

    window.history.pushState({}, '', previousUrl)
  })
})
