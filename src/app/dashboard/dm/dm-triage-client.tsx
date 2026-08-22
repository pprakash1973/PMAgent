"use client";
import React, { useState, useMemo } from "react";
import { DrillDownPanel } from "./drill-down-panel";

// ── Types ───────────────────────────────────────────────────────────────────────
type TriageRow = {
  id: string; name: string; accountId: string | null; accountName: string | null;
  programId: string | null; programName: string | null; pmId: string; pmName: string;
  healthStatus: string; band: "red" | "amber" | "no_data" | "green"; attentionScore: number;
  deliveryMethod: string; // "predictive" | "agile_scrum" | "hybrid" — extensible
  spi: number | null; cpi: number | null; compositeScore: number | null;
  // Agile-specific (null for waterfall)
  velocity: number | null; commitmentReliability: number | null;
  activeSprint: { id: string; label: string | null; sprintNumber: number } | null;
  velTrend: "up" | "down" | "stable" | null;
  openActionItems: number; highRisks: number; criticalIssues: number;
  nextMilestone: { name: string; dueDate: string; daysUntilDue: number | null } | null;
  phase: string; lastReportDate: string | null; daysSinceReport: number | null;
  spiTrend: (number | null)[]; cpiTrend: (number | null)[]; compositeTrend: (number | null)[];
  burnPct: number | null; budget: number | null; currency: string; totalSpent: number;
  whyDiagnosis: string;
  artifactsGenerated: number; hoursSaved: number; dollarsSaved: number;
};

type TriageData = {
  bands: { red: TriageRow[]; amber: TriageRow[]; no_data: TriageRow[]; green: TriageRow[] };
  counts: { red: number; amber: number; no_data: number; green: number; total: number };
  overdueActionItems: number;
  totalBudget?: number; totalSpentAll?: number;
  portfolioProd?: { artifactsGenerated: number; hoursSaved: number; dollarsSaved: number };
};

// ── Design tokens ───────────────────────────────────────────────────────────────
const C = {
  ground: "#EEF4F5",
  surface: "#FFFFFF",
  surface2: "#F5F9FA",
  petrol: "#003C51", teal: "#006E74", blue: "#0097AC",
  blueSoft: "#E3F2F5",
  border: "#D9E3E6", borderSoft: "#E9F0F2",
  ink: "#1C2426", ink2: "#4A5860", ink3: "#7C8B93", inkFaint: "#9FB0B7",
  red: "#C5392B", redBg: "#FBECEA", redLine: "#F0CBC6",
  amber: "#B9770F", amberBg: "#FDF3E2", amberLine: "#F2DDB8",
  green: "#0F9F70", greenBg: "#E6F6F0", greenLine: "#BFE8D8",
  grey: "#6F7880", greyBg: "#EEF0F2", greyLine: "#DBE0E3",
  tabBar: "#006E74",
  FF: "var(--font-inter),'Inter',system-ui,sans-serif",
  FM: "'Consolas','SF Mono','Courier New',monospace",
};

