import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetEcosystemRuntimeStoreForTests,
  initializeTrace,
  setCurrentStep,
  updateNodeState,
  useEcosystemTraceState,
} from './ecosystemRuntimeStore'

describe('ecosystemRuntimeStore reactive hook', () => {
  afterEach(() => {
    __resetEcosystemRuntimeStoreForTests()
  })

  it('updates subscribed trace snapshot when currentStep changes', () => {
    const traceId = 'trace-reactive-1'
    initializeTrace(traceId)

    const { result } = renderHook(() => useEcosystemTraceState(traceId))
    expect(result.current?.currentStep).toBeNull()

    act(() => {
      updateNodeState(traceId, 'fetch_agent', 'active')
      setCurrentStep(traceId, 'fetch_agent')
    })
    expect(result.current?.currentStep).toBe('fetch_agent')

    act(() => {
      updateNodeState(traceId, 'normalize_agent', 'active')
      setCurrentStep(traceId, 'normalize_agent')
    })
    expect(result.current?.currentStep).toBe('normalize_agent')
  })
})
