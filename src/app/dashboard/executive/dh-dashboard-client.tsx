"use client";
import React, { useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { DrillDownPanel } from "@/app/dashboard/dm/drill-down-panel";

// ── Types ────────────────────────────────────────────────────────────────────────
export interface DhProject {
  id: string; name: string;
  clientId: string; clientName: string;
  clusterId: string; clusterName: string; clusterType: string;
  programName: string; pmName: string;
  dmId: string | null; dmName: string | null;
  rag: "red" | "amber" | "green";
  spi: number | null; cpi: number | null;
  deliveryMethod: string; // "predictive" | "agile_scrum" | "hybrid" — extensible
  velocity: number | null; commitmentReliability: number | null;
  schedPct: number; budPct: number; budget: number | null;
  phase: string;
  whyDiagnosis: string;
  highRisks: number; criticalIssues: number; openActionItems: number;
  daysSinceReport: number | null;
  artifactsGenerated?: number; hoursSaved?: number; dollarsSaved?: number;
}

export interface TrendPoint {
  label: string; avgSpi: number | null; avgCpi: number | null; healthPct: number | null;
}

export interface AgileVelPoint {
  label: string; avgVelocity: number | null; avgReliability: number | null;
}

export interface ClusterHealth {
  id: string; name: string; red: number; amber: number; green: number; total: number;
  methodCounts: Record<string, number>;
}

export interface DhEscalation {
  id: string; title: string; severity: string; status: string; targetType: string;
  createdAt: string; slaDueAt: string | null; slaBreachedAt: string | null;
  situation: string; impact: string; supportRequired: string;
  raisedBy: { fullName: string };
  project: { name: string; program: { name: string } | null } | null;
  accountName?: string | null;
}

// ── Design tokens ────────────────────────────────────────────────────────────────
const C = {
  ground: "#EEF4F5", surface: "#FFFFFF", surface2: "#F5F9FA",
  petrol: "#003C51", teal: "#006E74", blue: "#0097AC", blueSoft: "#E3F2F5",
  border: "#D9E3E6", borderSoft: "#E9F0F2",
  ink: "#1C2426", ink2: "#4A5860", ink3: "#7C8B93", inkFaint: "#9FB0B7",
  red: "#C5392B", redBg: "#FBECEA", redLine: "#F0CBC6",
  amber: "#B9770F", amberBg: "#FDF3E2", amberLine: "#F2DDB8",
  green: "#0F9F70", greenBg: "#E6F6F0", greenLine: "#BFE8D8",
  grey: "#6F7880", greyBg: "#EEF0F2", greyLine: "#DBE0E3",
  tabBar: "#003C51",
  FF: "var(--font-inter),'Inter',system-ui,sans-serif",
  FM: "'Consolas','SF Mono','Courier New',monospace",
};

// ── Methodology config ────────────────────────────────────────────────────────────
const METHODOLOGY_GROUPS: Record<string, { label: string; shortLabel: string; color: string; bg: string; border: string; perf: string }> = {
  predictive:  { label: "Waterfall / Predictive", shortLabel: "Waterfall", color: C.teal,    bg: "#e8f5f6", border: "#b2dde0", perf: "SPI / CPI" },
  agile_scrum: { label: "Agile Scrum",            shortLabel: "Agile",     color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd", perf: "Velocity / Reliability" },
  hybrid:      { label: "Hybrid",                 shortLabel: "Hybrid",    color: C.blue,    bg: "#e3f2f5", border: "#93c5fd", perf: "SPI + Velocity" },
};
function dmkey(p: DhProject): string {
  return METHODOLOGY_GROUPS[p.deliveryMethod] ? p.deliveryMethod : "predictive";
}

// ── Helpers ───────────────────────────────────────────────────────────────────────
function sev(s: string) {
  return s === "critical" ? { c: C.red, bg: C.redBg, border: C.redLine }
    : s === "high"        ? { c: C.amber, bg: C.amberBg, border: C.amberLine }
    :                       { c: C.blue, bg: C.blueSoft, border: "#BFE8D8" };
}

function fmtAge(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`;
}

function slaLabel(slaDue: string | null, slaBreached: string | null) {
  if (slaBreached) return { label: "SLA breached", c: C.red };
  if (!slaDue) return null;
  const d = Math.ceil((new Date(slaDue).getTime() - Date.now()) / 86400000);
  if (d < 0) return { label: "SLA breached", c: C.red };
  if (d === 0) return { label: "SLA due today", c: C.amber };
  if (d <= 1) return { label: `SLA due in ${d}d`, c: C.amber };
  return null;
}

function ragColor(r: string) { return r === "red" ? C.red : r === "amber" ? C.amber : C.green; }
function spiColor(v: number | null) {
  if (v === null) return C.inkFaint;
  if (v < 0.85) return C.red;
  if (v < 0.95) return C.amber;
  return C.green;
}
function fmt2(v: number | null) { return v === null ? "—" : v.toFixed(2); }

// ── Resolve modal ─────────────────────────────────────────────────────────────────
function ResolveModal({ esc, onClose, onDone }: {
  esc: DhEscalation; onClose: () => void; onDone: (id: string) => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (note.trim().length < 20) { setErr("Resolution note must be at least 20 characters."); return; }
    setSaving(true); setErr(null);
    try {
      const res = await fetch(`/api/escalations/${esc.id}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved", resolutionNote: note.trim() }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? "Failed"); return; }
      onDone(esc.id);
    } catch { setErr("Network error"); }
    finally { setSaving(false); }
  }

  const inp: React.CSSProperties = {
    width: "100%", boxSizing: "border-box" as const, border: `1px solid ${C.border}`,
    borderRadius: 9, padding: "10px 13px", fontSize: 13.5, color: C.ink,
    outline: "none", resize: "vertical" as const, fontFamily: C.FF, minHeight: 90,
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 480, maxWidth: "calc(100vw - 32px)", background: "#fff", borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,.2)", overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg,${C.green},#0a8060)`, padding: "16px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: C.FF }}>Resolve escalation</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", fontFamily: C.FF }}>{esc.title}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.2)", border: "none", color: "#fff", borderRadius: 8, width: 28, height: 28, cursor: "pointer", fontSize: 15 }}>×</button>
        </div>
        <form onSubmit={submit} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.inkFaint, display: "block", marginBottom: 5, fontFamily: C.FF }}>
              Decision / resolution note *
            </label>
            <textarea
              value={note} onChange={e => setNote(e.target.value)} required minLength={20}
              placeholder="What action was taken or decided? What is the PM expected to do next?"
              style={inp}
            />
          </div>
          {err && <div style={{ background: C.redBg, border: `1px solid ${C.redLine}`, borderRadius: 8, padding: "9px 13px", fontSize: 13, color: C.red, fontFamily: C.FF }}>{err}</div>}
          <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ height: 36, padding: "0 16px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", fontSize: 13, color: C.inkFaint, cursor: "pointer", fontFamily: C.FF }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ height: 36, padding: "0 20px", border: "none", borderRadius: 8, background: saving ? "#ccc" : `linear-gradient(135deg,${C.green},#0a8060)`, fontSize: 13, fontWeight: 600, color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontFamily: C.FF }}>
              {saving ? "Resolving…" : "Mark resolved"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Escalation card ────────────────────────────────────────────────────────────────
function EscCard({ esc, onAck, onResolve, done }: {
  esc: DhEscalation; onAck: () => void; onResolve: () => void; done: boolean;
}) {
  const sv = sev(esc.severity);
  const sla = slaLabel(esc.slaDueAt, esc.slaBreachedAt);
  const acked = esc.status === "acknowledged" || esc.status === "in_progress";

  if (done) return null;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${sv.border}`,
      borderLeft: `5px solid ${sv.c}`, borderRadius: 14, padding: "15px 18px",
      boxShadow: "0 1px 4px rgba(16,40,48,.05)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const, marginBottom: 3 }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink, fontFamily: C.FF }}>{esc.title}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, letterSpacing: ".04em", textTransform: "capitalize" as const, background: sv.bg, color: sv.c, border: `1px solid ${sv.border}`, fontFamily: C.FF }}>
              {esc.severity}
            </span>
            {acked && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: C.greenBg, color: C.green, fontFamily: C.FF }}>✓ Acknowledged</span>}
            {sla && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: sla.c === C.red ? C.redBg : C.amberBg, color: sla.c, fontFamily: C.FF }}>{sla.label}</span>}
          </div>
          <div style={{ fontSize: 12, color: C.ink3, fontFamily: C.FF }}>
            {esc.project?.name} · DM: {esc.raisedBy.fullName} · Raised {fmtAge(esc.createdAt)}
          </div>
        </div>
      </div>

      {/* Situation */}
      <div style={{
        background: sv.bg, border: `1px solid ${sv.border}`,
        borderRadius: 9, padding: "10px 13px", marginBottom: 8,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: sv.c, marginBottom: 4, fontFamily: C.FF }}>Situation</div>
        <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, fontFamily: C.FF }}>{esc.situation}</div>
      </div>

      {/* DM's ask */}
      <div style={{
        background: C.blueSoft, border: `1px solid #BFE8D8`,
        borderRadius: 9, padding: "9px 13px", marginBottom: 12,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, marginBottom: 3, fontFamily: C.FF }}>DM asks from you</div>
        <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.45, fontFamily: C.FF }}>{esc.supportRequired}</div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
        {!acked && (
          <button onClick={onAck} style={{
            height: 32, padding: "0 14px", fontSize: 12.5, fontWeight: 600,
            border: `1.5px solid ${C.teal}`, borderRadius: 8, background: C.teal,
            color: "#fff", cursor: "pointer", fontFamily: C.FF,
          }}>✓ Acknowledge &amp; commit</button>
        )}
        <button onClick={onResolve} style={{
          height: 32, padding: "0 14px", fontSize: 12.5, fontWeight: 600,
          border: `1.5px solid ${C.green}`, borderRadius: 8,
          background: C.greenBg, color: C.green, cursor: "pointer", fontFamily: C.FF,
        }}>Mark resolved</button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: C.inkFaint, alignSelf: "center", fontFamily: C.FF }}>
          Business impact: {esc.impact}
        </span>
      </div>
    </div>
  );
}