// ── Methodology config — add new methodologies here only ─────────────────────────
const METHODOLOGY_GROUPS: Record<string, { label: string; shortLabel: string; color: string; bg: string; border: string; perf: string }> = {
  predictive: { label: "Waterfall / Predictive", shortLabel: "Waterfall", color: C.teal,    bg: "#e8f5f6", border: "#b2dde0", perf: "SPI / CPI" },
  agile_scrum: { label: "Agile Scrum",           shortLabel: "Agile",     color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd", perf: "Velocity / Reliability" },
  hybrid:      { label: "Hybrid",                shortLabel: "Hybrid",    color: C.blue,    bg: C.blueSoft, border: "#93c5fd", perf: "SPI + Velocity" },
};

function mkey(row: TriageRow): string {
  return METHODOLOGY_GROUPS[row.deliveryMethod] ? row.deliveryMethod : "predictive";
}

// ── Helpers ──────────────────────────────────────────────────────────────────────
function ragColor(band: string) {
  return band === "red" ? C.red : band === "amber" ? C.amber : band === "green" ? C.green : C.grey;
}
function ragLabel(band: string) {
  return band === "red" ? "Critical" : band === "amber" ? "At risk" : band === "no_data" ? "No data" : "On track";
}
function spiColor(v: number | null) {
  if (v === null) return C.inkFaint;
  if (v < 0.85) return C.red;
  if (v < 0.95) return C.amber;
  return C.green;
}
function fmt(v: number | null, dp = 2) { return v === null ? "—" : v.toFixed(dp); }

function fmtMoney(v: number, currency = "USD") {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ── Sparkline ────────────────────────────────────────────────────────────────────
function Spark({ data, color, w = 72, h = 20 }: { data: (number | null)[]; color: string; w?: number; h?: number }) {
  const pts = data.filter((v): v is number => v !== null);
  if (pts.length < 2) return <svg width={w} height={h} />;
  const max = Math.max(...pts); const min = Math.min(...pts);
  const range = max - min || 0.001;
  const nx = (i: number) => (i / (pts.length - 1)) * (w - 2) + 1;
  const ny = (v: number) => h - 2 - ((v - min) / range) * (h - 4);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${nx(i).toFixed(1)} ${ny(v).toFixed(1)}`).join(" ");
  const area = `${d} L${nx(pts.length - 1)} ${h} L${nx(0)} ${h} Z`;
  return (
    <svg width={w} height={h} style={{ overflow: "visible", display: "block" }}>
      <path d={area} fill={color} fillOpacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={nx(pts.length - 1)} cy={ny(pts[pts.length - 1])} r={2} fill={color} />
    </svg>
  );
}

// ── Trend arrow ───────────────────────────────────────────────────────────────────
function trendArrow(data: (number | null)[]): { arrow: string; color: string } {
  const pts = data.filter((v): v is number => v !== null);
  if (pts.length < 2) return { arrow: "▶", color: C.inkFaint };
  const delta = pts[pts.length - 1] - pts[0];
  if (Math.abs(delta) < 0.02) return { arrow: "▶", color: C.inkFaint };
  return delta > 0 ? { arrow: "▲", color: C.green } : { arrow: "▼", color: C.red };
}

// ── Pill ─────────────────────────────────────────────────────────────────────────
function Pill({ count, label, activeColor, activeBg, show0 = false }: {
  count: number; label: string; activeColor: string; activeBg: string; show0?: boolean;
}) {
  if (!show0 && count === 0) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 7px", borderRadius: 5, fontSize: 11, fontWeight: 600,
      background: count > 0 ? activeBg : C.greyBg,
      color: count > 0 ? activeColor : C.inkFaint, fontFamily: C.FF,
    }}>
      {count} {label}
    </span>
  );
}

// ── Burn bar ─────────────────────────────────────────────────────────────────────
function BurnBar({ pct }: { pct: number }) {
  const color = pct >= 85 ? C.red : pct >= 70 ? C.amber : C.green;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 52, height: 5, borderRadius: 99, background: C.borderSoft, overflow: "hidden", display: "inline-block" }}>
        <span style={{ display: "block", height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 99 }} />
      </span>
      <span style={{ fontFamily: C.FM, fontSize: 11.5, fontWeight: 700, color }}>{pct}%</span>
    </span>
  );
}

// ── Attention Row ─────────────────────────────────────────────────────────────────
function AttentionRow({ p, onReview, onEscalate, onAddAction, escalated, addedActions }: {
  p: TriageRow;
  onReview: () => void;
  onEscalate: () => void;
  onAddAction: () => void;
  escalated: boolean;
  addedActions: number;
}) {
  const rc = ragColor(p.band);
  const [hovered, setHovered] = useState(false);

  const spiArr = trendArrow(p.spiTrend);

  const isRed = p.band === "red" || p.band === "amber";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: C.surface,
        border: `1px solid ${hovered ? C.blue : C.border}`,
        borderRadius: 14,
        borderLeft: `5px solid ${rc}`,
        padding: "15px 18px",
        boxShadow: hovered ? "0 4px 22px rgba(16,40,48,.09)" : "none",
        transition: "border-color .15s, box-shadow .15s, transform .1s",
        transform: hovered ? "translateY(-1px)" : "none",
      }}
    >
      {/* Top: name + attention score */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const, marginBottom: 3 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.ink, fontFamily: C.FF }}>{p.name}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, letterSpacing: ".04em",
              background: `${rc}18`, color: rc, border: `1px solid ${rc}30`, fontFamily: C.FF,
            }}>{ragLabel(p.band)}</span>
          </div>
          <div style={{ fontSize: 12, color: C.ink3, fontFamily: C.FM }}>
            {p.accountName ?? "Unassigned"} · {p.pmName} · {p.phase.replace(/_/g, " ")}
          </div>
        </div>
      </div>

      {/* Why diagnosis */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 9,
        background: isRed ? (p.band === "red" ? C.redBg : C.amberBg) : C.surface2,
        border: `1px solid ${isRed ? (p.band === "red" ? C.redLine : C.amberLine) : C.borderSoft}`,
        borderRadius: 9, padding: "9px 12px", marginBottom: 12,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
          <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4m0 4h.01"
            stroke={isRed ? (p.band === "red" ? C.red : C.amber) : C.ink3}
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.45, fontFamily: C.FF }}>
          <b>Why:</b> {p.whyDiagnosis}
        </span>
      </div>

      {/* Metrics row */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const }}>
        {/* Methodology badge */}
        {METHODOLOGY_GROUPS[mkey(p)] && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: METHODOLOGY_GROUPS[mkey(p)].bg, color: METHODOLOGY_GROUPS[mkey(p)].color, border: `1px solid ${METHODOLOGY_GROUPS[mkey(p)].border}`, fontFamily: C.FF }}>
            {METHODOLOGY_GROUPS[mkey(p)].shortLabel}
          </span>
        )}

        {/* Agile metrics */}
        {mkey(p) === "agile_scrum" ? (
          <>
            {p.velocity !== null && (
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 11.5, color: C.ink3, fontFamily: C.FF }}>Velocity</span>
                <span style={{ fontFamily: C.FM, fontSize: 13, fontWeight: 700, color: spiColor(p.velocity > 0 ? 1 : 0) }}>{p.velocity.toFixed(0)} pts</span>
                {p.velTrend && <span style={{ fontSize: 10.5, color: p.velTrend === "up" ? C.green : C.red }}>{p.velTrend === "up" ? "▲" : "▼"}</span>}
              </span>
            )}
            {p.commitmentReliability !== null && (
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 11.5, color: C.ink3, fontFamily: C.FF }}>Reliability</span>
                <span style={{ fontFamily: C.FM, fontSize: 13, fontWeight: 700, color: p.commitmentReliability < 60 ? C.red : p.commitmentReliability < 80 ? C.amber : C.green }}>{Math.round(p.commitmentReliability)}%</span>
              </span>
            )}
            {p.activeSprint && (
              <span style={{ fontSize: 11.5, color: C.ink3, fontFamily: C.FF }}>
                Sprint {p.activeSprint.sprintNumber}{p.activeSprint.label ? ` · ${p.activeSprint.label}` : ""}
              </span>
            )}
          </>
        ) : (
          <>
            {/* Waterfall: SPI with sparkline */}
            {p.spi !== null && (
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 11.5, color: C.ink3, fontFamily: C.FF }}>SPI</span>
                <Spark data={p.spiTrend} color={spiColor(p.spi)} w={52} h={16} />
                <span style={{ fontFamily: C.FM, fontSize: 13, fontWeight: 700, color: spiColor(p.spi) }}>{fmt(p.spi)}</span>
                <span style={{ fontSize: 10.5, color: spiArr.color }}>{spiArr.arrow}</span>
              </span>
            )}
            {/* Burn bar */}
            {p.burnPct !== null && (
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 11.5, color: C.ink3, fontFamily: C.FF }}>Burn</span>
                <BurnBar pct={p.burnPct} />
              </span>
            )}
            {/* Next milestone */}
            {p.nextMilestone && (
              <span style={{ fontSize: 11.5, color: C.ink3, fontFamily: C.FF, display: "flex", alignItems: "center", gap: 4 }}>
                📅 {p.nextMilestone.name}
                <span style={{ fontFamily: C.FM, fontWeight: 700, color: (p.nextMilestone.daysUntilDue ?? 99) <= 14 ? C.red : C.blue }}>
                  {p.nextMilestone.daysUntilDue !== null
                    ? (p.nextMilestone.daysUntilDue < 0 ? `${Math.abs(p.nextMilestone.daysUntilDue)}d overdue` : `${p.nextMilestone.daysUntilDue}d`)
                    : fmtDate(p.nextMilestone.dueDate)}
                </span>
              </span>
            )}
          </>
        )}
        {/* Chips */}
        <Pill count={p.highRisks} label="risks" activeColor={C.amber} activeBg={C.amberBg} />
        <Pill count={p.criticalIssues} label="issues" activeColor={C.red} activeBg={C.redBg} />
        <Pill count={p.openActionItems} label="actions" activeColor={C.blue} activeBg={C.blueSoft} />

        {/* Action buttons — right-aligned */}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexShrink: 0 }}>
          {!escalated && (
            <button onClick={e => { e.stopPropagation(); onEscalate(); }} style={btnStyle(p.band === "red" ? "ghost-red" : "ghost")}>⚑ Escalate to DH</button>
          )}
          {escalated && <span style={{ fontSize: 11, color: C.green, fontWeight: 600, fontFamily: C.FF, alignSelf: "center" }}>✓ Escalated</span>}
          <button onClick={e => { e.stopPropagation(); onAddAction(); }} style={btnStyle("ghost")}>
            + Action{addedActions > 0 ? ` (${p.openActionItems + addedActions})` : ""}
          </button>
          <button onClick={e => { e.stopPropagation(); onReview(); }} style={btnStyle("primary")}>Review →</button>
        </span>
      </div>
    </div>
  );
}

function btnStyle(variant: "primary" | "ghost" | "ghost-red"): React.CSSProperties {
  const base: React.CSSProperties = {
    height: 30, padding: "0 12px", fontSize: 12, fontWeight: 600,
    border: "1px solid", borderRadius: 8, cursor: "pointer", fontFamily: C.FF,
    display: "inline-flex", alignItems: "center", gap: 5,
  };
  if (variant === "primary") return { ...base, background: C.teal, color: "#fff", borderColor: C.teal };
  if (variant === "ghost-red") return { ...base, background: `${C.red}10`, color: C.red, borderColor: `${C.red}30` };
  return { ...base, background: C.surface2, color: C.ink2, borderColor: C.border };
}

// ── Band section (attention queue) ────────────────────────────────────────────────
function BandSection({ label, dotColor, projects, collapsed: initialCollapsed, onReview, onEscalate, onAddAction, escalatedIds, addedActionsMap }: {
  label: string; dotColor: string; projects: TriageRow[];
  collapsed: boolean;
  onReview: (id: string) => void; onEscalate: (p: TriageRow) => void;
  onAddAction: (p: TriageRow) => void; escalatedIds: Set<string>;
  addedActionsMap: Record<string, number>;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  if (projects.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, cursor: "pointer", userSelect: "none" as const }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: C.FF }}>{label}</span>
        <span style={{ fontSize: 12, color: C.inkFaint, fontFamily: C.FF }}>
          {projects.length} project{projects.length !== 1 ? "s" : ""}
        </span>
        <span style={{ flex: 1, height: 1, background: C.borderSoft }} />
        <span style={{ color: C.inkFaint, fontSize: 12 }}>{collapsed ? "▸" : "▾"}</span>
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 11 }}>
          {projects.map(p => (
            <AttentionRow
              key={p.id} p={p}
              onReview={() => onReview(p.id)}
              onEscalate={() => onEscalate(p)}
              onAddAction={() => onAddAction(p)}
              escalated={escalatedIds.has(p.id)}
              addedActions={addedActionsMap[p.id] ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Methodology mix strip + per-method KPIs ───────────────────────────────────────
function MethodologyMixStrip({ rows }: { rows: TriageRow[] }) {
  const total = rows.length || 1;
  const groups = (Object.entries(METHODOLOGY_GROUPS) as [string, typeof METHODOLOGY_GROUPS[string]][]).map(([key, cfg]) => {
    const mp = rows.filter(r => mkey(r) === key);
    if (mp.length === 0) return null;
    const red   = mp.filter(r => r.band === "red").length;
    const amber = mp.filter(r => r.band === "amber").length;
    const green = mp.filter(r => r.band === "green").length;
    const pct   = Math.round((mp.length / total) * 100);
    // Per-methodology KPIs
    const isAgile = key === "agile_scrum";
    const withVel = mp.filter(r => r.velocity !== null);
    const withRel = mp.filter(r => r.commitmentReliability !== null);
    const avgVel = withVel.length ? Math.round(withVel.reduce((s, r) => s + (r.velocity ?? 0), 0) / withVel.length) : null;
    const avgRel = withRel.length ? Math.round(withRel.reduce((s, r) => s + (r.commitmentReliability ?? 0), 0) / withRel.length) : null;
    const withSpi = mp.filter(r => r.spi !== null);
    const withCpi = mp.filter(r => r.cpi !== null);
    const avgSpi = withSpi.length ? withSpi.reduce((s, r) => s + (r.spi ?? 0), 0) / withSpi.length : null;
    const avgCpi = withCpi.length ? withCpi.reduce((s, r) => s + (r.cpi ?? 0), 0) / withCpi.length : null;
    return { key, cfg, count: mp.length, pct, red, amber, green, isAgile, avgVel, avgRel, avgSpi, avgCpi };
  }).filter((g): g is NonNullable<typeof g> => g !== null);

  if (groups.length < 2) return null;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.ink3, fontFamily: C.FF }}>Methodology Mix</span>
        <span style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF }}>{rows.length} projects</span>
      </div>
      {/* Stacked bar */}
      <div style={{ height: 8, borderRadius: 99, overflow: "hidden", display: "flex", marginBottom: 14 }}>
        {groups.map(g => (
          <div key={g.key} style={{ width: `${g.pct}%`, background: g.cfg.color, minWidth: 4 }} title={`${g.cfg.label}: ${g.count}`} />
        ))}
      </div>
      {/* Per-method tiles */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
        {groups.map(g => (
          <div key={g.key} style={{ flex: 1, minWidth: 160, background: g.cfg.bg, border: `1.5px solid ${g.cfg.border}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: g.cfg.color }} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: g.cfg.color, fontFamily: C.FF }}>{g.cfg.shortLabel}</span>
              <span style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF, marginLeft: "auto" }}>{g.count} projects</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {g.red > 0   && <span style={{ fontSize: 10, fontWeight: 600, color: C.red,   background: C.redBg,   borderRadius: 99, padding: "1px 6px", fontFamily: C.FF }}>{g.red} crit</span>}
              {g.amber > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: C.amber, background: C.amberBg, borderRadius: 99, padding: "1px 6px", fontFamily: C.FF }}>{g.amber} risk</span>}
              {g.green > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: C.green, background: C.greenBg, borderRadius: 99, padding: "1px 6px", fontFamily: C.FF }}>{g.green} ok</span>}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              {g.isAgile ? (
                <>
                  <div>
                    <div style={{ fontSize: 9.5, color: C.inkFaint, fontFamily: C.FF, marginBottom: 1 }}>Avg Velocity</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: g.avgVel !== null ? g.cfg.color : C.inkFaint, fontFamily: C.FM }}>{g.avgVel !== null ? `${g.avgVel} pts` : "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9.5, color: C.inkFaint, fontFamily: C.FF, marginBottom: 1 }}>Avg Reliability</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: g.avgRel !== null ? (g.avgRel < 60 ? C.red : g.avgRel < 80 ? C.amber : C.green) : C.inkFaint, fontFamily: C.FM }}>{g.avgRel !== null ? `${g.avgRel}%` : "—"}</div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div style={{ fontSize: 9.5, color: C.inkFaint, fontFamily: C.FF, marginBottom: 1 }}>Avg SPI</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: g.avgSpi !== null ? (g.avgSpi < 0.85 ? C.red : g.avgSpi < 0.95 ? C.amber : C.green) : C.inkFaint, fontFamily: C.FM }}>{g.avgSpi !== null ? g.avgSpi.toFixed(2) : "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9.5, color: C.inkFaint, fontFamily: C.FF, marginBottom: 1 }}>Avg CPI</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: g.avgCpi !== null ? (g.avgCpi < 0.85 ? C.red : g.avgCpi < 0.95 ? C.amber : C.green) : C.inkFaint, fontFamily: C.FM }}>{g.avgCpi !== null ? g.avgCpi.toFixed(2) : "—"}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Methodology section wrapper (attention queue) ─────────────────────────────────
