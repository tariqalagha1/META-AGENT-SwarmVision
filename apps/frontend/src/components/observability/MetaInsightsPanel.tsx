import { useMemo, useState } from 'react'
import { FixedSizeList, type ListChildComponentProps } from 'react-window'
import { useMetaInsightEvents, useObservabilityStore, usePausedSnapshot } from '../../store'
import type { ObservabilityEvent } from '../../store'
import { MetaInsightRow } from './MetaInsightRow'
import './ObservabilityPanels.css'

const INSIGHT_CAP = 200
const INSIGHT_ROW_HEIGHT = 72
const VIRTUALIZATION_THRESHOLD = 150

type VirtualRowData = { insights: ObservabilityEvent[] }

function VirtualizedInsightRow({ index, style, data }: ListChildComponentProps<VirtualRowData>) {
  const insight = data.insights[index]
  if (!insight) return null
  return (
    <div style={style}>
      <MetaInsightRow insight={insight} />
    </div>
  )
}

export function MetaInsightsPanel() {
  const [expanded, setExpanded] = useState(false)
  const streamMode = useObservabilityStore((s) => s.mode)

  const rawInsights = useMetaInsightEvents()
  const insights = usePausedSnapshot(rawInsights, streamMode === 'PAUSED')

  const capped = useMemo(
    () =>
      insights
        .slice()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, INSIGHT_CAP),
    [insights]
  )

  const rowData = useMemo<VirtualRowData>(() => ({ insights: capped }), [capped])

  return (
    <section className="meta-insights-drawer" aria-label="Meta insights panel">
      <header className="meta-insights-drawer-header">
        <button
          type="button"
          className="meta-insights-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          Meta Insights
        </button>
        <span className="meta-insights-count-pill">{capped.length}</span>
      </header>

      {expanded ? (
        <div className="meta-insights-body">
          {capped.length === 0 ? (
            <p className="meta-insights-empty">
              No meta insights yet — analysis begins when events start streaming.
            </p>
          ) : capped.length > VIRTUALIZATION_THRESHOLD ? (
            <FixedSizeList
              height={Math.min(320, capped.length * INSIGHT_ROW_HEIGHT)}
              width="100%"
              itemCount={capped.length}
              itemData={rowData}
              itemSize={INSIGHT_ROW_HEIGHT}
            >
              {VirtualizedInsightRow}
            </FixedSizeList>
          ) : (
            <div className="meta-insights-list">
              {capped.map((insight) => {
                const key = insight.event_id ?? insight.id
                return <MetaInsightRow key={key} insight={insight} />
              })}
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
