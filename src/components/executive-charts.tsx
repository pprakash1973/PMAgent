"use client";

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

type HealthData = { name: string; value: number; color: string };
type BarData = { name: string; value: number; color?: string };

// ── Health donut ──────────────────────────────────────────────────────────────
export function HealthDonut({ green, amber, red }: { green: number; amber: number; red: number }) {
  const data: HealthData[] = [
    { name: "On Track", value: green, color: "#22c55e" },
    { name: "At Risk", value: amber, color: "#f59e0b" },
    { name: "Critical", value: red, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">No projects yet</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip formatter={(v) => [`${v} project${Number(v) !== 1 ? "s" : ""}`, ""]} />
        <Legend iconType="circle" iconSize={10} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Budget bar (horizontal) ───────────────────────────────────────────────────
export function BudgetBar({ data }: { data: BarData[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">No budget data</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis
          type="number"
          tickFormatter={(v) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => [`$${Number(v).toLocaleString()}`, "Budget"]} />
        <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Methodology distribution bar ──────────────────────────────────────────────
export function MethodologyBar({ data }: { data: BarData[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">No projects yet</p>;
  }
  const COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];
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

// ── Risk by project bar ───────────────────────────────────────────────────────
export function RiskBar({ data }: { data: BarData[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">No risk data</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => [`${v} open risk${Number(v) !== 1 ? "s" : ""}`, ""]} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
          {data.map((d, i) => <Cell key={i} fill={d.value >= 5 ? "#ef4444" : d.value >= 3 ? "#f59e0b" : "#22c55e"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
