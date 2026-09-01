import Redis from "ioredis";
import { randomBytes } from "crypto";

const CHANNEL = "driftcache:invalidate";

export interface InvalidationMessage {
  key: string;
  operation: "set" | "del";
  timestamp: number;
  sourceId: string;
}

export class Invalidation {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;

  /**
   * Unique identifier for this Invalidation instance.
   * Used to ignore self-published messages — without this,
   * a set() would immediately evict the key from the same
   * instance's L1 cache via the pub/sub round-trip.
   */
  readonly instanceId = randomBytes(8).toString("hex");

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
      sourceId: this.instanceId,
    };

    await this.publisher.publish(CHANNEL, JSON.stringify(message));
  }

  /**
   * Subscribe to invalidation events. Call once at startup.
   * The callback receives each invalidation message so the caller
   * can evict stale L1 entries.
   *
   * Messages published by THIS instance are automatically filtered
   * out so a set() won't evict its own just-written L1 entry.
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

        // Skip messages we published ourselves.
        if (msg.sourceId === this.instanceId) {
          return;
        }

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
