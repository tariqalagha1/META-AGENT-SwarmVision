import { useEffect, useMemo, useState } from 'react'

export interface SummaryMetrics {
  total_events: number
  active_agents: number
  failed_tasks: number
  successful_tasks: number
  average_handoff_latency_ms: number
  peak_concurrent_agents: number
  average_task_completion_time_ms: number
}

export interface AnalyticsSummaryResponse {
  available: boolean
  from_timestamp: string
  to_timestamp: string
  metrics: SummaryMetrics
}

export interface FailureIncident {
  event_id: string
  timestamp: string
  agent_id?: string | null
  task_id?: string | null
  suspected_source_node?: string | null
  upstream_chain: string[]
  related_recent_failures: number
  latency_spike_correlation: boolean
  message: string
}

export interface TimeBucketMetric {
  bucket: string
  value: number
}

export interface AnalyticsFailuresResponse {
  available: boolean
  from_timestamp: string
  to_timestamp: string
  total_failures: number
  failures_over_time: TimeBucketMetric[]
  incidents: FailureIncident[]
}

export interface LatencyBucketMetric {
  bucket: string
  average_handoff_latency_ms: number
  average_task_completion_time_ms: number
}

export interface AnalyticsLatencyResponse {
  available: boolean
  from_timestamp: string
  to_timestamp: string
  events_per_minute: TimeBucketMetric[]
  latency_over_time: LatencyBucketMetric[]
}

export interface BottleneckAgent {
  agent_id: string
  agent_name: string
  severity: 'healthy' | 'warning' | 'bottleneck'
  categories: string[]
  summary: string
  failure_rate: number
  avg_completion_time_ms: number
  avg_handoff_latency_ms: number
  blocker_count: number
  stuck_task_ids: string[]
}

export interface RootCauseCandidate {
  agent_id: string
  severity: 'healthy' | 'warning' | 'bottleneck'
  summary: string
  upstream_chain: string[]
  recent_failure_count: number
  latency_spike_correlation: boolean
}

export interface AnalyticsBottlenecksResponse {
  available: boolean
  from_timestamp: string
  to_timestamp: string
  agents: BottleneckAgent[]
  suspected_root_causes: RootCauseCandidate[]
}

interface UseAnalyticsOptions {
  apiBaseUrl: string
  enabled: boolean
  mode: 'live' | 'replay'
  fromTimestamp: string | null
  toTimestamp: string | null
  tenantId?: string
  appId?: string
}

const emptySummary: AnalyticsSummaryResponse = {
  available: false,
  from_timestamp: '',
  to_timestamp: '',
  metrics: {
    total_events: 0,
    active_agents: 0,
    failed_tasks: 0,
    successful_tasks: 0,
    average_handoff_latency_ms: 0,
    peak_concurrent_agents: 0,
    average_task_completion_time_ms: 0,
  },
}

const emptyFailures: AnalyticsFailuresResponse = {
  available: false,
  from_timestamp: '',
  to_timestamp: '',
  total_failures: 0,
  failures_over_time: [],
  incidents: [],
}

const emptyLatency: AnalyticsLatencyResponse = {
  available: false,
  from_timestamp: '',
  to_timestamp: '',
  events_per_minute: [],
  latency_over_time: [],
}

const emptyBottlenecks: AnalyticsBottlenecksResponse = {
  available: false,
  from_timestamp: '',
  to_timestamp: '',
  agents: [],
  suspected_root_causes: [],
}

export function useAnalytics({
  apiBaseUrl,
  enabled,
  mode,
  fromTimestamp,
  toTimestamp,
  tenantId,
  appId,
}: UseAnalyticsOptions) {
  const [summary, setSummary] = useState<AnalyticsSummaryResponse>(emptySummary)
  const [failures, setFailures] = useState<AnalyticsFailuresResponse>(emptyFailures)
  const [latency, setLatency] = useState<AnalyticsLatencyResponse>(emptyLatency)
  const [bottlenecks, setBottlenecks] =
    useState<AnalyticsBottlenecksResponse>(emptyBottlenecks)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !fromTimestamp || !toTimestamp) {
      setSummary(emptySummary)
      setFailures(emptyFailures)
      setLatency(emptyLatency)
      setBottlenecks(emptyBottlenecks)
      setError(null)
      return
    }

    const controller = new AbortController()

    const loadAnalytics = async () => {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        from: fromTimestamp,
        to: toTimestamp,
      }).toString()
      const scopedParams = new URLSearchParams(params)
      if (tenantId) scopedParams.set('tenant_id', tenantId)
      if (appId) scopedParams.set('app_id', appId)
      const query = scopedParams.toString()

      try {
        const [summaryResponse, failuresResponse, latencyResponse, bottlenecksResponse] =
          await Promise.all([
            fetch(`${apiBaseUrl}/analytics/summary?${query}`, {
              signal: controller.signal,
            }),
            fetch(`${apiBaseUrl}/analytics/failures?${query}`, {
              signal: controller.signal,
            }),
            fetch(`${apiBaseUrl}/analytics/latency?${query}`, {
              signal: controller.signal,
            }),
            fetch(`${apiBaseUrl}/analytics/bottlenecks?${query}`, {
              signal: controller.signal,
            }),
          ])

        const responses = [
          summaryResponse,
          failuresResponse,
          latencyResponse,
          bottlenecksResponse,
        ]
        const failedResponse = responses.find((response) => !response.ok)
        if (failedResponse) {
          const payload = (await failedResponse.json()) as { message?: string; last_error?: string }
          throw new Error(payload.last_error ?? payload.message ?? 'Analytics unavailable')
        }

        const [nextSummary, nextFailures, nextLatency, nextBottlenecks] =
          (await Promise.all([
            summaryResponse.json(),
            failuresResponse.json(),
            latencyResponse.json(),
            bottlenecksResponse.json(),
          ])) as [
            AnalyticsSummaryResponse,
            AnalyticsFailuresResponse,
            AnalyticsLatencyResponse,
            AnalyticsBottlenecksResponse,
          ]

        setSummary(nextSummary)
        setFailures(nextFailures)
        setLatency(nextLatency)
        setBottlenecks(nextBottlenecks)
      } catch (fetchError) {
        if ((fetchError as Error).name === 'AbortError') return
        setError((fetchError as Error).message)
      } finally {
        setLoading(false)
      }
    }

    void loadAnalytics()

    let intervalId: ReturnType<typeof setInterval> | null = null
    if (mode === 'live') {
      intervalId = setInterval(() => {
        void loadAnalytics()
      }, 15000)
    }

    return () => {
      controller.abort()
      if (intervalId) clearInterval(intervalId)
    }
  }, [apiBaseUrl, appId, enabled, fromTimestamp, mode, tenantId, toTimestamp])

  const healthByAgent = useMemo(
    () =>
      new Map(
        bottlenecks.agents.map((agent) => [
          agent.agent_id,
          {
            severity: agent.severity,
            summary: agent.summary,
            categories: agent.categories,
          },
        ])
      ),
    [bottlenecks.agents]
  )

  return {
    summary,
    failures,
    latency,
    bottlenecks,
    healthByAgent,
    loading,
    error,
  }
}
