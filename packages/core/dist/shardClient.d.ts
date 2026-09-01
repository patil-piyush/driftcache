import Redis from "ioredis";
export interface ShardConfig {
    id: string;
    host: string;
    port: number;
}
export declare function createShardClients(shardConfigs: ShardConfig[]): Map<string, Redis>;
export declare function getClientForShard(shardId: string): Redis;
export declare function shardGet(shardId: string, key: string): Promise<unknown | null>;
export declare function shardSet(shardId: string, key: string, value: unknown, ttlSeconds: number): Promise<void>;
export declare function shardDelete(shardId: string, key: string): Promise<void>;
export declare function pingShard(shardId: string, timeoutMs?: number): Promise<boolean>;
/**
 * Disconnect all shard clients and clear the connection pool.
 * Required for clean test teardown and graceful process shutdown.
 */
export declare function destroyShardClients(): Promise<void>;
//# sourceMappingURL=shardClient.d.ts.map