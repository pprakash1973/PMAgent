"use client";
import React, { useState } from "react";
import { DrillDownPanel } from "./drill-down-panel";

type TriageRow = {
  id: string; name: string; accountId: string | null; accountName: string | null;
  programId: string | null; programName: string | null; pmId: string; pmName: string;
  healthStatus: string; band: "red" | "amber" | "no_data" | "green"; attentionScore: number;
  spi: number | null; cpi: number | null; compositeScore: number | null;
  openActionItems: number; highRisks: number; criticalIssues: number;
  nextMilestone: { name: string; dueDate: string } | null; phase: string; lastReportDate: string | null;
  artifactsGenerated: number; hoursSaved: number; dollarsSaved: number;
};
type TriageData = {
  bands: { red: TriageRow[]; amber: TriageRow[]; no_data: TriageRow[]; green: TriageRow[] };
  counts: { red: number; amber: number; no_data: number; green: number; total: number };
  overdueActionItems: number;
  portfolioProd?: { artifactsGenerated: number; hoursSaved: number; dollarsSaved: number };
};

const C = {
  bg: "#F2F7F8",
  tabBar: "#006E74",
  border: "rgba(255,255,255,.10)",
  borderLight: "#D7E0E3",
  red: "#c5392b", redBg: "rgba(197,57,43,.10)", redBorder: "rgba(197,57,43,.25)",
  amber: "#c17d12", amberBg: "rgba(193,125,18,.10)", amberBorder: "rgba(193,125,18,.20)",
  green: "#01B27C", greenBg: "rgba(1,178,124,.10)", greenBorder: "rgba(1,178,124,.22)",
  noData: "#7A7480", noDataBg: "rgba(122,116,128,.10)", noDataBorder: "rgba(122,116,128,.22)",
  blue: "#0097AC",
  text: "#231F20", textMuted: "#64748b", textFaint: "#94a3b8",
  panelBg: "#fff",
  FF: "'Aptos','Calibri',system-ui,sans-serif",
  FM: "'Consolas','Courier New',monospace",
};

function ragColor(band: string) {
  if (band === "red") return C.red;
  if (band === "amber") return C.amber;
  if (band === "green") return C.green;
  return C.noData;
}
function ragLabel(band: string) {
  if (band === "red") return "Critical";
  if (band === "amber") return "At risk";
  if (band === "no_data") return "No data";
  return "On track";
}
function spiColor(v: number | null) {
  if (v === null) return C.textFaint;
  if (v < 0.85) return C.red;
  if (v < 0.95) return C.amber;
  return C.green;
}
function fmt(v: number | null) { return v === null ? "—" : v.toFixed(2); }
function clamp(lo: number, hi: number, v: number) { return Math.max(lo, Math.min(hi, v)); }
function pct(v: number | null) { return v === null ? null : clamp(0, 100, Math.round(v * 100)); }

function pmScore(spi: number | null, cpi: number | null, rag: string): number {
  const norm = (v: number) => Math.min(Math.max((v - 0.6) / 0.5, 0), 1);
  const spiN = spi !== null ? norm(spi) : null;
  const cpiN = cpi !== null ? norm(cpi) : null;
  const ragN = rag === "green" ? 1 : rag === "amber" ? 0.5 : 0.1;
  if (spiN !== null && cpiN !== null) return Math.round((spiN * 0.35 + cpiN * 0.30 + ragN * 0.35) * 100);
  if (spiN !== null) return Math.round((spiN * 0.5 + ragN * 0.5) * 100);
  if (cpiN !== null) return Math.round((cpiN * 0.5 + ragN * 0.5) * 100);
  return Math.round(ragN * 100);
}
function pmLabel(s: number) { return s >= 80 ? "High" : s >= 60 ? "Moderate" : s >= 40 ? "Low" : "Critical"; }
function pmColor(s: number): string { return s >= 80 ? C.green : s >= 60 ? C.blue : s >= 40 ? C.amber : C.red; }

function scoreColor(s: number) { return s >= 60 ? C.red : s >= 30 ? C.amber : C.green; }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, color, bg, border }: {
  title: string; value: number | string; sub?: string;
  color: string; bg: string; border: string;
}) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 13, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, color, fontWeight: 600, marginBottom: 8, opacity: .75, fontFamily: C.FF }}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color, fontFamily: C.FM, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.textFaint, marginTop: 5, fontFamily: C.FF }}>{sub}</div>}
    </div>
  );
}

