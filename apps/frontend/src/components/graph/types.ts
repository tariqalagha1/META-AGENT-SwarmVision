// Shared types for graph components

export interface FlowAgent {
  id: string
  name: string
  state: 'idle' | 'active' | 'working' | 'success' | 'failed' | 'terminated'
  x: number
  y: number
  tasks: string[]
  lastAction: string
  lastEventTime: number
}

export interface TopologyFilters {
  agent: string
  state: string
  eventType: string
  errorsOnly: boolean
  activeOnly: boolean
}

export interface ActiveHandoff {
  id: string
  sourceId: string
  targetId: string
  startTime: number
  duration: number
  eventType: string
}

export interface FlowEdge {
  source: string
  target: string
  lastActive: number
  count: number
}