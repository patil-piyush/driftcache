import express from "express";
import { DriftCache, DriftCacheConfig } from "driftcache";
export interface ProxyServerOptions {
    port: number;
    cacheConfig: DriftCacheConfig;
}
export declare function startProxyServer(options: ProxyServerOptions): Promise<{
    app: ReturnType<typeof express>;
    cache: DriftCache;
    close: () => Promise<void>;
}>;
//# sourceMappingURL=server.d.ts.map