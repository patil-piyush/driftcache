import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";

interface Props {
  p50: number;
  p95: number;
  p99: number;
}

const COLORS = ["#10b981", "#f59e0b", "#f43f5e"];

export function LatencyPercentiles({ p50, p95, p99 }: Props) {
  const data = [
    { name: "p50", ms: Number(p50.toFixed(2)), color: COLORS[0] },
    { name: "p95", ms: Number(p95.toFixed(2)), color: COLORS[1] },
    { name: "p99", ms: Number(p99.toFixed(2)), color: COLORS[2] },
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2d3a4d" />
        <XAxis dataKey="name" tick={{ fill: "#8a94a6", fontSize: 12 }} />
        <YAxis tick={{ fill: "#8a94a6", fontSize: 12 }} unit="ms" />
        <Tooltip
          contentStyle={{ background: "#1a2332", border: "1px solid #2d3a4d", borderRadius: 8, color: "#e8edf5" }}
          formatter={(val: number) => [`${val}ms`, "Latency"]}
        />
        <Bar dataKey="ms" radius={[6, 6, 0, 0]} maxBarSize={80}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
          <LabelList dataKey="ms" position="top" fill="#e8edf5" fontSize={13} fontWeight={600}
            formatter={(v: number) => `${v}ms`} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
