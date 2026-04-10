/**
 * ConnectionStatus Component
 * 
 * Displays WebSocket connection status and statistics
 */

import React from 'react'
import type { UseWebSocketState } from '../../hooks/useWebSocket'
import './ConnectionStatus.css'

export interface ConnectionStatusProps {
  state: UseWebSocketState
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ state }) => {
  const getStatusColor = () => {
    if (state.connected) return 'connected'
    if (state.error) return 'error'
    return 'disconnected'
  }

  const getStatusText = () => {
    if (state.connected) return 'Connected'
    if (state.error) return 'Error'
    return 'Disconnected'
  }

  const getStatusIcon = () => {
    if (state.connected) return '●'
    if (state.error) return '⚠'
    return '○'
  }

  return (
    <div className={`connection-status connection-${getStatusColor()}`}>
      <div className="status-main">
        <span className="status-icon">{getStatusIcon()}</span>
        <div className="status-info">
          <h4>Connection Status</h4>
          <p className="status-text">{getStatusText()}</p>
        </div>
      </div>

      <div className="status-stats">
        <div className="stat-item">
          <span className="stat-label">Events:</span>
          <span className="stat-value">{state.eventCount}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Reconnect Attempts:</span>
          <span className="stat-value">{state.reconnectAttempts}</span>
        </div>
      </div>

      {state.error && (
        <div className="status-error">
          <p>{state.error}</p>
        </div>
      )}

      {state.lastEvent && (
        <div className="status-last-event">
          <p className="last-event-label">Last Event:</p>
          <p className="last-event-type">{state.lastEvent.type}</p>
          <p className="last-event-time">
            {new Date(state.lastEvent.timestamp).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  )
}

export default ConnectionStatus
