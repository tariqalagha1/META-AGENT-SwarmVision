import { DECISION_FLAG_TOKENS, type DecisionFlag } from '../../design/decisionFlagTokens'
import './ObservabilityPanels.css'

type DecisionFilterBarProps = {
  selectedFlags: DecisionFlag[]
  searchText: string
  onSelectedFlagsChange: (flags: DecisionFlag[]) => void
  onSearchTextChange: (value: string) => void
}

const FILTER_FLAGS: DecisionFlag[] = ['ALLOW', 'RETRY', 'FALLBACK', 'BLOCK', 'SWITCH_AGENT']

const getNextFlags = (selectedFlags: DecisionFlag[], nextFlag: DecisionFlag) => {
  if (selectedFlags.includes(nextFlag)) {
    return selectedFlags.filter((flag) => flag !== nextFlag)
  }
  return [...selectedFlags, nextFlag]
}

export function DecisionFilterBar({
  selectedFlags,
  searchText,
  onSelectedFlagsChange,
  onSearchTextChange,
}: DecisionFilterBarProps) {
  const allSelected = selectedFlags.length === 0

  return (
    <div className="ov-decision-filter-bar">
      <div className="ov-decision-flag-filter" role="group" aria-label="Decision flag filter">
        <button
          type="button"
          className={`ov-decision-filter-pill ${allSelected ? 'is-active' : ''}`}
          onClick={() => onSelectedFlagsChange([])}
        >
          All
        </button>

        {FILTER_FLAGS.map((flag) => {
          const token = DECISION_FLAG_TOKENS[flag]
          const selected = selectedFlags.includes(flag)

          return (
            <button
              key={flag}
              type="button"
              className={`ov-decision-filter-pill ${selected ? 'is-active' : ''}`}
              onClick={() => onSelectedFlagsChange(getNextFlags(selectedFlags, flag))}
              style={
                selected
                  ? {
                      backgroundColor: token.bg,
                      color: token.text,
                      borderColor: token.bg,
                    }
                  : undefined
              }
            >
              {token.label}
            </button>
          )
        })}
      </div>

      <input
        type="text"
        className="ov-decision-search"
        value={searchText}
        onChange={(event) => onSearchTextChange(event.target.value)}
        placeholder="Search decision point or reason"
        aria-label="Search decision point or reason"
      />
    </div>
  )
}
