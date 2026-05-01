import { useEffect, useRef } from 'react'
import type { WebSocketEvent } from './useWebSocket'
import { useObservabilityStore } from '../store/useObservabilityStore'
import { normalizeEvent, type NormalizedEvent } from '../lib/normalizeEvent'
import { normalizeEcosystemEvent } from '../lib/ecosystemEventNormalizer'
import { handleNormalizedEvent } from '../store/eventToMotionMapper'
import { getTraceState } from '../store/ecosystemRuntimeStore'
import {
  createVisualEventId,
  shouldQueueForVisualPlayback,
  VISUAL_EVENT_STEP_DELAY_MS,
  type VisualQueueEvent,
} from '../store/visualPlaybackQueue'

export interface BufferedStreamInput {
  eventMessage: WebSocketEvent | null
  metricsMessage?: WebSocketEvent | null
  alertMessage?: WebSocketEvent | null
  agentMessage?: WebSocketEvent | null
  flushIntervalMs?: number
}

const MAX_BUFFER_SIZE = 2000
const HEARTBEAT_STALE_MS = 5000
const DEBUG_OBSERVABILITY =
  import.meta.env.DEV && (import.meta.env.VITE_DEBUG_OBSERVABILITY ?? 'true') === 'true'

const isMetricsSnapshot = (msg: NormalizedEvent) => msg.event_type === 'METRICS_SNAPSHOT'

const isAnomaly = (msg: NormalizedEvent) => msg.event_type === 'ANOMALY'

const isAgentSnapshot = (msg: NormalizedEvent) => msg.event_type === 'AGENT_STATE_SNAPSHOT'

