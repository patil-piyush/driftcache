import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface Props {
  l1: number;
  l2: number;
  misses: number;
  hitRatio: number;
}

const COLORS = ["#f5f5f5", "#a3a3a3", "#333333"];

export function HitMissRatio({ l1, l2, misses, hitRatio }: Props) {
  const data = [
    { name: "L1 Hits", value: l1 },
    { name: "L2 Hits", value: l2 },
    { name: "Misses", value: misses },
  ];

  const total = l1 + l2 + misses;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 32 }}>
      <div style={{ position: "relative", width: 160, height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#1a1a1a", border: "1px solid #333333", borderRadius: 4, color: "#f5f5f5" }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)", textAlign: "center"
        }}>
          <div style={{
            fontSize: 24, fontWeight: 500,
            fontFamily: "'JetBrains Mono', monospace",
            color: "var(--text-primary)"
          }}>
            {(hitRatio * 100).toFixed(1)}%
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Hit Rate
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data.map((item, i) => (
          <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i] }} />
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item.name}</span>
            <span style={{
              marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13, fontWeight: 500, color: "var(--text-primary)", paddingLeft: 16
            }}>
              {total > 0 ? item.value.toLocaleString() : "0"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
