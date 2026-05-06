import { useEffect, useRef } from 'react'
import { vizBridge } from '../VizBridge'
import { useVizStore } from '../useVizStore'
import { SimEngine } from './SimEngine'
import './PixelSim.css'

export default function PixelSim() {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const engineRef   = useRef<SimEngine | null>(null)
  const stats       = useVizStore((s) => s.stats)
  const log         = useVizStore((s) => s.log)
  const agents      = useVizStore((s) => s.agents)
  const setView     = useVizStore((s) => s.setView)

  useEffect(() => {
    if (!canvasRef.current) return

    const engine = new SimEngine(canvasRef.current)
    engineRef.current = engine
    engine.init().catch(console.error)

    const onEvent = (event: Parameters<typeof engine.applyEvent>[0]) => {
      engine.applyEvent(event)
    }
    vizBridge.subscribe(onEvent)

    return () => {
      vizBridge.unsubscribe(onEvent)
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  const agentList = Array.from(agents.values()).slice(0, 8)

  return (
    <div className="pixel-sim-wrapper">
      <canvas ref={canvasRef} className="pixel-sim-canvas" />

      {/* Top overlay */}
      <div className="pixel-sim-overlay-top">
        <span className="pixel-sim-title">SWARMVISION — DEMO VIEW</span>
        <button
          type="button"
          className="pixel-sim-toggle"
          onClick={() => setView('ops')}
        >
          ← OPS VIEW
        </button>
      </div>

      {/* Right panel overlay */}
      <div className="pixel-sim-overlay-right">
        <div className="pixel-sim-panel-title">AGENTS</div>
        <div className="pixel-sim-agent-list">
          {agentList.map((a) => (
            <div key={a.id} className="pixel-sim-agent-row">
              <span
                className="pixel-sim-agent-dot"
                style={{ background: a.color }}
              />
              <span className="pixel-sim-agent-name">{a.name}</span>
              <span className="pixel-sim-agent-zone">{a.zone}</span>
            </div>
          ))}
        </div>

        <div className="pixel-sim-panel-title" style={{ marginTop: 12 }}>LOG</div>
        <div className="pixel-sim-log">
          {log.slice(0, 8).map((entry, i) => (
            <div
              key={entry.id}
              className="pixel-sim-log-entry"
              style={{ opacity: Math.max(0.2, 1 - i * 0.12) }}
            >
              {entry.msg}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom stats overlay */}
      <div className="pixel-sim-overlay-bottom">
        {[
          { label: 'PROCESSED', val: stats.processed, color: '#06d6a0' },
          { label: 'SHIPPED',   val: stats.shipped,   color: '#00f5ff' },
          { label: 'ACTIVE',    val: stats.active,    color: '#ffbe0b' },
          { label: 'ERRORS',    val: stats.errors,    color: '#ff006e' },
        ].map((s) => (
          <div key={s.label} className="pixel-sim-stat">
            <span className="pixel-sim-stat-val" style={{ color: s.color }}>{s.val}</span>
            <span className="pixel-sim-stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
