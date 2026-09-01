export type HitTier = "l1" | "l2";
export interface MetricsSnapshot {
    hits: {
        l1: number;
        l2: number;
        total: number;
    };
    misses: number;
    hitRatio: number;
    latency: {
        p50: number;
        p95: number;
        p99: number;
    };
    shardDistribution: Record<string, number>;
    totalRequests: number;
}
export declare class Metrics {
    private l1Hits;
    private l2Hits;
    private misses;
    private latencySamples;
    private latencyIndex;
    private latencyFull;
    private shardCounts;
    /**
     * Record a cache hit, distinguishing between L1 (in-memory) and L2 (Redis).
     */
    recordHit(tier: HitTier): void;
    /**
     * Record a cache miss (key not found in either L1 or L2).
     */
    recordMiss(): void;
    /**
     * Record a single request's latency in milliseconds.
     * Uses a circular buffer so memory stays bounded.
     */
    recordLatency(ms: number): void;
    /**
     * Compute p50, p95, p99 from the current latency samples.
     */
    computePercentiles(): {
        p50: number;
        p95: number;
        p99: number;
    };
    /**
     * Record that a key was written to a specific shard.
     * Used to track the real observed distribution of keys across shards.
     */
    recordShardWrite(shardId: string): void;
    /**
     * Get the current key-count distribution across shards.
     */
    getShardDistribution(): Record<string, number>;
    /**
     * Assemble a complete metrics snapshot for the REST/WebSocket endpoint.
     */
    exportSnapshot(): MetricsSnapshot;
    /**
     * Reset all counters and samples. Useful for testing.
     */
    reset(): void;
}
//# sourceMappingURL=metrics.d.ts.map