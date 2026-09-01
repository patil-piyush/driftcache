"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Invalidation = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const crypto_1 = require("crypto");
const CHANNEL = "driftcache:invalidate";
class Invalidation {
    publisher = null;
    subscriber = null;
    /**
     * Unique identifier for this Invalidation instance.
     * Used to ignore self-published messages — without this,
     * a set() would immediately evict the key from the same
     * instance's L1 cache via the pub/sub round-trip.
     */
    instanceId = (0, crypto_1.randomBytes)(8).toString("hex");
    /**
     * Initialise with a Redis connection config. Creates two connections:
     * one for publishing invalidation messages, and a dedicated one for
     * subscribing (Redis requires a separate connection for subscriptions).
     */
    async initialize(config) {
        this.publisher = new ioredis_1.default({
            host: config.host,
            port: config.port,
            lazyConnect: false,
            maxRetriesPerRequest: 3,
        });
        this.publisher.on("error", (err) => {
            console.error("Invalidation publisher error:", err.message);
        });
        this.subscriber = new ioredis_1.default({
            host: config.host,
            port: config.port,
            lazyConnect: false,
            maxRetriesPerRequest: 3,
        });
        this.subscriber.on("error", (err) => {
            console.error("Invalidation subscriber error:", err.message);
        });
    }
    /**
     * Publish an invalidation event after a write or delete.
     */
    async publishInvalidation(key, operation) {
        if (!this.publisher) {
            throw new Error("Invalidation not initialized");
        }
        const message = {
            key,
            operation,
            timestamp: Date.now(),
            sourceId: this.instanceId,
        };
        await this.publisher.publish(CHANNEL, JSON.stringify(message));
    }
    /**
     * Subscribe to invalidation events. Call once at startup.
     * The callback receives each invalidation message so the caller
     * can evict stale L1 entries.
     *
     * Messages published by THIS instance are automatically filtered
     * out so a set() won't evict its own just-written L1 entry.
     */
    async subscribeToInvalidations(onMessage) {
        if (!this.subscriber) {
            throw new Error("Invalidation not initialized");
        }
        this.subscriber.on("message", (_channel, raw) => {
            try {
                const msg = JSON.parse(raw);
                // Skip messages we published ourselves.
                if (msg.sourceId === this.instanceId) {
                    return;
                }
                onMessage(msg);
            }
            catch {
                console.error("Failed to parse invalidation message:", raw);
            }
        });
        await this.subscriber.subscribe(CHANNEL);
    }
    /**
     * Tear down both connections. Used for graceful shutdown and test cleanup.
     */
    async destroy() {
        if (this.subscriber) {
            await this.subscriber.unsubscribe(CHANNEL).catch(() => { });
            this.subscriber.disconnect();
            this.subscriber = null;
        }
        if (this.publisher) {
            this.publisher.disconnect();
            this.publisher = null;
        }
    }
}
exports.Invalidation = Invalidation;
//# sourceMappingURL=invalidation.js.map