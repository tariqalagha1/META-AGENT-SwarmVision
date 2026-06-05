import { useState } from 'react'
import { runtimeConfig } from '../../config/runtime'
import './TruthUI.css'

type RuntimeFocusToggleProps = {
  onChange?: (enabled: boolean) => void
}

export function RuntimeFocusToggle({ onChange }: RuntimeFocusToggleProps) {
  const [enabled, setEnabled] = useState(runtimeConfig.truth.runtime_focus_enabled)

  return (
    <section className="truth-widget" aria-label="Runtime focus mode">
      <h4>Runtime Focus</h4>
      <button
        type="button"
        className="ov-alert-count-pill"
        onClick={() => {
          const next = !enabled
          setEnabled(next)
          onChange?.(next)
        }}
      >
        {enabled ? 'ON' : 'OFF'}
      </button>
    </section>
  )
}
