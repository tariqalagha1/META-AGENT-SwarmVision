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
          eventCount: 2,
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

describe('Phase 6 replay controls', () => {
  it('enables replay controls and transitions replay state', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })) as typeof fetch

    render(<App />)

    emitEvent({ type: 'AGENT_SPAWN', timestamp: '2026-04-10T12:00:00.000Z', payload: { agent_id: 'agent-1' } })
    emitEvent({ type: 'TASK_SUCCESS', timestamp: '2026-04-10T12:05:00.000Z', payload: { agent_id: 'agent-1' } })

    expect(screen.getByRole('button', { name: 'Enable replay' })).toHaveTextContent('Replay Off')
    expect(screen.getByLabelText('Replay timeline cursor')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enable replay' }))
    expect(screen.getByRole('button', { name: 'Disable replay' })).toHaveTextContent('Replay On')
    expect(screen.getByText('Replay Paused')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Play replay' })).toBeDisabled()
  })
})
