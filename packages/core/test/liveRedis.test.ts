/**
 * Live Redis integration tests.
 *
 * These tests require three Redis containers running via docker-compose:
 *   redis1 on localhost:6379
 *   redis2 on localhost:6380
 *   redis3 on localhost:6381
 *
 * Run with: npx jest test/liveRedis.test.ts --testTimeout=30000
 */

import {
  createShardClients,
  shardGet,
  shardSet,
  shardDelete,
  pingShard,
  destroyShardClients,
} from "../src/shardClient";
import { Invalidation } from "../src/invalidation";
import { DriftCache } from "../src/DriftCache";

const SHARD_CONFIGS = [
  { id: "shard-1", host: "localhost", port: 6379 },
  { id: "shard-2", host: "localhost", port: 6380 },
  { id: "shard-3", host: "localhost", port: 6381 },
];

// Create shard clients once for all tests in this file.
beforeAll(() => {
  createShardClients(SHARD_CONFIGS);
});

// Clean up all connections after all tests.
afterAll(async () => {
  await destroyShardClients();
});

// ─────────────────────────────────────────────────────────
// 1. shardClient — real GET/SET/DEL round trips
// ─────────────────────────────────────────────────────────

describe("shardClient (live Redis)", () => {
  it("SET then GET returns the same value", async () => {
    await shardSet("shard-1", "live-test-key", { msg: "hello" }, 60);

    const value = await shardGet("shard-1", "live-test-key");

    expect(value).toEqual({ msg: "hello" });
  });

  it("DEL removes a key", async () => {
    await shardSet("shard-2", "del-test-key", "to-delete", 60);
    await shardDelete("shard-2", "del-test-key");

    const value = await shardGet("shard-2", "del-test-key");

    expect(value).toBeNull();
  });

  it("GET returns null for a nonexistent key", async () => {
    const value = await shardGet("shard-3", "nonexistent-key-xyz");

    expect(value).toBeNull();
  });

  it("pingShard returns true for a live shard", async () => {
    const alive = await pingShard("shard-1");

    expect(alive).toBe(true);
  });

  it("SET/GET works across all three shards independently", async () => {
    for (const config of SHARD_CONFIGS) {
      const key = `cross-shard-${config.id}`;
      const val = { shard: config.id, ts: Date.now() };

      await shardSet(config.id, key, val, 60);
      const result = await shardGet(config.id, key);

      expect(result).toEqual(val);
    }
  });
});

// ─────────────────────────────────────────────────────────
// 2. Invalidation — pub/sub between two instances
// ─────────────────────────────────────────────────────────

