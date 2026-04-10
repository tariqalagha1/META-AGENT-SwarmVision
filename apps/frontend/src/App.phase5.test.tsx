import { act, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
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

vi.mock('react-force-graph-3d', () => ({
  default: React.forwardRef(function MockForceGraph3D(
    {
      graphData,
      onNodeClick,
      onNodeHover,
    }: {
      graphData: { nodes: Array<{ id: string; state: string }>; links: Array<{ isActive: boolean }> }
      onNodeClick?: (node: { id: string; state: string }) => void
      onNodeHover?: (node: { id: string; state: string } | null) => void
    },
    ref: React.ForwardedRef<unknown>
  ) {
    void ref
    return (
      <div data-testid="force-graph-3d">
        <div data-testid="graph-node-count">{graphData.nodes.length}</div>
        <div data-testid="graph-active-links">
          {graphData.links.filter((link) => link.isActive).length}
        </div>
        {graphData.nodes.map((node) => (
          <button
            key={node.id}
            data-testid={`graph-node-${node.id}`}
            onMouseEnter={() => onNodeHover?.(node)}
            onMouseLeave={() => onNodeHover?.(null)}
            onClick={() => onNodeClick?.(node)}
          >
            {node.id}:{node.state}
          </button>
        ))}
      </div>
    )
  }),
}))

function emitEvent(event: Partial<WebSocketEvent> & Pick<WebSocketEvent, 'type'>) {
  if (!latestWebSocketOptions?.onEvent) {
    throw new Error('WebSocket hook not initialized')
  }

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

describe('Phase 5 cinematic 3D mode', () => {
  it('keeps shared live state across 2D and 3D while inspector remains functional', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/analytics/summary')) {
        return new Response(
          JSON.stringify({
            available: true,
            from_timestamp: '2026-04-10T12:00:00.000Z',
            to_timestamp: '2026-04-10T12:05:00.000Z',
            metrics: {
              total_events: 3,
              active_agents: 2,
              failed_tasks: 0,
              successful_tasks: 0,
              average_handoff_latency_ms: 0,
              peak_concurrent_agents: 2,
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

    expect(screen.getByText('2D Control View')).toBeInTheDocument()
    expect(screen.getByText('Interactive Swarm Topology')).toBeInTheDocument()
    expect(screen.getByText('Swarm Inspector')).toBeInTheDocument()
    expect(screen.getAllByText(/Select an agent to inspect/i)).toHaveLength(2)

    emitEvent({
      type: 'AGENT_SPAWN',
      payload: { agent_id: 'agent-1', agent_name: 'Alpha' },
    })
    emitEvent({
      type: 'TASK_START',
      payload: { agent_id: 'agent-1', task_id: 'task-1' },
    })
    emitEvent({
      type: 'TASK_HANDOFF',
      payload: {
        source_agent_id: 'agent-1',
        target_agent_id: 'agent-2',
        task_id: 'task-1',
      },
    })

    fireEvent.click(screen.getByText('3D Swarm View'))

    expect(screen.getByText('3D CINEMATIC')).toBeInTheDocument()
    expect(screen.getByText('Reset Camera')).toBeInTheDocument()
    expect(screen.getByTestId('force-graph-3d')).toBeInTheDocument()
    expect(screen.getByTestId('graph-active-links')).toHaveTextContent('1')
    expect(screen.getByTestId('graph-node-agent-1')).toHaveTextContent('agent-1:active')
    expect(screen.getByTestId('graph-node-agent-2')).toHaveTextContent('agent-2:working')

    fireEvent.click(screen.getByTestId('graph-node-agent-2'))

    const inspector = screen.getByText('Swarm Inspector').closest('.swarm-inspector')
    expect(inspector).not.toBeNull()
    const scoped = within(inspector as HTMLElement)
    expect(scoped.getByRole('heading', { name: 'agent-2' })).toBeInTheDocument()
    expect(scoped.getByText('working')).toBeInTheDocument()
    expect(scoped.getByText(/received from agent-1/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText('2D Control View'))

    expect(screen.getByText('Interactive Swarm Topology')).toBeInTheDocument()
    expect(scoped.getByRole('heading', { name: 'agent-2' })).toBeInTheDocument()
    expect(scoped.getByText('working')).toBeInTheDocument()

    fireEvent.click(screen.getByText('3D Swarm View'))
    expect(screen.getByTestId('graph-node-agent-2')).toHaveTextContent('agent-2:working')
  })
})
