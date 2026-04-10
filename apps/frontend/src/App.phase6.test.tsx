import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

vi.mock('react-force-graph-3d', () => ({
  default: React.forwardRef(function MockForceGraph3D(_props, ref) {
    void ref
    return <div data-testid="force-graph-3d" />
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

describe('Phase 6 replay mode', () => {
  it('switches from live mode into replay mode and scrubs historical topology', async () => {
    const historicalResponses = {
      status: {
        available: true,
        enabled: true,
        message: 'Neo4j ready',
        last_error: null,
      },
      range: {
        available: true,
        count: 2,
        timeline: ['2026-04-10T12:00:00.000Z', '2026-04-10T12:05:00.000Z'],
        events: [
          {
            id: 'persisted-1',
            type: 'AGENT_SPAWN',
            timestamp: '2026-04-10T12:00:00.000Z',
            source: 'system',
            payload: { agent_id: 'agent-1', agent_name: 'Alpha' },
          },
          {
            id: 'persisted-2',
            type: 'TASK_SUCCESS',
            timestamp: '2026-04-10T12:05:00.000Z',
            source: 'agent',
            payload: { agent_id: 'agent-1', task_id: 'task-1' },
          },
        ],
        topology: {
          agents: [
            {
              id: 'agent-1',
              name: 'Alpha',
              state: 'success',
              x: 120,
              y: 140,
              tasks: ['task-1'],
              last_action: 'task completed',
              last_event_time: '2026-04-10T12:05:00.000Z',
            },
          ],
          edges: [],
        },
      },
      topologyStart: {
        available: true,
        event_count: 1,
        agents: [
          {
            id: 'agent-1',
            name: 'Alpha',
            state: 'active',
            x: 120,
            y: 140,
            tasks: [],
            last_action: 'spawned',
            last_event_time: '2026-04-10T12:00:00.000Z',
          },
        ],
        edges: [],
      },
      topologyEnd: {
        available: true,
        event_count: 2,
        agents: [
          {
            id: 'agent-1',
            name: 'Alpha',
            state: 'success',
            x: 120,
            y: 140,
            tasks: ['task-1'],
            last_action: 'task completed',
            last_event_time: '2026-04-10T12:05:00.000Z',
          },
        ],
        edges: [],
      },
      analyticsSummary: {
        available: true,
        from_timestamp: '2026-04-10T12:00:00.000Z',
        to_timestamp: '2026-04-10T12:05:00.000Z',
        metrics: {
          total_events: 2,
          active_agents: 1,
          failed_tasks: 0,
          successful_tasks: 1,
          average_handoff_latency_ms: 0,
          peak_concurrent_agents: 1,
          average_task_completion_time_ms: 300000,
        },
      },
      analyticsFailures: {
        available: true,
        from_timestamp: '2026-04-10T12:00:00.000Z',
        to_timestamp: '2026-04-10T12:05:00.000Z',
        total_failures: 0,
        failures_over_time: [],
        incidents: [],
      },
      analyticsLatency: {
        available: true,
        from_timestamp: '2026-04-10T12:00:00.000Z',
        to_timestamp: '2026-04-10T12:05:00.000Z',
        events_per_minute: [{ bucket: '2026-04-10T12:00:00.000Z', value: 1 }],
        latency_over_time: [
          {
            bucket: '2026-04-10T12:05:00.000Z',
            average_handoff_latency_ms: 0,
            average_task_completion_time_ms: 300000,
          },
        ],
      },
      analyticsBottlenecks: {
        available: true,
        from_timestamp: '2026-04-10T12:00:00.000Z',
        to_timestamp: '2026-04-10T12:05:00.000Z',
        agents: [],
        suspected_root_causes: [],
      },
    }

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/analytics/summary')) {
        return new Response(JSON.stringify(historicalResponses.analyticsSummary), { status: 200 })
      }
      if (url.includes('/analytics/failures')) {
        return new Response(JSON.stringify(historicalResponses.analyticsFailures), { status: 200 })
      }
      if (url.includes('/analytics/latency')) {
        return new Response(JSON.stringify(historicalResponses.analyticsLatency), { status: 200 })
      }
      if (url.includes('/analytics/bottlenecks')) {
        return new Response(JSON.stringify(historicalResponses.analyticsBottlenecks), {
          status: 200,
        })
      }
      if (url.includes('/replay/status')) {
        return new Response(JSON.stringify(historicalResponses.status), { status: 200 })
      }
      if (url.includes('/replay/range')) {
        return new Response(JSON.stringify(historicalResponses.range), { status: 200 })
      }
      if (url.includes('timestamp=2026-04-10T12%3A00%3A00.000Z')) {
        return new Response(JSON.stringify(historicalResponses.topologyStart), { status: 200 })
      }
      return new Response(JSON.stringify(historicalResponses.topologyEnd), { status: 200 })
    }) as typeof fetch

    render(<App />)

    emitEvent({
      type: 'AGENT_SPAWN',
      payload: { agent_id: 'agent-live', agent_name: 'LiveAgent' },
    })
    emitEvent({
      type: 'TASK_START',
      payload: { agent_id: 'agent-live', task_id: 'task-live' },
    })

    expect(screen.getByText('Live Mode')).toBeInTheDocument()
    expect(screen.getByText('Interactive Swarm Topology')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Replay Mode'))

    expect(await screen.findByText('Historical Replay')).toBeInTheDocument()
    expect(screen.getByText('Historical Event Stream')).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByTestId('flow-node-agent-1')).toBeInTheDocument()
    )

    fireEvent.change(screen.getByTestId('replay-slider'), {
      target: { value: '0' },
    })

    await waitFor(() => {
      const inspectorRoot = screen.getByText('Swarm Inspector').closest('.swarm-inspector')
      expect(inspectorRoot).not.toBeNull()
    })

    fireEvent.click(screen.getByTestId('flow-node-agent-1'))

    const inspector = screen.getByText('Swarm Inspector').closest('.swarm-inspector')
    const scoped = within(inspector as HTMLElement)

    await waitFor(() => {
      expect(scoped.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
      expect(scoped.getByText('active')).toBeInTheDocument()
      expect(scoped.getByText('spawned')).toBeInTheDocument()
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/replay/status'),
      expect.any(Object)
    )
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/replay/range'),
      expect.any(Object)
    )
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/replay/topology?timestamp=2026-04-10T12%3A00%3A00.000Z'),
      expect.any(Object)
    )
  })
})
