import { useEffect, useMemo, useState } from 'react'
import { FixedSizeList, type ListChildComponentProps } from 'react-window'
import { useDecisionEvents, useObservabilityStore, usePausedSnapshot } from '../../store'
import type { DecisionFlag } from '../../design/decisionFlagTokens'
import { applyFilters, type DecisionEvent } from '../../utils/decision'
import { useRelativeTimeTicker } from '../../utils/formatTimestamp'
import { DecisionRow } from './DecisionRow'
import { DecisionFilterBar } from './DecisionFilterBar'
import { EmptyStateCard } from './EmptyStateCard'
import './ObservabilityPanels.css'

const DECISION_PANEL_STORAGE_KEY = 'observability.decisionPanel.expanded'
const DECISION_CAP = 500
const VIRTUALIZATION_THRESHOLD = 150
const DECISION_ROW_HEIGHT = 56

type DecisionRowData = {
  decisions: DecisionEvent[]
  onSelectDecision: (event: DecisionEvent) => void
}

function VirtualizedDecisionRow({ index, style, data }: ListChildComponentProps<DecisionRowData>) {
  const event = data.decisions[index]
  if (!event) return null

  return (
    <div style={style}>
      <DecisionRow event={event} onSelect={data.onSelectDecision} />
    </div>
  )
}

const readExpandedFromStorage = () => {
  if (typeof window === 'undefined') return false
  const storedValue = window.localStorage.getItem(DECISION_PANEL_STORAGE_KEY)
  return storedValue === 'true'
}

export function DecisionPanel() {
  const [expanded, setExpanded] = useState<boolean>(readExpandedFromStorage)
  const [flagFilter, setFlagFilter] = useState<DecisionFlag[]>([])
  const [searchText, setSearchText] = useState('')
  const [debouncedSearchText, setDebouncedSearchText] = useState('')

  const connection = useObservabilityStore((s) => s.connection)
  const streamMode = useObservabilityStore((s) => s.mode)
  const selectEvent = useObservabilityStore((s) => s.selectEvent)
  const selectTrace = useObservabilityStore((s) => s.selectTrace)
  const selectAgent = useObservabilityStore((s) => s.selectAgent)

  const rawDecisions = useDecisionEvents()
  const decisions = usePausedSnapshot(rawDecisions, streamMode === 'PAUSED')

  useRelativeTimeTicker()

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchText(searchText)
    }, 200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [searchText])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(DECISION_PANEL_STORAGE_KEY, String(expanded))
  }, [expanded])

  const capped = useMemo(
    () =>
      decisions
        .slice()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, DECISION_CAP),
    [decisions]
  )

  const visible = useMemo(
    () => applyFilters(capped, flagFilter, debouncedSearchText),
    [capped, debouncedSearchText, flagFilter]
  )

  const hasActiveFilters = flagFilter.length > 0 || debouncedSearchText.trim().length > 0
  const disconnected = connection !== 'CONNECTED'

  const countLabel = hasActiveFilters ? `${visible.length} / ${capped.length}` : String(visible.length)

  const handleSelectDecision = (event: DecisionEvent) => {
    const eventId = event.event_id ?? event.id
    selectEvent(eventId)

    if (event.trace_id) {
      selectTrace(event.trace_id)
    }

    if (event.agent_id) {
      selectAgent(event.agent_id)
    }
  }

  const handleClearFilters = () => {
    setFlagFilter([])
    setSearchText('')
    setDebouncedSearchText('')
  }

  const rowData = useMemo<DecisionRowData>(
    () => ({
      decisions: visible,
      onSelectDecision: handleSelectDecision,
    }),
    [visible]
  )

  return (
    <section
      className={`ov-panel ov-panel-decisions ${expanded ? 'is-expanded' : 'is-collapsed'}`}
      aria-label="Decision intelligence panel"
    >
      <header className="ov-panel-header ov-decisions-header">
        <button
          type="button"
          className="ov-decisions-toggle"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          Decisions
        </button>

        <div className="ov-decisions-header-right">
          {disconnected ? <span className="ov-decisions-disconnected">Disconnected</span> : null}
          <span className="ov-alert-count-pill">{countLabel}</span>
        </div>
      </header>

      {expanded ? (
        <>
          <DecisionFilterBar
            selectedFlags={flagFilter}
            searchText={searchText}
            onSelectedFlagsChange={setFlagFilter}
            onSearchTextChange={setSearchText}
          />

          <div className="ov-decision-list" role="list">
            {disconnected && capped.length === 0 ? (
              <EmptyStateCard
                title="Decisions unavailable — connection lost"
                description="Reconnect to resume decision monitoring."
              />
            ) : visible.length === 0 ? (
              hasActiveFilters ? (
                <EmptyStateCard
                  title="No decisions match current filters"
                  description="Adjust or clear filters to see decision events."
                  actionLabel="Clear filters"
                  onAction={handleClearFilters}
                />
              ) : (
                <EmptyStateCard
                  title="No decision events available"
                  description="Decision events will appear here when they are emitted."
                />
              )
            ) : visible.length > VIRTUALIZATION_THRESHOLD ? (
              <FixedSizeList
                height={Math.min(336, visible.length * DECISION_ROW_HEIGHT)}
                width="100%"
                itemCount={visible.length}
                itemData={rowData}
                itemSize={DECISION_ROW_HEIGHT}
              >
                {VirtualizedDecisionRow}
              </FixedSizeList>
            ) : (
              <>
                {visible.map((event) => {
                  const eventId = event.event_id ?? event.id
                  return (
                    <DecisionRow key={eventId} event={event} onSelect={handleSelectDecision} />
                  )
                })}
              </>
            )}
          </div>
        </>
      ) : null}
    </section>
  )
}
