import WebSocket, { WebSocketServer } from "ws";
import { config } from "./config";
import { log } from "./logger";
import type { Ue5Message } from "./types";

// The event-relay can operate in two modes:
//
//   MODE A — UE5 connects TO us (server mode, default)
//     The relay opens a plain WebSocket server. UE5's Pixel Streaming
//     data channel connects to it. This avoids needing UE5's signalling
//     server URL during early development.
//
//   MODE B — We connect TO UE5 (client mode, UE5_WS_URL set)
//     The relay dials UE5's Pixel Streaming signalling endpoint directly.
//     Used in production when UE5_WS_URL points to the Pixel Streaming
//     WebSocket server.
//
// Mode is selected by UE5_MODE env var ("server" | "client", default "server").

const UE5_MODE = (process.env["UE5_MODE"] ?? "server") as "server" | "client";
const UE5_SERVER_PORT = parseInt(process.env["UE5_SERVER_PORT"] ?? "9000", 10);

// Events buffered while UE5 is not connected.
// Capped at 500 entries; oldest drop on overflow.
const MAX_BUFFER = 500;

export class Ue5Client {
  private socket: WebSocket | null = null;
  private server: WebSocketServer | null = null;
  private buffer: string[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private bufferPurgeTimer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    if (UE5_MODE === "server") {
      this.startServer();
    } else {
      this.connectClient();
    }
  }

  private startServer(): void {
    this.server = new WebSocketServer({ port: UE5_SERVER_PORT });
    log.info(`UE5 relay server listening`, { port: UE5_SERVER_PORT });

    this.server.on("connection", (ws) => {
      log.info("UE5 connected to relay server");
      // Only one UE5 instance at a time; close any existing socket
      this.socket?.terminate();
      this.socket = ws;
      this.flushBuffer();

      ws.on("close", () => {
        log.warn("UE5 disconnected from relay server");
        if (this.socket === ws) this.socket = null;
      });

      ws.on("error", (err) => {
        log.error("UE5 socket error", { error: err.message });
      });

      ws.on("message", (data) => {
        // UE5 → relay commands (reserved for future control messages)
        log.debug("UE5 → relay", { data: data.toString() });
      });
    });
  }

  private connectClient(): void {
    if (this.destroyed) return;
    const url = config.ue5WsUrl;
    log.info("Connecting to UE5 Pixel Streaming signalling", { url });

    const ws = new WebSocket(url);
    this.socket = ws;

    ws.on("open", () => {
      log.info("Connected to UE5 Pixel Streaming");
      this.flushBuffer();
    });

    ws.on("close", () => {
      log.warn("UE5 connection closed — scheduling reconnect", {
        retryMs: config.reconnectIntervalMs,
      });
      if (this.socket === ws) this.socket = null;
      this.scheduleReconnect();
    });

    ws.on("error", (err) => {
      log.error("UE5 connection error", { error: err.message });
    });
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectClient();
    }, config.reconnectIntervalMs);
  }

  send(msg: Ue5Message): void {
    const json = JSON.stringify(msg);

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(json, (err) => {
        if (err) log.error("UE5 send error", { error: err.message, type: msg.ue5_type });
      });
      return;
    }

    // Buffer while UE5 not ready
    if (this.buffer.length >= MAX_BUFFER) {
      this.buffer.shift(); // drop oldest
    }
    this.buffer.push(json);

    // Schedule buffer purge after TTL so stale events don't replay
    if (!this.bufferPurgeTimer) {
      this.bufferPurgeTimer = setTimeout(() => {
        const dropped = this.buffer.length;
        this.buffer = [];
        this.bufferPurgeTimer = null;
        if (dropped > 0) {
          log.warn("Buffer TTL expired — dropped buffered events", { dropped });
        }
      }, config.ue5BufferTtlMs);
    }
  }

  private flushBuffer(): void {
    if (this.bufferPurgeTimer) {
      clearTimeout(this.bufferPurgeTimer);
      this.bufferPurgeTimer = null;
    }
    if (this.buffer.length === 0) return;
    const toFlush = this.buffer.splice(0);
    log.info("Flushing buffered events to UE5", { count: toFlush.length });
    for (const json of toFlush) {
      this.socket?.send(json, (err) => {
        if (err) log.error("UE5 flush error", { error: err.message });
      });
    }
  }

  stop(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.bufferPurgeTimer) clearTimeout(this.bufferPurgeTimer);
    this.socket?.terminate();
    this.server?.close();
  }
}