function Pill({ count, label, activeColor, activeBg }: {
  count: number; label: string; activeColor: string; activeBg: string;
}) {
  const active = count > 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
      background: active ? activeBg : "#f1f4f8",
      color: active ? activeColor : "#c4c9d4",
      fontFamily: C.FF,
    }}>
      {count} {label}
    </span>
  );
}

function ProjectTile({ p, onReview, onEscalate, escalated }: {
  p: TriageRow;
  onReview: () => void;
  onEscalate: () => void;
  escalated: boolean;
}) {
  const rc = ragColor(p.band);
  const rl = ragLabel(p.band);
  const sc = scoreColor(p.attentionScore);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: C.panelBg,
        border: `1px solid ${hovered ? "#b8c4cc" : C.borderLight}`,
        borderRadius: 14,
        borderTop: `3px solid ${rc}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "border-color .15s, box-shadow .15s",
        boxShadow: hovered ? "0 4px 18px rgba(0,0,0,.09)" : "none",
      }}
    >
      <div style={{ padding: "15px 16px 0" }}>
        {/* Name + badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{
            flex: 1, fontSize: 14, fontWeight: 700, color: C.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
            fontFamily: C.FF,
          }}>{p.name}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
            background: `${rc}16`, color: rc, border: `1px solid ${rc}28`,
            whiteSpace: "nowrap" as const, flexShrink: 0, letterSpacing: ".04em", fontFamily: C.FF,
          }}>{rl}</span>
        </div>

        {/* Account · phase */}
        <div style={{ fontSize: 11, color: C.textFaint, fontFamily: C.FM, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
          {p.accountName ?? "Unassigned"} · {p.phase.replace(/_/g, " ")}
        </div>

        {/* Attention score */}
        <div style={{ marginBottom: 11 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: C.textMuted, fontFamily: C.FF }}>Attention score</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: sc, fontFamily: C.FM }}>{p.attentionScore}</span>
          </div>
          <div style={{ height: 3, borderRadius: 99, background: "#eef0f3" }}>
            <div style={{ height: "100%", width: `${p.attentionScore}%`, background: sc, borderRadius: 99 }} />
          </div>
        </div>

        {/* SPI / CPI */}
        {(p.spi !== null || p.cpi !== null) && (
          <div style={{ display: "flex", gap: 10, marginBottom: 11 }}>
            {p.spi !== null && (
              <span style={{ fontSize: 11, color: C.textMuted, fontFamily: C.FF }}>
                SPI <span style={{ fontFamily: C.FM, fontWeight: 700, color: spiColor(p.spi) }}>{fmt(p.spi)}</span>
              </span>
            )}
            {p.cpi !== null && (
              <span style={{ fontSize: 11, color: C.textMuted, fontFamily: C.FF }}>
                CPI <span style={{ fontFamily: C.FM, fontWeight: 700, color: spiColor(p.cpi) }}>{fmt(p.cpi)}</span>
              </span>
            )}
          </div>
        )}

        {/* Count pills */}
        <div style={{ display: "flex", gap: 5, marginBottom: 11, flexWrap: "wrap" as const }}>
          <Pill count={p.highRisks} label="risks" activeColor={C.amber} activeBg="#fdf3e0" />
          <Pill count={p.criticalIssues} label="issues" activeColor={C.red} activeBg="#fff1f0" />
          <Pill count={p.openActionItems} label="actions" activeColor={C.blue} activeBg="#e8f5f8" />
        </div>
      </div>

      {/* Next milestone */}
      {p.nextMilestone ? (
        <div style={{ margin: "0 16px 11px", background: C.bg, borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, fontFamily: C.FF }}>
            📅 {p.nextMilestone.name}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.blue, fontFamily: C.FM, flexShrink: 0, marginLeft: 8 }}>
            {fmtDate(p.nextMilestone.dueDate)}
          </span>
        </div>
      ) : (
        <div style={{ margin: "0 16px 11px", height: 28 }} />
      )}

      {/* Footer */}
      <div style={{ marginTop: "auto", borderTop: `1px solid #f0f2f5`, padding: "9px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: C.textMuted, fontFamily: C.FF, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.pmName}</span>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }}>
          {p.band === "red" && !escalated && (
            <button
              onClick={onEscalate}
              style={{
                height: 28, padding: "0 10px", fontSize: 11, fontWeight: 600,
                color: C.red, background: `${C.red}10`, border: `1px solid ${C.red}28`,
                borderRadius: 7, cursor: "pointer", fontFamily: C.FF,
              }}
            >Escalate</button>
          )}
          {escalated && (
            <span style={{ fontSize: 11, color: C.green, fontWeight: 600, fontFamily: C.FF }}>✓ Escalated</span>
          )}
          <button
            onClick={onReview}
            style={{
              height: 28, padding: "0 13px", fontSize: 12, fontWeight: 600,
              color: "#fff", background: C.tabBar, border: "none",
              borderRadius: 7, cursor: "pointer", fontFamily: C.FF,
            }}
          >Review →</button>
        </div>
      </div>
    </div>
  );
}

