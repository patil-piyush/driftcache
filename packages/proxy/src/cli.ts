import { startProxyServer } from "./server";
import { DriftCacheConfig, ShardConfig } from "driftcache";
import * as fs from "fs";

function printUsage(): void {
  console.log(`
DriftCache Proxy Server

Usage:
  npx driftcache start [options]

Options:
  --port <port>        Server port (default: 7000)
  --config <path>      Path to JSON config file
  --shards <list>      Comma-separated shard list: id:host:port,...
  --l1-size <n>        L1 cache max entries (default: 1000)
  --ttl <seconds>      Default TTL in seconds (default: 300)

Examples:
  npx driftcache start --port 7000 --shards shard1:localhost:6379,shard2:localhost:6380,shard3:localhost:6381
  npx driftcache start --config ./driftcache.json
`);
}

function parseShardList(shardStr: string): ShardConfig[] {
  return shardStr.split(",").map((entry) => {
    const [id, host, portStr] = entry.trim().split(":");

    if (!id || !host || !portStr) {
      throw new Error(
        `Invalid shard format: "${entry}". Expected id:host:port`
      );
    }

    return { id, host, port: parseInt(portStr, 10) };
  });
}

function parseArgs(
  argv: string[]
): { port: number; config: DriftCacheConfig } {
  let port = 7000;
  let shards: ShardConfig[] = [];
  let l1MaxSize = 1000;
  let defaultTtlSeconds = 300;
  let configPath: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--port":
        port = parseInt(argv[++i], 10);
        break;
      case "--config":
        configPath = argv[++i];
        break;
      case "--shards":
        shards = parseShardList(argv[++i]);
        break;
      case "--l1-size":
        l1MaxSize = parseInt(argv[++i], 10);
        break;
      case "--ttl":
        defaultTtlSeconds = parseInt(argv[++i], 10);
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
    }
  }

  if (configPath) {
    const raw = fs.readFileSync(configPath, "utf-8");
    const fileConfig = JSON.parse(raw);

    return {
      port: fileConfig.port ?? port,
      config: {
        shards: fileConfig.shards ?? shards,
        l1MaxSize: fileConfig.l1MaxSize ?? l1MaxSize,
        defaultTtlSeconds: fileConfig.defaultTtlSeconds ?? defaultTtlSeconds,
        ...fileConfig,
      },
    };
  }

  if (shards.length === 0) {
    // Default: local dev shards.
    shards = [
      { id: "shard-1", host: "localhost", port: 6379 },
      { id: "shard-2", host: "localhost", port: 6380 },
      { id: "shard-3", host: "localhost", port: 6381 },
    ];
  }

  return {
    port,
    config: {
      shards,
      l1MaxSize,
      defaultTtlSeconds,
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === "start" || args.length === 0) {
    const parsed = parseArgs(args.slice(args[0] === "start" ? 1 : 0));

    console.log("Starting DriftCache proxy...");
    console.log(`  Port: ${parsed.port}`);
    console.log(`  Shards: ${parsed.config.shards.map((s) => s.id).join(", ")}`);
    console.log(`  L1 Max Size: ${parsed.config.l1MaxSize}`);
    console.log(`  Default TTL: ${parsed.config.defaultTtlSeconds}s`);

    const { close } = await startProxyServer({
      port: parsed.port,
      cacheConfig: parsed.config,
    });

    // Graceful shutdown.
    process.on("SIGINT", async () => {
      console.log("\nShutting down...");
      await close();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\nShutting down...");
      await close();
      process.exit(0);
    });
  } else {
    printUsage();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
