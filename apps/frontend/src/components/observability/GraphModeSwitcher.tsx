import { useObservabilityStore, type GraphMode } from '../../store'

const MODE_OPTIONS: Array<{ mode: GraphMode; label: string }> = [
  { mode: 'OBSERVABILITY', label: 'Observability' },
  { mode: 'PIPELINE', label: 'Pipeline' },
  { mode: 'CINEMATIC', label: 'Cinematic' },
]

export function GraphModeSwitcher() {
  const mode = useObservabilityStore((s) => s.graphMode)
  const setGraphMode = useObservabilityStore((s) => s.setGraphMode)

  return (
    <div className="ov-graph-mode-switcher" role="tablist" aria-label="Graph mode selector">
      {MODE_OPTIONS.map((option) => {
        const active = option.mode === mode
        return (
          <button
            key={option.mode}
            type="button"
            role="tab"
            aria-selected={active}
            className={`ov-graph-mode-btn${active ? ' is-active' : ''}`}
            onClick={() => setGraphMode(option.mode)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