// ── Red project row (no drill-down) ───────────────────────────────────────────────
function RedRow({ p, onReview }: { p: DhProject; onReview?: (id: string) => void }) {
  const rc = ragColor(p.rag);
  const mg = METHODOLOGY_GROUPS[dmkey(p)] ?? METHODOLOGY_GROUPS.predictive;
  const isAgile = dmkey(p) === "agile_scrum";
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderLeft: `5px solid ${rc}`, borderRadius: 12, padding: "13px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" as const }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: C.FF }}>{p.name}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: `${rc}18`, color: rc, border: `1px solid ${rc}30`, fontFamily: C.FF }}>
              {p.rag === "red" ? "Critical" : "At risk"}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: mg.bg, color: mg.color, border: `1px solid ${mg.border}`, fontFamily: C.FF }}>
              {mg.shortLabel}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.ink3, marginBottom: 8, fontFamily: C.FF }}>
            {p.clientName} · PM: {p.pmName} · {p.phase.replace(/_/g, " ")}
          </div>
          {/* Why */}
          <div style={{
            display: "flex", gap: 8, alignItems: "flex-start",
            background: p.rag === "red" ? C.redBg : C.amberBg,
            border: `1px solid ${p.rag === "red" ? C.redLine : C.amberLine}`,
            borderRadius: 8, padding: "8px 11px", marginBottom: 10,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4m0 4h.01"
                stroke={rc} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.45, fontFamily: C.FF }}>{p.whyDiagnosis}</span>
          </div>
          {/* Metric badges — methodology-aware */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {isAgile ? (
              <>
                {p.velocity !== null && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: mg.color, background: mg.bg, border: `1px solid ${mg.border}`, borderRadius: 5, padding: "2px 8px", fontFamily: C.FM }}>
                    Velocity {p.velocity.toFixed(0)} pts
                  </span>
                )}
                {p.commitmentReliability !== null && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: p.commitmentReliability < 60 ? C.red : p.commitmentReliability < 80 ? C.amber : C.green, background: p.commitmentReliability < 60 ? C.redBg : p.commitmentReliability < 80 ? C.amberBg : C.greenBg, border: `1px solid ${p.commitmentReliability < 60 ? C.redLine : p.commitmentReliability < 80 ? C.amberLine : C.greenLine}`, borderRadius: 5, padding: "2px 8px", fontFamily: C.FM }}>
                    Reliability {Math.round(p.commitmentReliability)}%
                  </span>
                )}
              </>
            ) : (
              <>
                {p.spi !== null && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: spiColor(p.spi), background: `${spiColor(p.spi)}18`, border: `1px solid ${spiColor(p.spi)}30`, borderRadius: 5, padding: "2px 8px", fontFamily: C.FM }}>
                    SPI {fmt2(p.spi)}
                  </span>
                )}
                {p.cpi !== null && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: spiColor(p.cpi), background: `${spiColor(p.cpi)}18`, border: `1px solid ${spiColor(p.cpi)}30`, borderRadius: 5, padding: "2px 8px", fontFamily: C.FM }}>
                    CPI {fmt2(p.cpi)}
                  </span>
                )}
              </>
            )}
            {p.criticalIssues > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: C.red, background: C.redBg, borderRadius: 5, padding: "2px 7px", fontFamily: C.FF }}>
                {p.criticalIssues} critical issue{p.criticalIssues > 1 ? "s" : ""}
              </span>
            )}
            {p.highRisks > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: C.amber, background: C.amberBg, borderRadius: 5, padding: "2px 7px", fontFamily: C.FF }}>
                {p.highRisks} high risk{p.highRisks > 1 ? "s" : ""}
              </span>
            )}
            {p.daysSinceReport !== null && p.daysSinceReport > 14 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: C.grey, background: C.greyBg, borderRadius: 5, padding: "2px 7px", fontFamily: C.FF }}>
                No report {p.daysSinceReport}d
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right" as const }}>
            <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: C.FF, marginBottom: 1 }}>Budget used</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: p.budPct > 85 ? C.red : p.budPct > 70 ? C.amber : C.green, fontFamily: C.FM }}>{p.budPct}%</div>
          </div>
          {onReview && (
            <button onClick={() => onReview(p.id)} style={{
              fontSize: 11.5, fontWeight: 600, color: C.teal, background: "#e8f5f6",
              border: `1px solid #b2dde0`, borderRadius: 7, padding: "5px 12px",
              cursor: "pointer", fontFamily: C.FF, whiteSpace: "nowrap" as const,
            }}>
              Review ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Methodology mix bar ────────────────────────────────────────────────────────────
function MethodologyMixBar({ projects }: { projects: DhProject[] }) {
  const total = projects.length || 1;
  const groups = (Object.entries(METHODOLOGY_GROUPS) as [string, typeof METHODOLOGY_GROUPS[string]][]).map(([key, cfg]) => {
    const mp = projects.filter(p => dmkey(p) === key);
    if (mp.length === 0) return null;
    return {
      key, cfg, count: mp.length,
      pct: Math.round((mp.length / total) * 100),
      red: mp.filter(p => p.rag === "red").length,
      amber: mp.filter(p => p.rag === "amber").length,
      green: mp.filter(p => p.rag === "green").length,
    };
  }).filter((g): g is NonNullable<typeof g> => g !== null);

  if (groups.length < 2) return null;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.ink3, fontFamily: C.FF }}>Methodology Mix</span>
        <span style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF }}>{projects.length} projects</span>
      </div>
      <div style={{ height: 10, borderRadius: 99, overflow: "hidden", display: "flex", marginBottom: 12 }}>
        {groups.map(g => (
          <div key={g.key} style={{ width: `${g.pct}%`, background: g.cfg.color, minWidth: 4 }} title={`${g.cfg.label}: ${g.count}`} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" as const }}>
        {groups.map(g => (
          <div key={g.key} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: g.cfg.color, marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: g.cfg.color, fontFamily: C.FF }}>
                {g.cfg.shortLabel} <span style={{ fontFamily: C.FM, fontWeight: 700 }}>{g.count}</span>
              </div>
              <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" as const }}>
                {g.red > 0   && <span style={{ fontSize: 10, fontWeight: 600, color: C.red,   background: C.redBg,   border: `1px solid ${C.redLine}`,   borderRadius: 99, padding: "1px 6px", fontFamily: C.FF }}>{g.red} crit</span>}
                {g.amber > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: C.amber, background: C.amberBg, border: `1px solid ${C.amberLine}`, borderRadius: 99, padding: "1px 6px", fontFamily: C.FF }}>{g.amber} risk</span>}
                {g.green > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: C.green, background: C.greenBg, border: `1px solid ${C.greenLine}`, borderRadius: 99, padding: "1px 6px", fontFamily: C.FF }}>{g.green} ok</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cluster health bar ─────────────────────────────────────────────────────────────
function ClusterBar({ c }: { c: ClusterHealth }) {
  const t = c.total || 1;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 140, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, fontFamily: C.FF }}>{c.name}</div>
        <div style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF }}>{c.total} project{c.total !== 1 ? "s" : ""}</div>
      </div>
      <div style={{ flex: 1, height: 8, borderRadius: 99, overflow: "hidden", background: C.borderSoft, display: "flex" }}>
        <div style={{ width: `${(c.red / t) * 100}%`, background: C.red }} />
        <div style={{ width: `${(c.amber / t) * 100}%`, background: C.amber }} />
        <div style={{ width: `${(c.green / t) * 100}%`, background: C.green }} />
      </div>
      <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
        {[{ v: c.red, c: C.red }, { v: c.amber, c: C.amber }, { v: c.green, c: C.green }].map((k, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: k.c, fontFamily: C.FF }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: k.c, display: "inline-block" }} />{k.v}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Overview section ──────────────────────────────────────────────────────────────