export function useBufferedStream({
  eventMessage,
  metricsMessage,
  alertMessage,
  agentMessage,
  flushIntervalMs = 300,
}: BufferedStreamInput) {
  const addBatchEvents = useObservabilityStore((s) => s.addBatchEvents)
  const setMetrics = useObservabilityStore((s) => s.setMetrics)
  const setAlerts = useObservabilityStore((s) => s.setAlerts)
  const setAgents = useObservabilityStore((s) => s.setAgents)
  const mode = useObservabilityStore((s) => s.mode)
  const markMessageReceived = useObservabilityStore((s) => s.markMessageReceived)
  const checkHeartbeat = useObservabilityStore((s) => s.checkHeartbeat)
  const cleanupStaleEvents = useObservabilityStore((s) => s.cleanupStaleEvents)
  const selectedTraceId = useObservabilityStore((s) => s.selectedTraceId)
  const selectedRequestId = useObservabilityStore((s) => s.selectedRequestId)
  const selectTrace = useObservabilityStore((s) => s.selectTrace)
  const selectRequest = useObservabilityStore((s) => s.selectRequest)

  const bufferRef = useRef<NormalizedEvent[]>([])
  const visualQueueRef = useRef<VisualQueueEvent[]>([])
  const visualAppliedIdsRef = useRef<Set<string>>(new Set())
  const visualInFlightRef = useRef(false)
  const visualSequenceRef = useRef(0)
  const droppedEventsRef = useRef(0)
  const ingestionCountRef = useRef(0)
  const ingestWindowStartRef = useRef(Date.now())
  const selectedTraceIdRef = useRef<string | null>(selectedTraceId)
  const selectedRequestIdRef = useRef<string | null>(selectedRequestId)

  useEffect(() => {
    selectedTraceIdRef.current = selectedTraceId
  }, [selectedTraceId])

  useEffect(() => {
    selectedRequestIdRef.current = selectedRequestId
  }, [selectedRequestId])

  useEffect(() => {
    const interval = setInterval(() => {
      if (visualInFlightRef.current) return
      const next = visualQueueRef.current.shift()
      if (!next) {
        if (import.meta.env.DEV) {
          console.log('VISUAL_QUEUE_COMPLETE')
        }
        return
      }
      visualInFlightRef.current = true
      handleNormalizedEvent(next.event)
      if (import.meta.env.DEV) {
        console.log('APPLIED_EVENT', JSON.stringify({
          trace_id: next.event.trace_id,
          type: next.event.type,
          step_name: next.event.step_name,
        }))
      }
      if (import.meta.env.DEV) {
        console.log('STORE_AFTER_MAPPER', JSON.stringify({
          trace_id: next.event.trace_id,
          state: getTraceState(next.event.trace_id),
        }))
      }
      if (import.meta.env.DEV) {
        const focusTraceId = selectedRequestIdRef.current ?? selectedTraceIdRef.current
        console.log('UI_FOCUS_TRACE', JSON.stringify({
          focusTraceId,
          selectedTraceId: selectedTraceIdRef.current,
        }))
      }
      if (import.meta.env.DEV) {
        console.log('VISUAL_QUEUE_APPLIED', {
          visualEventId: next.id,
          type: next.event.type,
          step_name: next.event.step_name,
          trace_id: next.event.trace_id,
        })
      }
      if (import.meta.env.DEV) {
        console.debug('MOTION_TRACE_STATE_AFTER_EVENT', getTraceState(next.event.trace_id))
      }
      visualInFlightRef.current = false
    }, VISUAL_EVENT_STEP_DELAY_MS)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      checkHeartbeat(HEARTBEAT_STALE_MS)
      cleanupStaleEvents(Date.now())
      if (mode === 'PAUSED') return
      if (bufferRef.current.length === 0) return
      const batch = bufferRef.current.splice(0, bufferRef.current.length)
      if (DEBUG_OBSERVABILITY) {
        console.debug('[observability] buffer_flush', {
          batchSize: batch.length,
          bufferedRemaining: bufferRef.current.length,
          droppedEvents: droppedEventsRef.current,
        })
      }
      addBatchEvents(batch)
    }, flushIntervalMs)

    return () => clearInterval(interval)
  }, [addBatchEvents, checkHeartbeat, cleanupStaleEvents, flushIntervalMs, mode])

  useEffect(() => {
    if (!eventMessage) return
    const normalized = normalizeEvent(eventMessage)
    if (import.meta.env.DEV) {
      console.debug('RAW_SWARM_EVENT', eventMessage)
      console.debug('NORMALIZED_SWARM_EVENT', normalized)
    }
    const ecosystemEvent = normalizeEcosystemEvent(
      eventMessage as unknown as Record<string, unknown>
    )
    const sourceType = normalized._meta.source_event_type
    const payloadStepName =
      typeof normalized.payload?.step_name === 'string' ? normalized.payload.step_name : undefined
    const visualEvent = {
      ...ecosystemEvent,
      type: sourceType || ecosystemEvent.type,
      step_name: payloadStepName || ecosystemEvent.step_name,
    }
    if (shouldQueueForVisualPlayback(visualEvent)) {
      const sequence = visualSequenceRef.current++
      const visualEventId = createVisualEventId(visualEvent, sequence)
      if (!visualAppliedIdsRef.current.has(visualEventId)) {
        visualAppliedIdsRef.current.add(visualEventId)
        visualQueueRef.current.push({
          id: visualEventId,
          event: visualEvent,
        })
        if (import.meta.env.DEV) {
          console.log('VISUAL_QUEUE_ENQUEUED', {
            visualEventId,
            type: visualEvent.type,
            step_name: visualEvent.step_name,
            trace_id: visualEvent.trace_id,
            queueLength: visualQueueRef.current.length,
          })
        }
      }
    }

    const kind = normalized.event_type
    if (!kind) return
    if (sourceType.includes('ACKNOWLEDGED') || sourceType.includes('ping')) return
    if (isMetricsSnapshot(normalized) || isAnomaly(normalized) || isAgentSnapshot(normalized)) {
      return
    }
    markMessageReceived(Date.now())
    if (!selectedTraceId && sourceType === 'SWARM_STARTED' && ecosystemEvent.trace_id) {
      selectTrace(ecosystemEvent.trace_id)
      selectRequest(ecosystemEvent.trace_id)
    }
    ingestionCountRef.current += 1
    const elapsedMs = Date.now() - ingestWindowStartRef.current
    if (elapsedMs >= 1000) {
      if (DEBUG_OBSERVABILITY) {
        console.debug('[observability] ingestion_rate', {
          eventsPerSecond: ingestionCountRef.current,
          droppedEvents: droppedEventsRef.current,
        })
      }
      ingestionCountRef.current = 0
      ingestWindowStartRef.current = Date.now()
    }
    bufferRef.current.push(normalized)
    if (bufferRef.current.length > MAX_BUFFER_SIZE) {
      const overflow = bufferRef.current.length - MAX_BUFFER_SIZE
      bufferRef.current.splice(0, overflow)
      droppedEventsRef.current += overflow
    }
  }, [eventMessage, markMessageReceived, selectRequest, selectTrace, selectedTraceId])

  useEffect(() => {
    if (!metricsMessage) return
    const normalized = normalizeEvent(metricsMessage)
    console.log('RAW EVENT:', metricsMessage)
    console.log('NORMALIZED EVENT:', normalized)
    if (!isMetricsSnapshot(normalized)) return
    markMessageReceived(Date.now())
    const payload = normalized.payload as Record<string, unknown> | undefined
    if (!payload || typeof payload !== 'object') return
    setMetrics(payload)
  }, [markMessageReceived, metricsMessage, setMetrics])

  useEffect(() => {
    if (!alertMessage) return
    const normalized = normalizeEvent(alertMessage)
    console.log('RAW EVENT:', alertMessage)
    console.log('NORMALIZED EVENT:', normalized)
    if (!isAnomaly(normalized)) return
    markMessageReceived(Date.now())
    const next = {
      event_id: normalized.event_id,
      event_type: normalized.event_type,
      timestamp: new Date(normalized.timestamp).toISOString(),
      agent_id: normalized.agent_id,
      trace_id: normalized.trace_id,
      payload: normalized.payload ?? {},
    }
    if (!next.event_id || !next.timestamp || !next.event_type) return
    setAlerts((prev) => [next, ...prev].slice(0, 100))
  }, [alertMessage, markMessageReceived, setAlerts])

  useEffect(() => {
    if (!agentMessage) return
    const normalized = normalizeEvent(agentMessage)
    console.log('RAW EVENT:', agentMessage)
    console.log('NORMALIZED EVENT:', normalized)
    if (!isAgentSnapshot(normalized)) return
    markMessageReceived(Date.now())
    const payload = normalized.payload as { agents?: unknown } | undefined
    const agents = payload?.agents
    if (!Array.isArray(agents)) return
    const typed = agents
      .filter((agent) => typeof agent === 'object' && agent !== null)
      .map((agent) => agent as {
        agent_id: string
        state: 'ACTIVE' | 'DEGRADED' | 'FAILED'
        last_seen: string
        latency_avg: number
        error_rate: number
        throughput: number
      })
      .filter((agent) => Boolean(agent.agent_id))
    setAgents(typed)
  }, [agentMessage, markMessageReceived, setAgents])
}
