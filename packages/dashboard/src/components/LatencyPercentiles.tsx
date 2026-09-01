import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";

interface Props {
  p50: number;
  p95: number;
  p99: number;
}

const COLORS = ["#737373", "#a3a3a3", "#f5f5f5"];

export function LatencyPercentiles({ p50, p95, p99 }: Props) {
  const data = [
    { name: "p50", ms: Number(p50.toFixed(2)), color: COLORS[0] },
    { name: "p95", ms: Number(p95.toFixed(2)), color: COLORS[1] },
    { name: "p99", ms: Number(p99.toFixed(2)), color: COLORS[2] },
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333333" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: "#737373", fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: "#737373", fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: '#1f1f1f' }}
          contentStyle={{ background: "#1a1a1a", border: "1px solid #333333", borderRadius: 4, color: "#f5f5f5" }}
          formatter={(val: any) => [`${val}ms`, "Latency"]}
        />
        <Bar dataKey="ms" radius={[2, 2, 0, 0]} maxBarSize={60}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
          <LabelList dataKey="ms" position="top" fill="#a3a3a3" fontSize={12} fontWeight={500}
            formatter={(v: any) => `${v}`} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
