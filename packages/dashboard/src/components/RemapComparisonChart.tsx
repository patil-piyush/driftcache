import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";

const REMAP_DATA = [
  { name: "Consistent", pct: 27.21, color: "#f5f5f5" },
  { name: "Modulo", pct: 74.85, color: "#525252" },
];

export function RemapComparisonChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={REMAP_DATA} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333333" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: "#737373", fontSize: 12 }} interval={0} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: "#737373", fontSize: 12 }} domain={[0, 100]} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: '#1f1f1f' }}
          contentStyle={{ background: "#1a1a1a", border: "1px solid #333333", borderRadius: 4, color: "#f5f5f5" }}
          formatter={(val: any) => [`${val}%`, "Remapped"]}
        />
        <Bar dataKey="pct" radius={[2, 2, 0, 0]} maxBarSize={60}>
          {REMAP_DATA.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
          <LabelList dataKey="pct" position="top" fill="#a3a3a3" fontSize={12} fontWeight={500}
            formatter={(v: any) => `${v}%`} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
