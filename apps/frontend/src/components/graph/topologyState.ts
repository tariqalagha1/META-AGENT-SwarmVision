import { WebSocketEvent } from '../../types'
import { ActiveHandoff, FlowAgent, FlowEdge } from './types'

export const DEFAULT_AGENT_LAYOUT = {
  OCR: { x: 100, y: 150 },
  Parser: { x: 250, y: 150 },
  Linker: { x: 400, y: 150 },
  Memory: { x: 250, y: 300 },
  Orchestrator: { x: 250, y: 50 },
} as const

export interface TopologyState {
  agents: Map<string, FlowAgent>
  edges: Map<string, FlowEdge>
  activeHandoffs: ActiveHandoff[]
}

interface LayoutOptions {
  width: number
  height: number
  maxAgents: number
}

export function createInitialTopologyState(): TopologyState {
  const agents = new Map<string, FlowAgent>()
  Object.entries(DEFAULT_AGENT_LAYOUT).forEach(([name, pos]) => {
    agents.set(name, {
      id: name,
      name,
      state: 'idle',
      x: pos.x,
      y: pos.y,
      tasks: [],
      lastAction: 'initialized',
      lastEventTime: Date.now(),
    })
  })

  return {
    agents,
    edges: new Map(),
    activeHandoffs: [],
  }
}

function getDynamicAgentPosition(
  currentSize: number,
  { width, height, maxAgents }: LayoutOptions
) {
  const angle = (currentSize * 360) / Math.max(maxAgents, 1)
  const radius = Math.min(width, height) * 0.24

  return {
    x: width / 2 + radius * Math.cos((angle * Math.PI) / 180),
    y: height / 2 + radius * Math.sin((angle * Math.PI) / 180),
  }
}

function ensureAgent(
  agents: Map<string, FlowAgent>,
  agentId: string,
  agentName: string,
  layout: LayoutOptions,
  now: number,
  nextState: FlowAgent['state'],
  nextAction: string,
  taskId?: string
) {
  if (!agents.has(agentId)) {
    const position = getDynamicAgentPosition(agents.size, layout)
    agents.set(agentId, {
      id: agentId,
      name: agentName,
      state: nextState,
      x: position.x,
      y: position.y,
      tasks: taskId ? [taskId] : [],
      lastAction: nextAction,
      lastEventTime: now,
    })
    return
  }

  const agent = agents.get(agentId)
  if (!agent) return
  agent.state = nextState
  agent.lastAction = nextAction
  agent.lastEventTime = now
  if (taskId && !agent.tasks.includes(taskId)) {
    agent.tasks.push(taskId)
  }
}

export function applyEventToTopologyState(
  previous: TopologyState,
  event: WebSocketEvent,
  layout: LayoutOptions
): TopologyState {
  const agents = new Map(previous.agents)
  const edges = new Map(previous.edges)
  const activeHandoffs = [...previous.activeHandoffs]
  const now = Date.now()
  const payload = event.payload as Record<string, string>

  switch (event.type) {
    case 'AGENT_SPAWN': {
      const agentId = payload.agent_id || `agent-${now}`
      const agentName = payload.agent_name || agentId.split('_')[0] || 'Unknown'
      ensureAgent(agents, agentId, agentName, layout, now, 'active', 'spawned')
      break
    }

    case 'TASK_START': {
      const agentId = payload.agent_id
      const taskId = payload.task_id
      if (agentId) {
        ensureAgent(
          agents,
          agentId,
          agentId.split('_')[0] || agentId,
          layout,
          now,
          'working',
          `task ${taskId?.substring(0, 8) ?? 'started'}`,
          taskId
        )
      }
      break
    }

    case 'TASK_HANDOFF': {
      const sourceId = payload.source_agent_id
      const targetId = payload.target_agent_id
      const taskId = payload.task_id

      if (sourceId) {
        ensureAgent(
          agents,
          sourceId,
          sourceId.split('_')[0] || sourceId,
          layout,
          now,
          'active',
          `handoff to ${targetId?.substring(0, 8) ?? 'target'}`,
          taskId
        )
      }

      if (targetId) {
        ensureAgent(
          agents,
          targetId,
          targetId.split('_')[0] || targetId,
          layout,
          now,
          'working',
          `received from ${sourceId?.substring(0, 8) ?? 'source'}`,
          taskId
        )
      }

      if (sourceId && targetId) {
        const edgeKey = `${sourceId}->${targetId}`
        const edge = edges.get(edgeKey)
        if (edge) {
          edge.lastActive = now
          edge.count += 1
        } else {
          edges.set(edgeKey, {
            source: sourceId,
            target: targetId,
            lastActive: now,
            count: 1,
          })
        }

        activeHandoffs.push({
          id: `${sourceId}->${targetId}->${now}`,
          sourceId,
          targetId,
          startTime: now,
          duration: 1200,
          eventType: 'TASK_HANDOFF',
        })
      }
      break
    }

    case 'TASK_SUCCESS': {
      const agentId = payload.agent_id
      if (agentId) {
        ensureAgent(
          agents,
          agentId,
          agentId.split('_')[0] || agentId,
          layout,
          now,
          'success',
          'task completed',
          payload.task_id
        )
      }
      break
    }

    case 'TASK_FAIL': {
      const agentId = payload.agent_id
      if (agentId) {
        ensureAgent(
          agents,
          agentId,
          agentId.split('_')[0] || agentId,
          layout,
          now,
          'failed',
          'task failed',
          payload.task_id
        )
      }
      break
    }

    case 'AGENT_MOVE': {
      const agentId = payload.agent_id
      if (agentId) {
        ensureAgent(
          agents,
          agentId,
          agentId.split('_')[0] || agentId,
          layout,
          now,
          'active',
          'moving'
        )
      }
      break
    }

    case 'AGENT_TERMINATION': {
      const agentId = payload.agent_id
      if (agentId) {
        ensureAgent(
          agents,
          agentId,
          agentId.split('_')[0] || agentId,
          layout,
          now,
          'terminated',
          'terminated'
        )
      }
      break
    }
  }

  return {
    agents,
    edges,
    activeHandoffs,
  }
}

export function pruneExpiredHandoffs(
  state: TopologyState,
  now = Date.now()
): TopologyState {
  const nextHandoffs = state.activeHandoffs.filter(
    (handoff) => now - handoff.startTime < handoff.duration
  )

  if (nextHandoffs.length === state.activeHandoffs.length) {
    return state
  }

  return {
    agents: state.agents,
    edges: state.edges,
    activeHandoffs: nextHandoffs,
  }
}
