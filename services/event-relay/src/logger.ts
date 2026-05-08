import { config } from "./config";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
const threshold = LEVELS[config.logLevel];

function fmt(level: string, msg: string, meta?: object): string {
  const ts = new Date().toISOString();
  const suffix = meta ? " " + JSON.stringify(meta) : "";
  return `[${ts}] [${level.toUpperCase()}] ${msg}${suffix}`;
}

export const log = {
  debug: (msg: string, meta?: object) => {
    if (LEVELS.debug >= threshold) process.stdout.write(fmt("debug", msg, meta) + "\n");
  },
  info: (msg: string, meta?: object) => {
    if (LEVELS.info >= threshold) process.stdout.write(fmt("info", msg, meta) + "\n");
  },
  warn: (msg: string, meta?: object) => {
    if (LEVELS.warn >= threshold) process.stderr.write(fmt("warn", msg, meta) + "\n");
  },
  error: (msg: string, meta?: object) => {
    if (LEVELS.error >= threshold) process.stderr.write(fmt("error", msg, meta) + "\n");
  },
};
