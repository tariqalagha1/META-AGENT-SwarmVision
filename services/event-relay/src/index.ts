import { Relay } from "./relay";
import { log } from "./logger";

const relay = new Relay();
relay.start();

function shutdown(signal: string): void {
  log.info(`Received ${signal} — shutting down`);
  relay.stop();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  log.error("Uncaught exception", { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log.error("Unhandled rejection", { reason: String(reason) });
  process.exit(1);
});
