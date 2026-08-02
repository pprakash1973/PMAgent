"use client";
import React from "react";

const C = {
  primary: "#4f5bd5", primaryLight: "#eef0fc",
  green: "#158a5a", greenLight: "#e3f3ea",
  amber: "#c17d12",
  border: "#e2e5ea", surface: "#fff", surface2: "#f7f8fa",
  text: "#1a1d24", text2: "#5b616e", text3: "#8a909c",
};

function ChartShell({ title, children, height = 180 }: { title: string; children: React.ReactNode; height?: number }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 12 }}>{title}</div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

// ── Bar chart helper ─────────────────────────────────────────────────────────

function BarChart({
  data, barKey, lineKey, barColor, lineColor, labelKey, height = 160,
}: {
  data: Record<string, unknown>[];
  barKey: string; lineKey?: string;
  barColor?: string; lineColor?: string;
  labelKey: string; height?: number;
}) {
  if (!data.length) return <div style={{ fontSize: 12, color: C.text3, paddingTop: 20, textAlign: "center" }}>No data yet</div>;

  const maxBar = Math.max(...data.map(d => Number(d[barKey] ?? 0)), 1);
  const maxLine = lineKey ? Math.max(...data.map(d => Number(d[lineKey] ?? 0)), 1) : 0;
  const maxVal = Math.max(maxBar, maxLine, 1);

  const w = 500; const h = height;
  const padLeft = 40; const padBottom = 30; const padTop = 10; const padRight = 10;
  const chartW = w - padLeft - padRight;
  const chartH = h - padBottom - padTop;
  const barW = Math.max(10, (chartW / data.length) * 0.55);
  const gap = chartW / data.length;

  const yTicks = 4;
  const yScale = (val: number) => padTop + chartH - (val / maxVal) * chartH;

  const linePoints = lineKey
    ? data.map((d, i) => `${padLeft + i * gap + gap / 2},${yScale(Number(d[lineKey] ?? 0))}`).join(" ")
    : "";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "100%" }}>
      {/* Y axis ticks */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const val = Math.round((maxVal / yTicks) * i);
        const y = yScale(val);
        return (
          <g key={i}>
            <line x1={padLeft} y1={y} x2={w - padRight} y2={y} stroke={C.border} strokeWidth={0.7} />
            <text x={padLeft - 4} y={y + 4} textAnchor="end" fontSize={9} fill={C.text3}>{val}</text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const val = Number(d[barKey] ?? 0);
        const bh = (val / maxVal) * chartH;
        const x = padLeft + i * gap + gap / 2 - barW / 2;
        const y = padTop + chartH - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh}
              fill={barColor ?? C.primary} rx={3} opacity={0.85} />
            {val > 0 && (
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={9} fill={C.text2} fontWeight={600}>{val}</text>
            )}
            <text x={padLeft + i * gap + gap / 2} y={h - 6} textAnchor="middle" fontSize={9} fill={C.text3}>
              {String(d[labelKey]).replace("Sprint ", "S")}
            </text>
          </g>
        );
      })}

      {/* Line overlay */}
      {lineKey && data.length > 1 && (
        <polyline points={linePoints} fill="none" stroke={lineColor ?? C.green} strokeWidth={2} strokeLinejoin="round" />
      )}
      {lineKey && data.map((d, i) => (
        <circle key={i}
          cx={padLeft + i * gap + gap / 2}
          cy={yScale(Number(d[lineKey] ?? 0))}
          r={3} fill={lineColor ?? C.green} />
      ))}
    </svg>
  );
}

// ── Burndown chart ───────────────────────────────────────────────────────────

