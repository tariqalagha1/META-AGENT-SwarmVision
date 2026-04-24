import { useEffect, useMemo, useState } from 'react'
import { GraphModeSwitcher } from './GraphModeSwitcher'
import { useObservabilityStore } from '../../store'

const EVENT_TYPE_OPTIONS = ['TASK_HANDOFF', 'FLOW_EVENT', 'DECISION_EVENT', 'ANOMALY', 'META_INSIGHT']

type GraphControlsBarProps = {
  onExportPng: () => void
  onExportJson: () => void
}

const toggleFromArray = (items: string[] | undefined, value: string) => {
  const base = items ?? []
  if (base.includes(value)) return base.filter((item) => item !== value)
  return [...base, value]
}

export function GraphControlsBar({ onExportJson, onExportPng }: GraphControlsBarProps) {
  const filters = useObservabilityStore((s) => s.filters)
  const setFilters = useObservabilityStore((s) => s.setFilters)
  const clearFilters = useObservabilityStore((s) => s.clearFilters)
  const setExportOptions = useObservabilityStore((s) => s.setExportOptions)
  const agents = useObservabilityStore((s) => s.agents)

  const [queryDraft, setQueryDraft] = useState(filters.query ?? '')

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const nextQuery = queryDraft.trim()
      setFilters({
        query: nextQuery || undefined,
      })
    }, 200)
    return () => {
      clearTimeout(handle)
    }
  }, [queryDraft, setFilters])

  useEffect(() => {
    setQueryDraft(filters.query ?? '')
  }, [filters.query])

  const visibleAgentChips = useMemo(
    () => Object.keys(agents).sort((a, b) => a.localeCompare(b)).slice(0, 12),
    [agents]
  )

  return (
    <div className="ov-controls-bar" aria-label="Graph controls">
      <div className="ov-controls-row">
        <input
          type="search"
          className="ov-controls-search"
          placeholder="Search agent_id / trace_id"
          value={queryDraft}
          onChange={(event) => setQueryDraft(event.currentTarget.value)}
          aria-label="Search graph"
        />
        <GraphModeSwitcher />
        <button
          type="button"
          className="ov-controls-btn"
          onClick={() => {
            setExportOptions({ format: 'PNG' })
            onExportPng()
          }}
          aria-label="Export graph as PNG"
        >
          Export PNG
        </button>
        <button
          type="button"
          className="ov-controls-btn"
          onClick={() => {
            setExportOptions({ format: 'JSON' })
            onExportJson()
          }}
          aria-label="Export graph as JSON"
        >
          Export JSON
        </button>
        <button type="button" className="ov-controls-btn" onClick={clearFilters} aria-label="Clear filters">
          Clear
        </button>
      </div>

      <div className="ov-controls-row ov-controls-filters">
        <span className="ov-controls-label">Event Types</span>
        {EVENT_TYPE_OPTIONS.map((eventType) => {
          const active = Boolean(filters.eventTypes?.includes(eventType))
          return (
            <button
              key={eventType}
              type="button"
              className={`ov-filter-chip${active ? ' is-active' : ''}`}
              onClick={() =>
                setFilters({
                  eventTypes: toggleFromArray(filters.eventTypes, eventType),
                })
              }
              aria-label={`Filter ${eventType}`}
            >
              {eventType}
            </button>
          )
        })}
      </div>

      {visibleAgentChips.length > 0 ? (
        <div className="ov-controls-row ov-controls-filters">
          <span className="ov-controls-label">Agents</span>
          {visibleAgentChips.map((agentId) => {
            const active = Boolean(filters.agentIds?.includes(agentId))
            return (
              <button
                key={agentId}
                type="button"
                className={`ov-filter-chip${active ? ' is-active' : ''}`}
                onClick={() =>
                  setFilters({
                    agentIds: toggleFromArray(filters.agentIds, agentId),
                  })
                }
                aria-label={`Filter ${agentId}`}
              >
                {agentId}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
