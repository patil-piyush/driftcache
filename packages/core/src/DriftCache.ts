import { HashRing } from "./hashRing";
import {
  ShardConfig,
  createShardClients,
  shardGet,
  shardSet,
  shardDelete,
} from "./shardClient";
import { L1Cache } from "./l1Cache";
import { Invalidation } from "./invalidation";
import { HealthChecker, ShardStatusEvent } from "./healthChecker";
import { HotKeyTracker } from "./hotKeyTracker";
import { Metrics, MetricsSnapshot } from "./metrics";

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
  invalidationRedis?: { host: string; port: number };
}

export class DriftCache {
  private readonly hashRing: HashRing;
  private readonly l1Cache: L1Cache;
  private readonly metrics: Metrics;
  private readonly invalidation: Invalidation;
  private readonly healthChecker: HealthChecker;
  private readonly hotKeyTracker: HotKeyTracker;
  private readonly defaultTtlSeconds: number;
  private initialized = false;

  constructor(private readonly config: DriftCacheConfig) {
    // 1. Build the hash ring.
    this.hashRing = new HashRing(config.virtualNodeCount ?? 150);

    for (const shard of config.shards) {
      this.hashRing.addNode(shard.id);
    }

    // 2. Create shard clients.
    createShardClients(config.shards);

    // 3. Create the L1 cache.
    this.l1Cache = new L1Cache({ maxSize: config.l1MaxSize });

    // 4. Metrics.
    this.metrics = new Metrics();

    // 5. Invalidation (pub/sub).
    this.invalidation = new Invalidation();

    // 6. Health checker.
    this.healthChecker = new HealthChecker({
      intervalMs: config.healthCheckIntervalMs ?? 2000,
      failureThreshold: config.healthCheckThreshold ?? 3,
      shardIds: config.shards.map((s) => s.id),
      hashRing: this.hashRing,
    });

    // 7. Hot key tracker.
    this.hotKeyTracker = new HotKeyTracker({
      threshold: config.hotKeyThreshold ?? 100,
      windowMs: config.hotKeyWindowMs ?? 5000,
      replicaCount: config.hotKeyReplicaCount ?? 2,
    });

    this.defaultTtlSeconds = config.defaultTtlSeconds;
  }

  /**
   * Async initialization: set up pub/sub and start background tasks.
   * Must be called before using get/set/delete.
   */
  async initialize(): Promise<void> {
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
   * 3. Check L2 (Redis via hash ring) → on hit, populate L1 and return.
   * 4. On full miss, return null.
   */
  async get(key: string): Promise<unknown | null> {
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

      // L2 check — route via hash ring.
      const shardId = this.hashRing.getNode(key);
      const l2Value = await shardGet(shardId, key);

      if (l2Value !== null) {
        // Populate L1 for next time.
        this.l1Cache.l1Set(key, l2Value, this.defaultTtlSeconds);
        this.metrics.recordHit("l2");
        return l2Value;
      }

      // Full miss.
      this.metrics.recordMiss();
      return null;
    } finally {
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
  async set(
    key: string,
    value: unknown,
    options?: { ttlSeconds?: number }
  ): Promise<void> {
    const ttl = options?.ttlSeconds ?? this.defaultTtlSeconds;
    const shardId = this.hashRing.getNode(key);

    await shardSet(shardId, key, value, ttl);
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
  async delete(key: string): Promise<void> {
    const shardId = this.hashRing.getNode(key);

    await shardDelete(shardId, key);
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
  getMetricsSnapshot(): MetricsSnapshot {
    return this.metrics.exportSnapshot();
  }

  /**
   * Get the health checker for status subscriptions.
   */
  getHealthChecker(): HealthChecker {
    return this.healthChecker;
  }

  /**
   * Get the hot key tracker for debugging/metrics.
   */
  getHotKeyTracker(): HotKeyTracker {
    return this.hotKeyTracker;
  }

  /**
   * Get the hash ring for debugging/metrics.
   */
  getHashRing(): HashRing {
    return this.hashRing;
  }

  /**
   * Graceful shutdown — stop timers, disconnect Redis.
   */
  async destroy(): Promise<void> {
    this.healthChecker.stopHealthChecks();
    this.hotKeyTracker.stop();
    await this.invalidation.destroy();
    this.initialized = false;
  }
}
