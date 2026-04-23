export type MetaCategoryToken = {
  label: string
  color: string
}

export const META_CATEGORY_TOKENS: Record<string, MetaCategoryToken> = {
  bottleneck: { label: 'Bottleneck', color: '#F59E0B' },
  repeated_failure: { label: 'Repeated Failure', color: '#EF4444' },
  decision_pattern: { label: 'Decision Pattern', color: '#8B5CF6' },
  anomaly_correlation: { label: 'Anomaly Correlation', color: '#EC4899' },
  load_risk: { label: 'Load Risk', color: '#F97316' },
}

const FALLBACK_TOKEN: MetaCategoryToken = { label: 'Insight', color: '#8AA0C0' }

export const getMetaCategoryToken = (category: string): MetaCategoryToken =>
  META_CATEGORY_TOKENS[category] ?? FALLBACK_TOKEN
