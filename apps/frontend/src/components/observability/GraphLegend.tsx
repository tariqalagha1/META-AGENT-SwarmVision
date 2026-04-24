import { agentStateTokens } from '../../design/agentStateTokens'
import './ObservabilityPanels.css'

export function GraphLegend() {
  return (
    <div className="ov-graph-legend" aria-label="Graph legend">
      <h4>Legend</h4>
      <ul>
        {Object.entries(agentStateTokens).map(([state, token]) => (
          <li key={state}>
            <span
              className="ov-legend-swatch"
              style={{ borderColor: token.ringColor }}
              data-indicator={token.indicator}
            />
            <span>{state}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
