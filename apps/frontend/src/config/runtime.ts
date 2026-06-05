export const runtimeConfig = {
  websocket: {
    reconnectAttempts: Number(import.meta.env.VITE_WS_RECONNECT_ATTEMPTS ?? 10),
    reconnectDelayMs: Number(import.meta.env.VITE_WS_RECONNECT_DELAY_MS ?? 2000),
    heartbeatIntervalMs: Number(import.meta.env.VITE_WS_HEARTBEAT_INTERVAL_MS ?? 30000),
    reconnectBackoffMultiplier: Number(
      import.meta.env.VITE_WS_RECONNECT_BACKOFF_MULTIPLIER ?? 1.5
    ),
  },
  truth: {
    store_split_enabled: String(import.meta.env.VITE_STORE_SPLIT_ENABLED ?? 'false').toLowerCase() === 'true',
    synthetic_isolation_enabled:
      String(import.meta.env.VITE_SYNTHETIC_ISOLATION_ENABLED ?? 'false').toLowerCase() === 'true',
    trust_labels_enabled: String(import.meta.env.VITE_TRUST_LABELS_ENABLED ?? 'false').toLowerCase() === 'true',
    runtime_focus_enabled:
      String(import.meta.env.VITE_RUNTIME_FOCUS_ENABLED ?? 'false').toLowerCase() === 'true',
    twin_truth_gate_enabled:
      String(import.meta.env.VITE_TWIN_TRUTH_GATE_ENABLED ?? 'false').toLowerCase() === 'true',
  },
}
