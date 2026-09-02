#!/usr/bin/env node

/**
 * Hot-Key READ DISTRIBUTION Test.
 *
 * Measures which Redis shard actually serves each read for a hot key,
 * proving that hot-key reads are distributed across replicas (not just
 * the primary shard).
 *
 * This script directly instantiates DriftCache from the compiled dist/
 * and intercepts shardGet to count per-shard reads.
 *
 * Requires:
 *   1. docker-compose Redis containers running on 6379/6380/6381.
 *   2. packages/core built (npm run build --workspace=packages/core).
 *
 * Run: node scripts/hotkey-read-distribution.js
 */

const { DriftCache, destroyShardClients } = require("../packages/core/dist/index.js");
const shardClient = require("../packages/core/dist/shardClient.js");

// ── Instrumentation: intercept shardGet to count per-shard reads ──

const originalShardGet = shardClient.shardGet;
const readCounts = new Map();

shardClient.shardGet = async function (shardId, key) {
  readCounts.set(shardId, (readCounts.get(shardId) || 0) + 1);
  return originalShardGet(shardId, key);
};

// ── Config ──

const CONFIG = {
  shards: [
    { id: "shard-1", host: "localhost", port: 6379 },
    { id: "shard-2", host: "localhost", port: 6380 },
    { id: "shard-3", host: "localhost", port: 6381 },
  ],
  l1MaxSize: 1,            // Minimal L1; we manually evict before each read.
  defaultTtlSeconds: 120,
  hotKeyThreshold: 10,     // Flag as hot after 10 accesses in one window.
  hotKeyWindowMs: 60000,   // 60s window so it doesn't reset during our test.
  hotKeyReplicaCount: 2,   // Replicate to 2 extra shards = primary + 2 replicas.
};

const HOT_KEY = "viral-tweet:12345";
const NUM_READS = 300;

async function main() {
  console.log("\n" + "═".repeat(60));
  console.log("  HOT-KEY READ DISTRIBUTION TEST");
  console.log("═".repeat(60));

  const cache = new DriftCache(CONFIG);
  await cache.initialize();

  // Step 1: Write the hot key to its primary shard.
  console.log("\n📝 Step 1: Writing hot key to primary shard...");
  await cache.set(HOT_KEY, { title: "This is a viral tweet", likes: 1000000 });

  const primaryShard = cache.getHashRing().getNode(HOT_KEY);
  console.log(`   Primary shard for "${HOT_KEY}": ${primaryShard}`);

  // Step 2: Warm up the hot-key tracker past the threshold.
  console.log("\n🔥 Step 2: Warming up hot-key tracker (triggering detection)...");
  for (let i = 0; i < CONFIG.hotKeyThreshold + 5; i++) {
    // Clear L1 to force L2 reads and accumulate access counts.
    cache.l1Cache.l1Delete(HOT_KEY);
    await cache.get(HOT_KEY);
  }

  console.log(`   isHot("${HOT_KEY}"): ${cache.getHotKeyTracker().isHot(HOT_KEY)}`);

  // Step 3: Write again to trigger replication to neighbor shards.
  console.log("   Writing again to trigger replication to replicas...");
  await cache.set(HOT_KEY, { title: "This is a viral tweet", likes: 1500000 });

  // Brief wait for writes to propagate.
  await new Promise(r => setTimeout(r, 200));

  // Step 4: Verify the key exists on all 3 shards.
  console.log("\n🔍 Step 3: Verifying key exists on all shards...");
  for (const shard of CONFIG.shards) {
    const val = await originalShardGet(shard.id, HOT_KEY);
    console.log(`   ${shard.id}: ${val !== null ? "✅ HAS key" : "❌ MISSING key"}`);
  }

  // Step 5: Fire reads and measure distribution.
  console.log(`\n📊 Step 4: Firing ${NUM_READS} GETs for the hot key...`);
  readCounts.clear();

  for (let i = 0; i < NUM_READS; i++) {
    // Evict from L1 so every read goes to L2 (Redis).
    cache.l1Cache.l1Delete(HOT_KEY);
    await cache.get(HOT_KEY);
  }

  // Step 6: Report per-shard read distribution.
  console.log("\n" + "═".repeat(60));
  console.log("  READ DISTRIBUTION FOR HOT KEY");
  console.log("═".repeat(60));

  const totalReads = Array.from(readCounts.values()).reduce((a, b) => a + b, 0);

  for (const shard of CONFIG.shards) {
    const count = readCounts.get(shard.id) || 0;
    const pct = totalReads > 0 ? ((count / totalReads) * 100).toFixed(1) : "0.0";
    const bar = "█".repeat(Math.round(count / totalReads * 40));
    const label = shard.id === primaryShard ? " (primary)" : " (replica)";
    console.log(`  ${shard.id}${label}: ${count} reads (${pct}%) ${bar}`);
  }

  console.log(`\n  Total L2 reads: ${totalReads}`);
  console.log("═".repeat(60) + "\n");

  // Cleanup.
  await cache.destroy();
  await destroyShardClients();
}

main().catch((err) => {
  console.error("Hot-key read distribution test error:", err);
  process.exit(1);
});
