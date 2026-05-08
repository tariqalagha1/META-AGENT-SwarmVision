import WebSocket from "ws";
import { config } from "./config";
import { log } from "./logger";
import type { BackendChannel } from "./types";

type MessageHandler = (raw: string, channel: BackendChannel) => void;

// Channel → WS path mapping matching main.py endpoint definitions
const CHANNEL_PATHS: Record<BackendChannel, string> = {
  events: "/ws/events",
  metrics: "/metrics",
  alerts: "/alerts",
  agents: "/agents",
};

class ChannelClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private readonly channel: BackendChannel,
    private readonly onMessage: MessageHandler,
  ) {}

  connect(): void {
    if (this.destroyed) return;
    const url = config.backendWsUrl + CHANNEL_PATHS[this.channel];
    log.info(`Connecting to backend channel`, { channel: this.channel, url });

    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      log.info(`Backend channel connected`, { channel: this.channel });
    });

    this.ws.on("message", (data: WebSocket.RawData) => {
      this.onMessage(data.toString(), this.channel);
    });

    this.ws.on("close", (code, reason) => {
      log.warn(`Backend channel closed — scheduling reconnect`, {
        channel: this.channel,
        code,
        reason: reason.toString(),
        retryMs: config.reconnectIntervalMs,
      });
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      log.error(`Backend channel error`, { channel: this.channel, error: err.message });
      // close handler fires after error, reconnect happens there
    });
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, config.reconnectIntervalMs);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.terminate();
  }
}

export class BackendClient {
  private channels: ChannelClient[] = [];

  start(onMessage: MessageHandler): void {
    const names: BackendChannel[] = ["events", "metrics", "alerts", "agents"];
    for (const ch of names) {
      const client = new ChannelClient(ch, onMessage);
      this.channels.push(client);
      client.connect();
    }
  }

  stop(): void {
    for (const ch of this.channels) ch.destroy();
    this.channels = [];
  }
}
