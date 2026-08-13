import { HashRing } from "../src/hashRing";

describe("HashRing", () => {
  it("adds virtual nodes and keeps them sorted", () => {
    const ring = new HashRing(150);

    ring.addNode("redis-1");

    const snapshot = ring.getRingSnapshot();

    expect(snapshot).toHaveLength(150);

    for (let i = 1; i < snapshot.length; i++) {
      expect(snapshot[i].hash).toBeGreaterThanOrEqual(
        snapshot[i - 1].hash
      );
    }
  });

  it("removes all virtual nodes belonging to a shard", () => {
    const ring = new HashRing(150);

    ring.addNode("redis-1");
    ring.addNode("redis-2");
    ring.addNode("redis-3");

    expect(ring.getRingSnapshot()).toHaveLength(450);

    ring.removeNode("redis-2");

    const snapshot = ring.getRingSnapshot();

    expect(snapshot).toHaveLength(300);
    expect(snapshot.some((node) => node.nodeId === "redis-2")).toBe(false);
  });

  it("routes keys to existing shards", () => {
    const ring = new HashRing(150);

    ring.addNode("redis-1");
    ring.addNode("redis-2");
    ring.addNode("redis-3");

    const validNodes = new Set([
      "redis-1",
      "redis-2",
      "redis-3"
    ]);

    for (let i = 0; i < 1000; i++) {
      expect(validNodes.has(ring.getNode(`key-${i}`))).toBe(true);
    }
  });

  it("wraps around when the key hash is past the final ring position", () => {
    const ring = new HashRing(150);

    ring.addNode("redis-1");
    ring.addNode("redis-2");
    ring.addNode("redis-3");

    const snapshot = ring.getRingSnapshot();
    const lastNode = snapshot[snapshot.length - 1];
    const firstNode = snapshot[0];

    // Find a key whose hash is greater than the final ring position.
    let key: string | undefined;

    for (let i = 0; i < 100_000; i++) {
      const candidate = `wrap-test-${i}`;

      if (hash(candidate) > lastNode.hash) {
        key = candidate;
        break;
      }
    }

    expect(key).toBeDefined();
    expect(ring.getNode(key!)).toBe(firstNode.nodeId);
  });

  it("returns a snapshot in sorted ring order", () => {
    const ring = new HashRing(150);

    ring.addNode("redis-1");
    ring.addNode("redis-2");

    const snapshot = ring.getRingSnapshot();

    for (let i = 1; i < snapshot.length; i++) {
      expect(snapshot[i].hash).toBeGreaterThanOrEqual(
        snapshot[i - 1].hash
      );
    }
  });

  it("distributes keys reasonably evenly across shards", () => {
    const ring = new HashRing(150);

    const shards = ["redis-1", "redis-2", "redis-3"];

    for (const shard of shards) {
      ring.addNode(shard);
    }

    const counts = new Map<string, number>();

    for (const shard of shards) {
      counts.set(shard, 0);
    }

    const sampleCount = 100_000;

    for (let i = 0; i < sampleCount; i++) {
      const nodeId = ring.getNode(`sample-key-${i}`);
      counts.set(nodeId, counts.get(nodeId)! + 1);
    }

    const expected = sampleCount / shards.length;

    for (const shard of shards) {
      const count = counts.get(shard)!;
      const deviation = Math.abs(count - expected) / expected;

      expect(deviation).toBeLessThan(0.05);
    }
  });

  it("only remaps roughly 1/N of keys when adding a shard", () => {
    const ring = new HashRing(150);

    ring.addNode("redis-1");
    ring.addNode("redis-2");
    ring.addNode("redis-3");

    const sampleCount = 100_000;
    const before = new Map<string, string>();

    for (let i = 0; i < sampleCount; i++) {
      const key = `sample-key-${i}`;
      before.set(key, ring.getNode(key));
    }

    ring.addNode("redis-4");

    let changed = 0;

    for (let i = 0; i < sampleCount; i++) {
      const key = `sample-key-${i}`;

      if (before.get(key) !== ring.getNode(key)) {
        changed++;
      }
    }

    const remapPercentage = changed / sampleCount;

    // Adding a 4th shard should remap roughly 1/4 of the keys.
    expect(remapPercentage).toBeGreaterThan(0.20);
    expect(remapPercentage).toBeLessThan(0.30);
  });

  it("only remaps roughly 1/N of keys when removing a shard", () => {
    const ring = new HashRing(150);

    ring.addNode("redis-1");
    ring.addNode("redis-2");
    ring.addNode("redis-3");

    const sampleCount = 100_000;
    const before = new Map<string, string>();

    for (let i = 0; i < sampleCount; i++) {
      const key = `sample-key-${i}`;
      before.set(key, ring.getNode(key));
    }

    ring.removeNode("redis-3");

    let changed = 0;

    for (let i = 0; i < sampleCount; i++) {
      const key = `sample-key-${i}`;

      if (before.get(key) !== ring.getNode(key)) {
        changed++;
      }
    }

    const remapPercentage = changed / sampleCount;

    // Removing one of three shards should remap roughly 1/3.
    expect(remapPercentage).toBeGreaterThan(0.28);
    expect(remapPercentage).toBeLessThan(0.38);
  });
});

function hash(input: string): number {
  let value = 0x811c9dc5;

  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }

  return value >>> 0;
}