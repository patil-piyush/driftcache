"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startProxyServer = startProxyServer;
const express_1 = __importDefault(require("express"));
const core_1 = require("@driftcache/core");
async function startProxyServer(options) {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    const cache = new core_1.DriftCache(options.cacheConfig);
    await cache.initialize();
    // --- Cache routes ---
    app.get("/cache/:key", async (req, res) => {
        try {
            const value = await cache.get(req.params.key);
            if (value === null) {
                res.status(404).json({ error: "Key not found" });
                return;
            }
            res.json({ key: req.params.key, value });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Internal error";
            res.status(500).json({ error: message });
        }
    });
    app.put("/cache/:key", async (req, res) => {
        try {
            const { value, ttlSeconds } = req.body;
            if (value === undefined) {
                res.status(400).json({ error: "Missing 'value' in request body" });
                return;
            }
            await cache.set(req.params.key, value, { ttlSeconds });
            res.status(201).json({ key: req.params.key, status: "ok" });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Internal error";
            res.status(500).json({ error: message });
        }
    });
    app.delete("/cache/:key", async (req, res) => {
        try {
            await cache.delete(req.params.key);
            res.json({ key: req.params.key, status: "deleted" });
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
    };
    return { app, cache, close };
}
//# sourceMappingURL=server.js.map