function MethodologySection({ methKey, bands, onReview, onEscalate, onAddAction, escalatedIds, addedActionsMap, filter }: {
  methKey: string;
  bands: { red: TriageRow[]; amber: TriageRow[]; no_data: TriageRow[]; green: TriageRow[] };
  onReview: (id: string) => void;
  onEscalate: (p: TriageRow) => void;
  onAddAction: (p: TriageRow) => void;
  escalatedIds: Set<string>;
  addedActionsMap: Record<string, number>;
  filter: (rows: TriageRow[]) => TriageRow[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = METHODOLOGY_GROUPS[methKey] ?? METHODOLOGY_GROUPS.predictive;
  const total = filter(bands.red).length + filter(bands.amber).length + filter(bands.no_data).length + filter(bands.green).length;
  if (total === 0) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <div onClick={() => setCollapsed(!collapsed)} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, cursor: "pointer", userSelect: "none" as const, padding: "10px 14px", borderRadius: 10, background: cfg.bg, border: `1.5px solid ${cfg.border}` }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: cfg.color, color: "#fff", fontFamily: C.FF }}>{cfg.shortLabel}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: cfg.color, fontFamily: C.FF }}>{cfg.label}</span>
        <span style={{ fontSize: 12, color: C.inkFaint, fontFamily: C.FF }}>{total} project{total !== 1 ? "s" : ""}</span>
        <span style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF }}>· {cfg.perf}</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: C.inkFaint, fontSize: 12 }}>{collapsed ? "▸" : "▾"}</span>
      </div>
      {!collapsed && (
        <div style={{ paddingLeft: 12, borderLeft: `3px solid ${cfg.border}` }}>
          <BandSection label="Needs you now" dotColor={C.red}   projects={filter(bands.red)}     collapsed={false} onReview={onReview} onEscalate={onEscalate} onAddAction={onAddAction} escalatedIds={escalatedIds} addedActionsMap={addedActionsMap} />
          <BandSection label="Watch"         dotColor={C.amber} projects={filter(bands.amber)}   collapsed={false} onReview={onReview} onEscalate={onEscalate} onAddAction={onAddAction} escalatedIds={escalatedIds} addedActionsMap={addedActionsMap} />
          <BandSection label="No data"       dotColor={C.grey}  projects={filter(bands.no_data)} collapsed={false} onReview={onReview} onEscalate={onEscalate} onAddAction={onAddAction} escalatedIds={escalatedIds} addedActionsMap={addedActionsMap} />
          <BandSection label="Steady"        dotColor={C.green} projects={filter(bands.green)}   collapsed={true}  onReview={onReview} onEscalate={onEscalate} onAddAction={onAddAction} escalatedIds={escalatedIds} addedActionsMap={addedActionsMap} />
        </div>
      )}
    </div>
  );
}

