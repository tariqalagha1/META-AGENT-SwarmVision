import { useSyncExternalStore } from 'react'

const subscribers = new Set<() => void>()
let ticker: ReturnType<typeof setInterval> | null = null

const startTicker = () => {
  if (ticker) return
  ticker = setInterval(() => {
    subscribers.forEach((notify) => notify())
  }, 10000)
}

const stopTicker = () => {
  if (!ticker || subscribers.size > 0) return
  clearInterval(ticker)
  ticker = null
}

const subscribe = (notify: () => void) => {
  subscribers.add(notify)
  startTicker()
  return () => {
    subscribers.delete(notify)
    stopTicker()
  }
}

const getSnapshot = () => Date.now()

export const useRelativeTimeTicker = () =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

const getRelativeLabel = (eventTime: number, now: number) => {
  const deltaSeconds = Math.max(0, Math.floor((now - eventTime) / 1000))

  if (deltaSeconds < 60) return `${deltaSeconds}s ago`

  const deltaMinutes = Math.floor(deltaSeconds / 60)
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`

  const deltaHours = Math.floor(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`

  if (deltaHours < 48) return 'yesterday'

  return null
}

const formatAbsolute = (eventTime: number) => {
  const ageMs = Date.now() - eventTime
  if (ageMs < 24 * 60 * 60 * 1000) {
    const date = new Date(eventTime)
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    const ss = String(date.getSeconds()).padStart(2, '0')
    const ms = String(date.getMilliseconds()).padStart(3, '0')
    return `${hh}:${mm}:${ss}.${ms}`
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(eventTime)
}

export function formatTimestamp(
  iso: string,
  mode: 'relative' | 'absolute' = 'relative'
): string {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return 'Invalid timestamp'

  if (mode === 'absolute') {
    return formatAbsolute(parsed)
  }

  const relative = getRelativeLabel(parsed, Date.now())
  if (relative) return relative

  return formatAbsolute(parsed)
}
