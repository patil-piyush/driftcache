import Redis from "ioredis";

export interface ShardConfig {
  id: string;
  host: string;
  port: number;
}

const clients = new Map<string, Redis>();

export function createShardClients(
  shardConfigs: ShardConfig[]
): Map<string, Redis> {
  for (const config of shardConfigs) {
    if (clients.has(config.id)) {
      continue;
    }

    const client = new Redis({
      host: config.host,
      port: config.port,
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });

    client.on("error", (error) => {
      console.error(`Redis shard ${config.id} error:`, error);
    });

    client.on("reconnecting", (delay: number) => {
      console.warn(
        `Redis shard ${config.id} reconnecting in ${delay}ms`
      );
    });

    clients.set(config.id, client);
  }

  return clients;
}

export function getClientForShard(shardId: string): Redis {
  const client = clients.get(shardId);

  if (!client) {
    throw new Error(`Unknown Redis shard: ${shardId}`);
  }

  return client;
}

export async function shardGet(
  shardId: string,
  key: string
): Promise<unknown | null> {
  const client = getClientForShard(shardId);

  const stored = await client.get(key);

  if (stored === null) {
    return null;
  }

  return JSON.parse(stored);
}

export async function shardSet(
  shardId: string,
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  const client = getClientForShard(shardId);

  await client.set(
    key,
    JSON.stringify(value),
    "EX",
    ttlSeconds
  );
}

export async function shardDelete(
  shardId: string,
  key: string
): Promise<void> {
  const client = getClientForShard(shardId);

  await client.del(key);
}

export async function pingShard(
  shardId: string,
  timeoutMs = 1000
): Promise<boolean> {
  const client = getClientForShard(shardId);

  try {
    await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Redis ping timed out")),
          timeoutMs
        )
      ),
    ]);

    return true;
  } catch {
    return false;
  }
}

/**
 * Disconnect all shard clients and clear the connection pool.
 * Required for clean test teardown and graceful process shutdown.
 */
export async function destroyShardClients(): Promise<void> {
  for (const [id, client] of clients) {
    try {
      client.disconnect();
    } catch {
      // Ignore disconnect errors during teardown.
    }
  }

  clients.clear();
}