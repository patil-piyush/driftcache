import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";

// Pre-computed from scripts/remap-benchmark.js (150 vnodes, 100k keys)
const REMAP_DATA = [
  { name: "Consistent\nHashing", pct: 27.21, color: "#3b82f6" },
  { name: "Naive\nModulo", pct: 74.85, color: "#f43f5e" },
];

export function RemapComparisonChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={REMAP_DATA} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2d3a4d" />
        <XAxis dataKey="name" tick={{ fill: "#8a94a6", fontSize: 11 }} interval={0} />
        <YAxis tick={{ fill: "#8a94a6", fontSize: 12 }} domain={[0, 100]} unit="%" />
        <Tooltip
          contentStyle={{ background: "#1a2332", border: "1px solid #2d3a4d", borderRadius: 8, color: "#e8edf5" }}
          formatter={(val: number) => [`${val}%`, "Remapped"]}
        />
        <Bar dataKey="pct" radius={[6, 6, 0, 0]} maxBarSize={80}>
          {REMAP_DATA.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
          <LabelList dataKey="pct" position="top" fill="#e8edf5" fontSize={14} fontWeight={700}
            formatter={(v: number) => `${v}%`} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
