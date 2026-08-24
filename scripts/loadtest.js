/**
 * DriftCache Load Test Script
 *
 * Generates synthetic traffic against a running DriftCache proxy to measure
 * throughput, latency, hit rates, and hot-key behaviour.
 *
 * Usage:
 *   node scripts/loadtest.js [options]
 *
 * Options:
 *   --url <base>         Proxy base URL (default: http://localhost:7000)
 *   --duration <secs>    Test duration in seconds (default: 10)
 *   --concurrency <n>    Concurrent requests (default: 10)
 *   --pattern <type>     Traffic pattern: uniform | zipfian (default: zipfian)
 *   --keys <n>           Key pool size (default: 1000)
 */

const http = require("http");

// --- Zipfian distribution ---
function buildZipfianWeights(n, skew = 1.2) {
  const weights = [];
  let total = 0;

  for (let i = 1; i <= n; i++) {
    const w = 1.0 / Math.pow(i, skew);
    weights.push(w);
    total += w;
  }

  // Normalize to cumulative distribution.
  const cdf = [];
  let cumulative = 0;

  for (let i = 0; i < n; i++) {
    cumulative += weights[i] / total;
    cdf.push(cumulative);
  }

  return cdf;
}

function sampleZipfian(cdf) {
  const r = Math.random();
  for (let i = 0; i < cdf.length; i++) {
    if (r <= cdf[i]) return i;
  }
  return cdf.length - 1;
}

