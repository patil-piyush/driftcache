import { EventEmitter } from "events";
import { HashRing } from "./hashRing";
export interface HealthCheckerOptions {
    /** How often to ping each shard, in milliseconds. */
    intervalMs: number;
    /** How many consecutive failures before marking a shard down. */
    failureThreshold: number;
    /** The shard IDs to monitor. */
    shardIds: string[];
    /** The hash ring to update on shard status changes. */
    hashRing: HashRing;
}
export type ShardStatus = "up" | "down";
export interface ShardStatusEvent {
    shardId: string;
    status: ShardStatus;
    timestamp: number;
}
export declare class HealthChecker extends EventEmitter {
    private readonly intervalMs;
    private readonly failureThreshold;
    private readonly shardIds;
    private readonly hashRing;
    private readonly consecutiveFailures;
    private readonly shardStatus;
    private timer;
    constructor(options: HealthCheckerOptions);
    /**
     * Start periodic health checks for every known shard.
     */
    startHealthChecks(): void;
    /**
     * Stop periodic health checks. Required for clean test teardown.
     */
    stopHealthChecks(): void;
    /**
     * Register a callback for shard status changes.
     */
    onStatusChange(callback: (event: ShardStatusEvent) => void): void;
    /**
     * Get the current status of all shards.
     */
    getStatus(): Map<string, ShardStatus>;
    /**
     * Run a single round of health checks for all shards.
     */
    runChecks(): Promise<void>;
    /**
     * Evaluate a single ping result and update shard state.
     * Only changes status after crossing the consecutive-failure threshold
     * to avoid reacting to transient blips.
     */
    evaluateShardHealth(shardId: string, isAlive: boolean): void;
}
//# sourceMappingURL=healthChecker.d.ts.map