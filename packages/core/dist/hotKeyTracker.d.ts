import { HashRing } from "./hashRing";
export interface HotKeyTrackerOptions {
    /** Access count threshold within a single window to flag a key as hot. */
    threshold: number;
    /** Duration of each time window in milliseconds. */
    windowMs: number;
    /** Number of replica shards to write hot keys to (in addition to primary). */
    replicaCount: number;
}
export declare class HotKeyTracker {
    private readonly threshold;
    private readonly windowMs;
    private readonly replicaCount;
    private currentWindow;
    private hotKeys;
    private timer;
    constructor(options: HotKeyTrackerOptions);
    /**
     * Start the sliding-window reset timer.
     */
    start(): void;
    /**
     * Stop the sliding-window timer. Required for test cleanup.
     */
    stop(): void;
    /**
     * Record a single access for a key. Called on every GET.
     */
    recordAccess(key: string): void;
    /**
     * Check whether a key is currently flagged as hot.
     */
    isHot(key: string): boolean;
    /**
     * Reset the current window — clears counters and hot-key flags.
     */
    resetWindow(): void;
    /**
     * Replicate a hot key's value to neighbouring shards on the ring
     * so read load is spread across multiple nodes instead of hitting
     * a single shard for every request.
     */
    replicateHotKey(key: string, value: unknown, ttlSeconds: number, hashRing: HashRing): Promise<void>;
    /**
     * Get the current window's access counts (for metrics/debugging).
     */
    getWindowSnapshot(): Map<string, number>;
    /**
     * Get the current set of hot keys (for metrics/debugging).
     */
    getHotKeys(): Set<string>;
}
//# sourceMappingURL=hotKeyTracker.d.ts.map