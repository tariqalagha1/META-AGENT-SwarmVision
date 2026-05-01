import { useMemo } from 'react'
import { FixedSizeList, type ListChildComponentProps } from 'react-window'
import { useObservabilityStore } from '../../store/useObservabilityStore'
import { usePausedSnapshot, useTimelineEvents } from '../../store'
import { useRelativeTimeTicker } from '../../utils/formatTimestamp'
import { TimelineEventRow } from './TimelineEventRow'
import { EmptyStateCard } from './EmptyStateCard'
import './ObservabilityPanels.css'

type ExecutionTimelinePanelProps = {
  disconnected: boolean
}

type TimelineRowProps = {
  eventIds: string[]
  eventById: Map<string, ReturnType<typeof useTimelineEvents>[number]>
  onSelectEvent: (eventId: string) => void
}

const VIRTUALIZATION_THRESHOLD = 150
const ROW_HEIGHT = 52

function VirtualizedRow({ index, style, data }: ListChildComponentProps<TimelineRowProps>) {
  const eventId = data.eventIds[index]
  const event = data.eventById.get(eventId)
  if (!event) return null

  return (
    <div style={style}>
      <TimelineEventRow event={event} onSelectEvent={data.onSelectEvent} />
    </div>
  )
}

export function ExecutionTimelinePanel({ disconnected }: ExecutionTimelinePanelProps) {
  const selectedTraceId = useObservabilityStore((s) => s.selectedTraceId)
  const selectTrace = useObservabilityStore((s) => s.selectTrace)
  const selectRequest = useObservabilityStore((s) => s.selectRequest)
  const streamMode = useObservabilityStore((s) => s.mode)
  const selectEvent = useObservabilityStore((s) => s.selectEvent)
  const isPaused = streamMode === 'PAUSED'

  const liveEvents = useTimelineEvents(selectedTraceId)
  const timelineEvents = usePausedSnapshot(liveEvents, isPaused)
  useRelativeTimeTicker()

  const rowData = useMemo<TimelineRowProps>(() => {
    const eventById = new Map<string, (typeof timelineEvents)[number]>()
    const eventIds: string[] = []

    for (const event of timelineEvents) {
      const eventId = event.event_id ?? event.id
      eventIds.push(eventId)
      eventById.set(eventId, event)
    }

    return {
      eventIds,
      eventById,
      onSelectEvent: (eventId: string) => {
        selectEvent(eventId)
        const event = eventById.get(eventId)
        if (!event) return
        const traceId = event.trace_id ?? selectedTraceId ?? null
        if (traceId) {
          selectTrace(traceId)
          selectRequest(traceId)
        }
      },
    }
  }, [selectEvent, selectRequest, selectTrace, selectedTraceId, timelineEvents])

  if (!selectedTraceId) {
    return (
      <section className="ov-panel ov-panel-timeline" aria-label="Execution timeline panel">
        <header className="ov-panel-header">
          <h2>Execution Timeline</h2>
        </header>
        <EmptyStateCard
          title="Select a node or trace to view execution"
          description="Choose an agent in the graph to load timeline events."
        />
      </section>
    )
  }

  if (timelineEvents.length === 0) {
    return (
      <section className="ov-panel ov-panel-timeline" aria-label="Execution timeline panel">
        <header className="ov-panel-header">
          <h2>Execution Timeline</h2>
        </header>
        <EmptyStateCard
          title="No events recorded for this trace yet"
          description="Streaming may still be catching up for this trace."
        />
      </section>
    )
  }

  return (
    <section className="ov-panel ov-panel-timeline" aria-label="Execution timeline panel">
      <header className="ov-panel-header">
        <h2>Execution Timeline</h2>
        <p>Trace {selectedTraceId}</p>
      </header>

      {disconnected ? <div className="ov-panel-overlay">Disconnected</div> : null}

      <div className="ov-timeline-list" role="list">
        {timelineEvents.length > VIRTUALIZATION_THRESHOLD ? (
          <FixedSizeList
            height={Math.min(520, timelineEvents.length * ROW_HEIGHT)}
            width="100%"
            itemCount={rowData.eventIds.length}
            itemData={rowData}
            itemSize={ROW_HEIGHT}
          >
            {VirtualizedRow}
          </FixedSizeList>
        ) : (
          <>
            {timelineEvents.map((event) => {
              const eventId = event.event_id ?? event.id
              return (
                <TimelineEventRow key={eventId} event={event} onSelectEvent={rowData.onSelectEvent} />
              )
            })}
          </>
        )}
      </div>
    </section>
  )
}
