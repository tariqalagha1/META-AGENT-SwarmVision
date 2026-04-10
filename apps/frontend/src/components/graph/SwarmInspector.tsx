import React from 'react'
import { WebSocketEvent } from '../../types'
import { FlowAgent, FlowEdge } from './types'
import './SwarmInspector.css'

interface SwarmInspectorProps {
  selectedAgentId: string | null
  agents: Map<string, FlowAgent>
  edges: Map<string, FlowEdge>
  events: WebSocketEvent[]
  onClose: () => void
}

/**
 * SwarmInspector Component
 *
 * Displays detailed information about a selected agent
 */
export const SwarmInspector: React.FC<SwarmInspectorProps> = ({
  selectedAgentId,
  agents,
  edges,
  events,
  onClose,
}) => {
  if (!selectedAgentId) {
    return (
      <div className="swarm-inspector">
        <div className="inspector-header">
          <h3>Swarm Inspector</h3>
        </div>
        <div className="inspector-content">
          <div className="empty-inspector">
            <p>👁️ Select an agent to inspect</p>
            <p className="help-text">Click on any node in the topology</p>
          </div>
        </div>
      </div>
    )
  }

  const agent = agents.get(selectedAgentId)
  if (!agent) {
    return (
      <div className="swarm-inspector">
        <div className="inspector-header">
          <h3>Swarm Inspector</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <div className="inspector-content">
          <div className="error-message">
            <p>Agent not found</p>
          </div>
        </div>
      </div>
    )
  }

  // Get recent events for this agent
  const agentEvents = events
    .filter(event =>
      event.payload?.agent_id === selectedAgentId ||
      event.payload?.source_agent_id === selectedAgentId ||
      event.payload?.target_agent_id === selectedAgentId
    )
    .slice(-5)
    .reverse()

  const latestContext = agentEvents[0]?.context

  // Calculate latency (time since last event)
  const latency = Date.now() - agent.lastEventTime
  const latencyText = latency < 1000 ? '< 1s' : `${Math.floor(latency / 1000)}s`

  // Get connected nodes
  const connectedNodes = Array.from(edges.values())
    .filter(
      (edge) => edge.source === selectedAgentId || edge.target === selectedAgentId
    )
    .map((edge) => (edge.source === selectedAgentId ? edge.target : edge.source))
    .map((agentId) => agents.get(agentId)?.name ?? agentId)

  return (
    <div className="swarm-inspector">
      <div className="inspector-header">
        <h3>Swarm Inspector</h3>
        <button onClick={onClose} className="close-btn">×</button>
      </div>

      <div className="inspector-content">
        <div className="agent-summary">
          <div className="agent-name">
            <h4>{agent.name}</h4>
            <span className={`agent-state ${agent.state}`}>{agent.state}</span>
          </div>

          <div className="agent-metrics">
            <div className="metric">
              <label>Current Task</label>
              <span>{agent.lastAction || 'None'}</span>
            </div>

            <div className="metric">
              <label>Completed Tasks</label>
              <span>{agent.tasks.length}</span>
            </div>

            <div className="metric">
              <label>Last Event</label>
              <span>{new Date(agent.lastEventTime).toLocaleTimeString()}</span>
            </div>

            <div className="metric">
              <label>Latency</label>
              <span className={latency < 2000 ? 'latency-good' : 'latency-high'}>
                {latencyText}
              </span>
            </div>

            <div className="metric">
              <label>Tenant</label>
              <span>{latestContext?.tenant_id ?? 'default'}</span>
            </div>

            <div className="metric">
              <label>App Context</label>
              <span>{latestContext?.app_name ?? latestContext?.app_id ?? 'standalone'}</span>
            </div>
          </div>
        </div>

        <div className="agent-connections">
          <h5>Connected Nodes ({connectedNodes.length})</h5>
          <div className="connections-list">
            {connectedNodes.length > 0 ? (
              connectedNodes.map((node, idx) => (
                <span key={idx} className="connection-tag">{node}</span>
              ))
            ) : (
              <span className="no-connections">No connections</span>
            )}
          </div>
        </div>

        <div className="recent-events">
          <h5>Recent Events</h5>
          <div className="events-list">
            {agentEvents.length > 0 ? (
              agentEvents.map((event, idx) => (
                <div key={idx} className="event-item">
                  <span className="event-type">{event.type}</span>
                  <span className="event-time">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            ) : (
              <div className="no-events">No recent events</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
