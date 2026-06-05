import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import type { UseWebSocketOptions } from './hooks/useWebSocket'

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

describe('Phase 7 diagnostics', () => {
  it('renders diagnostics panel and filter controls', async () => {
    void latestWebSocketOptions

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/diagnostics')) {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      return new Response(JSON.stringify({ available: true, agents: [], suspected_root_causes: [] }), { status: 200 })
    }) as typeof fetch

    render(<App />)

    expect(screen.getByText('Diagnostics')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Diagnostics filters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ALL' })).toBeInTheDocument()
  })
})
