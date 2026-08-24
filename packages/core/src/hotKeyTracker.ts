import { HashRing } from "./hashRing";
import { shardSet } from "./shardClient";

export interface HotKeyTrackerOptions {
  /** Access count threshold within a single window to flag a key as hot. */
  threshold: number;
  /** Duration of each time window in milliseconds. */
  windowMs: number;
  /** Number of replica shards to write hot keys to (in addition to primary). */
  replicaCount: number;
}

export class HotKeyTracker {
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly replicaCount: number;

  private currentWindow = new Map<string, number>();
  private hotKeys = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: HotKeyTrackerOptions) {
    this.threshold = options.threshold;
    this.windowMs = options.windowMs;
    this.replicaCount = options.replicaCount;
  }

  /**
   * Start the sliding-window reset timer.
   */
  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.resetWindow();
    }, this.windowMs);
  }

  /**
   * Stop the sliding-window timer. Required for test cleanup.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Record a single access for a key. Called on every GET.
   */
  recordAccess(key: string): void {
    const count = (this.currentWindow.get(key) ?? 0) + 1;
    this.currentWindow.set(key, count);

    if (count >= this.threshold) {
      this.hotKeys.add(key);
    }
  }

  /**
   * Check whether a key is currently flagged as hot.
   */
  isHot(key: string): boolean {
    return this.hotKeys.has(key);
  }

  /**
   * Reset the current window — clears counters and hot-key flags.
   */
  resetWindow(): void {
    this.currentWindow.clear();
    this.hotKeys.clear();
  }

  /**
   * Replicate a hot key's value to neighbouring shards on the ring
   * so read load is spread across multiple nodes instead of hitting
   * a single shard for every request.
   */
  async replicateHotKey(
    key: string,
    value: unknown,
    ttlSeconds: number,
    hashRing: HashRing
  ): Promise<void> {
    const snapshot = hashRing.getRingSnapshot();

    if (snapshot.length === 0) {
      return;
    }

    // Collect unique shard IDs in ring order starting from the primary.
    const primaryShard = hashRing.getNode(key);
    const seen = new Set<string>([primaryShard]);
    const replicaShards: string[] = [];

    for (const node of snapshot) {
      if (replicaShards.length >= this.replicaCount) {
        break;
      }

      if (!seen.has(node.nodeId)) {
        seen.add(node.nodeId);
        replicaShards.push(node.nodeId);
      }
    }

    // Write to all replica shards in parallel.
    const writes = replicaShards.map((shardId) =>
      shardSet(shardId, key, value, ttlSeconds).catch((err) => {
        console.error(
          `Failed to replicate hot key "${key}" to shard ${shardId}:`,
          err
        );
      })
    );

    await Promise.allSettled(writes);
  }

  /**
   * Get the current window's access counts (for metrics/debugging).
   */
  getWindowSnapshot(): Map<string, number> {
    return new Map(this.currentWindow);
  }

  /**
   * Get the current set of hot keys (for metrics/debugging).
   */
  getHotKeys(): Set<string> {
    return new Set(this.hotKeys);
  }
}
