export type AgentStateToken = {
  ringColor: string
  indicator: 'none' | 'dot' | 'x'
  pulse: 'none' | 'pulse'
}

export const agentStateTokens: Record<'ACTIVE' | 'DEGRADED' | 'FAILED', AgentStateToken> = {
  ACTIVE: {
    ringColor: '#00C8FF',
    indicator: 'none',
    pulse: 'none',
  },
  DEGRADED: {
    ringColor: '#F2A623',
    indicator: 'dot',
    pulse: 'pulse',
  },
  FAILED: {
    ringColor: '#E24B4A',
    indicator: 'x',
    pulse: 'none',
  },
}
