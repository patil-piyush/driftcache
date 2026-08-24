import { Metrics } from "../src/metrics";

describe("Metrics", () => {
  let metrics: Metrics;

  beforeEach(() => {
    metrics = new Metrics();
  });

  describe("hit/miss tracking", () => {
    it("tracks L1 and L2 hits separately", () => {
      metrics.recordHit("l1");
      metrics.recordHit("l1");
      metrics.recordHit("l2");

      const snapshot = metrics.exportSnapshot();

      expect(snapshot.hits.l1).toBe(2);
      expect(snapshot.hits.l2).toBe(1);
      expect(snapshot.hits.total).toBe(3);
    });

    it("tracks misses", () => {
      metrics.recordMiss();
      metrics.recordMiss();

      const snapshot = metrics.exportSnapshot();

      expect(snapshot.misses).toBe(2);
    });

    it("computes hit ratio correctly", () => {
      metrics.recordHit("l1");
      metrics.recordHit("l2");
      metrics.recordMiss();

      const snapshot = metrics.exportSnapshot();

      // 2 hits / 3 total = 0.6667
      expect(snapshot.hitRatio).toBeCloseTo(0.6667, 3);
    });

    it("returns 0 hit ratio when no requests", () => {
      expect(metrics.exportSnapshot().hitRatio).toBe(0);
    });
  });

  describe("latency percentiles", () => {
    it("returns zeros when no samples recorded", () => {
      const percentiles = metrics.computePercentiles();

      expect(percentiles).toEqual({ p50: 0, p95: 0, p99: 0 });
    });

    it("computes percentiles from a known distribution", () => {
      // Record latencies 1 through 100.
      for (let i = 1; i <= 100; i++) {
        metrics.recordLatency(i);
      }

      const p = metrics.computePercentiles();

      expect(p.p50).toBe(50);
      expect(p.p95).toBe(95);
      expect(p.p99).toBe(99);
    });

    it("handles a single sample", () => {
      metrics.recordLatency(42);

      const p = metrics.computePercentiles();

      expect(p.p50).toBe(42);
      expect(p.p95).toBe(42);
      expect(p.p99).toBe(42);
    });
  });

  describe("shard distribution", () => {
    it("tracks writes per shard", () => {
      metrics.recordShardWrite("shard-1");
      metrics.recordShardWrite("shard-1");
      metrics.recordShardWrite("shard-2");

      const dist = metrics.getShardDistribution();

      expect(dist["shard-1"]).toBe(2);
      expect(dist["shard-2"]).toBe(1);
    });
  });

  describe("exportSnapshot", () => {
    it("assembles a complete snapshot", () => {
      metrics.recordHit("l1");
      metrics.recordMiss();
      metrics.recordLatency(10);
      metrics.recordShardWrite("shard-1");

      const snapshot = metrics.exportSnapshot();

      expect(snapshot.totalRequests).toBe(2);
      expect(snapshot.hits.l1).toBe(1);
      expect(snapshot.misses).toBe(1);
      expect(snapshot.latency.p50).toBe(10);
      expect(snapshot.shardDistribution["shard-1"]).toBe(1);
    });
  });

  describe("reset", () => {
    it("clears all counters", () => {
      metrics.recordHit("l1");
      metrics.recordMiss();
      metrics.recordLatency(10);
      metrics.recordShardWrite("shard-1");

      metrics.reset();

      const snapshot = metrics.exportSnapshot();

      expect(snapshot.totalRequests).toBe(0);
      expect(snapshot.hits.total).toBe(0);
      expect(snapshot.misses).toBe(0);
    });
  });
});
