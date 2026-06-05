import { act, render, screen, waitFor } from '@testing-library/react'
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
  if (!latestWebSocketOptions?.onEvent) throw new Error('WebSocket hook not initialized')

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
  it('shows tenant/app scope and preserves scoped fetch calls', async () => {
    const previousUrl = window.location.href
    window.history.pushState(
      {},
      '',
      '/?embed=1&tenant_id=tenant-a&app_id=host-app&app_name=Host%20Portal&environment=prod&version=1.4.2'
    )

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/analytics/') || url.includes('/replay/')) {
        expect(url).toContain('tenant_id=tenant-a')
        expect(url).toContain('app_id=host-app')
      }
      if (url.includes('/api/v1/diagnostics')) return new Response(JSON.stringify([]), { status: 200 })
      return new Response(JSON.stringify({ available: true, agents: [], suspected_root_causes: [] }), { status: 200 })
    }) as typeof fetch

    render(<App />)

    emitEvent({
      type: 'AGENT_SPAWN',
      payload: { agent_id: 'tenant-node', agent_name: 'TenantNode' },
      context: {
        tenant_id: 'tenant-a',
        app_id: 'host-app',
        app_name: 'Host Portal',
      },
    })

    expect(await screen.findByText(/Tenant tenant-a/)).toBeInTheDocument()
    expect(screen.getByText(/App host-app/)).toBeInTheDocument()
    expect(screen.getByText(/Host Portal/)).toBeInTheDocument()

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })

    window.history.pushState({}, '', previousUrl)
  })
})
