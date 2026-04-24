import './ObservabilityPanels.css'

type AgentIdChipProps = {
  agentId?: string | null
}

const truncateAgentId = (agentId: string) => {
  if (agentId.length <= 8) return agentId
  return `${agentId.slice(0, 8)}…`
}

export function AgentIdChip({ agentId }: AgentIdChipProps) {
  const label = agentId && agentId.trim().length > 0 ? agentId : '—'

  const handleCopy = async () => {
    if (!agentId) return
    try {
      await navigator.clipboard.writeText(agentId)
    } catch {
      // Ignore clipboard write failures in unsupported contexts.
    }
  }

  return (
    <button
      type="button"
      className="ov-agent-id-chip"
      onClick={handleCopy}
      title={label}
      disabled={!agentId}
    >
      {agentId ? truncateAgentId(agentId) : '—'}
    </button>
  )
}
