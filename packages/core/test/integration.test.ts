import { HashRing, hashFunction } from "../src/hashRing";
import { L1Cache } from "../src/l1Cache";
import { Metrics } from "../src/metrics";
import { HotKeyTracker } from "../src/hotKeyTracker";

/**
 * Integration tests that exercise multiple modules together
 * without requiring Redis connections.
 */
describe("DriftCache Integration (no Redis)", () => {
  describe("Hash Ring + L1 Cache flow", () => {
    it("routes keys consistently through L1 and ring", () => {
      const ring = new HashRing(150);

      ring.addNode("shard-1");
      ring.addNode("shard-2");
      ring.addNode("shard-3");

      const l1 = new L1Cache({ maxSize: 100 });

      // Simulate a SET: determine shard, store in L1.
      const key = "user:123";
      const value = { name: "Alice" };
      const shard = ring.getNode(key);

      l1.l1Set(key, value, 60);

      // Simulate a GET: L1 hit.
      const cached = l1.l1Get(key);

      expect(cached).toEqual(value);

      // The ring should consistently route to the same shard.
      expect(ring.getNode(key)).toBe(shard);
    });

    it("exercises L1 miss → L2 hit path", () => {
      const ring = new HashRing(150);

      ring.addNode("shard-1");
      ring.addNode("shard-2");

      const l1 = new L1Cache({ maxSize: 10 });

      // L1 miss.
      expect(l1.l1Get("key")).toBeUndefined();

      // Simulate L2 hit by populating L1.
      const shardId = ring.getNode("key");
      expect(typeof shardId).toBe("string");

      const l2Value = { data: "from redis" };
      l1.l1Set("key", l2Value, 30);

      // Now L1 should hit.
      expect(l1.l1Get("key")).toEqual(l2Value);
    });

    it("exercises full miss path", () => {
      const l1 = new L1Cache({ maxSize: 10 });

      // Both L1 and simulated L2 miss.
      expect(l1.l1Get("nonexistent")).toBeUndefined();
    });
  });

  describe("Metrics integration", () => {
    it("records L1 hits, L2 hits, and misses accurately", () => {
      const metrics = new Metrics();

      // Simulate 10 L1 hits, 5 L2 hits, 3 misses.
      for (let i = 0; i < 10; i++) metrics.recordHit("l1");
      for (let i = 0; i < 5; i++) metrics.recordHit("l2");
      for (let i = 0; i < 3; i++) metrics.recordMiss();

      const snapshot = metrics.exportSnapshot();

      expect(snapshot.hits.l1).toBe(10);
      expect(snapshot.hits.l2).toBe(5);
      expect(snapshot.misses).toBe(3);
      expect(snapshot.totalRequests).toBe(18);
      expect(snapshot.hitRatio).toBeCloseTo(15 / 18, 4);
    });

    it("latency percentiles match expected distribution", () => {
      const metrics = new Metrics();

      // Record 1000 samples with known distribution.
      for (let i = 0; i < 950; i++) metrics.recordLatency(2);
      for (let i = 0; i < 45; i++) metrics.recordLatency(50);
      for (let i = 0; i < 5; i++) metrics.recordLatency(500);

      const p = metrics.computePercentiles();

      expect(p.p50).toBe(2);
      expect(p.p95).toBe(2);
      expect(p.p99).toBe(50);
    });
  });

  describe("Hash Ring + Metrics shard distribution", () => {
    it("records even distribution across shards", () => {
      const ring = new HashRing(150);
      const metrics = new Metrics();

      const shards = ["shard-1", "shard-2", "shard-3"];
      for (const s of shards) ring.addNode(s);

      const sampleCount = 10_000;

      for (let i = 0; i < sampleCount; i++) {
        const key = `key-${i}`;
        const shardId = ring.getNode(key);
        metrics.recordShardWrite(shardId);
      }

      const dist = metrics.getShardDistribution();
      const expected = sampleCount / shards.length;

      for (const s of shards) {
        const count = dist[s] ?? 0;
        const deviation = Math.abs(count - expected) / expected;

        expect(deviation).toBeLessThan(0.10);
      }
    });
  });

  describe("Hot key tracking integration", () => {
    it("detects hot keys and reports them in the window snapshot", () => {
      const tracker = new HotKeyTracker({
        threshold: 10,
        windowMs: 5000,
        replicaCount: 2,
      });

      // Simulate 15 accesses for "trending".
      for (let i = 0; i < 15; i++) {
        tracker.recordAccess("trending");
      }

      // Only 5 accesses for "normal".
      for (let i = 0; i < 5; i++) {
        tracker.recordAccess("normal");
      }

      expect(tracker.isHot("trending")).toBe(true);
      expect(tracker.isHot("normal")).toBe(false);

      const snapshot = tracker.getWindowSnapshot();
      expect(snapshot.get("trending")).toBe(15);
      expect(snapshot.get("normal")).toBe(5);
    });
  });

  describe("Remap comparison (consistent vs. modulo)", () => {
    it("consistent hashing remaps far fewer keys than modulo", () => {
      const sampleCount = 50_000;
      const keys = Array.from(
        { length: sampleCount },
        (_, i) => `key-${i}`
      );

      // --- Consistent hashing ---
      const ring = new HashRing(150);
      ring.addNode("shard-1");
      ring.addNode("shard-2");
      ring.addNode("shard-3");

      const consistentBefore = keys.map((k) => ring.getNode(k));

      ring.addNode("shard-4");

      const consistentAfter = keys.map((k) => ring.getNode(k));

      let consistentChanged = 0;
      for (let i = 0; i < sampleCount; i++) {
        if (consistentBefore[i] !== consistentAfter[i]) {
          consistentChanged++;
        }
      }

      const consistentPct = consistentChanged / sampleCount;

      // --- Naive modulo ---
      const shards3 = ["shard-1", "shard-2", "shard-3"];
      const shards4 = ["shard-1", "shard-2", "shard-3", "shard-4"];

      let moduloChanged = 0;
      for (const key of keys) {
        const h = hashFunction(key);
        const before = shards3[h % 3];
        const after = shards4[h % 4];
        if (before !== after) {
          moduloChanged++;
        }
      }

      const moduloPct = moduloChanged / sampleCount;

      // Consistent hashing should remap ~25% (1/4).
      expect(consistentPct).toBeGreaterThan(0.15);
      expect(consistentPct).toBeLessThan(0.35);

      // Modulo hashing remaps ~75% ((N-1)/N).
      expect(moduloPct).toBeGreaterThan(0.65);
      expect(moduloPct).toBeLessThan(0.85);

      // The key assertion: consistent hashing remaps far fewer keys.
      expect(consistentPct).toBeLessThan(moduloPct * 0.5);

      console.log(
        `\n📊 Remap Benchmark (50k keys, 3→4 shards):\n` +
        `   Consistent hashing: ${(consistentPct * 100).toFixed(2)}% remapped\n` +
        `   Naive modulo:       ${(moduloPct * 100).toFixed(2)}% remapped\n` +
        `   Improvement:        ${((1 - consistentPct / moduloPct) * 100).toFixed(1)}% fewer remaps\n`
      );
    });
  });
});
