import { useVizStore } from './useVizStore'
import './VizToggle.css'

export function VizToggle() {
  const activeView = useVizStore((s) => s.activeView)
  const setView = useVizStore((s) => s.setView)

  return (
    <div className="viz-toggle">
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
  )
}