describe("Invalidation (live Redis)", () => {
  let pubInstance: Invalidation;
  let subInstance: Invalidation;

  beforeAll(async () => {
    pubInstance = new Invalidation();
    subInstance = new Invalidation();

    await pubInstance.initialize({ host: "localhost", port: 6379 });
    await subInstance.initialize({ host: "localhost", port: 6379 });
  });

  afterAll(async () => {
    await pubInstance.destroy();
    await subInstance.destroy();
  });

  it("subscriber receives messages published by another instance", async () => {
    const received: Array<{ key: string; operation: string }> = [];

    await subInstance.subscribeToInvalidations((msg) => {
      received.push({ key: msg.key, operation: msg.operation });
    });

    // Small delay for subscription to be established.
    await new Promise((r) => setTimeout(r, 200));

    await pubInstance.publishInvalidation("user:42", "set");
    await pubInstance.publishInvalidation("session:99", "del");

    // Wait for messages to be delivered.
    await new Promise((r) => setTimeout(r, 500));

    expect(received).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "user:42", operation: "set" }),
        expect.objectContaining({ key: "session:99", operation: "del" }),
      ])
    );

    expect(received.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────
// 3. DriftCache E2E — L1 hit, L2 hit, full miss
// ─────────────────────────────────────────────────────────

describe("DriftCache end-to-end (live Redis)", () => {
  const makeConfig = () => ({
    shards: SHARD_CONFIGS,
    l1MaxSize: 100,
    defaultTtlSeconds: 60,
    virtualNodeCount: 150,
    healthCheckIntervalMs: 60000,
    healthCheckThreshold: 3,
    hotKeyThreshold: 1000,
    hotKeyWindowMs: 60000,
    hotKeyReplicaCount: 2,
  });

  let cache: DriftCache;

  beforeAll(async () => {
    cache = new DriftCache(makeConfig());
    await cache.initialize();
  });

  afterAll(async () => {
    await cache.destroy();
  });

  it("full miss returns null for a key never written", async () => {
    const result = await cache.get("never-written-key-xyz");

    expect(result).toBeNull();

    const metrics = cache.getMetricsSnapshot();
    expect(metrics.misses).toBeGreaterThanOrEqual(1);
  });

  it("set then get returns the value (L1 hit since set populates L1)", async () => {
    await cache.set("e2e-key", { data: "round-trip" });

    const value = await cache.get("e2e-key");

    expect(value).toEqual({ data: "round-trip" });
  });

  it("L2 hit: fresh instance with empty L1 fetches from Redis", async () => {
    // Write via the main cache instance.
    await cache.set("l2-hit-key", { data: "from-redis" });

    // Create a second instance — its L1 is empty.
    const cache2 = new DriftCache(makeConfig());
    await cache2.initialize();

    try {
      // Must go to Redis (L2 hit) since cache2's L1 is empty.
      const value = await cache2.get("l2-hit-key");

      expect(value).toEqual({ data: "from-redis" });

      const metrics = cache2.getMetricsSnapshot();
      expect(metrics.hits.l2).toBeGreaterThanOrEqual(1);
    } finally {
      await cache2.destroy();
    }
  });

  it("L1 hit: second get on same instance returns from memory", async () => {
    await cache.set("l1-hit-key", { data: "fast" });

    const metricsBefore = cache.getMetricsSnapshot();
    const l1Before = metricsBefore.hits.l1;

    // Should be an L1 hit since set() populated L1.
    const value = await cache.get("l1-hit-key");

    expect(value).toEqual({ data: "fast" });

    const metricsAfter = cache.getMetricsSnapshot();
    expect(metricsAfter.hits.l1).toBeGreaterThan(l1Before);
  });

  it("delete removes the key from Redis", async () => {
    await cache.set("del-e2e-key", "to-delete");
    await cache.delete("del-e2e-key");

    // Fresh instance to confirm it's gone from Redis.
    const cache2 = new DriftCache(makeConfig());
    await cache2.initialize();

    try {
      const result = await cache2.get("del-e2e-key");
      expect(result).toBeNull();
    } finally {
      await cache2.destroy();
    }
  });

  it("cross-instance invalidation evicts stale L1 entries", async () => {
    const cacheA = new DriftCache(makeConfig());
    const cacheB = new DriftCache(makeConfig());

    await cacheA.initialize();
    await cacheB.initialize();

    try {
      // Write v1 through A, then read through B to populate B's L1.
      await cacheA.set("coherence-key", { version: 1 });
      await new Promise((r) => setTimeout(r, 300));

      const v1 = await cacheB.get("coherence-key");
      expect(v1).toEqual({ version: 1 });

      // Now A writes v2 — invalidation should evict from B's L1.
      await cacheA.set("coherence-key", { version: 2 });
      await new Promise((r) => setTimeout(r, 500));

      // B's next get should go to Redis and get v2.
      const v2 = await cacheB.get("coherence-key");
      expect(v2).toEqual({ version: 2 });
    } finally {
      await cacheA.destroy();
      await cacheB.destroy();
    }
  });
});

// ─────────────────────────────────────────────────────────
// 4. HealthChecker — real PING
// ─────────────────────────────────────────────────────────

describe("HealthChecker (live Redis)", () => {
  it("reports all shards as up when they are running", async () => {
    for (const config of SHARD_CONFIGS) {
      const alive = await pingShard(config.id);
      expect(alive).toBe(true);
    }
  });
});
