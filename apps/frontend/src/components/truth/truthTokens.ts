export type TruthClass = 'runtime' | 'replay' | 'derived' | 'synthetic' | 'mock' | 'unknown'

export const truthLabels: Record<TruthClass, string> = {
  runtime: 'Runtime Verified',
  replay: 'Replay',
  derived: 'Derived',
  synthetic: 'Synthetic',
  mock: 'Mock',
  unknown: 'Unknown',
}

export const truthIcons: Record<TruthClass, string> = {
  runtime: '✓',
  replay: '⏪',
  derived: 'ƒx',
  synthetic: '◇',
  mock: '◎',
  unknown: '?',
}
