import { useEffect, useMemo, useState } from 'react'
import { useObservabilityStore } from '../../store'
import { formatTimestamp } from '../../utils/formatTimestamp'
import { EmptyStateCard } from './EmptyStateCard'
import './ObservabilityPanels.css'

type StageStatus = 'passed' | 'failed' | 'warning' | 'skipped'

type DiagnosticStage = {
  name: string
  status: StageStatus
  details?: Record<string, unknown>
}

type UnifiedDiagnostic = {
  final_score: number
  effective_weight_used: number
  verdict: 'PASS' | 'WARNING' | 'FAIL'
  top_issues?: Array<Record<string, string>>
}

type StoredDiagnosticRecord = {
  request_id: string
  trace_id: string
  timestamp: string
  diagnostic: {
    request_id: string
    score: number
    verdict: 'PASS' | 'FAIL'
    stages: DiagnosticStage[]
    unified?: UnifiedDiagnostic
  }
  unified: UnifiedDiagnostic
  enforcement: {
    mode: 'off' | 'soft' | 'strict'
    block: boolean
    warn: boolean
    trigger?: string
  }
}

type DiagnosticsPanelProps = {
  apiBaseUrl: string
}

type FilterKind = 'ALL' | 'FAIL' | 'BLOCKED' | 'WARNING'

const FILTERS: FilterKind[] = ['ALL', 'FAIL', 'BLOCKED', 'WARNING']

const scoreLabel = (record: StoredDiagnosticRecord) => {
  if (Number.isFinite(record.unified?.final_score)) return record.unified.final_score.toFixed(1)
  return Number.isFinite(record.diagnostic?.score) ? String(record.diagnostic.score) : '-'
}

const badgeClassForVerdict = (verdict: string) => {
  if (verdict === 'PASS') return 'is-pass'
  if (verdict === 'WARNING') return 'is-warning'
  return 'is-fail'
}

const stageClassForStatus = (status: StageStatus) => {
  if (status === 'passed') return 'is-pass'
  if (status === 'warning') return 'is-warning'
  if (status === 'failed') return 'is-fail'
  return 'is-muted'
}

const normalizeReason = (details?: Record<string, unknown>) => {
  if (!details) return '-'
  const reason = details.reason
  if (typeof reason === 'string' && reason.trim()) return reason
  const error = details.error
  if (typeof error === 'string' && error.trim()) return error
  return '-'
}

