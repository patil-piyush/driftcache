import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Props {
  distribution: Record<string, number>;
}

const COLOR = "#a3a3a3";
const COLOR_ACTIVE = "#f5f5f5";

export function ShardLoadChart({ distribution }: Props) {
  const entries = Object.entries(distribution);
  if (entries.length === 0) {
    return <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "60px 0" }}>No data yet</div>;
  }

  const data = entries.map(([shard, count]) => ({ name: shard, writes: count }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333333" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: "#737373", fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: "#737373", fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: '#1f1f1f' }}
          contentStyle={{ background: "#1a1a1a", border: "1px solid #333333", borderRadius: 4, color: "#f5f5f5" }}
        />
        <Bar dataKey="writes" radius={[2, 2, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={i % 2 === 0 ? COLOR : COLOR_ACTIVE} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
