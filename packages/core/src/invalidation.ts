import Redis from "ioredis";

const CHANNEL = "driftcache:invalidate";

export interface InvalidationMessage {
  key: string;
  operation: "set" | "del";
  timestamp: number;
}

export class Invalidation {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;

  /**
   * Initialise with a Redis connection config. Creates two connections:
   * one for publishing invalidation messages, and a dedicated one for
   * subscribing (Redis requires a separate connection for subscriptions).
   */
  async initialize(config: { host: string; port: number }): Promise<void> {
    this.publisher = new Redis({
      host: config.host,
      port: config.port,
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });

    this.publisher.on("error", (err) => {
      console.error("Invalidation publisher error:", err.message);
    });

    this.subscriber = new Redis({
      host: config.host,
      port: config.port,
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });

    this.subscriber.on("error", (err) => {
      console.error("Invalidation subscriber error:", err.message);
    });
  }

  /**
   * Publish an invalidation event after a write or delete.
   */
  async publishInvalidation(
    key: string,
    operation: "set" | "del"
  ): Promise<void> {
    if (!this.publisher) {
      throw new Error("Invalidation not initialized");
    }

    const message: InvalidationMessage = {
      key,
      operation,
      timestamp: Date.now(),
    };

    await this.publisher.publish(CHANNEL, JSON.stringify(message));
  }

  /**
   * Subscribe to invalidation events. Call once at startup.
   * The callback receives each invalidation message so the caller
   * can evict stale L1 entries.
   */
  async subscribeToInvalidations(
    onMessage: (msg: InvalidationMessage) => void
  ): Promise<void> {
    if (!this.subscriber) {
      throw new Error("Invalidation not initialized");
    }

    this.subscriber.on("message", (_channel: string, raw: string) => {
      try {
        const msg = JSON.parse(raw) as InvalidationMessage;
        onMessage(msg);
      } catch {
        console.error("Failed to parse invalidation message:", raw);
      }
    });

    await this.subscriber.subscribe(CHANNEL);
  }

  /**
   * Tear down both connections. Used for graceful shutdown and test cleanup.
   */
  async destroy(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.unsubscribe(CHANNEL).catch(() => {});
      this.subscriber.disconnect();
      this.subscriber = null;
    }

    if (this.publisher) {
      this.publisher.disconnect();
      this.publisher = null;
    }
  }
}
