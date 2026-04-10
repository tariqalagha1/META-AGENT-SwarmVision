import React from 'react'
import './ModeToggle.css'

export type AppMode = 'live' | 'replay'

interface ModeToggleProps {
  mode: AppMode
  onModeChange: (mode: AppMode) => void
}

export const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onModeChange }) => {
  return (
    <div className="mode-toggle">
      <button
        className={`mode-toggle-btn ${mode === 'live' ? 'active' : ''}`}
        onClick={() => onModeChange('live')}
      >
        Live Mode
      </button>
      <button
        className={`mode-toggle-btn ${mode === 'replay' ? 'active' : ''}`}
        onClick={() => onModeChange('replay')}
      >
        Replay Mode
      </button>
    </div>
  )
}