function BandSection({ label, dotColor, projects, onReview, onEscalate, escalatedIds }: {
  label: string; dotColor: string; projects: TriageRow[];
  onReview: (id: string) => void; onEscalate: (p: TriageRow) => void;
  escalatedIds: Set<string>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (projects.length === 0) return null;

  return (
    <div style={{ marginBottom: 26 }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13, cursor: "pointer", userSelect: "none" as const }}
      >
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: dotColor, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: C.FF }}>{label}</span>
        <span style={{ fontSize: 12, color: C.textFaint, fontFamily: C.FF }}>
          {projects.length} project{projects.length !== 1 ? "s" : ""}
        </span>
        <span style={{ marginLeft: "auto", color: C.textFaint, fontSize: 13 }}>{collapsed ? "▸" : "▾"}</span>
      </div>
      {!collapsed && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }}>
          {projects.map(p => (
            <ProjectTile
              key={p.id}
              p={p}
              onReview={() => onReview(p.id)}
              onEscalate={() => onEscalate(p)}
              escalated={escalatedIds.has(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Health Overview tab (unchanged) ────────────────────────────────────────────

function HealthOverview({ data, onSelect, userRole }: { data: TriageData; onSelect: (id: string) => void; userRole?: string }) {
  const all = [...data.bands.red, ...data.bands.amber, ...data.bands.no_data, ...data.bands.green];
  const total = data.counts.total;
  const avgSpi = all.length > 0 ? all.filter(p => p.spi !== null).reduce((s, p) => s + (p.spi ?? 0), 0) / Math.max(1, all.filter(p => p.spi !== null).length) : null;
  const avgCpi = all.length > 0 ? all.filter(p => p.cpi !== null).reduce((s, p) => s + (p.cpi ?? 0), 0) / Math.max(1, all.filter(p => p.cpi !== null).length) : null;

  const kpiCard = (title: string, value: number | string, subtitle: string | null, color: string, border: string, bg: string = C.panelBg) => (
    <div style={{ flex: 1, minWidth: 130, background: bg, border: `1px solid ${border}`, borderRadius: 13, padding: "16px 18px" }}>
      <div style={{ font: `600 10px ${C.FF}`, letterSpacing: ".07em", textTransform: "uppercase" as const, color, marginBottom: 8, opacity: .7 }}>{title}</div>
      <div style={{ font: `700 33px ${C.FM}`, color, lineHeight: 1 }}>{value}</div>
      {subtitle && <div style={{ font: `400 12px ${C.FF}`, color: C.textFaint, marginTop: 4 }}>{subtitle}</div>}
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px 48px", background: C.bg }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" as const }}>
        {kpiCard("Total Projects", total, null, "#fff", C.borderLight, "#003C51")}
        {kpiCard("At Risk", data.counts.red, total ? `${Math.round(data.counts.red / total * 100)}% of portfolio` : null, C.red, "rgba(197,57,43,.28)")}
        {kpiCard("Needs Watch", data.counts.amber, total ? `${Math.round(data.counts.amber / total * 100)}% of portfolio` : null, C.amber, "rgba(193,125,18,.25)")}
        {kpiCard("On Track", data.counts.green, total ? `${Math.round(data.counts.green / total * 100)}% of portfolio` : null, C.green, "rgba(21,138,90,.25)")}
        <div style={{ flex: 1, minWidth: 130, background: C.panelBg, border: `1px solid ${C.borderLight}`, borderRadius: 13, padding: "16px 18px" }}>
          <div style={{ font: `600 10px ${C.FF}`, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.textFaint, marginBottom: 10 }}>Avg SPI / CPI</div>
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <div><div style={{ font: `400 10px ${C.FF}`, color: C.textFaint }}>SPI</div><div style={{ font: `700 23px ${C.FM}`, color: spiColor(avgSpi), lineHeight: 1.1 }}>{fmt(avgSpi)}</div></div>
            <div style={{ width: 1, background: "#eef0f3" }} />
            <div><div style={{ font: `400 10px ${C.FF}`, color: C.textFaint }}>CPI</div><div style={{ font: `700 23px ${C.FM}`, color: spiColor(avgCpi), lineHeight: 1.1 }}>{fmt(avgCpi)}</div></div>
          </div>
        </div>
        <div style={{ flex: 1.6, minWidth: 180, background: C.panelBg, border: `1px solid ${C.borderLight}`, borderRadius: 13, padding: "16px 18px" }}>
          <div style={{ font: `600 10px ${C.FF}`, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.textFaint, marginBottom: 10 }}>RAG Distribution</div>
          {total > 0 && (
            <div style={{ height: 10, borderRadius: 5, overflow: "hidden", display: "flex", marginBottom: 8 }}>
              <div style={{ background: C.red, width: `${data.counts.red / total * 100}%`, transition: "width .4s" }} />
              <div style={{ background: C.amber, width: `${data.counts.amber / total * 100}%`, transition: "width .4s" }} />
              <div style={{ background: C.green, width: `${(data.counts.green + data.counts.no_data) / total * 100}%`, transition: "width .4s" }} />
            </div>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ font: `500 12px ${C.FF}`, color: C.red }}>● {data.counts.red} Red</span>
            <span style={{ font: `500 12px ${C.FF}`, color: C.amber }}>● {data.counts.amber} Amber</span>
            <span style={{ font: `500 12px ${C.FF}`, color: C.green }}>● {data.counts.green} Green</span>
          </div>
        </div>
        {(data.portfolioProd?.artifactsGenerated ?? 0) > 0 && (
          <div style={{ flex: 1, minWidth: 150, background: `rgba(1,178,124,.06)`, border: `1px solid rgba(1,178,124,.22)`, borderRadius: 13, padding: "16px 18px" }}>
            <div style={{ font: `600 10px ${C.FF}`, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.green, marginBottom: 8, opacity: .8 }}>AI Effort Saved</div>
            <div style={{ font: `700 28px ${C.FM}`, color: C.green, lineHeight: 1 }}>{data.portfolioProd!.hoursSaved}h</div>
            <div style={{ font: `400 12px ${C.FF}`, color: C.textFaint, marginTop: 4 }}>${(data.portfolioProd!.dollarsSaved).toLocaleString()} saved · {data.portfolioProd!.artifactsGenerated} artifacts</div>
          </div>
        )}
      </div>

      {/* All projects table */}
      <div style={{ background: C.panelBg, border: `1px solid ${C.borderLight}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid #f0f2f5`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ font: `700 14px ${C.FF}`, color: C.text }}>All Projects</span>
          <span style={{ font: `400 12px ${C.FF}`, color: C.textFaint }}>· sorted by risk</span>
          <div style={{ flex: 1 }} />
          <span style={{ font: `400 12px ${C.FF}`, color: C.textFaint }}>{total} projects</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", padding: "8px 20px", background: "#f7f8fa", borderBottom: "1px solid #eceef2", font: `700 10.5px ${C.FF}`, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.textFaint }}>
          <span style={{ flex: 1.8, minWidth: 160 }}>Project</span>
          <span style={{ width: 100 }}>Account</span>
          <span style={{ width: 90 }}>PM</span>
          <span style={{ width: 70 }}>Status</span>
          <span style={{ width: 54 }}>SPI</span>
          <span style={{ width: 54 }}>CPI</span>
          <span style={{ width: 100 }}>PM Score</span>
          <span style={{ width: 60 }}>Actions</span>
          <span style={{ width: 60 }} />
        </div>
        {all.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center" as const, color: C.textFaint, font: `400 14px ${C.FF}` }}>
            {userRole === "pgm" ? "No projects in your assigned programs." : "No projects in your assigned accounts."}
          </div>
        )}
        {all.map((p, i) => {
          const rc = ragColor(p.band);
          const rl = ragLabel(p.band);
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", padding: "10px 20px", borderBottom: i < all.length - 1 ? "1px solid #f8f9fb" : "none", background: i % 2 === 0 ? C.panelBg : "#fafbfc" }}>
              <div style={{ flex: 1.8, minWidth: 160, display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: rc, flexShrink: 0 }} />
                <span style={{ font: `600 13.5px ${C.FF}`, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.name}</span>
              </div>
              <span style={{ width: 100, font: `400 13px ${C.FF}`, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.accountName ?? "—"}</span>
              <span style={{ width: 90, font: `400 13px ${C.FF}`, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.pmName}</span>
              <span style={{ width: 70 }}>
                <span style={{ font: `700 10px ${C.FF}`, color: rc, background: `${rc}18`, border: `1px solid ${rc}30`, borderRadius: 5, padding: "2px 6px", letterSpacing: ".04em" }}>{rl}</span>
              </span>
              <span style={{ width: 54, font: `600 14px ${C.FM}`, color: spiColor(p.spi) }}>{fmt(p.spi)}</span>
              <span style={{ width: 54, font: `600 14px ${C.FM}`, color: spiColor(p.cpi) }}>{fmt(p.cpi)}</span>
              <div style={{ width: 100, paddingRight: 8 }}>
                {(() => {
                  const s = pmScore(p.spi, p.cpi, p.band);
                  const col = pmColor(s);
                  return (<>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ font: `500 10px ${C.FF}`, color: col }}>{pmLabel(s)}</span>
                      <span style={{ font: `600 10px ${C.FM}`, color: col }}>{s}%</span>
                    </div>
                    <div style={{ height: 4, background: "#eef0f3", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, background: col, width: `${s}%`, transition: "width .4s" }} />
                    </div>
                  </>);
                })()}
              </div>
              <span style={{ width: 60 }}>
                {p.openActionItems > 0 && (
                  <span style={{ font: `600 11px ${C.FF}`, color: C.amber, background: "#fdf3e0", borderRadius: 4, padding: "2px 6px" }}>{p.openActionItems} open</span>
                )}
              </span>
              <span style={{ width: 60, font: `600 13px ${C.FF}`, color: C.blue, cursor: "pointer", textAlign: "right" as const }} onClick={() => onSelect(p.id)}>
                Review →
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Escalation modal ────────────────────────────────────────────────────────────

type EscalateSeverity = "critical" | "high" | "medium";

function EscalateModal({ project, onClose, onSuccess }: {
  project: TriageRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
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

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box" as const, border: `1px solid ${C.borderLight}`,
    borderRadius: 8, padding: "9px 12px", font: `400 13.5px ${C.FF}`, color: C.text,
    outline: "none", resize: "vertical" as const,
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/escalations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "project", projectId: project.id, severity,
          title: title.trim(), situation: situation.trim(),
          impact: impact.trim(), supportRequired: support.trim(),
          contextSnapshot: { spi: project.spi, cpi: project.cpi, rag: project.band, pmName: project.pmName },
        }),
      });
      if (res.status === 409) { setError("This project already has an open escalation."); return; }
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Failed to raise escalation"); return; }
      onSuccess();
    } catch { setError("Network error — please try again"); }
    finally { setSubmitting(false); }
  }

  const lbl = (text: string, req = true) => (
    <label style={{ font: `600 11px ${C.FF}`, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.textFaint, display: "block", marginBottom: 5 }}>
      {text}{req ? " *" : ""}
    </label>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 540, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 48px)", background: "#fff", borderRadius: 18, boxShadow: "0 24px 80px rgba(0,0,0,.22)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg,${C.red},#b02020)`, padding: "18px 22px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚑</span>
          <div style={{ flex: 1 }}>
            <div style={{ font: `700 15px ${C.FF}`, color: "#fff" }}>Raise escalation</div>
            <div style={{ font: `400 12px ${C.FF}`, color: "rgba(255,255,255,.75)", marginTop: 1 }}>{project.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.2)", border: "none", color: "#fff", borderRadius: 8, width: 28, height: 28, cursor: "pointer", fontSize: 16, lineHeight: "28px", textAlign: "center" as const }}>×</button>
        </div>
        <form onSubmit={submit} style={{ flex: 1, overflowY: "auto", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            {lbl("Severity")}
            <div style={{ display: "flex", gap: 8 }}>
              {SELS.map(s => (
                <button key={s.value} type="button" onClick={() => setSeverity(s.value)} style={{
                  flex: 1, height: 34, border: `2px solid ${severity === s.value ? s.color : C.borderLight}`,
                  borderRadius: 8, background: severity === s.value ? `${s.color}14` : "#fff",
                  font: `${severity === s.value ? 700 : 500} 12.5px ${C.FF}`, color: severity === s.value ? s.color : C.textMuted, cursor: "pointer",
                }}>{s.label}</button>
              ))}
            </div>
          </div>
          <div>{lbl("Title")}<input required value={title} onChange={e => setTitle(e.target.value)} maxLength={120} style={{ ...inputStyle, height: 38, resize: "none" as const }} /></div>
          <div>{lbl("Situation")}<textarea required minLength={30} rows={3} value={situation} onChange={e => setSituation(e.target.value)} placeholder="What is happening? Include key metrics and timeline…" style={inputStyle} /></div>
          <div>{lbl("Business impact")}<textarea required minLength={10} rows={2} value={impact} onChange={e => setImpact(e.target.value)} placeholder="What is the business impact if not resolved?" style={inputStyle} /></div>
          <div>{lbl("Support required from DH")}<textarea required minLength={10} rows={2} value={support} onChange={e => setSupport(e.target.value)} placeholder="What decision or action do you need from the Delivery Head?" style={inputStyle} /></div>
          {error && <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: "10px 14px", font: `400 13px ${C.FF}`, color: C.red }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ height: 36, padding: "0 16px", border: `1px solid ${C.borderLight}`, borderRadius: 8, background: "#fff", font: `500 13px ${C.FF}`, color: C.textMuted, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{ height: 36, padding: "0 20px", border: "none", borderRadius: 8, background: submitting ? "#ccc" : `linear-gradient(135deg,${C.red},#b02020)`, font: `600 13px ${C.FF}`, color: "#fff", cursor: submitting ? "not-allowed" : "pointer" }}>
              {submitting ? "Raising…" : "Raise escalation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DmTriageClient({ data, userName, userRole }: { data: TriageData; userName: string; userRole?: string }) {
  const [tab, setTab] = useState<"triage" | "health">("triage");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [escalatedIds, setEscalatedIds] = useState<Set<string>>(new Set());
  const [escalateTarget, setEscalateTarget] = useState<TriageRow | null>(null);

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

  function openReview(id: string) {
    setReviewId(id);
    setTab("triage");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px)", overflow: "hidden", fontFamily: C.FF }}>

      {/* Tab bar */}
      <div style={{ background: C.tabBar, borderBottom: `1px solid ${C.border}`, padding: "0 22px", display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
        {(["triage", "health"] as const).map(key => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: "12px 16px 11px", border: "none", background: "transparent",
            font: `600 13.5px ${C.FF}`,
            color: tab === key ? "#fff" : "rgba(255,255,255,.45)",
            borderBottom: tab === key ? `2px solid ${C.blue}` : "2px solid transparent",
            cursor: "pointer",
          }}>
            {key === "triage" ? "Triage" : "Health overview"}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 4 }}>
          {data.counts.red > 0 && <span style={{ font: `600 11.5px ${C.FF}`, color: C.red, background: C.redBg, borderRadius: 4, padding: "2px 8px" }}>{data.counts.red} critical</span>}
          {data.counts.amber > 0 && <span style={{ font: `600 11.5px ${C.FF}`, color: C.amber, background: C.amberBg, borderRadius: 4, padding: "2px 8px" }}>{data.counts.amber} at risk</span>}
          {data.overdueActionItems > 0 && <span style={{ font: `600 11.5px ${C.FF}`, color: C.amber, background: C.amberBg, borderRadius: 4, padding: "2px 8px" }}>{data.overdueActionItems} overdue actions</span>}
          <span style={{ font: `400 11.5px ${C.FF}`, color: "rgba(255,255,255,.45)" }}>{data.counts.total} projects</span>
        </div>
      </div>

      {/* ── Triage tab ─── */}
      {tab === "triage" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "22px 24px 48px", background: C.bg }}>

          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 }}>
            <StatCard title="Active projects" value={data.counts.total} sub={`${uniqueAccounts} account${uniqueAccounts !== 1 ? "s" : ""}`} color={C.text} bg={C.panelBg} border={C.borderLight} />
            <StatCard title="Critical (red)" value={data.counts.red} sub={data.counts.total ? `${Math.round(data.counts.red / data.counts.total * 100)}% of portfolio` : undefined} color={C.red} bg={`${C.red}08`} border={C.redBorder} />
            <StatCard title="At risk (amber)" value={data.counts.amber} sub={data.counts.total ? `${Math.round(data.counts.amber / data.counts.total * 100)}% of portfolio` : undefined} color={C.amber} bg={`${C.amber}08`} border={C.amberBorder} />
            <StatCard title="Open actions" value={totalActions} sub={data.overdueActionItems > 0 ? `${data.overdueActionItems} overdue` : "All on track"} color={totalActions > 0 ? C.blue : C.green} bg={totalActions > 0 ? `${C.blue}08` : `${C.green}08`} border={totalActions > 0 ? `${C.blue}22` : C.greenBorder} />
          </div>

          {/* Search */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", height: 36, background: "#fff", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "0 12px", gap: 8, maxWidth: 280 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke={C.textFaint} strokeWidth="2" />
                <path d="M20 20l-3-3" stroke={C.textFaint} strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="Filter by name, account, or PM…"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                style={{ border: "none", outline: "none", fontSize: 13, color: C.text, background: "transparent", flex: 1, fontFamily: C.FF, minWidth: 180 }}
              />
            </div>
            <span style={{ fontSize: 13, color: C.textFaint, fontFamily: C.FF }}>{allProjects.length} projects</span>
          </div>

          {/* Empty state */}
          {allProjects.length === 0 && (
            <div style={{ textAlign: "center" as const, padding: "60px 24px", color: C.textFaint }}>
              <p style={{ fontSize: 16, fontWeight: 500, margin: "0 0 8px", fontFamily: C.FF }}>No projects in scope</p>
              <p style={{ fontSize: 14, margin: 0, fontFamily: C.FF }}>
                {userRole === "pgm" ? "Contact an admin to assign programs to your profile." : "Contact an admin to assign accounts to your profile."}
              </p>
            </div>
          )}

          {/* Band sections */}
          <BandSection
            label="Critical" dotColor={C.red}
            projects={filter(data.bands.red)}
            onReview={openReview}
            onEscalate={p => setEscalateTarget(p)}
            escalatedIds={escalatedIds}
          />
          <BandSection
            label="At risk" dotColor={C.amber}
            projects={filter(data.bands.amber)}
            onReview={openReview}
            onEscalate={p => setEscalateTarget(p)}
            escalatedIds={escalatedIds}
          />
          <BandSection
            label="No data" dotColor={C.noData}
            projects={filter(data.bands.no_data)}
            onReview={openReview}
            onEscalate={p => setEscalateTarget(p)}
            escalatedIds={escalatedIds}
          />
          <BandSection
            label="On track" dotColor={C.green}
            projects={filter(data.bands.green)}
            onReview={openReview}
            onEscalate={p => setEscalateTarget(p)}
            escalatedIds={escalatedIds}
          />

          {/* No-match state when searching */}
          {q && filter(allProjects).length === 0 && (
            <div style={{ textAlign: "center" as const, padding: "40px 24px", color: C.textFaint, fontFamily: C.FF, fontSize: 14 }}>
              No projects match "{searchQ}"
            </div>
          )}
        </div>
      )}

      {/* ── Health overview tab ─── */}
      {tab === "health" && (
        <HealthOverview data={data} onSelect={openReview} userRole={userRole} />
      )}

      {/* Review panel (DrillDownPanel uses position:fixed) */}
      {reviewId && (
        <DrillDownPanel
          projectId={reviewId}
          onClose={() => setReviewId(null)}
          initialTab="review"
          openActionItem={() => {}}
        />
      )}

      {/* Escalation modal */}
      {escalateTarget && (
        <EscalateModal
          project={escalateTarget}
          onClose={() => setEscalateTarget(null)}
          onSuccess={() => {
            setEscalatedIds(prev => new Set([...prev, escalateTarget.id]));
            setEscalateTarget(null);
          }}
        />
      )}
    </div>
  );
}