function OverviewSection({ projects, escalations }: { projects: DhProject[]; escalations: DhEscalation[] }) {
  const redCount   = projects.filter(p => p.rag === "red").length;
  const amberCount = projects.filter(p => p.rag === "amber").length;
  const greenCount = projects.filter(p => p.rag === "green").length;
  const total = projects.length || 1;

  const spiVals = projects.map(p => p.spi).filter((v): v is number => v !== null);
  const cpiVals = projects.map(p => p.cpi).filter((v): v is number => v !== null);
  const avgSpi = spiVals.length ? spiVals.reduce((a, b) => a + b, 0) / spiVals.length : null;
  const avgCpi = cpiVals.length ? cpiVals.reduce((a, b) => a + b, 0) / cpiVals.length : null;
  const avgBudget = projects.length ? Math.round(projects.reduce((s, p) => s + p.budPct, 0) / projects.length) : null;
  const onTimePct = projects.length ? Math.round(projects.filter(p => (p.spi ?? 0) >= 0.85).length / projects.length * 100) : null;
  const revenueAtRisk = projects.filter(p => p.rag !== "green").reduce((s, p) => s + (p.budget ?? 0), 0);
  const fmtM = (v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`;

  const topAtRisk = [...projects]
    .filter(p => p.rag === "red" || p.rag === "amber")
    .sort((a, b) => (a.spi ?? 999) - (b.spi ?? 999))
    .slice(0, 5);

  const openEscs = escalations.filter(e => ["open", "acknowledged", "in_progress"].includes(e.status)).slice(0, 4);

  function KpiTile({ label, value, sub, color, bg }: { label: string; value: string | null; sub: string; color: string; bg: string }) {
    return (
      <div style={{ background: bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color, textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 6, fontFamily: C.FF }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, fontFamily: C.FM }}>{value ?? "—"}</div>
        <div style={{ fontSize: 10.5, color: C.ink3, marginTop: 4, fontFamily: C.FF }}>{sub}</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto" as const, padding: "22px 26px 48px", background: C.ground }}>
      {/* Methodology mix */}
      <MethodologyMixBar projects={projects} />
      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12, marginBottom: 20 }}>
        <KpiTile label="Avg SPI" value={avgSpi !== null ? avgSpi.toFixed(2) : null} sub="Schedule performance" color={avgSpi !== null && avgSpi < 0.85 ? C.red : avgSpi !== null && avgSpi < 0.95 ? C.amber : C.teal} bg={avgSpi !== null && avgSpi < 0.85 ? C.redBg : avgSpi !== null && avgSpi < 0.95 ? C.amberBg : C.greenBg} />
        <KpiTile label="Avg CPI" value={avgCpi !== null ? avgCpi.toFixed(2) : null} sub="Cost performance" color={avgCpi !== null && avgCpi < 0.85 ? C.red : avgCpi !== null && avgCpi < 0.95 ? C.amber : C.teal} bg={avgCpi !== null && avgCpi < 0.85 ? C.redBg : avgCpi !== null && avgCpi < 0.95 ? C.amberBg : C.greenBg} />
        <KpiTile label="Budget Util." value={avgBudget !== null ? `${avgBudget}%` : null} sub="Across all projects" color={avgBudget !== null && avgBudget > 85 ? C.red : C.ink2} bg={C.surface} />
        <KpiTile label="On-Time Delivery" value={onTimePct !== null ? `${onTimePct}%` : null} sub="Projects with SPI ≥ 0.85" color={onTimePct !== null && onTimePct < 60 ? C.red : onTimePct !== null && onTimePct < 75 ? C.amber : C.teal} bg={onTimePct !== null && onTimePct < 60 ? C.redBg : onTimePct !== null && onTimePct < 75 ? C.amberBg : C.greenBg} />
        <KpiTile label="Active Projects" value={String(projects.length)} sub="Across all clusters" color={C.blue} bg={C.blueSoft} />
        <KpiTile label="Revenue at Risk" value={revenueAtRisk > 0 ? fmtM(revenueAtRisk) : "$0"} sub="Critical + At Risk budget" color={revenueAtRisk > 0 ? C.red : C.green} bg={revenueAtRisk > 0 ? C.redBg : C.greenBg} />
      </div>

      {/* Health distribution bar */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: C.FF }}>Project Health Distribution</span>
          <span style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF }}>{projects.length} total projects</span>
        </div>
        <div style={{ display: "flex", height: 14, borderRadius: 99, overflow: "hidden", gap: 1 }}>
          {redCount > 0   && <div style={{ width: `${(redCount   / total) * 100}%`, background: C.red   }} title={`Critical: ${redCount}`} />}
          {amberCount > 0 && <div style={{ width: `${(amberCount / total) * 100}%`, background: C.amber }} title={`At Risk: ${amberCount}`} />}
          {greenCount > 0 && <div style={{ flex: 1, background: C.green }} title={`On Track: ${greenCount}`} />}
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
          {[{ c: C.red, l: "Critical", v: redCount }, { c: C.amber, l: "At Risk", v: amberCount }, { c: C.green, l: "On Track", v: greenCount }].map(k => (
            <div key={k.l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: k.c, display: "inline-block" }} />
              <span style={{ fontSize: 12, color: C.ink3, fontFamily: C.FF }}>{k.l}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: k.c, fontFamily: C.FM }}>{k.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column: at-risk + escalations */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Top at-risk */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: C.FF }}>Top At-Risk Projects</span>
            <span style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF }}>{redCount + amberCount} projects</span>
          </div>
          {topAtRisk.length === 0 ? (
            <div style={{ fontSize: 13, color: C.green, fontFamily: C.FF }}>✓ All projects on track</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {topAtRisk.map(p => (
                <div key={p.id} style={{ borderLeft: `4px solid ${ragColor(p.rag)}`, paddingLeft: 12, paddingTop: 6, paddingBottom: 6, borderRadius: "0 8px 8px 0", background: p.rag === "red" ? C.redBg : C.amberBg }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, fontFamily: C.FF }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: C.ink3, marginTop: 2, fontFamily: C.FF }}>{p.clientName} · PM: {p.pmName}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: `${ragColor(p.rag)}22`, color: ragColor(p.rag), border: `1px solid ${ragColor(p.rag)}33`, flexShrink: 0, fontFamily: C.FF }}>
                      {p.rag === "red" ? "Critical" : "At Risk"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                    {dmkey(p) === "agile_scrum" ? (
                      <>
                        <span style={{ fontSize: 11, color: C.ink3, fontFamily: C.FF }}>Vel <span style={{ fontWeight: 700, color: "#7c3aed", fontFamily: C.FM }}>{p.velocity !== null ? p.velocity.toFixed(0) : "—"}</span></span>
                        <span style={{ fontSize: 11, color: C.ink3, fontFamily: C.FF }}>Rel <span style={{ fontWeight: 700, color: p.commitmentReliability !== null && p.commitmentReliability < 60 ? C.red : p.commitmentReliability !== null && p.commitmentReliability < 80 ? C.amber : C.green, fontFamily: C.FM }}>{p.commitmentReliability !== null ? `${Math.round(p.commitmentReliability)}%` : "—"}</span></span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 11, color: C.ink3, fontFamily: C.FF }}>SPI <span style={{ fontWeight: 700, color: spiColor(p.spi), fontFamily: C.FM }}>{p.spi !== null ? p.spi.toFixed(2) : "—"}</span></span>
                        <span style={{ fontSize: 11, color: C.ink3, fontFamily: C.FF }}>CPI <span style={{ fontWeight: 700, color: spiColor(p.cpi), fontFamily: C.FM }}>{p.cpi !== null ? p.cpi.toFixed(2) : "—"}</span></span>
                      </>
                    )}
                    <span style={{ fontSize: 11, color: C.ink3, fontFamily: C.FF }}>Budget <span style={{ fontWeight: 700, color: p.budPct > 85 ? C.red : C.ink, fontFamily: C.FM }}>{p.budPct}%</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Open escalations */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: C.FF }}>Open Escalations</span>
            <span style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF }}>{openEscs.length} open</span>
          </div>
          {openEscs.length === 0 ? (
            <div style={{ fontSize: 13, color: C.green, fontFamily: C.FF }}>✓ No open escalations</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {openEscs.map((e, i) => {
                const sv = sev(e.severity);
                const age = Math.floor((Date.now() - new Date(e.createdAt).getTime()) / 86400000);
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, paddingTop: 12, paddingBottom: 12, borderBottom: i < openEscs.length - 1 ? `1px solid ${C.borderSoft}` : "none" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, fontFamily: C.FF }}>{e.title}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 5, background: sv.bg, color: sv.c, border: `1px solid ${sv.border}`, fontFamily: C.FF }}>{e.severity}</span>
                      </div>
                      <div style={{ fontSize: 11, color: C.ink3, fontFamily: C.FF }}>{e.project?.name} · {e.raisedBy.fullName}</div>
                    </div>
                    <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: age >= 3 ? C.red : C.amber, fontFamily: C.FM }}>{age}d</div>
                      <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: C.FF }}>open</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Health tab ────────────────────────────────────────────────────────────────────
function HealthSection({ projects, onReview }: { projects: DhProject[]; onReview: (id: string) => void }) {
  const [clusterFilter, setClusterFilter] = useState("__all__");
  const [clientFilter, setClientFilter] = useState("__all__");

  const clusters = Array.from(new Map(projects.map(p => [p.clusterId || "__none__", p.clusterName || "Unassigned"])).entries());
  const clients  = Array.from(new Map(projects.map(p => [p.clientId || "__none__", p.clientName || "Unassigned"])).entries());

  const filtered = projects.filter(p => {
    const clusterMatch = clusterFilter === "__all__" || (p.clusterId || "__none__") === clusterFilter;
    const clientMatch  = clientFilter  === "__all__" || (p.clientId  || "__none__") === clientFilter;
    return clusterMatch && clientMatch;
  });

  const reds   = filtered.filter(p => p.rag === "red");
  const ambers = filtered.filter(p => p.rag === "amber");
  const greens = filtered.filter(p => p.rag === "green");

  const selStyle: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 7, border: `1px solid rgba(255,255,255,.2)`,
    background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 12.5,
    fontFamily: C.FF, cursor: "pointer", outline: "none",
  };

  const band = (label: string, color: string, bg: string, border: string, rows: DhProject[]) => (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase" as const, letterSpacing: ".06em", fontFamily: C.FF }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: bg, color, border: `1px solid ${border}`, fontFamily: C.FF }}>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: C.inkFaint, fontStyle: "italic", padding: "8px 0 4px", fontFamily: C.FF }}>None in this band</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map(p => <RedRow key={p.id} p={p} onReview={onReview} />)}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Filter bar */}
      <div style={{ background: "rgba(0,0,0,.15)", borderBottom: "1px solid rgba(255,255,255,.08)", padding: "10px 22px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)", fontFamily: C.FF }}>Filter:</span>
        <select value={clusterFilter} onChange={e => setClusterFilter(e.target.value)} style={selStyle}>
          <option value="__all__">All clusters</option>
          {clusters.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} style={selStyle}>
          <option value="__all__">All clients</option>
          {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.35)", fontFamily: C.FF, marginLeft: "auto" }}>
          {filtered.length} project{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Sections — grouped by methodology */}
      <div style={{ flex: 1, overflowY: "auto" as const, padding: "22px 26px 48px", background: C.ground }}>
        <div style={{
          maxWidth: 1280, margin: "0 auto",
          // Two across, wrapping to a new row as methodologies are added.
          // minmax(0,1fr) — plain 1fr defaults to min-width:auto, letting a long
          // project name push its column past its share and break the grid.
          display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))",
          gap: 16, alignItems: "start",
        }}>
          {Object.entries(METHODOLOGY_GROUPS).map(([methKey, cfg]) => {
            const mp = filtered.filter(p => dmkey(p) === methKey);
            if (mp.length === 0) return null;
            const mr = mp.filter(p => p.rag === "red");
            const ma = mp.filter(p => p.rag === "amber");
            const mg = mp.filter(p => p.rag === "green");
            return (
              <div key={methKey}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: cfg.bg, border: `1.5px solid ${cfg.border}` }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: cfg.color, color: "#fff", fontFamily: C.FF }}>{cfg.shortLabel}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: cfg.color, fontFamily: C.FF }}>{cfg.label}</span>
                  <span style={{ fontSize: 12, color: C.inkFaint, fontFamily: C.FF }}>{mp.length} project{mp.length !== 1 ? "s" : ""} · {cfg.perf}</span>
                </div>
                <div style={{ paddingLeft: 12, borderLeft: `3px solid ${cfg.border}`, display: "flex", flexDirection: "column", gap: 20 }}>
                  {band("Critical", C.red, C.redBg, C.redLine, mr)}
                  {ma.length > 0 && mr.length > 0 && <div style={{ borderTop: `1px dashed ${C.borderSoft}` }} />}
                  {band("At Risk", C.amber, C.amberBg, C.amberLine, ma)}
                  {mg.length > 0 && (mr.length + ma.length) > 0 && <div style={{ borderTop: `1px dashed ${C.borderSoft}` }} />}
                  {band("On Track", C.green, C.greenBg, C.greenLine, mg)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Metrics tiles tab ─────────────────────────────────────────────────────────────
function MetricsTilesSection({ projects, clusterHealth, wfTrends, agileTrends }: { projects: DhProject[]; clusterHealth: ClusterHealth[]; wfTrends: TrendPoint[]; agileTrends: AgileVelPoint[] }) {
  const [accountFilter, setAccountFilter] = useState("__all__");

  const clients = Array.from(new Map(projects.map(p => [p.clientId || "__none__", p.clientName || "Unassigned"])).entries());

  const filtered = accountFilter === "__all__"
    ? projects
    : projects.filter(p => (p.clientId || "__none__") === accountFilter);

  const total   = filtered.length;
  const reds    = filtered.filter(p => p.rag === "red").length;
  const ambers  = filtered.filter(p => p.rag === "amber").length;
  const greens  = filtered.filter(p => p.rag === "green").length;

  const spiVals = filtered.map(p => p.spi).filter((v): v is number => v !== null);
  const cpiVals = filtered.map(p => p.cpi).filter((v): v is number => v !== null);
  const avgSpi  = spiVals.length ? spiVals.reduce((a, b) => a + b, 0) / spiVals.length : null;
  const avgCpi  = cpiVals.length ? cpiVals.reduce((a, b) => a + b, 0) / cpiVals.length : null;

  const totalBudget = filtered.reduce((s, p) => s + (p.budget ?? 0), 0);
  const onTimePct   = total > 0 ? Math.round(filtered.filter(p => p.spi !== null && p.spi >= 0.85).length / total * 100) : null;

  const revenueAtRisk = filtered.filter(p => p.rag !== "green").reduce((s, p) => s + (p.budget ?? 0), 0);

  const fmtM = (v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K` : `$${v.toFixed(0)}`;

  type Tile = { label: string; value: string | null; sub: string; color: string; bg: string; border: string };
  const tiles: Tile[] = [
    { label: "Active Projects", value: String(total), sub: "In scope", color: C.teal, bg: "#e8f5f6", border: "#b2dde0" },
    { label: "Critical", value: String(reds), sub: "Red health", color: C.red, bg: C.redBg, border: C.redLine },
    { label: "At Risk", value: String(ambers), sub: "Amber health", color: C.amber, bg: C.amberBg, border: C.amberLine },
    { label: "On Track", value: String(greens), sub: "Green health", color: C.green, bg: C.greenBg, border: C.greenLine },
    { label: "Avg SPI", value: avgSpi !== null ? fmt2(avgSpi) : "—", sub: "Schedule performance", color: avgSpi === null ? C.inkFaint : avgSpi < 0.85 ? C.red : avgSpi < 0.95 ? C.amber : C.green, bg: C.surface, border: C.border },
    { label: "Avg CPI", value: avgCpi !== null ? fmt2(avgCpi) : "—", sub: "Cost performance", color: avgCpi === null ? C.inkFaint : avgCpi < 0.85 ? C.red : avgCpi < 0.95 ? C.amber : C.green, bg: C.surface, border: C.border },
    { label: "On-Time Delivery", value: onTimePct !== null ? `${onTimePct}%` : "—", sub: "SPI ≥ 0.85", color: onTimePct === null ? C.inkFaint : onTimePct < 60 ? C.red : onTimePct < 75 ? C.amber : C.green, bg: C.surface, border: C.border },
    { label: "Revenue at Risk", value: revenueAtRisk > 0 ? fmtM(revenueAtRisk) : "$0", sub: "Critical + At Risk budget", color: revenueAtRisk > 0 ? C.red : C.green, bg: revenueAtRisk > 0 ? C.redBg : C.greenBg, border: revenueAtRisk > 0 ? C.redLine : C.greenLine },
    { label: "Total Portfolio Budget", value: totalBudget > 0 ? fmtM(totalBudget) : "—", sub: "Across filtered projects", color: C.ink, bg: C.surface, border: C.border },
  ];

  // Per-cluster breakdown
  const clusterTiles = clusterHealth.filter(c => {
    if (accountFilter === "__all__") return true;
    return projects.some(p => p.clusterId === c.id && (p.clientId || "__none__") === accountFilter);
  }).map(c => {
    const cp = filtered.filter(p => p.clusterId === c.id);
    const cr = cp.filter(p => p.rag === "red").length;
    const ca = cp.filter(p => p.rag === "amber").length;
    const cg = cp.filter(p => p.rag === "green").length;
    const cspi = cp.map(p => p.spi).filter((v): v is number => v !== null);
    const avgCSpi = cspi.length ? cspi.reduce((a, b) => a + b, 0) / cspi.length : null;
    return { ...c, filtered: cp.length, cr, ca, cg, avgCSpi };
  });

  const selStyle: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 7, border: `1px solid rgba(255,255,255,.2)`,
    background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 12.5,
    fontFamily: C.FF, cursor: "pointer", outline: "none",
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Filter bar */}
      <div style={{ background: "rgba(0,0,0,.15)", borderBottom: "1px solid rgba(255,255,255,.08)", padding: "10px 22px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)", fontFamily: C.FF }}>Filter by account:</span>
        <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)} style={selStyle}>
          <option value="__all__">All accounts</option>
          {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.35)", fontFamily: C.FF, marginLeft: "auto" }}>
          {filtered.length} of {projects.length} projects
        </span>
      </div>

      {/* Tiles */}
      <div style={{ flex: 1, overflowY: "auto" as const, padding: "22px 26px 48px", background: C.ground }}>
        {/* Portfolio KPI tiles */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.inkFaint, fontFamily: C.FF, marginBottom: 12 }}>
          Portfolio Overview
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
          {tiles.map(t => (
            <div key={t.label} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: t.color, opacity: .75, marginBottom: 8, fontFamily: C.FF }}>{t.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: t.color, fontFamily: C.FM, lineHeight: 1, marginBottom: 4 }}>{t.value ?? "—"}</div>
              <div style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF }}>{t.sub}</div>
            </div>
          ))}
        </div>

        {/* By Methodology tiles */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.inkFaint, fontFamily: C.FF, marginBottom: 12 }}>
          By Methodology
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, marginBottom: 28 }}>
          {Object.entries(METHODOLOGY_GROUPS).map(([methKey, cfg]) => {
            const mp = filtered.filter(p => dmkey(p) === methKey);
            if (mp.length === 0) return null;
            const redC = mp.filter(p => p.rag === "red").length;
            const amberC = mp.filter(p => p.rag === "amber").length;
            const greenC = mp.filter(p => p.rag === "green").length;
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
                  <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color, fontFamily: C.FF, flex: 1 }}>{cfg.label}</span>
                  <span style={{ fontSize: 11.5, color: C.inkFaint, fontFamily: C.FF }}>{mp.length}</span>
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
                        <div style={{ fontSize: 20, fontWeight: 700, color: avgVel !== null ? cfg.color : C.inkFaint, fontFamily: C.FM, lineHeight: 1 }}>{avgVel !== null ? avgVel.toFixed(0) + " pts" : "—"}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: C.FF, marginBottom: 2 }}>Avg Reliability</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: avgRel !== null ? (avgRel < 60 ? C.red : avgRel < 80 ? C.amber : C.green) : C.inkFaint, fontFamily: C.FM, lineHeight: 1 }}>{avgRel !== null ? Math.round(avgRel) + "%" : "—"}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: C.FF, marginBottom: 2 }}>Avg SPI</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: avgMS !== null ? (avgMS < 0.85 ? C.red : avgMS < 0.95 ? C.amber : C.green) : C.inkFaint, fontFamily: C.FM, lineHeight: 1 }}>{avgMS !== null ? fmt2(avgMS) : "—"}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: C.FF, marginBottom: 2 }}>Avg CPI</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: avgMC !== null ? (avgMC < 0.85 ? C.red : avgMC < 0.95 ? C.amber : C.green) : C.inkFaint, fontFamily: C.FM, lineHeight: 1 }}>{avgMC !== null ? fmt2(avgMC) : "—"}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* By Delivery Managers */}
        {(() => {
          const dmMap = new Map<string, { name: string; projects: DhProject[] }>();
          for (const p of filtered) {
            const key = p.dmId ?? "__unassigned__";
            const label = p.dmName ?? "Unassigned";
            if (!dmMap.has(key)) dmMap.set(key, { name: label, projects: [] });
            dmMap.get(key)!.projects.push(p);
          }
          const dmTiles = [...dmMap.values()].sort((a, b) => {
            const aRed = a.projects.filter(p => p.rag === "red").length;
            const bRed = b.projects.filter(p => p.rag === "red").length;
            const aAmber = a.projects.filter(p => p.rag === "amber").length;
            const bAmber = b.projects.filter(p => p.rag === "amber").length;
            return bRed - aRed || bAmber - aAmber || a.name.localeCompare(b.name);
          });
          if (dmTiles.length < 2) return null;
          return (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.inkFaint, fontFamily: C.FF, marginBottom: 12 }}>
                By Delivery Manager
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginBottom: 28 }}>
                {dmTiles.map(dm => {
                  const pp = dm.projects;
                  const red   = pp.filter(p => p.rag === "red").length;
                  const amber = pp.filter(p => p.rag === "amber").length;
                  const green = pp.filter(p => p.rag === "green").length;
                  const wfProjs   = pp.filter(p => dmkey(p) !== "agile_scrum");
                  const agileProjs = pp.filter(p => dmkey(p) === "agile_scrum");
                  const wfSpi  = wfProjs.map(p => p.spi).filter((v): v is number => v !== null);
                  const wfCpi  = wfProjs.map(p => p.cpi).filter((v): v is number => v !== null);
                  const avgSpi = wfSpi.length ? wfSpi.reduce((a, b) => a + b, 0) / wfSpi.length : null;
                  const avgCpi = wfCpi.length ? wfCpi.reduce((a, b) => a + b, 0) / wfCpi.length : null;
                  const aVel  = agileProjs.map(p => p.velocity).filter((v): v is number => v !== null);
                  const aRel  = agileProjs.map(p => p.commitmentReliability).filter((v): v is number => v !== null);
                  const avgVel = aVel.length ? aVel.reduce((a, b) => a + b, 0) / aVel.length : null;
                  const avgRel = aRel.length ? aRel.reduce((a, b) => a + b, 0) / aRel.length : null;
                  const budgets = pp.map(p => p.budget ?? 0).reduce((a, b) => a + b, 0);
                  const fmtM = (v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K` : `$${v}`;
                  const ragLine = red > 0 ? C.red : amber > 0 ? C.amber : C.green;
                  return (
                    <div key={dm.name} style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `5px solid ${ragLine}`, borderRadius: 13, padding: "16px 18px" }}>
                      {/* Header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${ragLine}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={ragLine} strokeWidth="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={ragLine} strokeWidth="1.8" strokeLinecap="round"/></svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, fontFamily: C.FF, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{dm.name}</div>
                          <div style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF }}>{pp.length} project{pp.length !== 1 ? "s" : ""}{budgets > 0 ? ` · ${fmtM(budgets)}` : ""}</div>
                        </div>
                      </div>
                      {/* Health breakdown */}
                      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                        {[{ v: red, l: "Critical", c: C.red, bg: C.redBg }, { v: amber, l: "At Risk", c: C.amber, bg: C.amberBg }, { v: green, l: "On Track", c: C.green, bg: C.greenBg }].map(k => (
                          <div key={k.l} style={{ flex: 1, textAlign: "center" as const, background: k.bg, borderRadius: 7, padding: "7px 4px" }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: k.c, fontFamily: C.FM, lineHeight: 1 }}>{k.v}</div>
                            <div style={{ fontSize: 9.5, color: k.c, fontFamily: C.FF, marginTop: 3 }}>{k.l}</div>
                          </div>
                        ))}
                      </div>
                      {/* Metrics — split by methodology presence */}
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const }}>
                        {wfProjs.length > 0 && (
                          <div style={{ flex: 1, minWidth: 80 }}>
                            <div style={{ fontSize: 9.5, color: C.inkFaint, fontFamily: C.FF, marginBottom: 4 }}>Waterfall ({wfProjs.length})</div>
                            <div style={{ display: "flex", gap: 12 }}>
                              <div>
                                <div style={{ fontSize: 9, color: C.inkFaint, fontFamily: C.FF }}>SPI</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: avgSpi !== null ? (avgSpi < 0.85 ? C.red : avgSpi < 0.95 ? C.amber : C.green) : C.inkFaint, fontFamily: C.FM }}>{avgSpi !== null ? fmt2(avgSpi) : "—"}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 9, color: C.inkFaint, fontFamily: C.FF }}>CPI</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: avgCpi !== null ? (avgCpi < 0.85 ? C.red : avgCpi < 0.95 ? C.amber : C.green) : C.inkFaint, fontFamily: C.FM }}>{avgCpi !== null ? fmt2(avgCpi) : "—"}</div>
                              </div>
                            </div>
                          </div>
                        )}
                        {agileProjs.length > 0 && (
                          <div style={{ flex: 1, minWidth: 80 }}>
                            <div style={{ fontSize: 9.5, color: C.inkFaint, fontFamily: C.FF, marginBottom: 4 }}>Agile ({agileProjs.length})</div>
                            <div style={{ display: "flex", gap: 12 }}>
                              <div>
                                <div style={{ fontSize: 9, color: C.inkFaint, fontFamily: C.FF }}>Velocity</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: "#7c3aed", fontFamily: C.FM }}>{avgVel !== null ? `${avgVel.toFixed(0)} pts` : "—"}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 9, color: C.inkFaint, fontFamily: C.FF }}>Reliability</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: avgRel !== null ? (avgRel < 60 ? C.red : avgRel < 80 ? C.amber : C.green) : C.inkFaint, fontFamily: C.FM }}>{avgRel !== null ? `${Math.round(avgRel)}%` : "—"}</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Issues strip */}
                      {(() => {
                        const issues = pp.reduce((s, p) => s + p.criticalIssues, 0);
                        const risks  = pp.reduce((s, p) => s + p.highRisks, 0);
                        const actions = pp.reduce((s, p) => s + p.openActionItems, 0);
                        if (issues + risks + actions === 0) return null;
                        return (
                          <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${C.borderSoft}`, flexWrap: "wrap" as const }}>
                            {issues > 0  && <span style={{ fontSize: 10.5, color: C.red,   background: C.redBg,   borderRadius: 99, padding: "2px 8px", fontFamily: C.FF }}>{issues} critical issue{issues !== 1 ? "s" : ""}</span>}
                            {risks > 0   && <span style={{ fontSize: 10.5, color: C.amber, background: C.amberBg, borderRadius: 99, padding: "2px 8px", fontFamily: C.FF }}>{risks} high risk{risks !== 1 ? "s" : ""}</span>}
                            {actions > 0 && <span style={{ fontSize: 10.5, color: C.blue,  background: C.blueSoft,borderRadius: 99, padding: "2px 8px", fontFamily: C.FF }}>{actions} open action{actions !== 1 ? "s" : ""}</span>}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* Trend charts */}
        {(wfTrends.length > 0 || agileTrends.length > 0) && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.inkFaint, fontFamily: C.FF, marginBottom: 12 }}>
              Trend Charts
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
              {/* WF SPI trend */}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: C.FF, marginBottom: 4 }}>Waterfall SPI Trend</div>
                <div style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF, marginBottom: 12 }}>Schedule performance — Waterfall projects only</div>
                {wfTrends.some(t => t.avgSpi !== null) ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={wfTrends} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.inkFaint }} />
                      <YAxis domain={[0.5, 1.05]} tick={{ fontSize: 10, fill: C.inkFaint }} tickFormatter={v => v.toFixed(2)} />
                      <ReferenceLine y={0.85} stroke={C.amber} strokeDasharray="4 4" />
                      <ReferenceLine y={0.95} stroke={C.green} strokeDasharray="4 4" />
                      <Tooltip formatter={(v) => typeof v === "number" ? v.toFixed(2) : String(v ?? "")} labelStyle={{ fontFamily: C.FF, fontSize: 11 }} contentStyle={{ fontSize: 11, fontFamily: C.FF }} />
                      <Line type="monotone" dataKey="avgSpi" name="Avg SPI" stroke={C.teal} strokeWidth={2.5} dot={{ r: 3, fill: C.teal }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.inkFaint, fontFamily: C.FF }}>No Waterfall trend data yet</div>
                )}
              </div>
              {/* Agile velocity trend */}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: C.FF, marginBottom: 4 }}>Agile Velocity Trend</div>
                <div style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF, marginBottom: 12 }}>Avg accepted points per sprint — last 5 sprints</div>
                {agileTrends.some(t => t.avgVelocity !== null) ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={agileTrends} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.inkFaint }} />
                      <YAxis tick={{ fontSize: 10, fill: C.inkFaint }} />
                      <Tooltip formatter={(v) => typeof v === "number" ? v.toFixed(0) + " pts" : String(v ?? "")} labelStyle={{ fontFamily: C.FF, fontSize: 11 }} contentStyle={{ fontSize: 11, fontFamily: C.FF }} />
                      <Line type="monotone" dataKey="avgVelocity" name="Avg Velocity" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3, fill: "#7c3aed" }} />
                      {agileTrends.some(t => t.avgReliability !== null) && (
                        <Line type="monotone" dataKey="avgReliability" name="Reliability %" stroke={C.amber} strokeWidth={1.5} dot={{ r: 2, fill: C.amber }} strokeDasharray="4 4" />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.inkFaint, fontFamily: C.FF }}>No Agile sprint data yet</div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Cluster breakdown tiles */}
        {clusterTiles.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.inkFaint, fontFamily: C.FF, marginBottom: 12 }}>
              By Cluster
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {clusterTiles.map(c => (
                <div key={c.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: C.FF, marginBottom: 10 }}>{c.name}</div>
                  <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    {[{ v: c.cr, l: "Critical", col: C.red, bg: C.redBg }, { v: c.ca, l: "At Risk", col: C.amber, bg: C.amberBg }, { v: c.cg, l: "On Track", col: C.green, bg: C.greenBg }].map(k => (
                      <div key={k.l} style={{ flex: 1, textAlign: "center" as const, background: k.bg, borderRadius: 6, padding: "5px 4px" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: k.col, fontFamily: C.FM, lineHeight: 1 }}>{k.v}</div>
                        <div style={{ fontSize: 9, color: k.col, fontFamily: C.FF, marginTop: 2 }}>{k.l}</div>
                      </div>
                    ))}
                  </div>
                  {c.avgCSpi !== null && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF }}>Avg SPI</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: c.avgCSpi < 0.85 ? C.red : c.avgCSpi < 0.95 ? C.amber : C.green, fontFamily: C.FM }}>{fmt2(c.avgCSpi)}</span>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: C.inkFaint, fontFamily: C.FF, marginTop: 4 }}>{c.filtered} project{c.filtered !== 1 ? "s" : ""}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────────
