import { useState, useEffect, useCallback } from "react";

export interface MetricsData {
  hits: { l1: number; l2: number; total: number };
  misses: number;
  hitRatio: number;
  latency: { p50: number; p95: number; p99: number };
  shardDistribution: Record<string, number>;
  totalRequests: number;
}

export interface HealthData {
  status: string;
  shards: Record<string, string>;
}

const METRICS_URL = "http://localhost:7000/metrics";
const HEALTH_URL = "http://localhost:7000/health";
const POLL_INTERVAL = 1500;

export function useMetrics() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [connected, setConnected] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [mRes, hRes] = await Promise.all([
        fetch(METRICS_URL),
        fetch(HEALTH_URL),
      ]);
      const m = await mRes.json();
      const h = await hRes.json();
      setMetrics(m);
      setHealth(h);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchData]);

  return { metrics, health, connected };
}
