import React, { useState } from 'react'
import { WebSocketEvent } from '../../types'
import { FlowAgent, TopologyFilters } from './types'
import './TopologyControls.css'

interface TopologyControlsProps {
  events: WebSocketEvent[]
  agents: Map<string, FlowAgent>
  onSearchChange: (query: string) => void
  onFilterChange: (filters: TopologyFilters) => void
  onExportTopology: () => void
  onExportEvents: () => void
  onExportSelected: (agentId: string) => void
}

/**
 * TopologyControls Component
 *
 * Provides search, filtering, and export controls for the topology
 */
export const TopologyControls: React.FC<TopologyControlsProps> = ({
  events,
  agents,
  onSearchChange,
  onFilterChange,
  onExportTopology,
  onExportEvents,
  onExportSelected,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<TopologyFilters>({
    agent: '',
    state: '',
    eventType: '',
    errorsOnly: false,
    activeOnly: false,
  })

  // Get unique values for filter dropdowns
  const agentNames = Array.from(agents.values()).map(a => a.name)
  const agentStates = ['idle', 'active', 'working', 'success', 'failed', 'terminated']
  const eventTypes = [...new Set(events.map(e => e.type))]

  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
    onSearchChange(query)
  }

  const handleFilterChange = (key: keyof TopologyFilters, value: string | boolean) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    onFilterChange(newFilters)
  }

  const handleExportSelected = () => {
    // This would be called when a node is selected
    // For now, just export the first agent as example
    const firstAgent = Array.from(agents.values())[0]
    if (firstAgent) {
      onExportSelected(firstAgent.id)
    }
  }

  return (
    <div className="topology-controls">
      <div className="controls-row">
        {/* Search */}
        <div className="control-group">
          <label htmlFor="search">Search Agents</label>
          <input
            id="search"
            type="text"
            placeholder="Type agent name..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="search-input"
          />
        </div>

        {/* Filters */}
        <div className="control-group">
          <label htmlFor="agent-filter">Agent</label>
          <select
            id="agent-filter"
            value={filters.agent}
            onChange={(e) => handleFilterChange('agent', e.target.value)}
            className="filter-select"
          >
            <option value="">All Agents</option>
            {agentNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="state-filter">State</label>
          <select
            id="state-filter"
            value={filters.state}
            onChange={(e) => handleFilterChange('state', e.target.value)}
            className="filter-select"
          >
            <option value="">All States</option>
            {agentStates.map(state => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="event-filter">Event Type</label>
          <select
            id="event-filter"
            value={filters.eventType}
            onChange={(e) => handleFilterChange('eventType', e.target.value)}
            className="filter-select"
          >
            <option value="">All Events</option>
            {eventTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Checkboxes */}
        <div className="control-group checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={filters.errorsOnly}
              onChange={(e) => handleFilterChange('errorsOnly', e.target.checked)}
            />
            Errors Only
          </label>
        </div>

        <div className="control-group checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={filters.activeOnly}
              onChange={(e) => handleFilterChange('activeOnly', e.target.checked)}
            />
            Active Only
          </label>
        </div>
      </div>

      <div className="controls-row">
        {/* Export Buttons */}
        <div className="export-buttons">
          <button onClick={onExportTopology} className="btn btn-export">
            Export Topology
          </button>
          <button onClick={onExportEvents} className="btn btn-export">
            Export Events
          </button>
          <button onClick={handleExportSelected} className="btn btn-export">
            Export Selected
          </button>
        </div>
      </div>
    </div>
  )
}