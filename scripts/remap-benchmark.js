/**
 * Remap Benchmark Script
 *
 * Compares key remapping percentages between consistent hashing (with virtual nodes)
 * and naive modulo hashing when adding/removing shards.
 *
 * Run: node scripts/remap-benchmark.js
 */

// FNV-1a hash function (same as hashRing.ts)
function hashFunction(input) {
  let h = 0x811c9dc5;

  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }

  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;

  return h >>> 0;
}

// Minimal consistent hash ring implementation for the benchmark
class BenchmarkRing {
  constructor(virtualNodeCount = 150) {
    this.virtualNodeCount = virtualNodeCount;
    this.ring = [];
  }

  addNode(nodeId) {
    for (let i = 0; i < this.virtualNodeCount; i++) {
      const hash = hashFunction(`${nodeId}#${i}`);
      this.ring.push({ hash, nodeId });
    }
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  removeNode(nodeId) {
    this.ring = this.ring.filter((n) => n.nodeId !== nodeId);
  }

  getNode(key) {
    if (this.ring.length === 0) return null;

    const keyHash = hashFunction(key);
    let low = 0;
    let high = this.ring.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.ring[mid].hash < keyHash) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    if (low === this.ring.length) return this.ring[0].nodeId;
    return this.ring[low].nodeId;
  }
}

function moduloHash(key, shardCount, shards) {
  const h = hashFunction(key);
  return shards[h % shardCount];
}

function runBenchmark(sampleCount, vnodeCount) {
  const keys = Array.from({ length: sampleCount }, (_, i) => `key-${i}`);
  const shards3 = ["shard-1", "shard-2", "shard-3"];
  const shards4 = ["shard-1", "shard-2", "shard-3", "shard-4"];

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  REMAP BENCHMARK`);
  console.log(`  Sample keys: ${sampleCount.toLocaleString()}`);
  console.log(`  Virtual nodes per shard: ${vnodeCount}`);
  console.log(`${"═".repeat(60)}\n`);

  // --- Test 1: Adding a shard (3 → 4) ---
  console.log("📊 Scenario: Adding a shard (3 → 4 shards)\n");

  const ring3 = new BenchmarkRing(vnodeCount);
  for (const s of shards3) ring3.addNode(s);

  const consistentBefore = keys.map((k) => ring3.getNode(k));

  ring3.addNode("shard-4");

  const consistentAfter = keys.map((k) => ring3.getNode(k));

  let consistentChanged = 0;
  for (let i = 0; i < sampleCount; i++) {
    if (consistentBefore[i] !== consistentAfter[i]) {
      consistentChanged++;
    }
  }

  let moduloChanged = 0;
  for (const key of keys) {
    const before = moduloHash(key, 3, shards3);
    const after = moduloHash(key, 4, shards4);
    if (before !== after) moduloChanged++;
  }

  const consistentPct = ((consistentChanged / sampleCount) * 100).toFixed(2);
  const moduloPct = ((moduloChanged / sampleCount) * 100).toFixed(2);
  const improvement = (
    (1 - consistentChanged / moduloChanged) *
    100
  ).toFixed(1);

  console.log(`  Consistent hashing:  ${consistentPct}% keys remapped`);
  console.log(`  Naive modulo:        ${moduloPct}% keys remapped`);
  console.log(`  Improvement:         ${improvement}% fewer remaps`);
  console.log(`  Theoretical optimal: ${((1 / 4) * 100).toFixed(2)}% (1/N)`);

  // --- Test 2: Removing a shard (3 → 2) ---
  console.log("\n📊 Scenario: Removing a shard (3 → 2 shards)\n");

  const ring3b = new BenchmarkRing(vnodeCount);
  for (const s of shards3) ring3b.addNode(s);

  const removeBefore = keys.map((k) => ring3b.getNode(k));

  ring3b.removeNode("shard-3");

  const removeAfter = keys.map((k) => ring3b.getNode(k));

  let removeConsistentChanged = 0;
  for (let i = 0; i < sampleCount; i++) {
    if (removeBefore[i] !== removeAfter[i]) {
      removeConsistentChanged++;
    }
  }

  const shards2 = ["shard-1", "shard-2"];
  let removeModuloChanged = 0;
  for (const key of keys) {
    const before = moduloHash(key, 3, shards3);
    const after = moduloHash(key, 2, shards2);
    if (before !== after) removeModuloChanged++;
  }

  const removeConsistentPct = (
    (removeConsistentChanged / sampleCount) *
    100
  ).toFixed(2);
  const removeModuloPct = (
    (removeModuloChanged / sampleCount) *
    100
  ).toFixed(2);
  const removeImprovement = (
    (1 - removeConsistentChanged / removeModuloChanged) *
    100
  ).toFixed(1);

  console.log(`  Consistent hashing:  ${removeConsistentPct}% keys remapped`);
  console.log(`  Naive modulo:        ${removeModuloPct}% keys remapped`);
  console.log(`  Improvement:         ${removeImprovement}% fewer remaps`);
  console.log(`  Theoretical optimal: ${((1 / 3) * 100).toFixed(2)}% (1/N)`);

  // --- Distribution check ---
  console.log("\n📊 Key Distribution Across 3 Shards\n");

  const ring3c = new BenchmarkRing(vnodeCount);
  for (const s of shards3) ring3c.addNode(s);

  const dist = {};
  for (const s of shards3) dist[s] = 0;

  for (const key of keys) {
    dist[ring3c.getNode(key)]++;
  }

  const expected = sampleCount / 3;
  for (const [shard, count] of Object.entries(dist)) {
    const deviation = (((count - expected) / expected) * 100).toFixed(2);
    const bar = "█".repeat(Math.round((count / sampleCount) * 50));
    console.log(
      `  ${shard}: ${count.toLocaleString().padStart(8)} keys (${deviation > 0 ? "+" : ""}${deviation}%) ${bar}`
    );
  }

  console.log(`\n${"═".repeat(60)}`);

  return {
    addShard: {
      consistentPct: parseFloat(consistentPct),
      moduloPct: parseFloat(moduloPct),
      improvement: parseFloat(improvement),
    },
    removeShard: {
      consistentPct: parseFloat(removeConsistentPct),
      moduloPct: parseFloat(removeModuloPct),
      improvement: parseFloat(removeImprovement),
    },
    distribution: dist,
  };
}

// Run with different virtual node counts
const results = {};
for (const vnodes of [50, 150, 300]) {
  results[vnodes] = runBenchmark(100_000, vnodes);
}

console.log("\n📊 Virtual Node Count Impact on Distribution Evenness\n");
for (const [vnodes, result] of Object.entries(results)) {
  const counts = Object.values(result.distribution);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const maxDev = Math.max(...counts.map((c) => Math.abs(c - avg) / avg));
  console.log(
    `  ${vnodes} vnodes: max deviation ${(maxDev * 100).toFixed(2)}%, remap ${result.addShard.consistentPct}%`
  );
}
