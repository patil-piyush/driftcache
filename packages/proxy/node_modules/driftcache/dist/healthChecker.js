"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthChecker = void 0;
const events_1 = require("events");
const shardClient_1 = require("./shardClient");
class HealthChecker extends events_1.EventEmitter {
    intervalMs;
    failureThreshold;
    shardIds;
    hashRing;
    consecutiveFailures = new Map();
    shardStatus = new Map();
    timer = null;
    constructor(options) {
        super();
        this.intervalMs = options.intervalMs;
        this.failureThreshold = options.failureThreshold;
        this.shardIds = [...options.shardIds];
        this.hashRing = options.hashRing;
        for (const id of this.shardIds) {
            this.consecutiveFailures.set(id, 0);
            this.shardStatus.set(id, "up");
        }
    }
    /**
     * Start periodic health checks for every known shard.
     */
    startHealthChecks() {
        if (this.timer) {
            return;
        }
        this.timer = setInterval(() => {
            void this.runChecks();
        }, this.intervalMs);
    }
    /**
     * Stop periodic health checks. Required for clean test teardown.
     */
    stopHealthChecks() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    /**
     * Register a callback for shard status changes.
     */
    onStatusChange(callback) {
        this.on("statusChange", callback);
    }
    /**
     * Get the current status of all shards.
     */
    getStatus() {
        return new Map(this.shardStatus);
    }
    /**
     * Run a single round of health checks for all shards.
     */
    async runChecks() {
        const checks = this.shardIds.map(async (shardId) => {
            let isAlive = false;
            try {
                isAlive = await (0, shardClient_1.pingShard)(shardId, 1000);
            }
            catch {
                isAlive = false;
            }
            this.evaluateShardHealth(shardId, isAlive);
        });
        await Promise.allSettled(checks);
    }
    /**
     * Evaluate a single ping result and update shard state.
     * Only changes status after crossing the consecutive-failure threshold
     * to avoid reacting to transient blips.
     */
    evaluateShardHealth(shardId, isAlive) {
        const currentFailures = this.consecutiveFailures.get(shardId) ?? 0;
        const currentStatus = this.shardStatus.get(shardId) ?? "up";
        if (!isAlive) {
            const newFailures = currentFailures + 1;
            this.consecutiveFailures.set(shardId, newFailures);
            if (newFailures >= this.failureThreshold &&
                currentStatus !== "down") {
                this.shardStatus.set(shardId, "down");
                this.hashRing.removeNode(shardId);
                const event = {
                    shardId,
                    status: "down",
                    timestamp: Date.now(),
                };
                this.emit("statusChange", event);
            }
        }
        else {
            this.consecutiveFailures.set(shardId, 0);
            if (currentStatus === "down") {
                this.shardStatus.set(shardId, "up");
                this.hashRing.addNode(shardId);
                const event = {
                    shardId,
                    status: "up",
                    timestamp: Date.now(),
                };
                this.emit("statusChange", event);
            }
        }
    }
}
exports.HealthChecker = HealthChecker;
//# sourceMappingURL=healthChecker.js.map