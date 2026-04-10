import { useEffect, useState } from 'react'
import { WebSocketEvent } from '../types'
import {
  applyEventToTopologyState,
  createInitialTopologyState,
  pruneExpiredHandoffs,
  TopologyState,
} from '../components/graph/topologyState'

interface UseSwarmTopologyOptions {
  events: WebSocketEvent[]
  width: number
  height: number
  maxAgents?: number
}

export function useSwarmTopology({
  events,
  width,
  height,
  maxAgents = 50,
}: UseSwarmTopologyOptions): TopologyState {
  const [topologyState, setTopologyState] = useState<TopologyState>(() =>
    createInitialTopologyState()
  )

  useEffect(() => {
    if (events.length === 0) return

    const latestEvent = events[events.length - 1]
    if (!latestEvent) return

    setTopologyState((previous) =>
      applyEventToTopologyState(previous, latestEvent, {
        width,
        height,
        maxAgents,
      })
    )
  }, [events, width, height, maxAgents])

  useEffect(() => {
    const timer = setInterval(() => {
      setTopologyState((previous) => pruneExpiredHandoffs(previous))
    }, 50)

    return () => clearInterval(timer)
  }, [])

  return topologyState
}
