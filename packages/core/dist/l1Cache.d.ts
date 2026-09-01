export interface L1CacheOptions {
    maxSize: number;
}
export declare class L1Cache {
    private readonly maxSize;
    private readonly cache;
    private head;
    private tail;
    constructor(options: L1CacheOptions);
    l1Get(key: string): unknown | undefined;
    l1Set(key: string, value: unknown, ttlSeconds: number): void;
    l1Delete(key: string): void;
    l1Clear(): void;
    private addToFront;
    private removeNode;
    private moveToFront;
    private evictLeastRecentlyUsed;
}
//# sourceMappingURL=l1Cache.d.ts.map