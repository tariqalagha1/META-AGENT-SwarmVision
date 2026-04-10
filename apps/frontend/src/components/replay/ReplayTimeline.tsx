import React from 'react'
import './ReplayTimeline.css'

interface ReplayTimelineProps {
  disabled?: boolean
  loading?: boolean
  available?: boolean
  error?: string | null
  eventCount: number
  selectedIndex: number
  maxIndex: number
  selectedTimestamp: string | null
  onIndexChange: (index: number) => void
}

export const ReplayTimeline: React.FC<ReplayTimelineProps> = ({
  disabled = false,
  loading = false,
  available = true,
  error = null,
  eventCount,
  selectedIndex,
  maxIndex,
  selectedTimestamp,
  onIndexChange,
}) => {
  return (
    <div className="replay-timeline">
      <div className="replay-timeline-header">
        <div>
          <h3>Historical Replay</h3>
          <p>
            {available
              ? `${eventCount} persisted events in replay window`
              : 'Replay unavailable'}
          </p>
        </div>
        {selectedTimestamp && (
          <div className="replay-timestamp">
            <span>Viewing</span>
            <strong>{new Date(selectedTimestamp).toLocaleString()}</strong>
          </div>
        )}
      </div>

      {error && <div className="replay-error">{error}</div>}

      <div className="replay-controls">
        <button
          className="btn btn-secondary"
          disabled={disabled || loading || selectedIndex <= 0}
          onClick={() => onIndexChange(Math.max(0, selectedIndex - 1))}
        >
          Step Back
        </button>
        <input
          data-testid="replay-slider"
          type="range"
          min={0}
          max={Math.max(maxIndex, 0)}
          value={Math.min(selectedIndex, Math.max(maxIndex, 0))}
          disabled={disabled || loading || maxIndex < 0}
          onChange={(event) => onIndexChange(Number(event.target.value))}
          className="replay-slider"
        />
        <button
          className="btn btn-secondary"
          disabled={disabled || loading || selectedIndex >= maxIndex}
          onClick={() => onIndexChange(Math.min(maxIndex, selectedIndex + 1))}
        >
          Step Forward
        </button>
      </div>
    </div>
  )
}