// ── Portfolio summary cards ────────────────────────────────────────────────────────
function PulseCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 2px rgba(16,40,48,.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 13 }}>
        <span style={{ color: C.ink3 }}>{icon}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.ink3, fontFamily: C.FF }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── Health overview tab (unchanged from original, kept minimal) ────────────────────
function HealthOverview({ data, onSelect, userRole }: { data: TriageData; onSelect: (id: string) => void; userRole?: string }) {
  const all = [...data.bands.red, ...data.bands.amber, ...data.bands.no_data, ...data.bands.green];
  const total = data.counts.total;
  const avgSpi = all.filter(p => p.spi !== null).reduce((s, p) => s + (p.spi ?? 0), 0) / Math.max(1, all.filter(p => p.spi !== null).length);
  const avgCpi = all.filter(p => p.cpi !== null).reduce((s, p) => s + (p.cpi ?? 0), 0) / Math.max(1, all.filter(p => p.cpi !== null).length);

  return (
    <div style={{ flex: 1, overflowY: "auto" as const, padding: "22px 26px 48px", background: C.ground }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" as const }}>
        {[
          { label: "Total", val: total, color: C.ink, border: C.border, bg: C.surface },
          { label: "Critical", val: data.counts.red, color: C.red, border: C.redLine, bg: C.redBg },
          { label: "At risk", val: data.counts.amber, color: C.amber, border: C.amberLine, bg: C.amberBg },
          { label: "On track", val: data.counts.green, color: C.green, border: C.greenLine, bg: C.greenBg },
        ].map(k => (
          <div key={k.label} style={{ flex: 1, minWidth: 100, background: k.bg, border: `1px solid ${k.border}`, borderRadius: 13, padding: "16px 18px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: k.color, marginBottom: 8, opacity: .75, fontFamily: C.FF }}>{k.label}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: k.color, fontFamily: C.FM, lineHeight: 1 }}>{k.val}</div>
          </div>
        ))}
        <div style={{ flex: 1.4, minWidth: 130, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, padding: "16px 18px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.inkFaint, marginBottom: 10, fontFamily: C.FF }}>Avg SPI / CPI</div>
          <div style={{ display: "flex", gap: 16 }}>
            <div><div style={{ fontSize: 10, color: C.inkFaint, fontFamily: C.FF }}>SPI</div><div style={{ fontSize: 22, fontWeight: 700, color: spiColor(avgSpi || null), fontFamily: C.FM }}>{fmt(total > 0 ? avgSpi : null)}</div></div>
            <div><div style={{ fontSize: 10, color: C.inkFaint, fontFamily: C.FF }}>CPI</div><div style={{ fontSize: 22, fontWeight: 700, color: spiColor(avgCpi || null), fontFamily: C.FM }}>{fmt(total > 0 ? avgCpi : null)}</div></div>
          </div>
        </div>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: C.FF }}>All projects</span>
          <span style={{ fontSize: 12, color: C.inkFaint, fontFamily: C.FF }}>sorted by risk</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.inkFaint, fontFamily: C.FF }}>{total} projects</span>
        </div>
        <div style={{ display: "flex", padding: "7px 20px", background: "#f7f8fa", borderBottom: `1px solid #eceef2`, fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.inkFaint, fontFamily: C.FF }}>
          <span style={{ flex: 1.8, minWidth: 160 }}>Project</span>
          <span style={{ width: 100 }}>Account</span>
          <span style={{ width: 90 }}>PM</span>
          <span style={{ width: 70 }}>Status</span>
          <span style={{ width: 52 }}>SPI</span>
          <span style={{ width: 52 }}>CPI</span>
          <span style={{ width: 60 }}>Burn</span>
          <span style={{ width: 60 }} />
        </div>
        {all.length === 0 && <div style={{ padding: "40px 20px", textAlign: "center" as const, color: C.inkFaint, fontFamily: C.FF, fontSize: 14 }}>No projects in scope.</div>}
        {Object.entries(METHODOLOGY_GROUPS).map(([methKey, cfg]) => {
          const methProjects = [...data.bands.red, ...data.bands.amber, ...data.bands.no_data, ...data.bands.green].filter(p => mkey(p) === methKey);
          if (methProjects.length === 0) return null;
          return (
            <React.Fragment key={methKey}>
              <div style={{ padding: "7px 20px", background: cfg.bg, borderBottom: `1px solid ${cfg.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, background: cfg.color, borderRadius: 4, padding: "1px 7px", fontFamily: C.FF, color: "#fff" }}>{cfg.shortLabel}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: cfg.color, fontFamily: C.FF }}>{cfg.label}</span>
                <span style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF }}>{methProjects.length} project{methProjects.length !== 1 ? "s" : ""} · {cfg.perf}</span>
              </div>
              {methProjects.map((p, i) => {
                const rc = ragColor(p.band);
                const isAgile = mkey(p) === "agile_scrum";
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", padding: "10px 20px", borderBottom: i < methProjects.length - 1 ? `1px solid #f8f9fb` : "none", background: i % 2 === 0 ? C.surface : "#fafbfc" }}>
                    <div style={{ flex: 1.8, minWidth: 160, display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: rc, flexShrink: 0, display: "inline-block" }} />
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, fontFamily: C.FF }}>{p.name}</span>
                    </div>
                    <span style={{ width: 100, fontSize: 13, color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, fontFamily: C.FF }}>{p.accountName ?? "—"}</span>
                    <span style={{ width: 90, fontSize: 13, color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, fontFamily: C.FF }}>{p.pmName}</span>
                    <span style={{ width: 70 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: rc, background: `${rc}18`, border: `1px solid ${rc}30`, borderRadius: 5, padding: "2px 6px", fontFamily: C.FF }}>{ragLabel(p.band)}</span>
                    </span>
                    {isAgile ? (
                      <>
                        <span style={{ width: 52, fontSize: 12, fontWeight: 700, color: p.velocity !== null ? (p.velocity > 0 ? C.green : C.red) : C.inkFaint, fontFamily: C.FM }} title="Velocity">{p.velocity !== null ? p.velocity.toFixed(0) : "—"}</span>
                        <span style={{ width: 52, fontSize: 12, fontWeight: 700, color: p.commitmentReliability !== null ? (p.commitmentReliability < 60 ? C.red : p.commitmentReliability < 80 ? C.amber : C.green) : C.inkFaint, fontFamily: C.FM }} title="Reliability">{p.commitmentReliability !== null ? Math.round(p.commitmentReliability) + "%" : "—"}</span>
                      </>
                    ) : (
                      <>
                        <span style={{ width: 52, fontSize: 13, fontWeight: 700, color: spiColor(p.spi), fontFamily: C.FM }}>{fmt(p.spi)}</span>
                        <span style={{ width: 52, fontSize: 13, fontWeight: 700, color: spiColor(p.cpi), fontFamily: C.FM }}>{fmt(p.cpi)}</span>
                      </>
                    )}
                    <span style={{ width: 60 }}>{!isAgile && p.burnPct !== null ? <BurnBar pct={p.burnPct} /> : <span style={{ color: C.inkFaint, fontSize: 12, fontFamily: C.FM }}>—</span>}</span>
                    <span style={{ width: 60, fontSize: 13, fontWeight: 600, color: C.blue, cursor: "pointer", textAlign: "right" as const, fontFamily: C.FF }} onClick={() => onSelect(p.id)}>Review →</span>
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── Add Action modal ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { v: "schedule",    l: "Schedule" },
  { v: "cost",        l: "Cost" },
  { v: "risk",        l: "Risk" },
  { v: "issue",       l: "Issue" },
  { v: "stakeholder", l: "Stakeholder" },
  { v: "scope_change",l: "Scope change" },
  { v: "quality",     l: "Quality" },
  { v: "governance",  l: "Governance" },
];

function AddActionModal({ project, onClose, onSuccess }: {
  project: TriageRow; onClose: () => void; onSuccess: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("schedule");
  const [priority, setPriority] = useState<"p1" | "p2" | "p3">("p2");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inp: React.CSSProperties = {
    width: "100%", boxSizing: "border-box" as const, border: `1.5px solid ${C.border}`,
    borderRadius: 9, padding: "9px 12px", fontSize: 13.5, color: C.ink,
    outline: "none", fontFamily: C.FF, background: C.surface,
  };

  const PRIS: { v: "p1" | "p2" | "p3"; l: string; sub: string; c: string }[] = [
    { v: "p1", l: "P1", sub: "≤2 days", c: C.red },
    { v: "p2", l: "P2", sub: "≤5 days", c: C.amber },
    { v: "p3", l: "P3", sub: "≤15 days", c: C.green },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    if (priority === "p1" && description.trim().length < 40) {
      setError("P1 items require a description of at least 40 characters."); return;
    }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/action-items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), category, priority, description: description.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Failed to create action item."); return; }
      onSuccess();
    } catch { setError("Network error — please try again."); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.42)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 500, maxWidth: "calc(100vw - 32px)", background: "#fff", borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,.2)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ background: `linear-gradient(135deg,${C.teal},${C.petrol})`, padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 18 }}>＋</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: C.FF }}>New action item</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.65)", fontFamily: C.FF }}>{project.name} · Assigned to PM: {project.pmName}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.18)", border: "none", color: "#fff", borderRadius: 8, width: 28, height: 28, cursor: "pointer", fontSize: 15, lineHeight: "28px", textAlign: "center" as const }}>×</button>
        </div>

        <form onSubmit={submit} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Title */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.inkFaint, display: "block", marginBottom: 5, fontFamily: C.FF }}>Title *</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} maxLength={200}
              placeholder="What needs to be done?" style={{ ...inp, height: 38 }} autoFocus />
          </div>

          {/* Category + Priority row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.inkFaint, display: "block", marginBottom: 5, fontFamily: C.FF }}>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inp, height: 38 }}>
                {CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.inkFaint, display: "block", marginBottom: 5, fontFamily: C.FF }}>Priority</label>
              <div style={{ display: "flex", gap: 6 }}>
                {PRIS.map(p => (
                  <button key={p.v} type="button" onClick={() => setPriority(p.v)} style={{
                    flex: 1, height: 38, border: `2px solid ${priority === p.v ? p.c : C.border}`,
                    borderRadius: 8, background: priority === p.v ? `${p.c}14` : "#fff",
                    cursor: "pointer", fontFamily: C.FF,
                  }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: priority === p.v ? p.c : C.inkFaint }}>{p.l}</div>
                    <div style={{ fontSize: 9.5, color: priority === p.v ? p.c : C.inkFaint, opacity: .7 }}>{p.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.inkFaint, display: "block", marginBottom: 5, fontFamily: C.FF }}>
              Description {priority === "p1" && <span style={{ color: C.red }}>* (min 40 chars for P1)</span>}
            </label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="What is the expected outcome? Include context for the PM."
              style={{ ...inp, resize: "vertical" as const, minHeight: 72 }} />
            {priority === "p1" && description.trim().length > 0 && (
              <div style={{ fontSize: 11, color: description.trim().length >= 40 ? C.green : C.amber, marginTop: 3, fontFamily: C.FF }}>
                {description.trim().length}/40 chars minimum
              </div>
            )}
          </div>

          {error && <div style={{ background: C.redBg, border: `1px solid ${C.redLine}`, borderRadius: 8, padding: "9px 13px", fontSize: 13, color: C.red, fontFamily: C.FF }}>{error}</div>}

          <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ height: 36, padding: "0 16px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", fontSize: 13, color: C.inkFaint, cursor: "pointer", fontFamily: C.FF }}>Cancel</button>
            <button type="submit" disabled={saving} style={{
              height: 36, padding: "0 20px", border: "none", borderRadius: 8,
              background: saving ? "#ccc" : `linear-gradient(135deg,${C.teal},${C.petrol})`,
              fontSize: 13, fontWeight: 600, color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontFamily: C.FF,
            }}>
              {saving ? "Creating…" : "Create action item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Escalation modal (unchanged) ─────────────────────────────────────────────────
type EscalateSeverity = "critical" | "high" | "medium";
function EscalateModal({ project, onClose, onSuccess }: { project: TriageRow; onClose: () => void; onSuccess: () => void }) {
  const [severity, setSeverity] = useState<EscalateSeverity>("high");
  const [title, setTitle] = useState(`${project.name} — escalation required`);
  const [situation, setSituation] = useState("");
  const [impact, setImpact] = useState("");
  const [support, setSupport] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const SELS: { value: EscalateSeverity; label: string; color: string }[] = [
    { value: "critical", label: "Critical", color: C.red },
    { value: "high", label: "High", color: C.amber },
    { value: "medium", label: "Medium", color: C.blue },
  ];

  const inp: React.CSSProperties = {
    width: "100%", boxSizing: "border-box" as const, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: "9px 12px", fontSize: 13.5, color: C.ink, outline: "none", resize: "vertical" as const, fontFamily: C.FF,
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/escalations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "project", projectId: project.id, severity,
          title: title.trim(), situation: situation.trim(),
          impact: impact.trim(), supportRequired: support.trim(),
          contextSnapshot: { spi: project.spi, cpi: project.cpi, rag: project.band, pmName: project.pmName },
        }),
      });
      if (res.status === 409) { setError("This project already has an open escalation."); return; }
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Failed"); return; }
      onSuccess();
    } catch { setError("Network error — please try again"); }
    finally { setSubmitting(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 520, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 48px)", background: "#fff", borderRadius: 18, boxShadow: "0 24px 80px rgba(0,0,0,.22)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg,${C.red},#b02020)`, padding: "18px 22px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚑</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: C.FF }}>Raise escalation</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", fontFamily: C.FF }}>{project.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.2)", border: "none", color: "#fff", borderRadius: 8, width: 28, height: 28, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <form onSubmit={submit} style={{ flex: 1, overflowY: "auto", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.inkFaint, display: "block", marginBottom: 5, fontFamily: C.FF }}>Severity *</label>
            <div style={{ display: "flex", gap: 8 }}>
              {SELS.map(s => (
                <button key={s.value} type="button" onClick={() => setSeverity(s.value)} style={{
                  flex: 1, height: 34, border: `2px solid ${severity === s.value ? s.color : C.border}`,
                  borderRadius: 8, background: severity === s.value ? `${s.color}14` : "#fff",
                  fontSize: 12.5, fontWeight: severity === s.value ? 700 : 500, color: severity === s.value ? s.color : C.inkFaint, cursor: "pointer", fontFamily: C.FF,
                }}>{s.label}</button>
              ))}
            </div>
          </div>
          <div><label style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.inkFaint, display: "block", marginBottom: 5, fontFamily: C.FF }}>Title *</label><input required value={title} onChange={e => setTitle(e.target.value)} maxLength={120} style={{ ...inp, height: 38, resize: "none" as const }} /></div>
          <div><label style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.inkFaint, display: "block", marginBottom: 5, fontFamily: C.FF }}>Situation *</label><textarea required minLength={30} rows={3} value={situation} onChange={e => setSituation(e.target.value)} placeholder="What is happening? Include key metrics and timeline…" style={inp} /></div>
          <div><label style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.inkFaint, display: "block", marginBottom: 5, fontFamily: C.FF }}>Business impact *</label><textarea required minLength={10} rows={2} value={impact} onChange={e => setImpact(e.target.value)} placeholder="What is the business impact if not resolved?" style={inp} /></div>
          <div><label style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.inkFaint, display: "block", marginBottom: 5, fontFamily: C.FF }}>Support required from DH *</label><textarea required minLength={10} rows={2} value={support} onChange={e => setSupport(e.target.value)} placeholder="What decision or action do you need from the Delivery Head?" style={inp} /></div>
          {error && <div style={{ background: C.redBg, border: `1px solid ${C.redLine}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.red, fontFamily: C.FF }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ height: 36, padding: "0 16px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", fontSize: 13, color: C.inkFaint, cursor: "pointer", fontFamily: C.FF }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{ height: 36, padding: "0 20px", border: "none", borderRadius: 8, background: submitting ? "#ccc" : `linear-gradient(135deg,${C.red},#b02020)`, fontSize: 13, fontWeight: 600, color: "#fff", cursor: submitting ? "not-allowed" : "pointer", fontFamily: C.FF }}>
              {submitting ? "Raising…" : "Raise escalation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delivery Metrics tab ──────────────────────────────────────────────────────────
const PIE_COLORS = [C.teal, C.amber, C.red, C.grey, C.blue, "#7c3aed"];

function MetricKpi({ label, val, sub, color }: { label: string; val: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, padding: "15px 18px", flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.inkFaint, marginBottom: 8, fontFamily: C.FF }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color ?? C.ink, fontFamily: C.FM, lineHeight: 1, marginBottom: sub ? 4 : 0 }}>{val}</div>
      {sub && <div style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF }}>{sub}</div>}
    </div>
  );
}

function DeliveryMetrics({ data }: { data: TriageData }) {
  const all = useMemo(() => [...data.bands.red, ...data.bands.amber, ...data.bands.no_data, ...data.bands.green], [data]);

  const withSpi = all.filter(p => p.spi !== null);
  const withCpi = all.filter(p => p.cpi !== null);
  const avgSpi = withSpi.length > 0 ? withSpi.reduce((s, p) => s + (p.spi ?? 0), 0) / withSpi.length : null;
  const avgCpi = withCpi.length > 0 ? withCpi.reduce((s, p) => s + (p.cpi ?? 0), 0) / withCpi.length : null;

  const totalBudget   = data.totalBudget ?? 0;
  const totalSpent    = data.totalSpentAll ?? 0;
  const totalRisks    = all.reduce((s, p) => s + p.highRisks, 0);
  const totalIssues   = all.reduce((s, p) => s + p.criticalIssues, 0);
  const totalActions  = all.reduce((s, p) => s + p.openActionItems, 0);
  const burnPct       = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : null;
  const onTimePct     = all.length > 0 ? Math.round(all.filter(p => p.spi !== null && (p.spi ?? 0) >= 0.85).length / all.length * 100) : null;
  const revenueAtRisk = all.filter(p => p.band !== "green").reduce((s, p) => s + (p.budget ?? 0), 0);

  type Tile = { label: string; value: string; sub: string; color: string; bg: string; border: string };
  const tiles: Tile[] = [
    { label: "Active Projects",   value: String(all.length),                                                           sub: "In your scope",              color: C.teal,    bg: "#e8f5f6",  border: "#b2dde0" },
    { label: "Critical",          value: String(data.counts.red),                                                      sub: "Red health",                 color: C.red,     bg: C.redBg,    border: C.redLine },
    { label: "At Risk",           value: String(data.counts.amber),                                                    sub: "Amber health",               color: C.amber,   bg: C.amberBg,  border: C.amberLine },
    { label: "On Track",          value: String(data.counts.green),                                                    sub: "Green health",               color: C.green,   bg: C.greenBg,  border: C.greenLine },
    { label: "Avg SPI",           value: avgSpi !== null ? avgSpi.toFixed(2) : "—",                                   sub: "Schedule performance",       color: spiColor(avgSpi), bg: C.surface, border: C.border },
    { label: "Avg CPI",           value: avgCpi !== null ? avgCpi.toFixed(2) : "—",                                   sub: "Cost performance",           color: spiColor(avgCpi), bg: C.surface, border: C.border },
    { label: "On-Time Delivery",  value: onTimePct !== null ? `${onTimePct}%` : "—",                                  sub: "Projects with SPI ≥ 0.85",  color: onTimePct === null ? C.inkFaint : onTimePct < 60 ? C.red : onTimePct < 75 ? C.amber : C.green, bg: C.surface, border: C.border },
    { label: "Portfolio Value",   value: totalBudget > 0 ? fmtMoney(totalBudget) : "—",                               sub: "Total budget",               color: C.ink,     bg: C.surface,  border: C.border },
    { label: "Spent to Date",     value: totalSpent > 0 ? fmtMoney(totalSpent) : "—",                                 sub: burnPct !== null ? `${burnPct}% burn` : "Total spent", color: C.ink, bg: C.surface, border: C.border },
    { label: "Revenue at Risk",   value: revenueAtRisk > 0 ? fmtMoney(revenueAtRisk) : "$0",                          sub: "Critical + At Risk budget",  color: revenueAtRisk > 0 ? C.red : C.green, bg: revenueAtRisk > 0 ? C.redBg : C.greenBg, border: revenueAtRisk > 0 ? C.redLine : C.greenLine },
    { label: "High / VH Risks",   value: String(totalRisks),                                                           sub: "Open across portfolio",      color: totalRisks > 0 ? C.amber : C.inkFaint, bg: C.surface, border: C.border },
    { label: "Critical Issues",   value: String(totalIssues),                                                          sub: "Open, critical/high sev.",   color: totalIssues > 0 ? C.red : C.inkFaint, bg: C.surface, border: C.border },
    { label: "Open Actions",      value: String(totalActions),                                                          sub: "DM commitments to PMs",      color: totalActions > 0 ? C.blue : C.inkFaint, bg: C.surface, border: C.border },
    { label: "Overdue Actions",   value: String(data.overdueActionItems),                                               sub: "Need chasing",               color: data.overdueActionItems > 0 ? C.red : C.inkFaint, bg: data.overdueActionItems > 0 ? C.redBg : C.surface, border: data.overdueActionItems > 0 ? C.redLine : C.border },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto" as const, padding: "22px 26px 48px", background: C.ground }}>

      {/* Portfolio KPI tiles */}
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.inkFaint, fontFamily: C.FF, marginBottom: 12 }}>
        Portfolio Overview
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12, marginBottom: 28 }}>
        {tiles.map(t => (
          <div key={t.label} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: t.color, opacity: .75, marginBottom: 8, fontFamily: C.FF }}>{t.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: t.color, fontFamily: C.FM, lineHeight: 1, marginBottom: 4 }}>{t.value}</div>
            <div style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF }}>{t.sub}</div>
          </div>
        ))}
      </div>

      {/* By Methodology tiles */}
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.inkFaint, fontFamily: C.FF, marginBottom: 12 }}>
        By Methodology
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginBottom: 28 }}>
        {Object.entries(METHODOLOGY_GROUPS).map(([methKey, cfg]) => {
          const mp = all.filter(p => mkey(p) === methKey);
          if (mp.length === 0) return null;
          const redC = mp.filter(p => p.band === "red").length;
          const amberC = mp.filter(p => p.band === "amber").length;
          const greenC = mp.filter(p => p.band === "green").length;
          const isAgile = methKey === "agile_scrum";
          const withVel = mp.filter(p => p.velocity !== null);
          const withRel = mp.filter(p => p.commitmentReliability !== null);
          const avgVel = withVel.length ? withVel.reduce((s, p) => s + (p.velocity ?? 0), 0) / withVel.length : null;
          const avgRel = withRel.length ? withRel.reduce((s, p) => s + (p.commitmentReliability ?? 0), 0) / withRel.length : null;
          const withSpi = mp.filter(p => p.spi !== null);
          const withCpi = mp.filter(p => p.cpi !== null);
          const avgMS = withSpi.length ? withSpi.reduce((s, p) => s + (p.spi ?? 0), 0) / withSpi.length : null;
          const avgMC = withCpi.length ? withCpi.reduce((s, p) => s + (p.cpi ?? 0), 0) / withCpi.length : null;
          return (
            <div key={methKey} style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}`, borderRadius: 13, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: cfg.color, color: "#fff", fontFamily: C.FF }}>{cfg.shortLabel}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color, fontFamily: C.FF }}>{cfg.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: C.inkFaint, fontFamily: C.FF }}>{mp.length} projects</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {[{ v: redC, l: "Critical", c: C.red, bg: C.redBg }, { v: amberC, l: "At Risk", c: C.amber, bg: C.amberBg }, { v: greenC, l: "On Track", c: C.green, bg: C.greenBg }].map(k => (
                  <div key={k.l} style={{ flex: 1, textAlign: "center" as const, background: k.bg, borderRadius: 7, padding: "6px 4px" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: k.c, fontFamily: C.FM, lineHeight: 1 }}>{k.v}</div>
                    <div style={{ fontSize: 9.5, color: k.c, fontFamily: C.FF, marginTop: 3 }}>{k.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                {isAgile ? (
                  <>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: C.FF, marginBottom: 2 }}>Avg Velocity</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: avgVel !== null ? cfg.color : C.inkFaint, fontFamily: C.FM, lineHeight: 1 }}>{avgVel !== null ? avgVel.toFixed(0) + " pts" : "—"}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: C.FF, marginBottom: 2 }}>Avg Reliability</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: avgRel !== null ? (avgRel < 60 ? C.red : avgRel < 80 ? C.amber : C.green) : C.inkFaint, fontFamily: C.FM, lineHeight: 1 }}>{avgRel !== null ? Math.round(avgRel) + "%" : "—"}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: C.FF, marginBottom: 2 }}>Avg SPI</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: spiColor(avgMS), fontFamily: C.FM, lineHeight: 1 }}>{avgMS !== null ? avgMS.toFixed(2) : "—"}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: C.FF, marginBottom: 2 }}>Avg CPI</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: spiColor(avgMC), fontFamily: C.FM, lineHeight: 1 }}>{avgMC !== null ? avgMC.toFixed(2) : "—"}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────────
export function DmTriageClient({ data, userName, userRole }: { data: TriageData; userName: string; userRole?: string }) {
  const [tab, setTab] = useState<"triage" | "health" | "metrics">("triage");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [escalatedIds, setEscalatedIds] = useState<Set<string>>(new Set());
  const [escalateTarget, setEscalateTarget] = useState<TriageRow | null>(null);
  const [actionTarget, setActionTarget] = useState<TriageRow | null>(null);
  const [addedActionsMap, setAddedActionsMap] = useState<Record<string, number>>({});

  const q = searchQ.toLowerCase();
  const filter = (rows: TriageRow[]) =>
    !q ? rows : rows.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.accountName ?? "").toLowerCase().includes(q) ||
      p.pmName.toLowerCase().includes(q)
    );

  const allProjects = [...data.bands.red, ...data.bands.amber, ...data.bands.no_data, ...data.bands.green];
  const totalActions = allProjects.reduce((s, p) => s + p.openActionItems, 0);
  const uniqueAccounts = new Set(allProjects.map(p => p.accountId).filter(Boolean)).size;
  const portfolioBudget = data.totalBudget ?? 0;
  const portfolioSpent  = data.totalSpentAll ?? 0;
  const portfolioBurnPct = portfolioBudget > 0 ? Math.round((portfolioSpent / portfolioBudget) * 100) : null;

  function openReview(id: string) { setReviewId(id); }

  const tabBtn = (key: "triage" | "health" | "metrics", label: string) => (
    <button key={key} onClick={() => setTab(key)} style={{
      padding: "12px 16px 11px", border: "none", background: "transparent",
      fontSize: 13.5, fontWeight: 600, fontFamily: C.FF,
      color: tab === key ? "#fff" : "rgba(255,255,255,.45)",
      borderBottom: tab === key ? "2px solid #fff" : "2px solid transparent",
      cursor: "pointer",
    }}>{label}</button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px)", overflow: "hidden", fontFamily: C.FF }}>

      {/* Tab bar */}
      <div style={{ background: C.tabBar, borderBottom: "1px solid rgba(255,255,255,.1)", padding: "0 22px", display: "flex", alignItems: "center", flexShrink: 0 }}>
        {tabBtn("triage", "Attention queue")}
        {tabBtn("health", "Portfolio overview")}
        {tabBtn("metrics", "Delivery metrics")}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, paddingRight: 4 }}>
          {data.counts.red > 0 && <span style={{ fontSize: 11.5, fontWeight: 600, color: C.red, background: C.redBg, borderRadius: 4, padding: "2px 8px", fontFamily: C.FF }}>{data.counts.red} critical</span>}
          {data.counts.amber > 0 && <span style={{ fontSize: 11.5, fontWeight: 600, color: C.amber, background: C.amberBg, borderRadius: 4, padding: "2px 8px", fontFamily: C.FF }}>{data.counts.amber} at risk</span>}
          {data.overdueActionItems > 0 && <span style={{ fontSize: 11.5, fontWeight: 600, color: C.amber, background: C.amberBg, borderRadius: 4, padding: "2px 8px", fontFamily: C.FF }}>{data.overdueActionItems} overdue actions</span>}
          <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.45)", fontFamily: C.FF }}>{data.counts.total} projects</span>
        </div>
      </div>

      {/* ── Triage tab ── */}
      {tab === "triage" && (
        <div style={{ flex: 1, overflowY: "auto" as const, padding: "22px 26px 48px", background: C.ground }}>

          {/* Pulse cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, marginBottom: 22 }}>
            <PulseCard title="Portfolio health" icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 12h4l2 6 4-14 2 8h6" stroke={C.ink3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            }>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: C.red, fontFamily: C.FM }}>{data.counts.red}</span>
                <span style={{ fontSize: 13, color: C.ink3, fontWeight: 600, fontFamily: C.FF }}>critical</span>
                <span style={{ color: C.borderSoft, margin: "0 4px" }}>·</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: C.amber, fontFamily: C.FM }}>{data.counts.amber}</span>
                <span style={{ fontSize: 13, color: C.ink3, fontWeight: 600, fontFamily: C.FF }}>at risk</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, overflow: "hidden", display: "flex", background: C.borderSoft }}>
                <span style={{ width: `${data.counts.total ? data.counts.red / data.counts.total * 100 : 0}%`, background: C.red }} />
                <span style={{ width: `${data.counts.total ? data.counts.amber / data.counts.total * 100 : 0}%`, background: C.amber }} />
                <span style={{ width: `${data.counts.total ? data.counts.no_data / data.counts.total * 100 : 0}%`, background: C.grey }} />
                <span style={{ flex: 1, background: C.green }} />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                {[{c:C.red,l:`${data.counts.red} Red`},{c:C.amber,l:`${data.counts.amber} Amber`},{c:C.green,l:`${data.counts.green} Green`}].map(k => (
                  <span key={k.l} style={{ fontSize: 11, fontWeight: 600, color: k.c, display: "flex", alignItems: "center", gap: 4, fontFamily: C.FF }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: k.c, display: "inline-block" }} />{k.l}
                  </span>
                ))}
              </div>
            </PulseCard>

            <PulseCard title="Financial exposure" icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke={C.ink3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            }>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { l: "Portfolio value", v: portfolioBudget > 0 ? fmtMoney(portfolioBudget) : "—", c: C.ink },
                  { l: "Spent to date", v: portfolioSpent > 0 ? fmtMoney(portfolioSpent) : "—", c: C.ink },
                  { l: "Portfolio burn", v: portfolioBurnPct !== null ? `${portfolioBurnPct}%` : "—", c: portfolioBurnPct && portfolioBurnPct > 80 ? C.red : portfolioBurnPct && portfolioBurnPct > 65 ? C.amber : C.ink },
                ].map(r => (
                  <div key={r.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, color: C.ink2, fontFamily: C.FF }}>{r.l}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: r.c, fontFamily: C.FM }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </PulseCard>

          </div>

          {/* Methodology mix strip */}
          <MethodologyMixStrip rows={allProjects} />

          {/* Search */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", height: 36, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "0 12px", gap: 8, maxWidth: 300 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke={C.inkFaint} strokeWidth="2" /><path d="M20 20l-3-3" stroke={C.inkFaint} strokeWidth="2" strokeLinecap="round" /></svg>
              <input type="text" placeholder="Filter by name, account, or PM…" value={searchQ} onChange={e => setSearchQ(e.target.value)}
                style={{ border: "none", outline: "none", fontSize: 13, color: C.ink, background: "transparent", flex: 1, fontFamily: C.FF, minWidth: 180 }} />
            </div>
            <span style={{ fontSize: 13, color: C.inkFaint, fontFamily: C.FF }}>Sorted by attention score</span>
          </div>

          {allProjects.length === 0 && (
            <div style={{ textAlign: "center" as const, padding: "60px 24px", color: C.inkFaint }}>
              <p style={{ fontSize: 16, fontWeight: 500, margin: "0 0 8px", fontFamily: C.FF }}>No projects in scope</p>
              <p style={{ fontSize: 14, margin: 0, fontFamily: C.FF }}>Contact an admin to assign accounts to your profile.</p>
            </div>
          )}

          {Object.keys(METHODOLOGY_GROUPS).map(methKey => (
            <MethodologySection
              key={methKey}
              methKey={methKey}
              bands={{
                red:     data.bands.red.filter(p => mkey(p) === methKey),
                amber:   data.bands.amber.filter(p => mkey(p) === methKey),
                no_data: data.bands.no_data.filter(p => mkey(p) === methKey),
                green:   data.bands.green.filter(p => mkey(p) === methKey),
              }}
              onReview={openReview}
              onEscalate={p => setEscalateTarget(p)}
              onAddAction={p => setActionTarget(p)}
              escalatedIds={escalatedIds}
              addedActionsMap={addedActionsMap}
              filter={filter}
            />
          ))}

          {q && filter(allProjects).length === 0 && (
            <div style={{ textAlign: "center" as const, padding: "40px 24px", color: C.inkFaint, fontFamily: C.FF, fontSize: 14 }}>No projects match "{searchQ}"</div>
          )}
        </div>
      )}

      {/* ── Health overview tab ── */}
      {tab === "health"   && <HealthOverview data={data} onSelect={openReview} userRole={userRole} />}
      {tab === "metrics"  && <DeliveryMetrics data={data} />}

      {/* Review panel */}
      {reviewId && (
        <DrillDownPanel projectId={reviewId} onClose={() => setReviewId(null)} />
      )}

      {/* Add action modal */}
      {actionTarget && (
        <AddActionModal
          project={actionTarget}
          onClose={() => setActionTarget(null)}
          onSuccess={() => {
            setAddedActionsMap(prev => ({ ...prev, [actionTarget.id]: (prev[actionTarget.id] ?? 0) + 1 }));
            setActionTarget(null);
          }}
        />
      )}

      {/* Escalation modal */}
      {escalateTarget && (
        <EscalateModal
          project={escalateTarget}
          onClose={() => setEscalateTarget(null)}
          onSuccess={() => { setEscalatedIds(prev => new Set([...prev, escalateTarget.id])); setEscalateTarget(null); }}
        />
      )}
    </div>
  );
}
