"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HotKeyTracker = void 0;
const shardClient_1 = require("./shardClient");
class HotKeyTracker {
    threshold;
    windowMs;
    replicaCount;
    currentWindow = new Map();
    hotKeys = new Set();
    timer = null;
    constructor(options) {
        this.threshold = options.threshold;
        this.windowMs = options.windowMs;
        this.replicaCount = options.replicaCount;
    }
    /**
     * Start the sliding-window reset timer.
     */
    start() {
        if (this.timer) {
            return;
        }
        this.timer = setInterval(() => {
            this.resetWindow();
        }, this.windowMs);
    }
    /**
     * Stop the sliding-window timer. Required for test cleanup.
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    /**
     * Record a single access for a key. Called on every GET.
     */
    recordAccess(key) {
        const count = (this.currentWindow.get(key) ?? 0) + 1;
        this.currentWindow.set(key, count);
        if (count >= this.threshold) {
            this.hotKeys.add(key);
        }
    }
    /**
     * Check whether a key is currently flagged as hot.
     */
    isHot(key) {
        return this.hotKeys.has(key);
    }
    /**
     * Reset the current window — clears counters and hot-key flags.
     */
    resetWindow() {
        this.currentWindow.clear();
        this.hotKeys.clear();
    }
    /**
     * Replicate a hot key's value to neighbouring shards on the ring
     * so read load is spread across multiple nodes instead of hitting
     * a single shard for every request.
     */
    async replicateHotKey(key, value, ttlSeconds, hashRing) {
        const snapshot = hashRing.getRingSnapshot();
        if (snapshot.length === 0) {
            return;
        }
        // Collect unique shard IDs in ring order starting from the primary.
        const primaryShard = hashRing.getNode(key);
        const seen = new Set([primaryShard]);
        const replicaShards = [];
        for (const node of snapshot) {
            if (replicaShards.length >= this.replicaCount) {
                break;
            }
            if (!seen.has(node.nodeId)) {
                seen.add(node.nodeId);
                replicaShards.push(node.nodeId);
            }
        }
        // Write to all replica shards in parallel.
        const writes = replicaShards.map((shardId) => (0, shardClient_1.shardSet)(shardId, key, value, ttlSeconds).catch((err) => {
            console.error(`Failed to replicate hot key "${key}" to shard ${shardId}:`, err);
        }));
        await Promise.allSettled(writes);
    }
    /**
     * Get the current window's access counts (for metrics/debugging).
     */
    getWindowSnapshot() {
        return new Map(this.currentWindow);
    }
    /**
     * Get the current set of hot keys (for metrics/debugging).
     */
    getHotKeys() {
        return new Set(this.hotKeys);
    }
}
exports.HotKeyTracker = HotKeyTracker;
//# sourceMappingURL=hotKeyTracker.js.map