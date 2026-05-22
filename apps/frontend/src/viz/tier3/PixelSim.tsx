import { useEffect, useRef } from 'react'
import { vizBridge } from '../VizBridge'
import { useVizStore } from '../useVizStore'
import { SimEngine } from './SimEngine'
import './PixelSim.css'

export default function PixelSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<SimEngine | null>(null)
  const stats     = useVizStore((s) => s.stats)
  const log       = useVizStore((s) => s.log)
  const agents    = useVizStore((s) => s.agents)
  const setView   = useVizStore((s) => s.setView)

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current

    let engine: SimEngine
    let cancelled = false

    // rAF ensures canvas has settled layout dimensions before PixiJS reads them
    const handle = requestAnimationFrame(() => {
      if (cancelled) return
      engine = new SimEngine(canvas)
      engineRef.current = engine
      engine.init().catch(console.error)
    })

    const onEvent = (event: Parameters<SimEngine['applyEvent']>[0]) => {
      engineRef.current?.applyEvent(event)
    }
    vizBridge.subscribe(onEvent)

    return () => {
      cancelled = true
      cancelAnimationFrame(handle)
      vizBridge.unsubscribe(onEvent)
      engineRef.current?.destroy()
      engineRef.current = null
    }
  }, [])

  const agentList = Array.from(agents.values()).slice(0, 8)

  const statRows = [
    { label: 'PROCESSED', val: stats.processed,                                              color: 'var(--sv-teal)'    },
    { label: 'SHIPPED',   val: stats.shipped,                                                 color: 'var(--sv-emerald)' },
    { label: 'ACTIVE',    val: stats.active,                                                  color: 'var(--sv-amber)'   },
    { label: 'ERRORS',    val: stats.errors,                                                  color: 'var(--sv-red)'     },
    { label: 'LATENCY',   val: stats.latency != null ? `${stats.latency.toFixed(0)}ms` : '—', color: 'var(--sv-indigo)'  },
  ]

  return (
    <div className="pixel-sim-wrapper">
      <canvas ref={canvasRef} className="pixel-sim-canvas" />

      {/* Top overlay */}
      <div className="pixel-sim-overlay-top">
        <div className="pixel-sim-title">
          <span className="pixel-sim-live-dot" />
          <span className="pixel-sim-title-text">⬡ SWARMVISION</span>
          <span className="pixel-sim-title-sub">— LIVE</span>
        </div>
        <button
          type="button"
          className="pixel-sim-toggle"
          onClick={() => setView('ops')}
        >
          ← OPS VIEW
        </button>
        <button
          type="button"
          className="pixel-sim-toggle"
          onClick={() => setView('none')}
          style={{ marginLeft: '8px' }}
        >
          ✕ CLOSE
        </button>
      </div>

      {/* Right panel overlay */}
      <div className="pixel-sim-overlay-right">
        <div className="pixel-sim-panel-title">AGENTS</div>
        <div className="pixel-sim-agent-list">
          {agentList.map((a) => (
            <div key={a.id} className="pixel-sim-agent-row">
              <span
                className="pixel-sim-agent-bar"
                style={{ background: a.color }}
              />
              <span className="pixel-sim-agent-name">{a.name}</span>
              <span className="pixel-sim-agent-zone">{a.zone}</span>
            </div>
          ))}
        </div>

        <div className="pixel-sim-panel-title">EVENT LOG</div>
        <div className="pixel-sim-log">
          {log.slice(0, 10).map((entry, i) => (
            <div
              key={entry.id}
              className="pixel-sim-log-entry"
              style={{ opacity: Math.max(0.2, 1 - i * 0.1) }}
            >
              {entry.msg}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom stats bar */}
      <div className="pixel-sim-overlay-bottom">
        {statRows.map((s) => (
          <div key={s.label} className="pixel-sim-stat">
            <span className="pixel-sim-stat-val" style={{ color: s.color }}>{s.val}</span>
            <span className="pixel-sim-stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
