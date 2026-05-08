import "dotenv/config";

function required(name: string, fallback?: string): string {
  const val = process.env[name] ?? fallback;
  if (val === undefined) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  backendWsUrl: required("BACKEND_WS_URL", "ws://localhost:8012"),
  ue5WsUrl: required("UE5_WS_URL", "ws://localhost:8888"),
  reconnectIntervalMs: parseInt(process.env["RECONNECT_INTERVAL_MS"] ?? "3000", 10),
  ue5BufferTtlMs: parseInt(process.env["UE5_BUFFER_TTL_MS"] ?? "10000", 10),
  logLevel: (process.env["LOG_LEVEL"] ?? "info") as "debug" | "info" | "warn" | "error",
} as const;
