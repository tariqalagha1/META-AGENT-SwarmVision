/**
 * Event Emitter Client
 *
 * Provides event handling and emission for SwarmVision Graph integration
 */

type EventListener = (data: unknown) => void | Promise<void>;
type EventMap = Record<string, EventListener[]>;

export class EventEmitter {
  private events: EventMap = {};
  private maxListeners = 10;

  /**
   * Register an event listener
   */
  on(event: string, listener: EventListener): this {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    return this;
  }

  /**
   * Register a one-time event listener
   */
  once(event: string, listener: EventListener): this {
    const onceWrapper: EventListener = async (data) => {
      await listener(data);
      this.off(event, onceWrapper);
    };
    return this.on(event, onceWrapper);
  }

  /**
   * Remove an event listener
   */
  off(event: string, listener: EventListener): this {
    if (!this.events[event]) return this;
    this.events[event] = this.events[event].filter((l) => l !== listener);
    return this;
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners(event?: string): this {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
    return this;
  }

  /**
   * Emit an event
   */
  async emit(event: string, data?: unknown): Promise<void> {
    if (!this.events[event]) return;

    const listeners = [...this.events[event]];
    await Promise.all(listeners.map((listener) => listener(data)));
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount(event: string): number {
    return this.events[event]?.length ?? 0;
  }

  /**
   * Set max listeners warning threshold
   */
  setMaxListeners(n: number): this {
    this.maxListeners = n;
    return this;
  }
}

export default EventEmitter;
