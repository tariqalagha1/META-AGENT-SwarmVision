export type EventTypeToken = {
  background: string
  color: string
  icon?: string
}

export const eventTypeTokens: Record<string, EventTypeToken> = {
  TASK_START: {
    background: '#0C447C',
    color: '#B5D4F4',
    icon: '▶',
  },
  TASK_HANDOFF: {
    background: '#3C3489',
    color: '#CECBF6',
    icon: '⇄',
  },
  DECISION: {
    background: '#0F6E56',
    color: '#9FE1CB',
    icon: '◆',
  },
  ANOMALY: {
    background: '#854F0B',
    color: '#FAC775',
    icon: '⚠',
  },
  ERROR: {
    background: '#791F1F',
    color: '#F7C1C1',
    icon: '✕',
  },
}

export const defaultEventTypeToken: EventTypeToken = {
  background: '#0D1526',
  color: '#8AA0C0',
}
