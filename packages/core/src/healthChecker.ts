import { EventEmitter } from "events";
import { HashRing } from "./hashRing";
import { pingShard } from "./shardClient";

export interface HealthCheckerOptions {
  /** How often to ping each shard, in milliseconds. */
  intervalMs: number;
  /** How many consecutive failures before marking a shard down. */
  failureThreshold: number;
  /** The shard IDs to monitor. */
  shardIds: string[];
  /** The hash ring to update on shard status changes. */
  hashRing: HashRing;
}

export type ShardStatus = "up" | "down";

export interface ShardStatusEvent {
  shardId: string;
  status: ShardStatus;
  timestamp: number;
}

export class HealthChecker extends EventEmitter {
  private readonly intervalMs: number;
  private readonly failureThreshold: number;
  private readonly shardIds: string[];
  private readonly hashRing: HashRing;

  private readonly consecutiveFailures = new Map<string, number>();
  private readonly shardStatus = new Map<string, ShardStatus>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: HealthCheckerOptions) {
    super();
    this.intervalMs = options.intervalMs;
    this.failureThreshold = options.failureThreshold;
    this.shardIds = [...options.shardIds];
    this.hashRing = options.hashRing;

    for (const id of this.shardIds) {
      this.consecutiveFailures.set(id, 0);
      this.shardStatus.set(id, "up");
    }
  }

  /**
   * Start periodic health checks for every known shard.
   */
  startHealthChecks(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runChecks();
    }, this.intervalMs);
  }

  /**
   * Stop periodic health checks. Required for clean test teardown.
   */
  stopHealthChecks(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Register a callback for shard status changes.
   */
  onStatusChange(callback: (event: ShardStatusEvent) => void): void {
    this.on("statusChange", callback);
  }

  /**
   * Get the current status of all shards.
   */
  getStatus(): Map<string, ShardStatus> {
    return new Map(this.shardStatus);
  }

  /**
   * Run a single round of health checks for all shards.
   */
  async runChecks(): Promise<void> {
    const checks = this.shardIds.map(async (shardId) => {
      let isAlive = false;

      try {
        isAlive = await pingShard(shardId, 1000);
      } catch {
        isAlive = false;
      }

      this.evaluateShardHealth(shardId, isAlive);
    });

    await Promise.allSettled(checks);
  }

  /**
   * Evaluate a single ping result and update shard state.
   * Only changes status after crossing the consecutive-failure threshold
   * to avoid reacting to transient blips.
   */
  evaluateShardHealth(shardId: string, isAlive: boolean): void {
    const currentFailures = this.consecutiveFailures.get(shardId) ?? 0;
    const currentStatus = this.shardStatus.get(shardId) ?? "up";

    if (!isAlive) {
      const newFailures = currentFailures + 1;
      this.consecutiveFailures.set(shardId, newFailures);

      if (
        newFailures >= this.failureThreshold &&
        currentStatus !== "down"
      ) {
        this.shardStatus.set(shardId, "down");
        this.hashRing.removeNode(shardId);

        const event: ShardStatusEvent = {
          shardId,
          status: "down",
          timestamp: Date.now(),
        };

        this.emit("statusChange", event);
      }
    } else {
      this.consecutiveFailures.set(shardId, 0);

      if (currentStatus === "down") {
        this.shardStatus.set(shardId, "up");
        this.hashRing.addNode(shardId);

        const event: ShardStatusEvent = {
          shardId,
          status: "up",
          timestamp: Date.now(),
        };

        this.emit("statusChange", event);
      }
    }
  }
}
