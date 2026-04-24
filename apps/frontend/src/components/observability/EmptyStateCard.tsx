import './ObservabilityPanels.css'

type EmptyStateCardProps = {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyStateCard({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateCardProps) {
  return (
    <div className="ov-empty-card" role="status" aria-live="polite">
      <h3>{title}</h3>
      <p>{description}</p>
      {actionLabel && onAction ? (
        <button type="button" className="ov-empty-card-action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
