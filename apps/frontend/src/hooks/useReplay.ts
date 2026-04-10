import { useEffect, useMemo, useState } from 'react'
import type { WebSocketEvent } from './useWebSocket'
import type { FlowAgent, FlowEdge } from '../components/graph/types'

interface ReplayEventPayload extends WebSocketEvent {}

interface ReplayAgentPayload {
  id: string
  name: string
  state: FlowAgent['state']
  x: number
  y: number
  tasks: string[]
  last_action: string
  last_event_time: string
}

interface ReplayEdgePayload {
  source: string
  target: string
  last_active: string
  count: number
}

interface ReplayRangeResponse {
  available: boolean
  count: number
  timeline: string[]
  events: ReplayEventPayload[]
  topology: {
    agents: ReplayAgentPayload[]
    edges: ReplayEdgePayload[]
  }
}

interface ReplayTopologyResponse {
  available: boolean
  event_count: number
  agents: ReplayAgentPayload[]
  edges: ReplayEdgePayload[]
}

interface ReplayStatusResponse {
  available: boolean
  enabled: boolean
  message: string
  last_error?: string | null
}

function mapAgents(items: ReplayAgentPayload[]): Map<string, FlowAgent> {
  return new Map(
    items.map((agent) => [
      agent.id,
      {
        id: agent.id,
        name: agent.name,
        state: agent.state,
        x: agent.x,
        y: agent.y,
        tasks: agent.tasks,
        lastAction: agent.last_action,
        lastEventTime: new Date(agent.last_event_time).getTime(),
      },
    ])
  )
}

function mapEdges(items: ReplayEdgePayload[]): Map<string, FlowEdge> {
  return new Map(
    items.map((edge) => [
      `${edge.source}->${edge.target}`,
      {
        source: edge.source,
        target: edge.target,
        lastActive: new Date(edge.last_active).getTime(),
        count: edge.count,
      },
    ])
  )
}

interface ReplayScope {
  tenantId?: string
  appId?: string
}

export function useReplay(apiBaseUrl: string, enabled: boolean, scope: ReplayScope = {}) {
  const [status, setStatus] = useState<ReplayStatusResponse | null>(null)
  const [events, setEvents] = useState<ReplayEventPayload[]>([])
  const [timeline, setTimeline] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [agents, setAgents] = useState<Map<string, FlowAgent>>(new Map())
  const [edges, setEdges] = useState<Map<string, FlowEdge>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    const to = new Date()
    const from = new Date(to.getTime() - 60 * 60 * 1000)

    const loadReplayRange = async () => {
      setLoading(true)
      setError(null)

      try {
        const statusResponse = await fetch(`${apiBaseUrl}/replay/status`, {
          signal: controller.signal,
        })
        const nextStatus = (await statusResponse.json()) as ReplayStatusResponse
        setStatus(nextStatus)

        if (!nextStatus.available) {
          setError(nextStatus.last_error ?? nextStatus.message)
          setEvents([])
          setTimeline([])
          setAgents(new Map())
          setEdges(new Map())
          return
        }

        const query = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
        })
        if (scope.tenantId) query.set('tenant_id', scope.tenantId)
        if (scope.appId) query.set('app_id', scope.appId)

        const rangeResponse = await fetch(
          `${apiBaseUrl}/replay/range?${query.toString()}`,
          { signal: controller.signal }
        )

        if (!rangeResponse.ok) {
          const payload = (await rangeResponse.json()) as ReplayStatusResponse
          setError(payload.last_error ?? payload.message)
          return
        }

        const replayRange = (await rangeResponse.json()) as ReplayRangeResponse
        setEvents(replayRange.events)
        setTimeline(replayRange.timeline)
        setSelectedIndex(Math.max(0, replayRange.timeline.length - 1))
        setAgents(mapAgents(replayRange.topology.agents))
        setEdges(mapEdges(replayRange.topology.edges))
      } catch (fetchError) {
        if ((fetchError as Error).name === 'AbortError') return
        setError((fetchError as Error).message)
      } finally {
        setLoading(false)
      }
    }

    void loadReplayRange()

    return () => controller.abort()
  }, [apiBaseUrl, enabled, scope.appId, scope.tenantId])

  const selectedTimestamp = timeline[selectedIndex] ?? null

  useEffect(() => {
    if (!enabled || !selectedTimestamp || !(status?.available ?? false)) return

    const controller = new AbortController()

    const query = new URLSearchParams({
      timestamp: selectedTimestamp,
    })
    if (scope.tenantId) query.set('tenant_id', scope.tenantId)
    if (scope.appId) query.set('app_id', scope.appId)

    const loadTopology = async () => {
      setLoading(true)
      try {
        const topologyResponse = await fetch(
          `${apiBaseUrl}/replay/topology?${query.toString()}`,
          { signal: controller.signal }
        )

        if (!topologyResponse.ok) {
          const payload = (await topologyResponse.json()) as ReplayStatusResponse
          setError(payload.last_error ?? payload.message)
          return
        }

        const topology = (await topologyResponse.json()) as ReplayTopologyResponse
        setAgents(mapAgents(topology.agents))
        setEdges(mapEdges(topology.edges))
      } catch (fetchError) {
        if ((fetchError as Error).name === 'AbortError') return
        setError((fetchError as Error).message)
      } finally {
        setLoading(false)
      }
    }

    void loadTopology()

    return () => controller.abort()
  }, [apiBaseUrl, enabled, scope.appId, scope.tenantId, selectedTimestamp, status])

  const visibleEvents = useMemo(() => {
    if (!selectedTimestamp) return []
    const selectedTime = new Date(selectedTimestamp).getTime()
    return events.filter((event) => new Date(event.timestamp).getTime() <= selectedTime)
  }, [events, selectedTimestamp])

  return {
    status,
    loading,
    error,
    events: visibleEvents,
    allEvents: events,
    timeline,
    selectedIndex,
    selectedTimestamp,
    setSelectedIndex,
    agents,
    edges,
  }
}
