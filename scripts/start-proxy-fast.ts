/**
 * Start proxy with fast health checks for failover testing.
 */
import { startProxyServer } from "../packages/proxy/src/server";

async function main() {
  const { close } = await startProxyServer({
    port: 7000,
    cacheConfig: {
      shards: [
        { id: "shard-1", host: "localhost", port: 6379 },
        { id: "shard-2", host: "localhost", port: 6380 },
        { id: "shard-3", host: "localhost", port: 6381 },
      ],
      l1MaxSize: 1000,
      defaultTtlSeconds: 300,
      healthCheckIntervalMs: 500,   // Fast checks for failover testing.
      healthCheckThreshold: 2,      // Mark down after 2 failures (1s).
      hotKeyThreshold: 50,
      hotKeyWindowMs: 5000,
      hotKeyReplicaCount: 2,
    },
  });

  process.on("SIGINT", async () => {
    await close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
