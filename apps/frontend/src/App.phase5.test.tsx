import { act, fireEvent, render, screen } from '@testing-library/react'
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
    source: event.source ?? 'test',
    payload: event.payload ?? {},
  }

  act(() => {
    latestWebSocketOptions?.onEvent?.(nextEvent)
  })
}

describe('Phase 5 modern app shell', () => {
  it('renders top-level modes and visualize views while preserving event-driven state', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch

    render(<App />)

    expect(screen.getByRole('tab', { name: 'Observe' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Visualize' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Command' })).toBeInTheDocument()

    emitEvent({ type: 'AGENT_SPAWN', payload: { agent_id: 'agent-1', agent_name: 'Alpha' } })
    emitEvent({ type: 'TASK_START', payload: { agent_id: 'agent-1', task_id: 'task-1' } })

    expect(screen.getByText('System Graph')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Visualize' }))
    expect(screen.getByText('OPS VIEW')).toBeInTheDocument()
    expect(screen.getByText('DEMO VIEW')).toBeInTheDocument()

    fireEvent.click(screen.getByText('OPS VIEW'))
    expect(screen.getByText('◎ MOCK')).toBeInTheDocument()

    fireEvent.click(screen.getByText('DEMO VIEW'))
    expect(screen.getByText('⚡ LIVE')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Observe' }))
    expect(screen.getByText('System Graph')).toBeInTheDocument()
  })
})
