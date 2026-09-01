#!/usr/bin/env node

/**
 * Live failover test.
 *
 * 1. Starts DriftCache with fast health checks (500ms interval, threshold=2)
 * 2. Pre-populates keys
 * 3. Stops redis2 container
 * 4. Observes health checker detection + ring removal
 * 5. Verifies traffic continues on remaining shards
 * 6. Restarts redis2 and verifies rejoin
 *
 * Requires: docker-compose containers running.
 * Run: node scripts/failover-test.js
 */

const { execSync } = require("child_process");
const http = require("http");

const PROXY_URL = "http://localhost:7000";

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PROXY_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { "Content-Type": "application/json" },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", (err) => resolve({ status: 0, error: err.message }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("\n" + "═".repeat(60));
  console.log("  LIVE FAILOVER TEST");
  console.log("═".repeat(60));

  // Step 1: Pre-populate keys.
  console.log("\n📝 Step 1: Pre-populating 100 keys...");
  let writeErrors = 0;
  for (let i = 0; i < 100; i++) {
    const res = await request("PUT", `/cache/failover-key-${i}`, {
      value: { id: i, data: `value-${i}` },
      ttlSeconds: 300,
    });
    if (res.status !== 201) writeErrors++;
  }
  console.log(`   Wrote 100 keys (${writeErrors} errors)`);

  // Check health before stop.
  const healthBefore = await request("GET", "/health");
  console.log(`   Health before: ${JSON.stringify(healthBefore.body.shards)}`);

  // Step 2: Stop redis2 container.
  console.log("\n🔴 Step 2: Stopping redis2 container...");
  const stopStart = Date.now();
  execSync("docker stop driftcache-redis2-1", { stdio: "pipe" });
  console.log(`   Container stopped at t=0ms`);

  // Step 3: Poll health until shard-2 is detected as down.
  console.log("\n⏱️  Step 3: Waiting for health checker to detect failure...");
  let detectionTime = null;
  for (let t = 0; t < 30; t++) {
    await sleep(500);
    const health = await request("GET", "/health");
    const elapsed = Date.now() - stopStart;

    if (health.body?.shards?.["shard-2"] === "down") {
      detectionTime = elapsed;
      console.log(`   ✅ shard-2 detected as DOWN at t=${elapsed}ms`);
      console.log(`   Shard states: ${JSON.stringify(health.body.shards)}`);
      break;
    }
  }

  if (!detectionTime) {
    console.log("   ❌ shard-2 was NOT detected as down within 15 seconds!");
    return;
  }

  // Step 4: Fire traffic against remaining shards.
  console.log("\n📊 Step 4: Firing 200 GET requests during outage...");
  let successes = 0;
  let failures = 0;
  let errors = 0;

  for (let i = 0; i < 200; i++) {
    const keyIndex = Math.floor(Math.random() * 100);
    const res = await request("GET", `/cache/failover-key-${keyIndex}`);

    if (res.status === 200) successes++;
    else if (res.status === 404) failures++; // Key was on downed shard.
    else errors++;
  }

  console.log(`   Successes: ${successes}`);
  console.log(`   Not found (key was on downed shard): ${failures}`);
  console.log(`   Errors: ${errors}`);

  // Check how many keys are on the downed shard (should be ~1/3).
  const affectedPct = (failures / 200 * 100).toFixed(1);
  console.log(`   Affected: ~${affectedPct}% of requests (expected ~33%)`);

  // Get metrics.
  const metricsDuringOutage = await request("GET", "/metrics");
  console.log(`\n   Metrics during outage:`);
  console.log(`     Distribution: ${JSON.stringify(metricsDuringOutage.body.shardDistribution)}`);

  // Step 5: Restart redis2.
  console.log("\n🟢 Step 5: Restarting redis2 container...");
  const restartStart = Date.now();
  execSync("docker start driftcache-redis2-1", { stdio: "pipe" });

  // Wait for recovery.
  let recoveryTime = null;
  for (let t = 0; t < 30; t++) {
    await sleep(500);
    const health = await request("GET", "/health");
    const elapsed = Date.now() - restartStart;

    if (health.body?.shards?.["shard-2"] === "up") {
      recoveryTime = elapsed;
      console.log(`   ✅ shard-2 recovered at t=${elapsed}ms after restart`);
      console.log(`   Shard states: ${JSON.stringify(health.body.shards)}`);
      break;
    }
  }

  if (!recoveryTime) {
    console.log("   ❌ shard-2 did NOT recover within 15 seconds!");
  }

  // Step 6: Verify all keys accessible again.
  console.log("\n🔍 Step 6: Verifying keys accessible after recovery...");
  await sleep(1000); // Give the ring time to rebalance.

  let postRecoveryHits = 0;
  let postRecoveryMisses = 0;
  for (let i = 0; i < 100; i++) {
    const res = await request("GET", `/cache/failover-key-${i}`);
    if (res.status === 200) postRecoveryHits++;
    else postRecoveryMisses++;
  }

  console.log(`   Hits: ${postRecoveryHits}/100`);
  console.log(`   Misses: ${postRecoveryMisses}/100 (keys lost during failover)`);

  // Summary.
  console.log("\n" + "═".repeat(60));
  console.log("  FAILOVER TEST SUMMARY");
  console.log("═".repeat(60));
  console.log(`  Detection time:     ${detectionTime}ms`);
  console.log(`  Recovery time:      ${recoveryTime}ms`);
  console.log(`  During-outage hits: ${successes}/200 (${(successes/200*100).toFixed(1)}%)`);
  console.log(`  Affected requests:  ~${affectedPct}%`);
  console.log(`  Post-recovery hits: ${postRecoveryHits}/100`);
  console.log("═".repeat(60) + "\n");
}

main().catch((err) => {
  console.error("Failover test error:", err);
  // Make sure redis2 is back up.
  try { execSync("docker start driftcache-redis2-1", { stdio: "pipe" }); } catch {}
  process.exit(1);
});