export function DiagnosticsPanel({ apiBaseUrl }: DiagnosticsPanelProps) {
  const selectedTraceId = useObservabilityStore((s) => s.selectedTraceId)
  const selectedRequestId = useObservabilityStore((s) => s.selectedRequestId)
  const selectRequest = useObservabilityStore((s) => s.selectRequest)
  const selectTrace = useObservabilityStore((s) => s.selectTrace)

  const [records, setRecords] = useState<StoredDiagnosticRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<StoredDiagnosticRecord | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterKind>('ALL')
  const events = useObservabilityStore((s) => s.events)
  const eventOrder = useObservabilityStore((s) => s.eventOrder)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    const load = async () => {
      setLoadingList(true)
      setListError(null)
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/diagnostics?limit=20`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Failed to load diagnostics (${response.status})`)
        const payload = (await response.json()) as StoredDiagnosticRecord[]
        if (!active) return
        setRecords(Array.isArray(payload) ? payload : [])
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        if (!active) return
        setListError((error as Error).message)
      } finally {
        if (active) setLoadingList(false)
      }
    }

    void load()
    return () => {
      active = false
      controller.abort()
    }
  }, [apiBaseUrl])

  useEffect(() => {
    if (eventOrder.length === 0) return
    const latestId = eventOrder[eventOrder.length - 1]
    const latest = events[latestId]
    if (!latest || latest.event_type !== 'DIAGNOSTIC_RESULT') return

    const payload = (latest.payload ?? {}) as Record<string, unknown>
    const requestId = String(payload.request_id ?? '')
    const traceId = String(payload.trace_id ?? latest.trace_id ?? '')
    const diagnostic = payload.diagnostic as StoredDiagnosticRecord['diagnostic'] | undefined
    const unified = payload.unified as StoredDiagnosticRecord['unified'] | undefined
    const enforcement = payload.enforcement as StoredDiagnosticRecord['enforcement'] | undefined
    if (!requestId || !traceId || !diagnostic || !unified || !enforcement) return

    const record: StoredDiagnosticRecord = {
      request_id: requestId,
      trace_id: traceId,
      timestamp: new Date(latest.timestamp).toISOString(),
      diagnostic,
      unified,
      enforcement,
    }

    setRecords((prev) => {
      const next = [record, ...prev.filter((item) => item.request_id !== record.request_id)]
      return next.slice(0, 200)
    })

    if ((selectedRequestId && selectedRequestId === traceId) || (selectedTraceId && selectedTraceId === traceId)) {
      setSelectedId(requestId)
      setDetail(record)
    }
  }, [eventOrder, events, selectedRequestId, selectedTraceId])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setDetailError(null)
      return
    }

    const selectedByTraceOnly = !records.some((item) => item.request_id === selectedId)
    if (selectedByTraceOnly) {
      setDetail(null)
      setDetailError(null)
      return
    }

    let active = true
    const controller = new AbortController()

    const loadDetail = async () => {
      setLoadingDetail(true)
      setDetailError(null)
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/diagnostics/${selectedId}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Failed to load diagnostic detail (${response.status})`)
        const payload = (await response.json()) as StoredDiagnosticRecord
        if (!active) return
        setDetail(payload)
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        if (!active) return
        setDetailError((error as Error).message)
      } finally {
        if (active) setLoadingDetail(false)
      }
    }

    void loadDetail()
    return () => {
      active = false
      controller.abort()
    }
  }, [apiBaseUrl, records, selectedId])

  const visibleRecords = useMemo(() => {
    if (activeFilter === 'ALL') return records
    if (activeFilter === 'FAIL') return records.filter((item) => item.unified?.verdict === 'FAIL')
    if (activeFilter === 'BLOCKED') return records.filter((item) => item.enforcement?.block)
    return records.filter((item) => item.unified?.verdict === 'WARNING' || item.enforcement?.warn)
  }, [activeFilter, records])

  useEffect(() => {
    const externalId = selectedRequestId ?? selectedTraceId
    if (!externalId) return
    if (selectedId === externalId) return
    setSelectedId(externalId)
  }, [selectedId, selectedRequestId, selectedTraceId])

  const selectedRecord =
    detail ??
    records.find((item) => item.request_id === selectedId || item.trace_id === selectedId) ??
    null

  return (
    <section className="ov-panel ov-panel-diagnostics" aria-label="Diagnostics panel">
      <header className="ov-panel-header">
        <div>
          <h2>Diagnostics</h2>
          <p>Recent diagnostics and enforcement outcomes</p>
        </div>
        <span className="ov-alert-count-pill">{visibleRecords.length}</span>
      </header>

      <div className="ov-diagnostics-filter-row" role="group" aria-label="Diagnostics filters">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`ov-decision-filter-pill ${activeFilter === filter ? 'is-active' : ''}`}
            onClick={() => setActiveFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="ov-diagnostics-layout">
        <div className="ov-diagnostics-list" role="list">
          {loadingList ? (
            <EmptyStateCard title="Loading diagnostics" description="Fetching recent records..." />
          ) : listError ? (
            <EmptyStateCard title="Diagnostics unavailable" description={listError} />
          ) : visibleRecords.length === 0 ? (
            <EmptyStateCard
              title="No diagnostics found"
              description="Try changing filters or generate new diagnostic traffic."
            />
          ) : (
            visibleRecords.map((item) => {
              const verdict = item.unified?.verdict ?? 'FAIL'
              const selected = selectedId === item.request_id
              return (
                <button
                  key={item.request_id}
                  type="button"
                  className={`ov-diagnostics-row ${selected ? 'is-selected' : ''}`}
                  onClick={() => {
                    setSelectedId(item.request_id)
                    selectRequest(item.request_id)
                    selectTrace(item.request_id)
                  }}
                >
                  <div className="ov-diagnostics-row-id">{item.request_id}</div>
                  <div className="ov-diagnostics-row-time">
                    {formatTimestamp(item.timestamp, 'absolute')}
                  </div>
                  <div className={`ov-diagnostics-badge ${badgeClassForVerdict(verdict)}`}>{verdict}</div>
                  <div className="ov-diagnostics-score">{scoreLabel(item)}</div>
                  <div className="ov-diagnostics-flags">
                    {item.enforcement?.block ? 'BLOCKED' : item.enforcement?.warn ? 'WARN' : 'OK'}
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className="ov-diagnostics-detail">
          {!selectedId ? (
            <EmptyStateCard title="Select a diagnostic" description="Choose a request from the list." />
          ) : loadingDetail && !selectedRecord ? (
            <EmptyStateCard title="Loading details" description="Fetching diagnostic detail..." />
          ) : detailError && !selectedRecord ? (
            <EmptyStateCard title="Detail unavailable" description={detailError} />
          ) : selectedTraceId && !selectedRecord ? (
            <EmptyStateCard
              title="Diagnostics not executed for this run"
              description="No DIAGNOSTIC_RESULT was emitted for the selected trace."
            />
          ) : selectedRecord ? (
            <>
              <div className="ov-diagnostics-summary">
                <div>
                  <span className="ov-diagnostics-k">Request</span>
                  <span className="ov-diagnostics-v">{selectedRecord.request_id}</span>
                </div>
                <div>
                  <span className="ov-diagnostics-k">Unified Score</span>
                  <span className="ov-diagnostics-v">{scoreLabel(selectedRecord)}</span>
                </div>
                <div>
                  <span className="ov-diagnostics-k">Coverage</span>
                  <span className="ov-diagnostics-v">
                    {selectedRecord.unified?.effective_weight_used ?? '-'}
                  </span>
                </div>
                <div>
                  <span className="ov-diagnostics-k">Verdict</span>
                  <span className={`ov-diagnostics-badge ${badgeClassForVerdict(selectedRecord.unified?.verdict ?? 'FAIL')}`}>
                    {selectedRecord.unified?.verdict ?? 'FAIL'}
                  </span>
                </div>
                <div>
                  <span className="ov-diagnostics-k">Enforcement</span>
                  <span className="ov-diagnostics-v">
                    {selectedRecord.enforcement?.mode ?? '-'} /{' '}
                    {selectedRecord.enforcement?.block
                      ? 'BLOCKED'
                      : selectedRecord.enforcement?.warn
                        ? 'WARN'
                        : 'OK'}
                  </span>
                </div>
                <div>
                  <span className="ov-diagnostics-k">Trigger</span>
                  <span className="ov-diagnostics-v">{selectedRecord.enforcement?.trigger ?? '-'}</span>
                </div>
              </div>

              <div className="ov-diagnostics-stage-wrap">
                <table className="ov-diagnostics-stage-table">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Status</th>
                      <th>Weight</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedRecord.diagnostic?.stages ?? []).map((stage) => {
                      const details = stage.details ?? {}
                      const weight = details.weight
                      const weightLabel = typeof weight === 'number' ? String(weight) : '-'
                      return (
                        <tr key={stage.name}>
                          <td>{stage.name}</td>
                          <td>
                            <span className={`ov-diagnostics-badge ${stageClassForStatus(stage.status)}`}>
                              {stage.status.toUpperCase()}
                            </span>
                          </td>
                          <td>{weightLabel}</td>
                          <td>{normalizeReason(details)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}
