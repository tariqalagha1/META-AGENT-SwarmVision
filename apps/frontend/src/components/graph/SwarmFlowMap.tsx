import React, { useCallback, useState } from 'react'
import { ActiveHandoff, FlowAgent, FlowEdge, TopologyFilters } from './types'
import './SwarmFlowMap.css'

interface SwarmFlowMapProps {
  agents: Map<string, FlowAgent>
  edges: Map<string, FlowEdge>
  activeHandoffs: ActiveHandoff[]
  healthByAgent?: Map<
    string,
    {
      severity: 'healthy' | 'warning' | 'bottleneck'
      summary: string
      categories: string[]
    }
  >
  width?: number
  height?: number
  selectedAgentId?: string | null
  searchQuery?: string
  filters?: TopologyFilters
  onNodeSelect?: (agentId: string | null) => void
  onNodeHover?: (agentId: string | null) => void
}

export const SwarmFlowMap: React.FC<SwarmFlowMapProps> = ({
  agents,
  edges,
  activeHandoffs,
  healthByAgent = new Map(),
  width = 800,
  height = 400,
  selectedAgentId = null,
  searchQuery = '',
  filters = {
    agent: '',
    state: '',
    eventType: '',
    errorsOnly: false,
    activeOnly: false,
  },
  onNodeSelect,
  onNodeHover,
}) => {
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null)

  const getAgentColor = (state: string): string => {
    switch (state) {
      case 'idle':
        return '#6b7280'
      case 'active':
        return '#3b82f6'
      case 'working':
        return '#f59e0b'
      case 'success':
        return '#10b981'
      case 'failed':
        return '#ef4444'
      case 'terminated':
        return '#6b7280'
      default:
        return '#9ca3af'
    }
  }

  const isAgentVisible = useCallback(
    (agent: FlowAgent): boolean => {
      if (searchQuery && !agent.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }

      if (filters.agent && agent.name !== filters.agent) {
        return false
      }

      if (filters.state && agent.state !== filters.state) {
        return false
      }

      if (filters.activeOnly && agent.state === 'idle') {
        return false
      }

      if (filters.errorsOnly && agent.state !== 'failed') {
        return false
      }

      return true
    },
    [filters, searchQuery]
  )

  const isEdgeVisible = useCallback(
    (_edge: FlowEdge, sourceAgent: FlowAgent, targetAgent: FlowAgent): boolean =>
      isAgentVisible(sourceAgent) && isAgentVisible(targetAgent),
    [isAgentVisible]
  )

  const isConnectedToSelected = useCallback(
    (agentId: string): boolean => {
      if (!selectedAgentId) return false

      const forward = `${selectedAgentId}->${agentId}`
      const backward = `${agentId}->${selectedAgentId}`
      return edges.has(forward) || edges.has(backward)
    },
    [edges, selectedAgentId]
  )

  const getHandoffProgress = (handoff: ActiveHandoff): number => {
    const elapsed = Date.now() - handoff.startTime
    return Math.min(1, elapsed / handoff.duration)
  }

  const renderAgentNode = (agent: FlowAgent) => {
    const color = getAgentColor(agent.state)
    const health = healthByAgent.get(agent.id)
    const isRecent = Date.now() - agent.lastEventTime < 2000
    const isSelected = selectedAgentId === agent.id
    const isHovered = hoveredAgentId === agent.id
    const isConnected = isConnectedToSelected(agent.id)
    const isVisible = isAgentVisible(agent)
    const isHighlighted =
      isSelected ||
      isConnected ||
      (searchQuery && agent.name.toLowerCase().includes(searchQuery.toLowerCase()))

    let opacity = 1
    if (!isVisible) opacity = 0.3
    else if (isHighlighted) opacity = 1
    else if (selectedAgentId) opacity = 0.5

    const latency = Date.now() - agent.lastEventTime
    const latencyText = latency < 1000 ? '< 1s' : `${Math.floor(latency / 1000)}s`
    const tooltip = `Agent: ${agent.name}\nState: ${agent.state}\nTask: ${agent.lastAction}\nEvents: ${agent.tasks.length}\nHealth: ${health?.severity ?? 'healthy'}\nLast update: ${latencyText} ago`

    return (
      <g
        key={`agent-${agent.id}`}
        data-testid={`flow-node-${agent.id}`}
        data-health={health?.severity ?? 'healthy'}
        style={{ opacity }}
        onClick={() => onNodeSelect?.(isSelected ? null : agent.id)}
        onMouseEnter={() => {
          setHoveredAgentId(agent.id)
          onNodeHover?.(agent.id)
        }}
        onMouseLeave={() => {
          setHoveredAgentId(null)
          onNodeHover?.(null)
        }}
        className={`agent-node-group ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${isHighlighted ? 'highlighted' : ''}`}
      >
        {isSelected && (
          <circle
            cx={agent.x}
            cy={agent.y}
            r={36}
            fill="none"
            stroke="#fbbf24"
            strokeWidth={3}
            strokeDasharray="5,5"
            className="selection-ring"
          />
        )}

        {isConnected && !isSelected && (
          <circle
            cx={agent.x}
            cy={agent.y}
            r={32}
            fill="none"
            stroke="#10b981"
            strokeWidth={2}
            opacity={0.6}
            className="connection-ring"
          />
        )}

        {isRecent && (
          <circle
            cx={agent.x}
            cy={agent.y}
            r={32}
            fill="none"
            stroke={color}
            strokeWidth={2}
            opacity={0.3}
            className="agent-glow"
          />
        )}

        {health && (
          <circle
            cx={agent.x}
            cy={agent.y}
            r={30}
            fill="none"
            strokeWidth={4}
            className={`health-ring ${health.severity}`}
            data-testid={`health-ring-${agent.id}`}
          />
        )}

        <circle
          cx={agent.x}
          cy={agent.y}
          r={24}
          fill={color}
          stroke="white"
          strokeWidth={2}
          className={`agent-node ${agent.state}`}
          style={{ cursor: 'pointer' }}
        />

        <text
          x={agent.x}
          y={agent.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize="12"
          fontWeight="bold"
          pointerEvents="none"
        >
          {agent.name.substring(0, 3)}
        </text>

        {agent.tasks.length > 0 && (
          <g>
            <circle
              cx={agent.x + 18}
              cy={agent.y - 18}
              r={10}
              fill="#ef4444"
              stroke="white"
              strokeWidth={1}
            />
            <text
              x={agent.x + 18}
              y={agent.y - 18}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize="8"
              fontWeight="bold"
            >
              {agent.tasks.length}
            </text>
          </g>
        )}

        <title>{tooltip}</title>
      </g>
    )
  }

  const renderEdge = (sourceAgent: FlowAgent, targetAgent: FlowAgent, edge: FlowEdge) => {
    const isRecent = Date.now() - edge.lastActive < 3000
    const isVisible = isEdgeVisible(edge, sourceAgent, targetAgent)
    const isConnectedToSelection =
      selectedAgentId && (edge.source === selectedAgentId || edge.target === selectedAgentId)
    const isHighlighted = Boolean(isConnectedToSelection)

    let opacity = 1
    if (!isVisible) opacity = 0.3
    else if (isHighlighted) opacity = 1
    else if (selectedAgentId) opacity = 0.4

    const dx = targetAgent.x - sourceAgent.x
    const dy = targetAgent.y - sourceAgent.y
    const angle = Math.atan2(dy, dx)

    const startX = sourceAgent.x + 24 * Math.cos(angle)
    const startY = sourceAgent.y + 24 * Math.sin(angle)
    const endX = targetAgent.x - 24 * Math.cos(angle)
    const endY = targetAgent.y - 24 * Math.sin(angle)

    const arrowSize = 8
    const arrowX = endX - arrowSize * Math.cos(angle)
    const arrowY = endY - arrowSize * Math.sin(angle)
    const arrowLeft = `${arrowX + arrowSize * Math.cos(angle + Math.PI / 6)},${arrowY + arrowSize * Math.sin(angle + Math.PI / 6)}`
    const arrowRight = `${arrowX + arrowSize * Math.cos(angle - Math.PI / 6)},${arrowY + arrowSize * Math.sin(angle - Math.PI / 6)}`

    return (
      <g key={`edge-${edge.source}-${edge.target}`} style={{ opacity }}>
        <line
          x1={startX}
          y1={startY}
          x2={endX}
          y2={endY}
          stroke={isHighlighted ? '#fbbf24' : isRecent ? '#10b981' : '#d1d5db'}
          strokeWidth={isHighlighted ? 3 : isRecent ? 2 : 1}
          opacity={isHighlighted ? 0.9 : isRecent ? 0.8 : 0.4}
          className={`flow-edge ${isHighlighted ? 'highlighted' : ''}`}
        />

        <polygon
          points={`${endX},${endY} ${arrowLeft} ${arrowRight}`}
          fill={isHighlighted ? '#fbbf24' : isRecent ? '#10b981' : '#d1d5db'}
          opacity={isHighlighted ? 0.9 : isRecent ? 0.8 : 0.4}
        />

        {edge.count > 0 && (
          <text
            x={(startX + endX) / 2}
            y={(startY + endY) / 2 - 8}
            textAnchor="middle"
            fontSize="10"
            fill={isHighlighted ? '#fbbf24' : '#6b7280'}
            pointerEvents="none"
            fontWeight={isHighlighted ? 'bold' : 'normal'}
          >
            {edge.count}
          </text>
        )}
      </g>
    )
  }

  const renderHandoffPulse = (
    handoff: ActiveHandoff,
    sourceAgent: FlowAgent,
    targetAgent: FlowAgent
  ) => {
    const progress = getHandoffProgress(handoff)
    const easeProgress =
      progress < 0.5 ? progress / 0.5 : 1 - (progress - 0.5) / 0.5

    const dx = targetAgent.x - sourceAgent.x
    const dy = targetAgent.y - sourceAgent.y
    const angle = Math.atan2(dy, dx)

    const startX = sourceAgent.x + 24 * Math.cos(angle)
    const startY = sourceAgent.y + 24 * Math.sin(angle)
    const endX = targetAgent.x - 24 * Math.cos(angle)
    const endY = targetAgent.y - 24 * Math.sin(angle)

    const pulseX = startX + (endX - startX) * progress
    const pulseY = startY + (endY - startY) * progress
    const pulseSize = 6 + 3 * Math.sin(progress * Math.PI)

    return (
      <g key={`pulse-${handoff.id}`}>
        <circle
          cx={pulseX}
          cy={pulseY}
          r={pulseSize}
          fill="#f59e0b"
          opacity={easeProgress}
          className="handoff-pulse"
        />
        <circle
          cx={pulseX}
          cy={pulseY}
          r={pulseSize + 2}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={1}
          opacity={easeProgress * 0.5}
        />
      </g>
    )
  }

  const agentArray = Array.from(agents.values())
  const visibleAgents = agentArray.filter(isAgentVisible)

  return (
    <div className="swarm-flow-map">
      <div className="flow-map-header">
        <h3>Interactive Swarm Topology</h3>
        <span className="agent-count">
          {visibleAgents.length} of {agentArray.length} agents
          {selectedAgentId && ' (1 selected)'}
        </span>
      </div>

      <svg
        width={width}
        height={height}
        className="flow-map-canvas"
        viewBox={`0 0 ${width} ${height}`}
      >
        <rect width={width} height={height} fill="#f9fafb" />

        {Array.from(edges.values()).map((edge) => {
          const sourceAgent = agents.get(edge.source)
          const targetAgent = agents.get(edge.target)
          if (sourceAgent && targetAgent && isEdgeVisible(edge, sourceAgent, targetAgent)) {
            return renderEdge(sourceAgent, targetAgent, edge)
          }
          return null
        })}

        {visibleAgents.map((agent) => renderAgentNode(agent))}

        {activeHandoffs.map((handoff) => {
          const sourceAgent = agents.get(handoff.sourceId)
          const targetAgent = agents.get(handoff.targetId)
          if (
            sourceAgent &&
            targetAgent &&
            isAgentVisible(sourceAgent) &&
            isAgentVisible(targetAgent)
          ) {
            return renderHandoffPulse(handoff, sourceAgent, targetAgent)
          }
          return null
        })}
      </svg>

      <div className="flow-map-legend">
        <div className="legend-item">
          <div className="legend-dot idle" />
          <span>Idle</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot active" />
          <span>Active</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot working" />
          <span>Working</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot success" />
          <span>Success</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot failed" />
          <span>Failed</span>
        </div>
        <div className="legend-item">
          <div className="legend-ring healthy" />
          <span>Healthy</span>
        </div>
        <div className="legend-item">
          <div className="legend-ring warning" />
          <span>Warning</span>
        </div>
        <div className="legend-item">
          <div className="legend-ring bottleneck" />
          <span>Bottleneck</span>
        </div>
      </div>
    </div>
  )
}

export default SwarmFlowMap
