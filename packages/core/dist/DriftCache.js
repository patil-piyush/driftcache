"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriftCache = void 0;
const hashRing_1 = require("./hashRing");
const shardClient_1 = require("./shardClient");
const l1Cache_1 = require("./l1Cache");
const invalidation_1 = require("./invalidation");
const healthChecker_1 = require("./healthChecker");
const hotKeyTracker_1 = require("./hotKeyTracker");
const metrics_1 = require("./metrics");
class DriftCache {
    config;
    hashRing;
    l1Cache;
    metrics;
    invalidation;
    healthChecker;
    hotKeyTracker;
    defaultTtlSeconds;
    initialized = false;
    /**
     * Round-robin counter for distributing hot-key reads across replicas.
     * Using round-robin (instead of Math.random()) because it guarantees
     * perfectly even distribution over time and is easier to verify in tests.
     */
    hotKeyRRCounter = 0;
    constructor(config) {
        this.config = config;
        // 1. Build the hash ring.
        this.hashRing = new hashRing_1.HashRing(config.virtualNodeCount ?? 150);
        for (const shard of config.shards) {
            this.hashRing.addNode(shard.id);
        }
        // 2. Create shard clients.
        (0, shardClient_1.createShardClients)(config.shards);
        // 3. Create the L1 cache.
        this.l1Cache = new l1Cache_1.L1Cache({ maxSize: config.l1MaxSize });
        // 4. Metrics.
        this.metrics = new metrics_1.Metrics();
        // 5. Invalidation (pub/sub).
        this.invalidation = new invalidation_1.Invalidation();
        // 6. Health checker.
        this.healthChecker = new healthChecker_1.HealthChecker({
            intervalMs: config.healthCheckIntervalMs ?? 2000,
            failureThreshold: config.healthCheckThreshold ?? 3,
            shardIds: config.shards.map((s) => s.id),
            hashRing: this.hashRing,
        });
        // 7. Hot key tracker.
        this.hotKeyTracker = new hotKeyTracker_1.HotKeyTracker({
            threshold: config.hotKeyThreshold ?? 100,
            windowMs: config.hotKeyWindowMs ?? 5000,
            replicaCount: config.hotKeyReplicaCount ?? 2,
        });
        this.defaultTtlSeconds = config.defaultTtlSeconds;
    }
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
    getHotKeyShards(key) {
        const primaryShard = this.hashRing.getNode(key);
        const snapshot = this.hashRing.getRingSnapshot();
        if (snapshot.length === 0) {
            return [primaryShard];
        }
        const replicaCount = this.config.hotKeyReplicaCount ?? 2;
        const seen = new Set([primaryShard]);
        const replicaShards = [];
        for (const node of snapshot) {
            if (replicaShards.length >= replicaCount) {
                break;
            }
            if (!seen.has(node.nodeId)) {
                seen.add(node.nodeId);
                replicaShards.push(node.nodeId);
            }
        }
        // Return primary first, then replicas.
        return [primaryShard, ...replicaShards];
    }
    /**
     * Async initialization: set up pub/sub and start background tasks.
     * Must be called before using get/set/delete.
     */
    async initialize() {
        if (this.initialized) {
            return;
        }
        // Wire invalidation — evict from L1 on any remote write.
        const invalidationRedis = this.config.invalidationRedis ?? {
            host: this.config.shards[0].host,
            port: this.config.shards[0].port,
        };
        await this.invalidation.initialize(invalidationRedis);
        await this.invalidation.subscribeToInvalidations((msg) => {
            this.l1Cache.l1Delete(msg.key);
        });
        // Start health checks.
        this.healthChecker.startHealthChecks();
        // Start hot-key window timer.
        this.hotKeyTracker.start();
        this.initialized = true;
    }
    /**
     * Full GET flow:
     * 1. Record access for hot-key tracking.
     * 2. Check L1 → on hit, return immediately.
     * 3. If the key is hot, round-robin the L2 read across primary + replicas.
     *    On a replica miss, fall back to the primary before declaring a miss.
     * 4. If the key is not hot, read from the primary shard only (existing path).
     * 5. On full miss, return null.
     */
    async get(key) {
        const start = performance.now();
        try {
            // Record access for hot-key detection.
            this.hotKeyTracker.recordAccess(key);
            // L1 check.
            const l1Value = this.l1Cache.l1Get(key);
            if (l1Value !== undefined) {
                this.metrics.recordHit("l1");
                return l1Value;
            }
            // L2 check — hot-key path vs. normal path.
            if (this.hotKeyTracker.isHot(key)) {
                // Hot key: distribute reads across primary + replicas via round-robin.
                const shards = this.getHotKeyShards(key);
                const idx = this.hotKeyRRCounter % shards.length;
                this.hotKeyRRCounter++;
                const chosenShard = shards[idx];
                const l2Value = await (0, shardClient_1.shardGet)(chosenShard, key);
                if (l2Value !== null) {
                    this.l1Cache.l1Set(key, l2Value, this.defaultTtlSeconds);
                    this.metrics.recordHit("l2");
                    return l2Value;
                }
                // Replica miss — fall back to the primary shard before giving up.
                // This handles replication lag or a replica that hasn't received
                // the hot-key write yet.
                if (chosenShard !== shards[0]) {
                    const primaryValue = await (0, shardClient_1.shardGet)(shards[0], key);
                    if (primaryValue !== null) {
                        this.l1Cache.l1Set(key, primaryValue, this.defaultTtlSeconds);
                        this.metrics.recordHit("l2");
                        return primaryValue;
                    }
                }
            }
            else {
                // Normal path: route via hash ring to primary shard only.
                const shardId = this.hashRing.getNode(key);
                const l2Value = await (0, shardClient_1.shardGet)(shardId, key);
                if (l2Value !== null) {
                    this.l1Cache.l1Set(key, l2Value, this.defaultTtlSeconds);
                    this.metrics.recordHit("l2");
                    return l2Value;
                }
            }
            // Full miss.
            this.metrics.recordMiss();
            return null;
        }
        finally {
            this.metrics.recordLatency(performance.now() - start);
        }
    }
    /**
     * Full SET flow:
     * 1. Route key to the correct shard via hash ring.
     * 2. Write to Redis.
     * 3. Publish invalidation so other instances evict from L1.
     * 4. If the key is hot, replicate to neighbouring shards.
     */
    async set(key, value, options) {
        const ttl = options?.ttlSeconds ?? this.defaultTtlSeconds;
        const shardId = this.hashRing.getNode(key);
        await (0, shardClient_1.shardSet)(shardId, key, value, ttl);
        this.metrics.recordShardWrite(shardId);
        // Update local L1 immediately.
        this.l1Cache.l1Set(key, value, ttl);
        // Broadcast invalidation to other instances.
        await this.invalidation
            .publishInvalidation(key, "set")
            .catch((err) => {
            console.error("Failed to publish invalidation:", err);
        });
        // Replicate if hot.
        if (this.hotKeyTracker.isHot(key)) {
            await this.hotKeyTracker
                .replicateHotKey(key, value, ttl, this.hashRing)
                .catch((err) => {
                console.error("Failed to replicate hot key:", err);
            });
        }
    }
    /**
     * Full DELETE flow:
     * 1. Route key to shard, delete from Redis.
     * 2. Delete from local L1.
     * 3. Publish invalidation.
     */
    async delete(key) {
        const shardId = this.hashRing.getNode(key);
        await (0, shardClient_1.shardDelete)(shardId, key);
        this.l1Cache.l1Delete(key);
        await this.invalidation
            .publishInvalidation(key, "del")
            .catch((err) => {
            console.error("Failed to publish invalidation:", err);
        });
    }
    /**
     * Get a complete metrics snapshot for the REST/WebSocket endpoint.
     */
    getMetricsSnapshot() {
        return this.metrics.exportSnapshot();
    }
    /**
     * Get the health checker for status subscriptions.
     */
    getHealthChecker() {
        return this.healthChecker;
    }
    /**
     * Get the hot key tracker for debugging/metrics.
     */
    getHotKeyTracker() {
        return this.hotKeyTracker;
    }
    /**
     * Get the hash ring for debugging/metrics.
     */
    getHashRing() {
        return this.hashRing;
    }
    /**
     * Graceful shutdown — stop timers, disconnect pub/sub.
     *
     * Note: this does NOT disconnect shard clients because they live
     * in a shared global pool. Call `destroyShardClients()` separately
     * once ALL DriftCache instances are done (e.g. at process exit).
     */
    async destroy() {
        this.healthChecker.stopHealthChecks();
        this.hotKeyTracker.stop();
        await this.invalidation.destroy();
        this.initialized = false;
    }
}
exports.DriftCache = DriftCache;
//# sourceMappingURL=DriftCache.js.map