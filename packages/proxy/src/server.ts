import express, { Request, Response } from "express";
import { DriftCache, DriftCacheConfig } from "@driftcache/core";

export interface ProxyServerOptions {
  port: number;
  cacheConfig: DriftCacheConfig;
}

export async function startProxyServer(
  options: ProxyServerOptions
): Promise<{ app: ReturnType<typeof express>; cache: DriftCache; close: () => Promise<void> }> {
  const app = express();

  app.use(express.json());

  const cache = new DriftCache(options.cacheConfig);
  await cache.initialize();

  // --- Cache routes ---

  app.get("/cache/:key", async (req: Request, res: Response) => {
    try {
      const value = await cache.get(req.params.key);

      if (value === null) {
        res.status(404).json({ error: "Key not found" });
        return;
      }

      res.json({ key: req.params.key, value });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  app.put("/cache/:key", async (req: Request, res: Response) => {
    try {
      const { value, ttlSeconds } = req.body;

      if (value === undefined) {
        res.status(400).json({ error: "Missing 'value' in request body" });
        return;
      }

      await cache.set(req.params.key, value, { ttlSeconds });
      res.status(201).json({ key: req.params.key, status: "ok" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  app.delete("/cache/:key", async (req: Request, res: Response) => {
    try {
      await cache.delete(req.params.key);
      res.json({ key: req.params.key, status: "deleted" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // --- Metrics endpoint ---

  app.get("/metrics", (_req: Request, res: Response) => {
    res.json(cache.getMetricsSnapshot());
  });

  // --- Health endpoint ---

  app.get("/health", (_req: Request, res: Response) => {
    const status = cache.getHealthChecker().getStatus();
    const shards: Record<string, string> = {};

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