export default function DhDashboardClient({
  projects, trends, wfTrends, agileTrends, userName, escalations, clusterHealth,
}: {
  projects: DhProject[];
  trends: TrendPoint[];
  wfTrends: TrendPoint[];
  agileTrends: AgileVelPoint[];
  userName: string;
  escalations: DhEscalation[];
  clusterHealth: ClusterHealth[];
}) {
  const [tab, setTab] = useState<"escalations" | "health" | "metrics">("escalations");
  const [resolveTarget, setResolveTarget] = useState<DhEscalation | null>(null);
  const [ackedIds, setAckedIds] = useState<Set<string>>(new Set());
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [reviewId, setReviewId] = useState<string | null>(null);

  const openEscs = escalations.filter(e =>
    !resolvedIds.has(e.id) &&
    ["open", "acknowledged", "in_progress"].includes(e.status)
  );

  const totalProjects = projects.length;
  const redCount = projects.filter(p => p.rag === "red").length;
  const amberCount = projects.filter(p => p.rag === "amber").length;

  async function ackEsc(id: string) {
    try {
      const res = await fetch(`/api/escalations/${id}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "acknowledged" }),
      });
      if (res.ok) setAckedIds(prev => new Set([...prev, id]));
    } catch {}
  }

  const tabBtn = (key: typeof tab, label: string, badge?: number) => (
    <button key={key} onClick={() => setTab(key)} style={{
      padding: "12px 16px 11px", border: "none", background: "transparent",
      fontSize: 13.5, fontWeight: 600, fontFamily: C.FF,
      color: tab === key ? "#fff" : "rgba(255,255,255,.45)",
      borderBottom: tab === key ? "2px solid #fff" : "2px solid transparent",
      cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
    }}>
      {label}
      {badge !== undefined && badge > 0 && (
        <span style={{ fontSize: 10.5, fontWeight: 700, background: "rgba(255,255,255,.2)", color: "#fff", padding: "1px 6px", borderRadius: 99, fontFamily: C.FF }}>{badge}</span>
      )}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px)", overflow: "hidden", fontFamily: C.FF }}>

      {/* Tab bar */}
      <div style={{ background: C.tabBar, borderBottom: "1px solid rgba(255,255,255,.1)", padding: "0 22px", display: "flex", alignItems: "center", flexShrink: 0 }}>
        {tabBtn("escalations", "Escalation Inbox", openEscs.length)}
        {tabBtn("health", "Health")}
        {tabBtn("metrics", "Metrics")}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 4 }}>
          {redCount > 0 && <span style={{ fontSize: 11.5, fontWeight: 600, color: C.red, background: C.redBg, borderRadius: 4, padding: "2px 8px", fontFamily: C.FF }}>{redCount} critical</span>}
          {amberCount > 0 && <span style={{ fontSize: 11.5, fontWeight: 600, color: C.amber, background: C.amberBg, borderRadius: 4, padding: "2px 8px", fontFamily: C.FF }}>{amberCount} at risk</span>}
          <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.4)", fontFamily: C.FF }}>{totalProjects} projects · {clusterHealth.length} cluster{clusterHealth.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* ── Escalation inbox ── */}
      {tab === "escalations" && (
        <div style={{ flex: 1, overflowY: "auto" as const, padding: "22px 26px 48px", background: C.ground }}>
          {openEscs.length === 0 ? (
            <div style={{ textAlign: "center" as const, padding: "80px 24px" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.green, fontFamily: C.FF }}>No open escalations</div>
              <div style={{ fontSize: 13.5, color: C.inkFaint, marginTop: 6, fontFamily: C.FF }}>All projects under normal management — no DM has raised an escalation.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820, margin: "0 auto" }}>
              <div style={{ fontSize: 13, color: C.ink2, marginBottom: 4, fontFamily: C.FF }}>
                {openEscs.length} open escalation{openEscs.length !== 1 ? "s" : ""} requiring your decision
              </div>
              {openEscs.map(e => (
                <EscCard
                  key={e.id}
                  esc={{ ...e, status: ackedIds.has(e.id) ? "acknowledged" : e.status }}
                  onAck={() => ackEsc(e.id)}
                  onResolve={() => setResolveTarget(e)}
                  done={resolvedIds.has(e.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Health ── */}
      {tab === "health" && <HealthSection projects={projects} onReview={setReviewId} />}

      {/* ── Metrics ── */}
      {tab === "metrics" && <MetricsTilesSection projects={projects} clusterHealth={clusterHealth} wfTrends={wfTrends} agileTrends={agileTrends} />}

      {/* Project review panel */}
      {reviewId && <DrillDownPanel projectId={reviewId} onClose={() => setReviewId(null)} />}

      {/* Resolve modal */}
      {resolveTarget && (
        <ResolveModal
          esc={resolveTarget}
          onClose={() => setResolveTarget(null)}
          onDone={id => { setResolvedIds(prev => new Set([...prev, id])); setResolveTarget(null); }}
        />
      )}
    </div>
  );
}
