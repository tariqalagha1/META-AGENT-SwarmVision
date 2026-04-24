export const DECISION_FLAG_TOKENS = {
  ALLOW: {
    bg: '#0C447C',
    text: '#B5D4F4',
    label: 'Allow',
  },
  RETRY: {
    bg: '#854F0B',
    text: '#FAC775',
    label: 'Retry',
  },
  FALLBACK: {
    bg: '#3C3489',
    text: '#CECBF6',
    label: 'Fallback',
  },
  BLOCK: {
    bg: '#791F1F',
    text: '#F7C1C1',
    label: 'Block',
  },
  SWITCH_AGENT: {
    bg: '#0F6E56',
    text: '#9FE1CB',
    label: 'Switch agent',
  },
  UNKNOWN: {
    bg: '#444441',
    text: '#D3D1C7',
    label: 'Unknown',
  },
} as const

export type DecisionFlag = keyof typeof DECISION_FLAG_TOKENS
