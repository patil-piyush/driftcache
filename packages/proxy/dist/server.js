"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startProxyServer = startProxyServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const driftcache_1 = require("driftcache");
async function startProxyServer(options) {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    const cache = new driftcache_1.DriftCache(options.cacheConfig);
    await cache.initialize();
    // --- Cache routes ---
    app.get("/cache/:key", async (req, res) => {
        try {
            const key = req.params.key;
            const value = await cache.get(key);
            if (value === null) {
                res.status(404).json({ error: "Key not found" });
                return;
            }
            res.json({ key, value });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Internal error";
            res.status(500).json({ error: message });
        }
    });
    app.put("/cache/:key", async (req, res) => {
        try {
            const key = req.params.key;
            const { value, ttlSeconds } = req.body;
            if (value === undefined) {
                res.status(400).json({ error: "Missing 'value' in request body" });
                return;
            }
            await cache.set(key, value, { ttlSeconds });
            res.status(201).json({ key, status: "ok" });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Internal error";
            res.status(500).json({ error: message });
        }
    });
    app.delete("/cache/:key", async (req, res) => {
        try {
            const key = req.params.key;
            await cache.delete(key);
            res.json({ key, status: "deleted" });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Internal error";
            res.status(500).json({ error: message });
        }
    });
    // --- Metrics endpoint ---
    app.get("/metrics", (_req, res) => {
        res.json(cache.getMetricsSnapshot());
    });
    // --- Health endpoint ---
    app.get("/health", (_req, res) => {
        const status = cache.getHealthChecker().getStatus();
        const shards = {};
        for (const [id, state] of status) {
            shards[id] = state;
        }
        res.json({ status: "ok", shards });
    });
    // Start listening.
    const server = app.listen(options.port, () => {
        console.log(`DriftCache proxy listening on port ${options.port}`);
    });
    const close = async () => {
        server.close();
        await cache.destroy();
        await (0, driftcache_1.destroyShardClients)();
    };
    return { app, cache, close };
}
//# sourceMappingURL=server.js.map