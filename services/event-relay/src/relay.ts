import { BackendClient } from "./backendClient";
import { Ue5Client } from "./ue5Client";
import { translate } from "./translator";
import { log } from "./logger";
import type { BackendChannel } from "./types";

export class Relay {
  private backend = new BackendClient();
  private ue5 = new Ue5Client();
  private stats = {
    received: 0,
    translated: 0,
    dropped: 0,
  };

  start(): void {
    log.info("SwarmVision event-relay starting");

    this.ue5.start();

    this.backend.start((raw: string, channel: BackendChannel) => {
      this.stats.received++;

      const msg = translate(raw, channel);
      if (!msg) {
        this.stats.dropped++;
        return;
      }

      log.debug("Relay →", {
        type: msg.ue5_type,
        channel,
        agent: msg.agent_id,
        trace: msg.trace_id?.slice(0, 8),
      });

      this.stats.translated++;
      this.ue5.send(msg);
    });

    this.startStatsTimer();
  }

  private startStatsTimer(): void {
    setInterval(() => {
      log.info("Relay stats", this.stats);
    }, 30_000);
  }

  stop(): void {
    log.info("SwarmVision event-relay stopping");
    this.backend.stop();
    this.ue5.stop();
  }
}
