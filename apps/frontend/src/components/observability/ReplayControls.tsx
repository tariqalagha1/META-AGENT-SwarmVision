import { useEffect, useMemo } from 'react'
import { useObservabilityStore } from '../../store'

type ReplayControlsProps = {
  minTs?: number
  maxTs?: number
}

const SPEED_OPTIONS: Array<0.5 | 1 | 2 | 4> = [0.5, 1, 2, 4]

export function ReplayControls({ minTs, maxTs }: ReplayControlsProps) {
  const replay = useObservabilityStore((s) => s.replay)
  const setReplay = useObservabilityStore((s) => s.setReplay)
  const resetReplay = useObservabilityStore((s) => s.resetReplay)

  const hasTimeline = Boolean(minTs && maxTs && maxTs > minTs)
  const sliderMin = minTs ?? 0
  const sliderMax = maxTs ?? 1
  const sliderValue = replay.cursorTs ?? sliderMax

  useEffect(() => {
    if (!replay.enabled || !replay.isPlaying || !hasTimeline) return

    const stepMs = Math.max(40, Math.round(140 / replay.speed))
    const timer = window.setInterval(() => {
      setReplay({
        cursorTs: Math.min(sliderMax, (replay.cursorTs ?? sliderMin) + Math.round(250 * replay.speed)),
      })
    }, stepMs)

    return () => {
      clearInterval(timer)
    }
  }, [hasTimeline, replay.cursorTs, replay.enabled, replay.isPlaying, replay.speed, setReplay, sliderMax, sliderMin])

  useEffect(() => {
    if (!replay.enabled || !hasTimeline) return
    if ((replay.cursorTs ?? sliderMax) >= sliderMax && replay.isPlaying) {
      setReplay({ isPlaying: false, cursorTs: sliderMax })
    }
  }, [hasTimeline, replay.cursorTs, replay.enabled, replay.isPlaying, setReplay, sliderMax])

  const statusText = useMemo(() => {
    if (!replay.enabled) return 'Live'
    return replay.isPlaying ? 'Replay Playing' : 'Replay Paused'
  }, [replay.enabled, replay.isPlaying])

  return (
    <div className="ov-replay-controls" aria-label="Replay controls">
      <div className="ov-replay-row">
        <button
          type="button"
          className="ov-controls-btn"
          onClick={() =>
            setReplay({
              enabled: !replay.enabled,
              isPlaying: false,
              cursorTs: replay.enabled ? undefined : sliderMax,
            })
          }
          aria-label={replay.enabled ? 'Disable replay' : 'Enable replay'}
        >
          {replay.enabled ? 'Replay On' : 'Replay Off'}
        </button>

        <button
          type="button"
          className="ov-controls-btn"
          disabled={!replay.enabled || !hasTimeline}
          onClick={() => setReplay({ isPlaying: !replay.isPlaying })}
          aria-label={replay.isPlaying ? 'Pause replay' : 'Play replay'}
        >
          {replay.isPlaying ? 'Pause' : 'Play'}
        </button>

        <label className="ov-replay-speed">
          Speed
          <select
            value={replay.speed}
            onChange={(event) => setReplay({ speed: Number(event.currentTarget.value) as 0.5 | 1 | 2 | 4 })}
            aria-label="Replay speed"
            disabled={!replay.enabled}
          >
            {SPEED_OPTIONS.map((speed) => (
              <option key={speed} value={speed}>
                {speed}x
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="ov-controls-btn"
          onClick={resetReplay}
          aria-label="Reset replay"
        >
          Reset
        </button>

        <span className="ov-replay-status">{statusText}</span>
      </div>

      <input
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={100}
        value={Math.min(sliderMax, Math.max(sliderMin, sliderValue))}
        onChange={(event) =>
          setReplay({
            enabled: true,
            isPlaying: false,
            cursorTs: Number(event.currentTarget.value),
          })
        }
        disabled={!hasTimeline}
        aria-label="Replay timeline cursor"
      />
    </div>
  )
}
