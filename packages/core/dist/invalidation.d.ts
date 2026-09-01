export interface InvalidationMessage {
    key: string;
    operation: "set" | "del";
    timestamp: number;
    sourceId: string;
}
export declare class Invalidation {
    private publisher;
    private subscriber;
    /**
     * Unique identifier for this Invalidation instance.
     * Used to ignore self-published messages — without this,
     * a set() would immediately evict the key from the same
     * instance's L1 cache via the pub/sub round-trip.
     */
    readonly instanceId: string;
    /**
     * Initialise with a Redis connection config. Creates two connections:
     * one for publishing invalidation messages, and a dedicated one for
     * subscribing (Redis requires a separate connection for subscriptions).
     */
    initialize(config: {
        host: string;
        port: number;
    }): Promise<void>;
    /**
     * Publish an invalidation event after a write or delete.
     */
    publishInvalidation(key: string, operation: "set" | "del"): Promise<void>;
    /**
     * Subscribe to invalidation events. Call once at startup.
     * The callback receives each invalidation message so the caller
     * can evict stale L1 entries.
     *
     * Messages published by THIS instance are automatically filtered
     * out so a set() won't evict its own just-written L1 entry.
     */
    subscribeToInvalidations(onMessage: (msg: InvalidationMessage) => void): Promise<void>;
    /**
     * Tear down both connections. Used for graceful shutdown and test cleanup.
     */
    destroy(): Promise<void>;
}
//# sourceMappingURL=invalidation.d.ts.map