import fs from 'node:fs'
import path from 'node:path'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import type { UseWebSocketOptions, WebSocketEvent } from './hooks/useWebSocket'

let latestWebSocketOptions: UseWebSocketOptions | null = null

vi.mock('./hooks/useWebSocket', async () => {
  const actual = await vi.importActual<typeof import('./hooks/useWebSocket')>('./hooks/useWebSocket')

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

describe('viewer freeze protections', () => {
  it('preserves shell structure in observe mode', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })) as typeof fetch
    render(<App />)

    emitEvent({
      type: 'AGENT_SPAWN',
      payload: { agent_id: 'freeze-node', agent_name: 'FreezeNode' },
    })

    expect(screen.getByRole('navigation', { name: /command bar/i })).toBeInTheDocument()
    expect(screen.getByText('Left Swarm Rail')).toBeInTheDocument()
    expect(screen.getByText('Center Live Swarm Map')).toBeInTheDocument()
    expect(screen.getByText('Right Telemetry')).toBeInTheDocument()
    expect(screen.getByText('Timeline')).toBeInTheDocument()
    expect(screen.getByText('System Graph')).toBeInTheDocument()
  })

  it('preserves map and replay visibility in visualize mode', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })) as typeof fetch
    render(<App />)

    const visualizeTab = screen.getByRole('tab', { name: /visualize/i })
    await act(async () => {
      visualizeTab.click()
    })

    expect(screen.getByRole('button', { name: /^live$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^replay$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^compare$/i })).toBeInTheDocument()

    const opsButton = screen.getByRole('button', { name: /^ops view$/i })
    await act(async () => {
      opsButton.click()
    })

    expect(await screen.findByText(/ops command map/i)).toBeInTheDocument()
  })

  it('locks theme variables and shell zones via release artifacts', () => {
    const cssPath = path.resolve(process.cwd(), 'src', 'design', 'command-center.css')
    const css = fs.readFileSync(cssPath, 'utf8')
    expect(css).toContain('--bg-main')
    expect(css).toContain('--accent-green')
    expect(css).toContain('--panel-radius')
    expect(css).toContain('--motion-700')

    const lockPath = path.resolve(process.cwd(), '..', '..', 'layout-lock.json')
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as {
      zones: Record<string, unknown>
      breakpoints: Record<string, string>
    }

    expect(lock.zones).toHaveProperty('TopCommandBar')
    expect(lock.zones).toHaveProperty('LeftRail')
    expect(lock.zones).toHaveProperty('CenterMap')
    expect(lock.zones).toHaveProperty('RightRail')
    expect(lock.zones).toHaveProperty('BottomDock')
    expect(lock.breakpoints.desktop_compact).toBe('1280px')
    expect(lock.breakpoints.mobile_stack).toBe('900px')
  })
})
