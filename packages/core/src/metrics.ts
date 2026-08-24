export type HitTier = "l1" | "l2";

export interface MetricsSnapshot {
  hits: { l1: number; l2: number; total: number };
  misses: number;
  hitRatio: number;
  latency: { p50: number; p95: number; p99: number };
  shardDistribution: Record<string, number>;
  totalRequests: number;
}

const MAX_LATENCY_SAMPLES = 10_000;

export class Metrics {
  private l1Hits = 0;
  private l2Hits = 0;
  private misses = 0;

  private latencySamples: number[] = [];
  private latencyIndex = 0;
  private latencyFull = false;

  private shardCounts = new Map<string, number>();

  /**
   * Record a cache hit, distinguishing between L1 (in-memory) and L2 (Redis).
   */
  recordHit(tier: HitTier): void {
    if (tier === "l1") {
      this.l1Hits++;
    } else {
      this.l2Hits++;
    }
  }

  /**
   * Record a cache miss (key not found in either L1 or L2).
   */
  recordMiss(): void {
    this.misses++;
  }

  /**
   * Record a single request's latency in milliseconds.
   * Uses a circular buffer so memory stays bounded.
   */
  recordLatency(ms: number): void {
    if (this.latencySamples.length < MAX_LATENCY_SAMPLES) {
      this.latencySamples.push(ms);
    } else {
      this.latencySamples[this.latencyIndex] = ms;
      this.latencyFull = true;
    }

    this.latencyIndex =
      (this.latencyIndex + 1) % MAX_LATENCY_SAMPLES;
  }

  /**
   * Compute p50, p95, p99 from the current latency samples.
   */
  computePercentiles(): { p50: number; p95: number; p99: number } {
    if (this.latencySamples.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p50: sorted[Math.ceil(0.5 * len) - 1],
      p95: sorted[Math.ceil(0.95 * len) - 1],
      p99: sorted[Math.ceil(0.99 * len) - 1],
    };
  }

  /**
   * Record that a key was written to a specific shard.
   * Used to track the real observed distribution of keys across shards.
   */
  recordShardWrite(shardId: string): void {
    this.shardCounts.set(
      shardId,
      (this.shardCounts.get(shardId) ?? 0) + 1
    );
  }

  /**
   * Get the current key-count distribution across shards.
   */
  getShardDistribution(): Record<string, number> {
    const result: Record<string, number> = {};

    for (const [shardId, count] of this.shardCounts) {
      result[shardId] = count;
    }

    return result;
  }

  /**
   * Assemble a complete metrics snapshot for the REST/WebSocket endpoint.
   */
  exportSnapshot(): MetricsSnapshot {
    const totalHits = this.l1Hits + this.l2Hits;
    const totalRequests = totalHits + this.misses;

    return {
      hits: {
        l1: this.l1Hits,
        l2: this.l2Hits,
        total: totalHits,
      },
      misses: this.misses,
      hitRatio: totalRequests > 0 ? totalHits / totalRequests : 0,
      latency: this.computePercentiles(),
      shardDistribution: this.getShardDistribution(),
      totalRequests,
    };
  }

  /**
   * Reset all counters and samples. Useful for testing.
   */
  reset(): void {
    this.l1Hits = 0;
    this.l2Hits = 0;
    this.misses = 0;
    this.latencySamples = [];
    this.latencyIndex = 0;
    this.latencyFull = false;
    this.shardCounts.clear();
  }
}
