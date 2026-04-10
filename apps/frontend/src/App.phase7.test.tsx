import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

vi.mock('react-force-graph-3d', () => ({
  default: React.forwardRef(function MockForceGraph3D(_props, ref) {
    void ref
    return <div data-testid="force-graph-3d" />
  }),
}))

describe('Phase 7 analytics and RCA', () => {
  it('renders replay analytics, heatmap severity, and root cause diagnosis for failures', async () => {
    void latestWebSocketOptions

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/analytics/summary')) {
        return new Response(
          JSON.stringify({
            available: true,
            from_timestamp: '2026-04-10T12:00:00.000Z',
            to_timestamp: '2026-04-10T12:09:00.000Z',
            metrics: {
              total_events: 4,
              active_agents: 1,
              failed_tasks: 1,
              successful_tasks: 0,
              average_handoff_latency_ms: 390000,
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
            to_timestamp: '2026-04-10T12:09:00.000Z',
            total_failures: 1,
            failures_over_time: [{ bucket: '2026-04-10T12:08:00.000Z', value: 1 }],
            incidents: [
              {
                event_id: 'fail-1',
                timestamp: '2026-04-10T12:08:30.000Z',
                agent_id: 'agent-beta',
                task_id: 'task-1',
                suspected_source_node: 'agent-alpha',
                upstream_chain: ['agent-alpha', 'agent-beta'],
                related_recent_failures: 2,
                latency_spike_correlation: true,
                message: 'downstream timeout',
              },
            ],
          }),
          { status: 200 }
        )
      }

      if (url.includes('/analytics/latency')) {
        return new Response(
          JSON.stringify({
            available: true,
            from_timestamp: '2026-04-10T12:00:00.000Z',
            to_timestamp: '2026-04-10T12:09:00.000Z',
            events_per_minute: [{ bucket: '2026-04-10T12:02:00.000Z', value: 1 }],
            latency_over_time: [
              {
                bucket: '2026-04-10T12:08:00.000Z',
                average_handoff_latency_ms: 390000,
                average_task_completion_time_ms: 0,
              },
            ],
          }),
          { status: 200 }
        )
      }

      if (url.includes('/analytics/bottlenecks')) {
        return new Response(
          JSON.stringify({
            available: true,
            from_timestamp: '2026-04-10T12:00:00.000Z',
            to_timestamp: '2026-04-10T12:09:00.000Z',
            agents: [
              {
                agent_id: 'agent-beta',
                agent_name: 'Beta',
                severity: 'bottleneck',
                categories: ['high_failure_nodes', 'frequent_handoff_blockers'],
                summary: 'Beta shows failure rate at 100% and handoff latency elevated to 390000 ms.',
                failure_rate: 1,
                avg_completion_time_ms: 0,
                avg_handoff_latency_ms: 390000,
                blocker_count: 2,
                stuck_task_ids: ['task-1'],
              },
            ],
            suspected_root_causes: [
              {
                agent_id: 'agent-beta',
                severity: 'bottleneck',
                summary: 'Beta shows failure rate at 100% and handoff latency elevated to 390000 ms.',
                upstream_chain: ['agent-alpha', 'agent-beta'],
                recent_failure_count: 2,
                latency_spike_correlation: true,
              },
            ],
          }),
          { status: 200 }
        )
      }

      if (url.includes('/replay/status')) {
        return new Response(
          JSON.stringify({
            available: true,
            enabled: true,
            message: 'Neo4j ready',
            last_error: null,
          }),
          { status: 200 }
        )
      }

      if (url.includes('/replay/range')) {
        return new Response(
          JSON.stringify({
            available: true,
            count: 4,
            timeline: [
              '2026-04-10T12:00:00.000Z',
              '2026-04-10T12:01:00.000Z',
              '2026-04-10T12:02:00.000Z',
              '2026-04-10T12:08:30.000Z',
            ],
            events: [
              {
                id: 'spawn',
                type: 'AGENT_SPAWN',
                timestamp: '2026-04-10T12:00:00.000Z',
                source: 'system',
                payload: { agent_id: 'agent-alpha', agent_name: 'Alpha' },
              },
              {
                id: 'start',
                type: 'TASK_START',
                timestamp: '2026-04-10T12:01:00.000Z',
                source: 'agent',
                payload: { agent_id: 'agent-alpha', task_id: 'task-1' },
              },
              {
                id: 'handoff',
                type: 'TASK_HANDOFF',
                timestamp: '2026-04-10T12:02:00.000Z',
                source: 'agent',
                payload: {
                  source_agent_id: 'agent-alpha',
                  target_agent_id: 'agent-beta',
                  task_id: 'task-1',
                },
              },
              {
                id: 'fail',
                type: 'TASK_FAIL',
                timestamp: '2026-04-10T12:08:30.000Z',
                source: 'agent',
                payload: {
                  agent_id: 'agent-beta',
                  task_id: 'task-1',
                  error: 'downstream timeout',
                },
              },
            ],
            topology: {
              agents: [
                {
                  id: 'agent-alpha',
                  name: 'Alpha',
                  state: 'active',
                  x: 120,
                  y: 140,
                  tasks: ['task-1'],
                  last_action: 'handoff to agent-be',
                  last_event_time: '2026-04-10T12:02:00.000Z',
                },
                {
                  id: 'agent-beta',
                  name: 'Beta',
                  state: 'failed',
                  x: 260,
                  y: 180,
                  tasks: ['task-1'],
                  last_action: 'task failed',
                  last_event_time: '2026-04-10T12:08:30.000Z',
                },
              ],
              edges: [
                {
                  source: 'agent-alpha',
                  target: 'agent-beta',
                  last_active: '2026-04-10T12:02:00.000Z',
                  count: 1,
                },
              ],
            },
          }),
          { status: 200 }
        )
      }

      return new Response(
        JSON.stringify({
          available: true,
          event_count: 4,
          agents: [
            {
              id: 'agent-alpha',
              name: 'Alpha',
              state: 'active',
              x: 120,
              y: 140,
              tasks: ['task-1'],
              last_action: 'handoff to agent-be',
              last_event_time: '2026-04-10T12:02:00.000Z',
            },
            {
              id: 'agent-beta',
              name: 'Beta',
              state: 'failed',
              x: 260,
              y: 180,
              tasks: ['task-1'],
              last_action: 'task failed',
              last_event_time: '2026-04-10T12:08:30.000Z',
            },
          ],
          edges: [
            {
              source: 'agent-alpha',
              target: 'agent-beta',
              last_active: '2026-04-10T12:02:00.000Z',
              count: 1,
            },
          ],
        }),
        { status: 200 }
      )
    }) as typeof fetch

    render(<App />)

    fireEvent.click(screen.getByText('Replay Mode'))

    expect(await screen.findByText('Operational Summary')).toBeInTheDocument()
    expect(screen.getByTestId('events-per-minute-chart')).toBeInTheDocument()
    expect(screen.getByTestId('failures-over-time-chart')).toBeInTheDocument()
    expect(screen.getByTestId('latency-over-time-chart')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('flow-node-agent-beta')).toBeInTheDocument()
    })

    expect(screen.getByTestId('flow-node-agent-beta')).toHaveAttribute(
      'data-health',
      'bottleneck'
    )

    fireEvent.click(screen.getByTestId('flow-node-agent-beta'))

    const panel = await screen.findByTestId('root-cause-panel')
    const scoped = within(panel)
    expect(scoped.getByTestId('rca-source-node')).toHaveTextContent('agent-alpha')
    expect(scoped.getAllByText('agent-alpha').length).toBeGreaterThan(0)
    expect(scoped.getAllByText('agent-beta').length).toBeGreaterThan(0)
    expect(scoped.getByText('Yes')).toBeInTheDocument()
    expect(scoped.getByText('downstream timeout')).toBeInTheDocument()
  })
})
