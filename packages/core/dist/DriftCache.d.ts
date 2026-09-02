import { HashRing } from "./hashRing";
import { ShardConfig } from "./shardClient";
import { HealthChecker } from "./healthChecker";
import { HotKeyTracker } from "./hotKeyTracker";
import { MetricsSnapshot } from "./metrics";
export interface DriftCacheConfig {
    shards: ShardConfig[];
    /** Max entries in the in-process L1 cache. */
    l1MaxSize: number;
    /** Default TTL in seconds for cached values. */
    defaultTtlSeconds: number;
    /** Number of virtual nodes per shard on the hash ring. */
    virtualNodeCount?: number;
    /** Health check interval in milliseconds. */
    healthCheckIntervalMs?: number;
    /** Consecutive failures before marking a shard down. */
    healthCheckThreshold?: number;
    /** Hot-key access threshold per time window. */
    hotKeyThreshold?: number;
    /** Hot-key time window in milliseconds. */
    hotKeyWindowMs?: number;
    /** How many extra shards to replicate hot keys to. */
    hotKeyReplicaCount?: number;
    /** Redis config for pub/sub invalidation (host:port). Defaults to first shard. */
    invalidationRedis?: {
        host: string;
        port: number;
    };
}
export declare class DriftCache {
    private readonly config;
    private readonly hashRing;
    private readonly l1Cache;
    private readonly metrics;
    private readonly invalidation;
    private readonly healthChecker;
    private readonly hotKeyTracker;
    private readonly defaultTtlSeconds;
    private initialized;
    /**
     * Round-robin counter for distributing hot-key reads across replicas.
     * Using round-robin (instead of Math.random()) because it guarantees
     * perfectly even distribution over time and is easier to verify in tests.
     */
    private hotKeyRRCounter;
    constructor(config: DriftCacheConfig);
    /**
     * Compute the full set of shards that hold (or should hold) a hot key:
     * the primary shard from the hash ring plus the replica shards.
     *
     * This reuses the exact same replica-selection logic as
     * hotKeyTracker.replicateHotKey() so reads and writes agree on
     * which shards actually have the value. Both walk the ring snapshot
     * from index 0, collecting the first N distinct shard IDs that
     * aren't the primary.
     */
    private getHotKeyShards;
    /**
     * Async initialization: set up pub/sub and start background tasks.
     * Must be called before using get/set/delete.
     */
    initialize(): Promise<void>;
    /**
     * Full GET flow:
     * 1. Record access for hot-key tracking.
     * 2. Check L1 → on hit, return immediately.
     * 3. If the key is hot, round-robin the L2 read across primary + replicas.
     *    On a replica miss, fall back to the primary before declaring a miss.
     * 4. If the key is not hot, read from the primary shard only (existing path).
     * 5. On full miss, return null.
     */
    get(key: string): Promise<unknown | null>;
    /**
     * Full SET flow:
     * 1. Route key to the correct shard via hash ring.
     * 2. Write to Redis.
     * 3. Publish invalidation so other instances evict from L1.
     * 4. If the key is hot, replicate to neighbouring shards.
     */
    set(key: string, value: unknown, options?: {
        ttlSeconds?: number;
    }): Promise<void>;
    /**
     * Full DELETE flow:
     * 1. Route key to shard, delete from Redis.
     * 2. Delete from local L1.
     * 3. Publish invalidation.
     */
    delete(key: string): Promise<void>;
    /**
     * Get a complete metrics snapshot for the REST/WebSocket endpoint.
     */
    getMetricsSnapshot(): MetricsSnapshot;
    /**
     * Get the health checker for status subscriptions.
     */
    getHealthChecker(): HealthChecker;
    /**
     * Get the hot key tracker for debugging/metrics.
     */
    getHotKeyTracker(): HotKeyTracker;
    /**
     * Get the hash ring for debugging/metrics.
     */
    getHashRing(): HashRing;
    /**
     * Graceful shutdown — stop timers, disconnect pub/sub.
     *
     * Note: this does NOT disconnect shard clients because they live
     * in a shared global pool. Call `destroyShardClients()` separately
     * once ALL DriftCache instances are done (e.g. at process exit).
     */
    destroy(): Promise<void>;
}
//# sourceMappingURL=DriftCache.d.ts.map