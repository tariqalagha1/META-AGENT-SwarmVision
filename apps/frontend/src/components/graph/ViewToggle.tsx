import React from 'react'
import './ViewToggle.css'

export type ViewMode = '2d' | '3d'

interface ViewToggleProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  disable3D?: boolean
}

/**
 * ViewToggle Component
 *
 * Allows switching between 2D Operational and 3D Cinematic views
 */
export const ViewToggle: React.FC<ViewToggleProps> = ({
  mode,
  onModeChange,
  disable3D = false,
}) => {
  return (
    <div className="view-toggle">
      <div className="toggle-container">
        <button
          className={`toggle-btn ${mode === '2d' ? 'active' : ''}`}
          onClick={() => onModeChange('2d')}
        >
          2D Control View
        </button>
        <button
          className={`toggle-btn ${mode === '3d' ? 'active' : ''}`}
          disabled={disable3D}
          onClick={() => onModeChange('3d')}
        >
          3D Swarm View
        </button>
      </div>
    </div>
  )
}
