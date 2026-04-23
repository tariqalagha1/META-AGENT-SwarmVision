import { getMetaCategoryToken } from '../../design/metaCategoryTokens'
import './ObservabilityPanels.css'

type MetaCategoryBadgeProps = {
  category: string
}

export function MetaCategoryBadge({ category }: MetaCategoryBadgeProps) {
  const token = getMetaCategoryToken(category)

  return (
    <span className="meta-category-badge">
      <span className="meta-category-dot" style={{ backgroundColor: token.color }} />
      {token.label}
    </span>
  )
}
