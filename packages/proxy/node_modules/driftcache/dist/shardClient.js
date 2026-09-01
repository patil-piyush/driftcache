"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createShardClients = createShardClients;
exports.getClientForShard = getClientForShard;
exports.shardGet = shardGet;
exports.shardSet = shardSet;
exports.shardDelete = shardDelete;
exports.pingShard = pingShard;
exports.destroyShardClients = destroyShardClients;
const ioredis_1 = __importDefault(require("ioredis"));
const clients = new Map();
function createShardClients(shardConfigs) {
    for (const config of shardConfigs) {
        if (clients.has(config.id)) {
            continue;
        }
        const client = new ioredis_1.default({
            host: config.host,
            port: config.port,
            lazyConnect: false,
            maxRetriesPerRequest: 3,
        });
        client.on("error", (error) => {
            console.error(`Redis shard ${config.id} error:`, error);
        });
        client.on("reconnecting", (delay) => {
            console.warn(`Redis shard ${config.id} reconnecting in ${delay}ms`);
        });
        clients.set(config.id, client);
    }
    return clients;
}
function getClientForShard(shardId) {
    const client = clients.get(shardId);
    if (!client) {
        throw new Error(`Unknown Redis shard: ${shardId}`);
    }
    return client;
}
async function shardGet(shardId, key) {
    const client = getClientForShard(shardId);
    const stored = await client.get(key);
    if (stored === null) {
        return null;
    }
    return JSON.parse(stored);
}
async function shardSet(shardId, key, value, ttlSeconds) {
    const client = getClientForShard(shardId);
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
}
async function shardDelete(shardId, key) {
    const client = getClientForShard(shardId);
    await client.del(key);
}
async function pingShard(shardId, timeoutMs = 1000) {
    const client = getClientForShard(shardId);
    try {
        await Promise.race([
            client.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Redis ping timed out")), timeoutMs)),
        ]);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Disconnect all shard clients and clear the connection pool.
 * Required for clean test teardown and graceful process shutdown.
 */
async function destroyShardClients() {
    for (const [id, client] of clients) {
        try {
            client.disconnect();
        }
        catch {
            // Ignore disconnect errors during teardown.
        }
    }
    clients.clear();
}
//# sourceMappingURL=shardClient.js.map