export function BurndownChart({ data }: { data: { sprintNumber: number; label: string; remaining: number; accepted: number }[] }) {
  if (!data.length) return null;

  const maxVal = Math.max(...data.map(d => d.remaining), 1);
  const w = 500; const h = 160;
  const padL = 40; const padB = 30; const padT = 10; const padR = 10;
  const chartW = w - padL - padR;
  const chartH = h - padB - padT;
  const gap = chartW / Math.max(data.length - 1, 1);
  const yScale = (val: number) => padT + chartH - (val / maxVal) * chartH;

  const remainPts = data.map((d, i) => `${padL + i * gap},${yScale(d.remaining)}`).join(" ");
  const acceptPts = data.map((d, i) => `${padL + i * gap},${yScale(d.accepted)}`).join(" ");

  const idealSlope = data.length > 1 ? maxVal / (data.length - 1) : 0;
  const idealPts = data.map((d, i) => `${padL + i * gap},${yScale(Math.max(0, maxVal - i * idealSlope))}`).join(" ");

  return (
    <ChartShell title="Burndown (remaining scope)">
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "100%" }}>
        {Array.from({ length: 5 }, (_, i) => {
          const val = Math.round((maxVal / 4) * i);
          return (
            <g key={i}>
              <line x1={padL} y1={yScale(val)} x2={w - padR} y2={yScale(val)} stroke={C.border} strokeWidth={0.7} />
              <text x={padL - 4} y={yScale(val) + 4} textAnchor="end" fontSize={9} fill={C.text3}>{val}</text>
            </g>
          );
        })}
        {/* Ideal line */}
        <polyline points={idealPts} fill="none" stroke="#d3d7de" strokeWidth={1.5} strokeDasharray="5 3" />
        {/* Accepted (burnup) */}
        <polyline points={acceptPts} fill="none" stroke={C.green} strokeWidth={1.8} />
        {/* Remaining (burndown) */}
        <polyline points={remainPts} fill="none" stroke={C.primary} strokeWidth={2} />
        {data.map((d, i) => (
          <circle key={i} cx={padL + i * gap} cy={yScale(d.remaining)} r={3} fill={C.primary} />
        ))}
        {data.map((d, i) => (
          <text key={i} x={padL + i * gap} y={h - 6} textAnchor="middle" fontSize={9} fill={C.text3}>
            {String(d.label).replace("Sprint ", "S")}
          </text>
        ))}
        {/* Legend */}
        <circle cx={padL} cy={padT - 2} r={4} fill={C.primary} />
        <text x={padL + 8} y={padT + 2} fontSize={9} fill={C.text2}>Remaining</text>
        <circle cx={padL + 80} cy={padT - 2} r={4} fill={C.green} />
        <text x={padL + 88} y={padT + 2} fontSize={9} fill={C.text2}>Accepted</text>
        <line x1={padL + 160} y1={padT - 2} x2={padL + 175} y2={padT - 2} stroke="#d3d7de" strokeWidth={1.5} strokeDasharray="4 2" />
        <text x={padL + 178} y={padT + 2} fontSize={9} fill={C.text2}>Ideal</text>
      </svg>
    </ChartShell>
  );
}

// ── Velocity chart ────────────────────────────────────────────────────────────

export function VelocityChart({ velocities, avg }: {
  velocities: { sprintNumber: number; label: string; accepted: number }[];
  avg: number | null;
}) {
  if (!velocities.length) return null;
  return (
    <ChartShell title="Velocity (story points accepted per sprint)">
      <BarChart data={velocities} barKey="accepted" labelKey="label" barColor={C.primary} />
    </ChartShell>
  );
}

// ── Commitment reliability chart ──────────────────────────────────────────────

export function CommitmentChart({ data }: {
  data: { sprintNumber: number; label: string; committed: number; accepted: number; reliability: number | null }[];
}) {
  if (!data.length) return null;
  return (
    <ChartShell title="Commitment Reliability (%)">
      <BarChart data={data} barKey="reliability" labelKey="label" barColor={C.amber} />
    </ChartShell>
  );
}

// ── Metric card ──────────────────────────────────────────────────────────────

export function MetricCard({
  label, value, unit, sub, color,
}: { label: string; value: string | number | null; unit?: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: "14px 18px", minWidth: 130,
    }}>
      <div style={{ fontSize: 11, color: C.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? C.text }}>
        {value == null ? "—" : value}{unit && <span style={{ fontSize: 13, fontWeight: 500, color: C.text3, marginLeft: 3 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