// --- HTTP helpers ---
function httpRequest(method, url, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);

    const opts = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method,
      headers: { "Content-Type": "application/json" },
    };

    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode, data });
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// --- Percentile calculation ---
function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// --- Main load test ---
async function runLoadTest(options) {
  const {
    baseUrl = "http://localhost:7000",
    durationSeconds = 10,
    concurrency = 10,
    pattern = "zipfian",
    keyPoolSize = 1000,
  } = options;

  console.log(`\n${"═".repeat(60)}`);
  console.log("  DRIFTCACHE LOAD TEST");
  console.log(`${"═".repeat(60)}`);
  console.log(`  URL:          ${baseUrl}`);
  console.log(`  Duration:     ${durationSeconds}s`);
  console.log(`  Concurrency:  ${concurrency}`);
  console.log(`  Pattern:      ${pattern}`);
  console.log(`  Key pool:     ${keyPoolSize}`);
  console.log(`${"═".repeat(60)}\n`);

  const keys = Array.from({ length: keyPoolSize }, (_, i) => `loadtest-key-${i}`);
  const cdf = pattern === "zipfian" ? buildZipfianWeights(keyPoolSize) : null;

  // Seed some data first.
  console.log("Seeding data...");
  const seedPromises = [];
  for (let i = 0; i < Math.min(100, keyPoolSize); i++) {
    seedPromises.push(
      httpRequest("PUT", `${baseUrl}/cache/${keys[i]}`, {
        value: { data: `value-${i}`, ts: Date.now() },
        ttlSeconds: 300,
      }).catch(() => null)
    );
  }
  await Promise.all(seedPromises);
  console.log("Seeding complete.\n");

  // Run the load test.
  const latencies = [];
  const results = { hits: 0, misses: 0, errors: 0, sets: 0, gets: 0 };
  const startTime = Date.now();
  const endTime = startTime + durationSeconds * 1000;

  let active = 0;
  let totalRequests = 0;

  function pickKey() {
    if (pattern === "zipfian") {
      return keys[sampleZipfian(cdf)];
    }
    return keys[Math.floor(Math.random() * keys.length)];
  }

  async function worker() {
    while (Date.now() < endTime) {
      const key = pickKey();
      const isWrite = Math.random() < 0.2; // 80/20 read/write ratio

      const start = Date.now();

      try {
        if (isWrite) {
          await httpRequest("PUT", `${baseUrl}/cache/${key}`, {
            value: { data: `value-${Date.now()}`, ts: Date.now() },
            ttlSeconds: 300,
          });
          results.sets++;
        } else {
          const res = await httpRequest("GET", `${baseUrl}/cache/${key}`);
          results.gets++;

          if (res.status === 200) {
            results.hits++;
          } else {
            results.misses++;
          }
        }
      } catch {
        results.errors++;
      }

      latencies.push(Date.now() - start);
      totalRequests++;
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }

  // Progress reporting.
  const progressInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rps = (totalRequests / (Date.now() - startTime)) * 1000;
    process.stdout.write(
      `\r  Progress: ${elapsed}s | ${totalRequests} reqs | ${rps.toFixed(0)} req/s`
    );
  }, 500);

  await Promise.all(workers);
  clearInterval(progressInterval);

  // Print results.
  const elapsed = (Date.now() - startTime) / 1000;
  const rps = totalRequests / elapsed;

  console.log(`\n\n${"═".repeat(60)}`);
  console.log("  RESULTS");
  console.log(`${"═".repeat(60)}`);
  console.log(`  Total requests:  ${totalRequests.toLocaleString()}`);
  console.log(`  Duration:        ${elapsed.toFixed(2)}s`);
  console.log(`  Throughput:      ${rps.toFixed(0)} req/s`);
  console.log(`  GETs:            ${results.gets.toLocaleString()}`);
  console.log(`  SETs:            ${results.sets.toLocaleString()}`);
  console.log(`  Hits:            ${results.hits.toLocaleString()}`);
  console.log(`  Misses:          ${results.misses.toLocaleString()}`);
  console.log(`  Errors:          ${results.errors.toLocaleString()}`);
  console.log(
    `  Hit ratio:       ${((results.hits / Math.max(results.gets, 1)) * 100).toFixed(2)}%`
  );
  console.log(`\n  Latency:`);
  console.log(`    p50:  ${percentile(latencies, 0.5)}ms`);
  console.log(`    p95:  ${percentile(latencies, 0.95)}ms`);
  console.log(`    p99:  ${percentile(latencies, 0.99)}ms`);
  console.log(`    max:  ${Math.max(...latencies)}ms`);
  console.log(`${"═".repeat(60)}\n`);

  // Fetch final metrics from the server.
  try {
    const metricsRes = await httpRequest("GET", `${baseUrl}/metrics`);
    if (metricsRes.status === 200) {
      const metrics = JSON.parse(metricsRes.data);
      console.log("  Server-side metrics:");
      console.log(`    L1 Hits:  ${metrics.hits?.l1 ?? "N/A"}`);
      console.log(`    L2 Hits:  ${metrics.hits?.l2 ?? "N/A"}`);
      console.log(`    Misses:   ${metrics.misses ?? "N/A"}`);
      console.log(`    Server p50:  ${metrics.latency?.p50?.toFixed(2) ?? "N/A"}ms`);
      console.log(`    Server p95:  ${metrics.latency?.p95?.toFixed(2) ?? "N/A"}ms`);
      console.log(`    Server p99:  ${metrics.latency?.p99?.toFixed(2) ?? "N/A"}ms`);

      if (metrics.shardDistribution) {
        console.log("\n    Shard Distribution:");
        for (const [shard, count] of Object.entries(metrics.shardDistribution)) {
          console.log(`      ${shard}: ${count} writes`);
        }
      }
      console.log("");
    }
  } catch {
    console.log("  (Could not fetch server-side metrics)\n");
  }
}

// --- Parse CLI args ---
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--url":
      options.baseUrl = args[++i];
      break;
    case "--duration":
      options.durationSeconds = parseInt(args[++i], 10);
      break;
    case "--concurrency":
      options.concurrency = parseInt(args[++i], 10);
      break;
    case "--pattern":
      options.pattern = args[++i];
      break;
    case "--keys":
      options.keyPoolSize = parseInt(args[++i], 10);
      break;
  }
}

runLoadTest(options).catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
