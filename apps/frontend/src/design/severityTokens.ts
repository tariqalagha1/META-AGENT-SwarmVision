export const SEVERITY_TOKENS = {
  LOW: {
    bg: '#0C447C',
    text: '#B5D4F4',
    label: 'Low',
  },
  MEDIUM: {
    bg: '#854F0B',
    text: '#FAC775',
    label: 'Medium',
  },
  HIGH: {
    bg: '#791F1F',
    text: '#F7C1C1',
    label: 'High',
  },
} as const

export type SeverityLevel = keyof typeof SEVERITY_TOKENS
