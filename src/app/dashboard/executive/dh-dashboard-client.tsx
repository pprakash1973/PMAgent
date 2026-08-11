"use client";
import React, { useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────────
export interface DhProject {
  id: string; name: string;
  clientId: string; clientName: string;
  clusterId: string; clusterName: string; clusterType: string;
  programName: string; pmName: string;
  rag: "red" | "amber" | "green";
  spi: number | null; cpi: number | null;
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

export interface ClusterHealth {
  id: string; name: string; red: number; amber: number; green: number; total: number;
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
  FF: "'Aptos','Calibri','Segoe UI',system-ui,sans-serif",
  FM: "'Consolas','SF Mono','Courier New',monospace",
};

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
function RedRow({ p }: { p: DhProject }) {
  const rc = ragColor(p.rag);
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
          {/* Metric badges */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
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
        <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: C.FF, marginBottom: 1 }}>Budget used</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: p.budPct > 85 ? C.red : p.budPct > 70 ? C.amber : C.green, fontFamily: C.FM }}>{p.budPct}%</div>
        </div>
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

// ── Main component ────────────────────────────────────────────────────────────────
export default function DhDashboardClient({
  projects, trends, userName, escalations, clusterHealth,
}: {
  projects: DhProject[];
  trends: TrendPoint[];
  userName: string;
  escalations: DhEscalation[];
  clusterHealth: ClusterHealth[];
}) {
  const [tab, setTab] = useState<"escalations" | "red" | "clusters">("escalations");
  const [resolveTarget, setResolveTarget] = useState<DhEscalation | null>(null);
  const [ackedIds, setAckedIds] = useState<Set<string>>(new Set());
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const openEscs = escalations.filter(e =>
    !resolvedIds.has(e.id) &&
    ["open", "acknowledged", "in_progress"].includes(e.status)
  );

  const redProjects = projects.filter(p => p.rag === "red" || p.rag === "amber");
  const totalProjects = projects.length;
  const redCount = projects.filter(p => p.rag === "red").length;
  const amberCount = projects.filter(p => p.rag === "amber").length;
  const greenCount = projects.filter(p => p.rag === "green").length;

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
        {tabBtn("escalations", "Escalation inbox", openEscs.length)}
        {tabBtn("red", "Red projects", redProjects.length)}
        {tabBtn("clusters", "Cluster health")}
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

      {/* ── Red digest ── */}
      {tab === "red" && (
        <div style={{ flex: 1, overflowY: "auto" as const, padding: "22px 26px 48px", background: C.ground }}>
          {redProjects.length === 0 ? (
            <div style={{ textAlign: "center" as const, padding: "80px 24px" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.green, fontFamily: C.FF }}>No projects in red or amber</div>
              <div style={{ fontSize: 13.5, color: C.inkFaint, marginTop: 6, fontFamily: C.FF }}>All {totalProjects} projects are on track.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 820, margin: "0 auto" }}>
              <div style={{ fontSize: 13, color: C.ink2, marginBottom: 4, fontFamily: C.FF }}>
                {redCount} critical · {amberCount} at risk · why each project is flagged
              </div>
              {/* Critical first, then amber */}
              {[...redProjects.filter(p => p.rag === "red"), ...redProjects.filter(p => p.rag === "amber")].map(p => (
                <RedRow key={p.id} p={p} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Cluster health ── */}
      {tab === "clusters" && (
        <div style={{ flex: 1, overflowY: "auto" as const, padding: "22px 26px 48px", background: C.ground }}>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            {/* Portfolio summary strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 22 }}>
              {[
                { v: totalProjects, l: "Total projects", c: C.ink, bg: C.surface, border: C.border },
                { v: redCount, l: "Critical", c: C.red, bg: C.redBg, border: C.redLine },
                { v: amberCount, l: "At risk", c: C.amber, bg: C.amberBg, border: C.amberLine },
                { v: greenCount, l: "On track", c: C.green, bg: C.greenBg, border: C.greenLine },
              ].map(k => (
                <div key={k.l} style={{ background: k.bg, border: `1px solid ${k.border}`, borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: k.c, opacity: .7, marginBottom: 6, fontFamily: C.FF }}>{k.l}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: k.c, fontFamily: C.FM, lineHeight: 1 }}>{k.v}</div>
                </div>
              ))}
            </div>

            {/* Cluster bars */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 16, fontFamily: C.FF }}>Health by cluster</div>
              {clusterHealth.length === 0 && (
                <div style={{ fontSize: 13, color: C.inkFaint, fontFamily: C.FF }}>No clusters assigned to your scope.</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {clusterHealth.map(c => <ClusterBar key={c.id} c={c} />)}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.borderSoft}` }}>
                {[{ c: C.red, l: "Critical" }, { c: C.amber, l: "At risk" }, { c: C.green, l: "On track" }].map(k => (
                  <span key={k.l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: k.c, fontFamily: C.FF }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: k.c, display: "inline-block" }} />{k.l}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
