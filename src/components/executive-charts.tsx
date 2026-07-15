"use client";

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";

type HealthData = { name: string; value: number; color: string };

// ── Health donut ──────────────────────────────────────────────────────────────
export function HealthDonut({ green, amber, red }: { green: number; amber: number; red: number }) {
  const data: HealthData[] = [
    { name: "On Track", value: green, color: "#158a5a" },
    { name: "At Risk", value: amber, color: "#c17d12" },
    { name: "Critical", value: red, color: "#cf3f3a" },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return <p style={{ fontSize: 13, color: "#8a909c", textAlign: "center", padding: "24px 0" }}>No projects yet</p>;
  }

  const total = green + amber + red;
  const healthPct = total > 0 ? Math.round((green / total) * 100) : 0;

  return (
    <div style={{ position: "relative" }}>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={58} outerRadius={82} paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip formatter={(v) => [`${v} project${Number(v) !== 1 ? "s" : ""}`, ""]} />
          <Legend iconType="circle" iconSize={9} formatter={(v) => <span style={{ fontSize: 12 }}>{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
      {/* centre label */}
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -65%)", textAlign: "center", pointerEvents: "none" }}>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 26, fontWeight: 700, color: healthPct >= 70 ? "#158a5a" : healthPct >= 40 ? "#c17d12" : "#cf3f3a", lineHeight: 1 }}>{healthPct}%</div>
        <div style={{ fontSize: 10, color: "#8a909c", marginTop: 2 }}>on track</div>
      </div>
    </div>
  );
}

// ── SPI by project bar (horizontal) ──────────────────────────────────────────
type SpiData = { name: string; spi: number; health: string };

export function SpiDistribution({ data }: { data: SpiData[] }) {
  if (data.length === 0) {
    return <p style={{ fontSize: 13, color: "#8a909c", textAlign: "center", padding: "24px 0" }}>No schedule data yet</p>;
  }

  const sorted = [...data].sort((a, b) => a.spi - b.spi);
  const chartData = sorted.map(d => ({
    name: d.name,
    spi: d.spi,
    fill: d.spi >= 1 ? "#158a5a" : d.spi >= 0.85 ? "#c17d12" : "#cf3f3a",
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 34)}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 32, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis
          type="number" domain={[0, Math.max(1.4, ...chartData.map(d => d.spi + 0.1))]}
          tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
          tickFormatter={v => v.toFixed(1)}
        />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => [`SPI: ${Number(v).toFixed(2)}`, ""]} />
        <ReferenceLine x={1} stroke="#4f5bd5" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "1.0", position: "top", fontSize: 10, fill: "#4f5bd5" }} />
        <ReferenceLine x={0.8} stroke="#cf3f3a" strokeDasharray="4 3" strokeWidth={1} label={{ value: "0.8", position: "top", fontSize: 10, fill: "#cf3f3a" }} />
        <Bar dataKey="spi" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Keep legacy exports so other pages that import them don't break ────────────
export function BudgetBar({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) return <p style={{ fontSize: 13, color: "#8a909c", textAlign: "center", padding: "24px 0" }}>No budget data</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" tickFormatter={(v) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => [`$${Number(v).toLocaleString()}`, "Budget"]} />
        <Bar dataKey="value" fill="#4f5bd5" radius={[0, 4, 4, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MethodologyBar({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) return <p style={{ fontSize: 13, color: "#8a909c", textAlign: "center", padding: "24px 0" }}>No projects yet</p>;
  const COLORS = ["#4f5bd5", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => [`${v} project${Number(v) !== 1 ? "s" : ""}`, ""]} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={52}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RiskBar({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) return <p style={{ fontSize: 13, color: "#8a909c", textAlign: "center", padding: "24px 0" }}>No risk data</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => [`${v} open risk${Number(v) !== 1 ? "s" : ""}`, ""]} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
          {data.map((d, i) => <Cell key={i} fill={d.value >= 5 ? "#cf3f3a" : d.value >= 3 ? "#c17d12" : "#158a5a"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Re-export for any other consumer
export function EVMScatter() { return null; }
