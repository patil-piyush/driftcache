import { useMetrics } from "./hooks/useMetrics";
import { ShardLoadChart } from "./components/ShardLoadChart";
import { HitMissRatio } from "./components/HitMissRatio";
import { RemapComparisonChart } from "./components/RemapComparisonChart";
import { LatencyPercentiles } from "./components/LatencyPercentiles";
import "./index.css";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

export default function App() {
  const { metrics, health, connected } = useMetrics();

  const m = metrics ?? {
    hits: { l1: 0, l2: 0, total: 0 },
    misses: 0,
    hitRatio: 0,
    latency: { p50: 0, p95: 0, p99: 0 },
    shardDistribution: {},
    totalRequests: 0,
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">⚡</div>
          <div>
            <h1>DriftCache</h1>
            <div className="header-subtitle">Distributed Cache Metrics Dashboard</div>
          </div>
        </div>
        <div className={`status-badge ${connected ? "connected" : "disconnected"}`}>
          <div className="status-dot" />
          <span>{connected ? "Live" : "Disconnected"}</span>
        </div>
      </header>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Requests</div>
          <div className="stat-value blue">{formatNumber(m.totalRequests)}</div>
          <div className="stat-detail">{formatNumber(m.hits.total)} hits / {formatNumber(m.misses)} misses</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Hit Ratio</div>
          <div className="stat-value green">{(m.hitRatio * 100).toFixed(1)}%</div>
          <div className="stat-detail">L1: {formatNumber(m.hits.l1)} | L2: {formatNumber(m.hits.l2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">p99 Latency</div>
          <div className="stat-value purple">{m.latency.p99.toFixed(2)}ms</div>
          <div className="stat-detail">p50: {m.latency.p50.toFixed(2)}ms | p95: {m.latency.p95.toFixed(2)}ms</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Cache Misses</div>
          <div className="stat-value amber">{formatNumber(m.misses)}</div>
          <div className="stat-detail">
            {m.totalRequests > 0
              ? `${((m.misses / m.totalRequests) * 100).toFixed(1)}% of total`
              : "—"}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title">📊 Shard Load Distribution</div>
          <div className="chart-subtitle">Keys written per shard — proves hash ring balances load</div>
          <ShardLoadChart distribution={m.shardDistribution} />
        </div>

        <div className="chart-card">
          <div className="chart-title">🎯 Hit / Miss Ratio</div>
          <div className="chart-subtitle">L1 (in-memory) vs L2 (Redis) vs misses</div>
          <HitMissRatio l1={m.hits.l1} l2={m.hits.l2} misses={m.misses} hitRatio={m.hitRatio} />
        </div>

        <div className="chart-card">
          <div className="chart-title">🔄 Remap Comparison</div>
          <div className="chart-subtitle">% of keys remapped when adding a shard (3 → 4)</div>
          <RemapComparisonChart />
        </div>

        <div className="chart-card">
          <div className="chart-title">⚡ Latency Percentiles</div>
          <div className="chart-subtitle">Request latency distribution (lower is better)</div>
          <LatencyPercentiles p50={m.latency.p50} p95={m.latency.p95} p99={m.latency.p99} />
        </div>

        {/* Shard Health */}
        <div className="chart-card full-width">
          <div className="chart-title">🖥️ Shard Health Status</div>
          <div className="chart-subtitle">Real-time health of all Redis shards</div>
          <div className="shard-grid">
            {health?.shards
              ? Object.entries(health.shards).map(([id, status]) => (
                  <div key={id} className={`shard-item ${status}`}>
                    <div className="shard-status-dot" />
                    <div>
                      <div className="shard-name">{id}</div>
                      <div className="shard-info">{status === "up" ? "● Healthy" : "✕ Down"}</div>
                    </div>
                    <div className="shard-writes">
                      {m.shardDistribution[id] ? formatNumber(m.shardDistribution[id]) : "—"}
                    </div>
                  </div>
                ))
              : ["shard-1", "shard-2", "shard-3"].map((id) => (
                  <div key={id} className="shard-item up">
                    <div className="shard-status-dot" />
                    <div>
                      <div className="shard-name">{id}</div>
                      <div className="shard-info">Waiting...</div>
                    </div>
                    <div className="shard-writes">—</div>
                  </div>
                ))}
          </div>
        </div>
      </div>
    </div>
  );
}
