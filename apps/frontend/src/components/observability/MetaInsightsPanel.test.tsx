import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { observabilityStore } from '../../store'
import { MetaInsightsPanel } from './MetaInsightsPanel'

const makeInsightEvent = (overrides: Record<string, unknown> = {}) => ({
  id: `insight-${Math.random().toString(36).slice(2)}`,
  event_id: `insight-${Math.random().toString(36).slice(2)}`,
  type: 'META_INSIGHT',
  event_type: 'META_INSIGHT',
  timestamp: new Date().toISOString(),
  source: 'meta-agent',
  trace_id: 'trace-test',
  payload: {
    category: 'bottleneck',
    summary: 'Agent alpha is a throughput bottleneck.',
    affected_agents: ['agent-alpha'],
    severity: 'HIGH',
    ...overrides,
  },
})

const clearInsights = () => {
  act(() => {
    observabilityStore.getState().cleanupStaleEvents(Date.now() + 10 * 60 * 1000)
  })
}

const ensureLiveMode = () => {
  act(() => {
    const { mode, toggleMode } = observabilityStore.getState()
    if (mode === 'PAUSED') toggleMode()
  })
}

afterEach(() => {
  ensureLiveMode()
  clearInsights()
})

describe('MetaInsightsPanel', () => {
  it('renders empty state when no insights are present', () => {
    render(<MetaInsightsPanel />)

    fireEvent.click(screen.getByRole('button', { name: /meta insights/i }))

    expect(
      screen.getByText(/no meta insights yet/i)
    ).toBeInTheDocument()
  })

  it('renders insight cards with category badge, summary, and timestamp when populated', () => {
    act(() => {
      observabilityStore.getState().addEvent(
        makeInsightEvent({
          category: 'bottleneck',
          summary: 'Agent alpha is a throughput bottleneck.',
          affected_agents: ['agent-alpha'],
          severity: 'HIGH',
        })
      )
    })

    render(<MetaInsightsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /meta insights/i }))

    expect(screen.getByText('Bottleneck')).toBeInTheDocument()
    expect(screen.getByText('Agent alpha is a throughput bottleneck.')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText(/agent-alpha/i)).toBeInTheDocument()
  })

  it('collapses body when toggle is clicked and expands again on re-click', () => {
    act(() => {
      observabilityStore.getState().addEvent(makeInsightEvent())
    })

    render(<MetaInsightsPanel />)
    const toggleBtn = screen.getByRole('button', { name: /meta insights/i })

    expect(screen.queryByText(/agent alpha/i)).not.toBeInTheDocument()

    fireEvent.click(toggleBtn)
    expect(screen.getByText('Agent alpha is a throughput bottleneck.')).toBeInTheDocument()

    fireEvent.click(toggleBtn)
    expect(screen.queryByText('Agent alpha is a throughput bottleneck.')).not.toBeInTheDocument()
  })

  it('renders fallback label and color for unknown category', () => {
    act(() => {
      observabilityStore.getState().addEvent(
        makeInsightEvent({ category: 'unknown_heuristic', summary: 'Unknown pattern detected.' })
      )
    })

    render(<MetaInsightsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /meta insights/i }))

    expect(screen.getByText('Insight')).toBeInTheDocument()
    expect(screen.getByText('Unknown pattern detected.')).toBeInTheDocument()
  })

  it('renders correctly when affected_agents and severity are absent', () => {
    act(() => {
      observabilityStore.getState().addEvent(
        makeInsightEvent({
          category: 'load_risk',
          summary: 'Load risk detected across cluster.',
          affected_agents: undefined,
          severity: undefined,
        })
      )
    })

    render(<MetaInsightsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /meta insights/i }))

    expect(screen.getByText('Load Risk')).toBeInTheDocument()
    expect(screen.getByText('Load risk detected across cluster.')).toBeInTheDocument()
    expect(screen.queryByText(/agents:/i)).not.toBeInTheDocument()
    expect(screen.queryByText('High')).not.toBeInTheDocument()
    expect(screen.queryByText('Low')).not.toBeInTheDocument()
    expect(screen.queryByText('Medium')).not.toBeInTheDocument()
  })

  it('freezes panel in PAUSED mode — new insight emitted after pause does not appear', () => {
    // Seed one insight before pause
    act(() => {
      observabilityStore.getState().addEvent(
        makeInsightEvent({ summary: 'Pre-pause insight.', category: 'bottleneck' })
      )
    })

    render(<MetaInsightsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /meta insights/i }))
    expect(screen.getByText('Pre-pause insight.')).toBeInTheDocument()

    // Switch to PAUSED — snapshot freezes here
    act(() => {
      observabilityStore.getState().toggleMode()
    })

    // Emit a new insight after pause
    act(() => {
      observabilityStore.getState().addEvent(
        makeInsightEvent({ summary: 'Post-pause insight.', category: 'anomaly_correlation' })
      )
    })

    // Post-pause insight must NOT appear; pre-pause insight still visible
    expect(screen.queryByText('Post-pause insight.')).not.toBeInTheDocument()
    expect(screen.getByText('Pre-pause insight.')).toBeInTheDocument()
  })

  it('renders at most 200 rows even when the store holds more than 200 insights', () => {
    act(() => {
      for (let i = 0; i < 210; i++) {
        observabilityStore.getState().addEvent(
          makeInsightEvent({ summary: `Insight number ${i}.`, category: 'bottleneck' })
        )
      }
    })

    render(<MetaInsightsPanel />)

    // The count pill should show 200, not 210
    expect(screen.getByText('200')).toBeInTheDocument()
  })
})
