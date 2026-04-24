export const runtimeConfig = {
  websocket: {
    reconnectAttempts: Number(import.meta.env.VITE_WS_RECONNECT_ATTEMPTS ?? 10),
    reconnectDelayMs: Number(import.meta.env.VITE_WS_RECONNECT_DELAY_MS ?? 2000),
    heartbeatIntervalMs: Number(import.meta.env.VITE_WS_HEARTBEAT_INTERVAL_MS ?? 30000),
    reconnectBackoffMultiplier: Number(
      import.meta.env.VITE_WS_RECONNECT_BACKOFF_MULTIPLIER ?? 1.5
    ),
  },
}
