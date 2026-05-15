import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import {
  InterventionCommand, InterventionKind, InterventionResult,
} from '../types';

// ─── Downstream command targets ───────────────────────────────────────────────
// Interventions are forwarded to the event-relay service, which translates
// them into control messages consumed by the UE5 USwarmEventRouterSubsystem
// and, when applicable, the AI backend.

export class InterventionHandler {
  private relayUrl: string;
  private pendingCommands = new Map<string, InterventionCommand>();

  constructor(relayUrl: string) {
    this.relayUrl = relayUrl;
  }

  async issue(
    kind: InterventionKind,
    target_id: string,
    issued_by: string,
    reason: string,
    payload: Record<string, unknown> = {}
  ): Promise<InterventionResult> {
    const command: InterventionCommand = {
      id:           uuidv4(),
      kind,
      target_id,
      issued_at_ms: Date.now(),
      issued_by,
      reason,
      payload,
    };

    this.pendingCommands.set(command.id, command);

    try {
      const result = await this.forwardToRelay(command);
      this.pendingCommands.delete(command.id);
      return result;
    } catch (err) {
      this.pendingCommands.delete(command.id);
      return {
        command_id:     command.id,
        accepted:       false,
        message:        `Relay unavailable: ${(err as Error).message}`,
        executed_at_ms: Date.now(),
      };
    }
  }

  private async forwardToRelay(
    command: InterventionCommand
  ): Promise<InterventionResult> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`${this.relayUrl}/intervention`);
      const timeout = setTimeout(() => {
        ws.terminate();
        resolve({
          command_id:     command.id,
          accepted:       false,
          message:        'Relay timeout',
          executed_at_ms: Date.now(),
        });
      }, 5000);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type:    'intervention',
          command: command,
        }));
      });

      ws.on('message', (raw) => {
        clearTimeout(timeout);
        try {
          const result = JSON.parse(raw.toString()) as InterventionResult;
          resolve(result);
        } catch {
          resolve({
            command_id:     command.id,
            accepted:       true,
            message:        'Command forwarded (no ack)',
            executed_at_ms: Date.now(),
          });
        }
        ws.close();
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          command_id:     command.id,
          accepted:       false,
          message:        `WS error: ${err.message}`,
          executed_at_ms: Date.now(),
        });
      });
    });
  }

  getPending(): InterventionCommand[] {
    return [...this.pendingCommands.values()];
  }

  // Translate kind to UE5-compatible event type
  static toEventType(kind: InterventionKind): string {
    const map: Record<InterventionKind, string> = {
      pause_swarm:    'INTERVENTION_PAUSE_SWARM',
      isolate_agent:  'INTERVENTION_ISOLATE_AGENT',
      reroute_task:   'INTERVENTION_REROUTE_TASK',
      reset_agent:    'INTERVENTION_RESET_AGENT',
      drain_zone:     'INTERVENTION_DRAIN_ZONE',
      emergency_stop: 'INTERVENTION_EMERGENCY_STOP',
    };
    return map[kind];
  }
}
