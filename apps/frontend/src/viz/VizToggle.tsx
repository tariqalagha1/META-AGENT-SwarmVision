import { useState } from 'react'
import { useVizStore, vizStore } from './useVizStore'
import './VizToggle.css'

export function VizToggle() {
  const activeView = useVizStore((s) => s.activeView)
  const setView = useVizStore((s) => s.setView)
  const [source, setSource] = useState<'live' | 'mock'>('mock')

  const handleLive = () => {
    vizStore.getState().connectLive()
    setSource('live')
  }

  const handleMock = () => {
    vizStore.getState().useMock()
    setSource('mock')
  }

  return (
    <div className="viz-toggle">
      <div className="viz-toggle-row">
        <button
          type="button"
          className={`viz-toggle-btn ${activeView === 'ops' ? 'active' : ''}`}
          onClick={() => setView('ops')}
        >
          OPS VIEW
        </button>
        <button
          type="button"
          className={`viz-toggle-btn ${activeView === 'demo' ? 'active' : ''}`}
          onClick={() => setView('demo')}
        >
          DEMO VIEW
        </button>
      </div>

      <div className="viz-toggle-row">
        <button
          type="button"
          className={`viz-toggle-btn viz-toggle-live ${source === 'live' ? 'active-live' : ''}`}
          onClick={handleLive}
        >
          ⚡ LIVE
        </button>
        <button
          type="button"
          className={`viz-toggle-btn viz-toggle-mock ${source === 'mock' ? 'active-mock' : ''}`}
          onClick={handleMock}
        >
          ◎ MOCK
        </button>
      </div>
    </div>
  )
}
