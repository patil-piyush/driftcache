import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Props {
  distribution: Record<string, number>;
}

const COLORS = ["#3b82f6", "#06b6d4", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e"];

export function ShardLoadChart({ distribution }: Props) {
  const entries = Object.entries(distribution);
  if (entries.length === 0) {
    return <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "60px 0" }}>No data yet</div>;
  }

  const data = entries.map(([shard, count]) => ({ name: shard, writes: count }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2d3a4d" />
        <XAxis dataKey="name" tick={{ fill: "#8a94a6", fontSize: 12 }} />
        <YAxis tick={{ fill: "#8a94a6", fontSize: 12 }} />
        <Tooltip
          contentStyle={{ background: "#1a2332", border: "1px solid #2d3a4d", borderRadius: 8, color: "#e8edf5" }}
        />
        <Bar dataKey="writes" radius={[6, 6, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
