"use client";
import { useState, useEffect, useCallback } from "react";

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

// UST brand palette — Dark Teal #006E74 · Light Teal #0097AC · Petrol #003C51
// RAG: Green #01B27C · Amber (kept) · Red/Orange #FC6A59
const C = {
  bg: "#F2F7F8",           // UST Light Gray Wash
  sidebarBg: "#003C51",    // UST Petrol
  tabBar: "#006E74",       // UST Dark Teal
  border: "rgba(255,255,255,.10)",
  borderLight: "#D7E0E3",  // UST Mid Gray Wash
  red: "#FC6A59", redBg: "rgba(252,106,89,.12)", redBorder: "rgba(252,106,89,.28)",
  amber: "#c17d12", amberBg: "rgba(193,125,18,.10)", amberBorder: "rgba(193,125,18,.20)",
  green: "#01B27C", greenBg: "rgba(1,178,124,.10)", greenBorder: "rgba(1,178,124,.22)",
  noData: "#7A7480", noDataBg: "rgba(122,116,128,.10)", noDataBorder: "rgba(122,116,128,.22)",
  blue: "#0097AC", blueL: "#0097AC",   // UST Light Teal — actions & highlights
  text: "#231F20", textMuted: "#7A7480", textFaint: "#7A7480",  // UST Soft Black / Dark Gray
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
  if (band === "red") return "RED";
  if (band === "amber") return "AMBER";
  if (band === "no_data") return "NO DATA";
  return "GREEN";
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

// ── Project list item (left sidebar) ──────────────────────────────────────────

function SidebarItem({ p, selected, onClick }: { p: TriageRow; selected: boolean; onClick: () => void }) {
  const rc = ragColor(p.band);
  const sc = spiColor(p.spi);
  const issueCount = p.highRisks + p.criticalIssues;
  return (
    <div onClick={onClick} style={{
      padding: "9px 14px", cursor: "pointer",
      background: selected ? "rgba(0,151,172,.18)" : "transparent",
      borderLeft: selected ? `3px solid ${C.blueL}` : "3px solid transparent",
      transition: "background .12s",
    }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "rgba(0,151,172,.08)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: rc, flexShrink: 0 }} />
        <span style={{ font: `600 13px ${C.FF}`, color: "#fff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 16 }}>
        <span style={{ font: `400 11px ${C.FF}`, color: "rgba(255,255,255,.35)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.pmName}</span>
        <span style={{ font: `600 11.5px ${C.FM}`, color: sc }}>{fmt(p.spi)}</span>
        {issueCount > 0 && (
          <span style={{ font: `700 9.5px ${C.FF}`, color: C.red, background: C.redBg, borderRadius: 4, padding: "1px 5px" }}>
            {issueCount} issue{issueCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Project header (right panel top) ──────────────────────────────────────────

function ProjectHeader({ p, detail, onEscalate, escalated }: { p: TriageRow; detail: any; onEscalate: () => void; escalated: boolean }) {
  const rc = ragColor(p.band);
  const rl = ragLabel(p.band);
  const schedPct = pct(p.spi);
  const budPct = pct(p.cpi);
  const schedColor = p.spi === null ? C.textFaint : p.spi < 0.85 ? C.red : p.spi < 0.95 ? C.amber : C.green;
  const budColor = p.cpi === null ? C.textFaint : p.cpi < 0.85 ? C.red : p.cpi < 0.95 ? C.amber : C.green;

  return (
    <div style={{ background: C.panelBg, borderBottom: `1px solid ${C.borderLight}`, flexShrink: 0, boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
      <div style={{ padding: "14px 24px 12px", display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5, flexWrap: "wrap" as const }}>
            <div style={{ width: 11, height: 11, borderRadius: "50%", background: rc, boxShadow: `0 0 0 3px ${rc}30`, flexShrink: 0 }} />
            <h1 style={{ margin: 0, font: `700 18px/1.2 ${C.FF}`, color: C.text }}>{p.name}</h1>
            <span style={{ font: `700 10.5px ${C.FF}`, color: rc, background: `${rc}18`, border: `1px solid ${rc}30`, borderRadius: 5, padding: "2px 8px", letterSpacing: ".05em" }}>{rl}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, paddingLeft: 21, flexWrap: "wrap" as const }}>
            {p.accountName && <><span style={{ font: `400 13px ${C.FF}`, color: C.textMuted }}>{p.accountName}</span><span style={{ color: "#d3d7de" }}>·</span></>}
            {detail?.project?.programName && <><span style={{ font: `400 13px ${C.FF}`, color: C.textMuted }}>{detail.project.programName}</span><span style={{ color: "#d3d7de" }}>·</span></>}
            <span style={{ font: `500 13px ${C.FF}`, color: C.textMuted }}>PM: <strong style={{ color: C.text }}>{p.pmName}</strong></span>
            <span style={{ color: "#d3d7de" }}>·</span>
            <span style={{ font: `400 13px ${C.FF}`, color: C.textMuted }}>{p.phase.replace(/_/g, " ")}</span>
          </div>
        </div>
        {p.band === "red" && (
          <button onClick={onEscalate} style={{
            height: 32, padding: "0 13px",
            background: escalated ? `linear-gradient(135deg, #01B27C, #009060)` : `linear-gradient(135deg, #FC6A59, #e05540)`,
            color: "#fff", border: "none", borderRadius: 8,
            font: `600 12.5px ${C.FF}`, cursor: "pointer",
            boxShadow: escalated ? "0 3px 10px rgba(1,178,124,.28)" : "0 3px 10px rgba(252,106,89,.28)",
            whiteSpace: "nowrap" as const, display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
          }}>
            <span>{escalated ? "✓" : "⚑"}</span> {escalated ? "Escalated" : "Escalate"}
          </button>
        )}
      </div>
      <div style={{ padding: "0 24px 14px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" as const }}>
        <div style={{ textAlign: "center" as const }}>
          <div style={{ font: `600 10px ${C.FF}`, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.textFaint, marginBottom: 2 }}>SPI</div>
          <div style={{ font: `700 22px ${C.FM}`, color: spiColor(p.spi), lineHeight: 1 }}>{fmt(p.spi)}</div>
        </div>
        <div style={{ width: 1, height: 32, background: "#eef0f3" }} />
        <div style={{ textAlign: "center" as const }}>
          <div style={{ font: `600 10px ${C.FF}`, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.textFaint, marginBottom: 2 }}>CPI</div>
          <div style={{ font: `700 22px ${C.FM}`, color: spiColor(p.cpi), lineHeight: 1 }}>{fmt(p.cpi)}</div>
        </div>
        {schedPct !== null && (
          <>
            <div style={{ width: 1, height: 32, background: "#eef0f3" }} />
            <div style={{ width: 140 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ font: `600 10px ${C.FF}`, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.textFaint }}>Schedule</span>
                <span style={{ font: `600 11.5px ${C.FM}`, color: schedColor }}>{schedPct}%</span>
              </div>
              <div style={{ height: 7, background: "#eef0f3", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 4, background: schedColor, width: `${schedPct}%`, transition: "width .4s" }} />
              </div>
            </div>
          </>
        )}
        {budPct !== null && (
          <div style={{ width: 140 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ font: `600 10px ${C.FF}`, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.textFaint }}>Budget</span>
              <span style={{ font: `600 11.5px ${C.FM}`, color: budColor }}>{budPct}%</span>
            </div>
            <div style={{ height: 7, background: "#eef0f3", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: budColor, width: `${budPct}%`, transition: "width .4s" }} />
            </div>
          </div>
        )}
        {/* PM Productivity meter */}
        {(() => {
          const s = pmScore(p.spi, p.cpi, p.band);
          const col = pmColor(s);
          return (
            <>
              <div style={{ width: 1, height: 32, background: "#eef0f3" }} />
              <div style={{ width: 150 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ font: `600 10px ${C.FF}`, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.textFaint }}>PM Productivity</span>
                  <span style={{ font: `600 11.5px ${C.FM}`, color: col }}>{s}%</span>
                </div>
                <div style={{ height: 7, background: "#eef0f3", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, background: col, width: `${s}%`, transition: "width .4s" }} />
                </div>
                <div style={{ font: `500 10px ${C.FF}`, color: col, marginTop: 3 }}>{pmLabel(s)}</div>
              </div>
            </>
          );
        })()}
        {(p.artifactsGenerated ?? 0) > 0 && (
          <>
            <div style={{ width: 1, height: 32, background: "#eef0f3" }} />
            <div style={{ textAlign: "center" as const }}>
              <div style={{ font: `600 10px ${C.FF}`, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.textFaint, marginBottom: 2 }}>AI Effort Saved</div>
              <div style={{ font: `700 17px ${C.FM}`, color: C.green, lineHeight: 1 }}>{p.hoursSaved}h</div>
              <div style={{ font: `500 10px ${C.FF}`, color: C.textFaint, marginTop: 1 }}>${(p.dollarsSaved ?? 0).toLocaleString()}</div>
            </div>
          </>
        )}
        {p.openActionItems > 0 && (
          <>
            <div style={{ width: 1, height: 32, background: "#eef0f3" }} />
            <div style={{ textAlign: "center" as const }}>
              <div style={{ font: `600 10px ${C.FF}`, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.textFaint, marginBottom: 2 }}>Open Actions</div>
              <div style={{ font: `700 22px ${C.FM}`, color: C.amber, lineHeight: 1 }}>{p.openActionItems}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Action items section ───────────────────────────────────────────────────────

function ActionItemsSection({ detail, pmName, onRefresh }: { detail: any; pmName: string; onRefresh: () => void }) {
  const [newText, setNewText] = useState("");
  const [priority, setPriority] = useState("p2");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  const projectId = detail?.project?.id;
  const items: any[] = detail?.actionItems ?? [];
  const open = items.filter((a: any) => !["closed", "cancelled"].includes(a.status));
  const resolved = items.filter((a: any) => ["closed", "cancelled"].includes(a.status));

  async function add() {
    if (!projectId || !newText.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/action-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newText.trim(), priority, dueDate: due || null, category: "delivery" }),
      });
      setNewText(""); setDue("");
      onRefresh();
    } catch {}
    setSaving(false);
  }

  function statusBadge(status: string) {
    const map: Record<string, { label: string; bg: string; color: string }> = {
      open: { label: "Open", bg: "#eef0f3", color: C.textFaint },
      acknowledged: { label: "Ack'd", bg: "#e8f0fe", color: "#3a54c4" },
      in_progress: { label: "In Progress", bg: "#e3f3ea", color: C.green },
      blocked: { label: "Blocked", bg: "#fbe4e2", color: C.red },
      submitted: { label: "Submitted", bg: "#fdf3e0", color: C.amber },
      closed: { label: "Closed", bg: "#e3f3ea", color: C.green },
      cancelled: { label: "Cancelled", bg: "#f3f4f6", color: C.noData },
    };
    const cfg = map[status] ?? map.open;
    return (
      <span style={{ font: `600 10.5px ${C.FF}`, background: cfg.bg, color: cfg.color, borderRadius: 5, padding: "2px 7px" }}>{cfg.label}</span>
    );
  }

  function priorityDot(p: string) {
    const col = p === "p1" ? C.red : p === "p2" ? C.amber : C.noData;
    return <div style={{ width: 7, height: 7, borderRadius: "50%", background: col, flexShrink: 0, marginTop: 5 }} />;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span style={{ font: `700 12px ${C.FF}`, letterSpacing: ".06em", textTransform: "uppercase" as const, color: C.textFaint }}>
          Action Items for {pmName}
        </span>
        {open.length > 0 && (
          <span style={{ font: `600 11px ${C.FF}`, color: C.amber, background: "#fdf3e0", borderRadius: 4, padding: "2px 7px" }}>{open.length} open</span>
        )}
      </div>

      {open.length > 0 && (
        <div style={{ background: C.panelBg, border: `1px solid ${C.borderLight}`, borderRadius: 11, overflow: "hidden", marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
          {open.map((act: any, i: number) => (
            <div key={act.id} style={{
              display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 16px",
              borderBottom: i < open.length - 1 ? `1px solid #f8f9fb` : "none",
            }}>
              {priorityDot(act.priority)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: `500 14px ${C.FF}`, color: C.text, marginBottom: 2 }}>{act.title}</div>
                <div style={{ font: `400 11px ${C.FM}`, color: C.textFaint, display: "flex", gap: 8 }}>
                  {act.assignedToName && <span>→ {act.assignedToName}</span>}
                  {act.dueDate && <span>Due {new Date(act.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>}
                </div>
              </div>
              {statusBadge(act.status)}
            </div>
          ))}
        </div>
      )}

      {/* Resolved items (closed / cancelled by PM) */}
      {resolved.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ font: `700 10px ${C.FF}`, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.textFaint, marginBottom: 6 }}>
            Resolved by PM ({resolved.length})
          </div>
          <div style={{ background: C.panelBg, border: `1px solid ${C.borderLight}`, borderRadius: 11, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
            {resolved.map((act: any, i: number) => {
              const note = act.closureNote || act.pmResponse;
              return (
                <div key={act.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 16px",
                  borderBottom: i < resolved.length - 1 ? `1px solid #f8f9fb` : "none",
                  opacity: 0.75,
                }}>
                  {priorityDot(act.priority)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: `500 14px ${C.FF}`, color: C.text, marginBottom: 2, textDecoration: act.status === "cancelled" ? "line-through" : "none" }}>{act.title}</div>
                    {note && (
                      <div style={{ font: `400 12px ${C.FF}`, color: C.textMuted, background: "#f7f8fa", borderRadius: 6, padding: "4px 8px", marginTop: 4 }}>
                        PM: {note}
                      </div>
                    )}
                    <div style={{ font: `400 11px ${C.FM}`, color: C.textFaint, marginTop: 3 }}>
                      {act.assignedToName && <span>→ {act.assignedToName}</span>}
                    </div>
                  </div>
                  {statusBadge(act.status)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick add */}
      <div style={{ background: C.panelBg, border: `1.5px solid ${C.borderLight}`, borderRadius: 11, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
        <textarea
          value={newText}
          onChange={e => setNewText(e.target.value)}
          placeholder={`Describe the action for ${pmName}…`}
          style={{
            width: "100%", height: 64, border: `1.5px solid ${C.borderLight}`, borderRadius: 8,
            padding: "9px 12px", font: `400 14px ${C.FF}`, color: C.text,
            resize: "none" as const, outline: "none", background: "#fafbfc", lineHeight: 1.5, marginBottom: 9,
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <select value={priority} onChange={e => setPriority(e.target.value)} style={{
            height: 34, border: `1.5px solid ${C.borderLight}`, borderRadius: 8, padding: "0 10px",
            font: `500 13px ${C.FF}`, color: C.text, background: "#fafbfc", outline: "none", flex: 1, cursor: "pointer",
          }}>
            <option value="p1">P1 — Critical</option>
            <option value="p2">P2 — Standard</option>
            <option value="p3">P3 — Low</option>
          </select>
          <input
            type="date"
            value={due}
            onChange={e => setDue(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            style={{
              height: 34, border: `1.5px solid ${C.borderLight}`, borderRadius: 8, padding: "0 10px",
              font: `400 13px ${C.FF}`, color: due ? C.text : C.textFaint, background: "#fafbfc", outline: "none", flex: 1, cursor: "pointer",
            }}
          />
          <button onClick={add} disabled={saving || !newText.trim()} style={{
            height: 34, padding: "0 18px",
            background: saving || !newText.trim() ? "#c9cdd6" : `linear-gradient(135deg, ${C.blueL}, ${C.blue})`,
            color: "#fff", border: "none", borderRadius: 8,
            font: `600 13.5px ${C.FF}`, cursor: saving || !newText.trim() ? "not-allowed" : "pointer",
            boxShadow: "0 3px 10px rgba(79,91,213,.25)", whiteSpace: "nowrap" as const,
          }}>
            {saving ? "Saving…" : "Assign →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Issues & Risks section ────────────────────────────────────────────────────

function IssuesRisks({ detail }: { detail: any }) {
  const openIssues = (detail?.issues ?? []).filter((i: any) => i.status === "open");
  const highRisks = (detail?.risks ?? []).filter((r: any) => r.status === "open" && ["high", "very_high"].includes(r.probability));
  const combined = [
    ...openIssues.map((i: any) => ({ type: "issue", sev: i.severity, title: i.description, body: i.description, owner: i.owner })),
    ...highRisks.map((r: any) => ({ type: "risk", sev: r.impact, title: r.description, body: r.description, owner: r.owner })),
  ].slice(0, 4);

  if (combined.length === 0) return null;

  return (
    <div>
      <div style={{ font: `700 12px ${C.FF}`, letterSpacing: ".06em", textTransform: "uppercase" as const, color: C.textFaint, marginBottom: 9 }}>Issues &amp; Risks</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {combined.map((item, i) => {
          const isHigh = ["critical", "high", "very_high"].includes(item.sev);
          const borderCol = isHigh ? C.red : C.amber;
          const typeCol = item.type === "issue" ? C.red : C.amber;
          const typeBg = item.type === "issue" ? "rgba(252,106,89,.10)" : "rgba(193,125,18,.1)";
          return (
            <div key={i} style={{
              background: C.panelBg, border: `1px solid ${isHigh ? "rgba(252,106,89,.22)" : "rgba(193,125,18,.2)"}`,
              borderLeft: `3px solid ${borderCol}`, borderRadius: 11, padding: "13px 16px",
              boxShadow: "0 1px 3px rgba(0,0,0,.04)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <span style={{ font: `700 10px ${C.FF}`, color: typeCol, background: typeBg, borderRadius: 5, padding: "2px 7px", textTransform: "uppercase" as const, letterSpacing: ".04em" }}>
                  {item.type === "issue" ? "Issue" : "Risk"} · {item.sev}
                </span>
              </div>
              <div style={{ font: `400 13.5px ${C.FF}`, color: C.textMuted, lineHeight: 1.5 }}>{item.body}</div>
              {item.owner && <div style={{ marginTop: 4, font: `400 11px ${C.FM}`, color: C.textFaint }}>Owner: {item.owner}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Health Overview tab ───────────────────────────────────────────────────────

function HealthOverview({ data, onSelect, userRole }: { data: TriageData; onSelect: (id: string) => void; userRole?: string }) {
  const all = [...data.bands.red, ...data.bands.amber, ...data.bands.no_data, ...data.bands.green];
  const total = data.counts.total;
  const avgSpi = all.length > 0 ? all.filter(p => p.spi !== null).reduce((s, p) => s + (p.spi ?? 0), 0) / Math.max(1, all.filter(p => p.spi !== null).length) : null;
  const avgCpi = all.length > 0 ? all.filter(p => p.cpi !== null).reduce((s, p) => s + (p.cpi ?? 0), 0) / Math.max(1, all.filter(p => p.cpi !== null).length) : null;

  const kpiCard = (title: string, value: number | string, subtitle: string | null, color: string, border: string, bg: string = C.panelBg) => (
    <div style={{ flex: 1, minWidth: 130, background: bg, border: `1px solid ${border}`, borderRadius: 13, padding: "16px 18px" }}>
      <div style={{ font: `600 10px ${C.FF}`, letterSpacing: ".07em", textTransform: "uppercase" as const, color: color, marginBottom: 8, opacity: .7 }}>{title}</div>
      <div style={{ font: `700 33px ${C.FM}`, color: color, lineHeight: 1 }}>{value}</div>
      {subtitle && <div style={{ font: `400 12px ${C.FF}`, color: C.textFaint, marginTop: 4 }}>{subtitle}</div>}
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px 48px", background: C.bg }}>
      {/* KPI strip */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" as const }}>
        {kpiCard("Total Projects", total, null, "#fff", C.borderLight, "#003C51")}
        {kpiCard("At Risk", data.counts.red, total ? `${Math.round(data.counts.red / total * 100)}% of portfolio` : null, C.red, "rgba(252,106,89,.28)")}
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
      <div style={{ background: C.panelBg, border: `1px solid ${C.borderLight}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.05)" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid #f0f2f5`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ font: `700 14px ${C.FF}`, color: C.text }}>All Projects</span>
          <span style={{ font: `400 12px ${C.FF}`, color: C.textFaint }}>· sorted by risk</span>
          <div style={{ flex: 1 }} />
          <span style={{ font: `400 12px ${C.FF}`, color: C.textFaint }}>{total} projects</span>
        </div>
        {/* Table header */}
        <div style={{ display: "flex", alignItems: "center", padding: "8px 20px", background: "#f7f8fa", borderBottom: "1px solid #eceef2", font: `700 10.5px ${C.FF}`, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.textFaint }}>
          <span style={{ flex: 1.8, minWidth: 160 }}>Project</span>
          <span style={{ width: 100 }}>Account</span>
          <span style={{ width: 90 }}>PM</span>
          <span style={{ width: 62 }}>Status</span>
          <span style={{ width: 54 }}>SPI</span>
          <span style={{ width: 54 }}>CPI</span>
          <span style={{ width: 100 }}>PM Score</span>
          <span style={{ width: 60 }}>Actions</span>
          <span style={{ width: 60 }} />
        </div>
        {/* Table rows */}
        {all.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center" as const, color: C.textFaint, font: `400 14px ${C.FF}` }}>
            {userRole === "pgm" ? "No projects in your assigned programs." : "No projects in your assigned accounts."}
          </div>
        )}
        {all.map((p, i) => {
          const rc = ragColor(p.band);
          const rl = ragLabel(p.band);
          return (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", padding: "10px 20px",
              borderBottom: i < all.length - 1 ? "1px solid #f8f9fb" : "none",
              background: i % 2 === 0 ? C.panelBg : "#fafbfc",
            }}>
              <div style={{ flex: 1.8, minWidth: 160, display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: rc, flexShrink: 0 }} />
                <span style={{ font: `600 13.5px ${C.FF}`, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.name}</span>
              </div>
              <span style={{ width: 100, font: `400 13px ${C.FF}`, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.accountName ?? "—"}</span>
              <span style={{ width: 90, font: `400 13px ${C.FF}`, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.pmName}</span>
              <span style={{ width: 62 }}>
                <span style={{ font: `700 10px ${C.FF}`, color: rc, background: `${rc}18`, border: `1px solid ${rc}30`, borderRadius: 5, padding: "2px 6px", letterSpacing: ".04em" }}>{rl}</span>
              </span>
              <span style={{ width: 54, font: `600 14px ${C.FM}`, color: spiColor(p.spi) }}>{fmt(p.spi)}</span>
              <span style={{ width: 54, font: `600 14px ${C.FM}`, color: spiColor(p.cpi) }}>{fmt(p.cpi)}</span>
              <div style={{ width: 100, paddingRight: 8 }}>
                {(() => {
                  const s = pmScore(p.spi, p.cpi, p.band);
                  const col = pmColor(s);
                  return (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ font: `500 10px ${C.FF}`, color: col }}>{pmLabel(s)}</span>
                        <span style={{ font: `600 10px ${C.FM}`, color: col }}>{s}%</span>
                      </div>
                      <div style={{ height: 4, background: "#eef0f3", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2, background: col, width: `${s}%`, transition: "width .4s" }} />
                      </div>
                    </>
                  );
                })()}
              </div>
              <span style={{ width: 60 }}>
                {p.openActionItems > 0 && (
                  <span style={{ font: `600 11px ${C.FF}`, color: C.amber, background: "#fdf3e0", borderRadius: 4, padding: "2px 6px" }}>{p.openActionItems} open</span>
                )}
              </span>
              <span style={{ width: 60, font: `600 13px ${C.FF}`, color: C.blue, cursor: "pointer", textAlign: "right" as const }}
                onClick={() => onSelect(p.id)}>
                View →
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DmTriageClient({ data, userName, userRole }: { data: TriageData; userName: string; userRole?: string }) {
  const [tab, setTab] = useState<"portfolio" | "health">("portfolio");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [escalatedIds, setEscalatedIds] = useState<Set<string>>(new Set());

  const allProjects = [...data.bands.red, ...data.bands.amber, ...data.bands.no_data, ...data.bands.green];

  // Auto-select first project
  useEffect(() => {
    if (allProjects.length > 0 && selectedId === null) {
      setSelectedId(allProjects[0].id);
    }
  }, [allProjects.length]);

  const fetchDetail = useCallback((id: string) => {
    setDetail(null);
    setDetailLoading(true);
    fetch(`/api/projects/${id}/dm-review`)
      .then(r => r.json())
      .then(d => { setDetail(d); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, []);

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  const sel = allProjects.find(p => p.id === selectedId);

  const q = searchQ.toLowerCase();
  const filteredRed = data.bands.red.filter(p => !q || p.name.toLowerCase().includes(q) || p.pmName.toLowerCase().includes(q));
  const filteredOther = [...data.bands.amber, ...data.bands.no_data, ...data.bands.green].filter(p => !q || p.name.toLowerCase().includes(q) || p.pmName.toLowerCase().includes(q));

  function selectAndView(id: string) {
    setSelectedId(id);
    setTab("portfolio");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px)", overflow: "hidden", fontFamily: C.FF }}>
      {/* ── Tab bar ─────────────────────────────────────── */}
      <div style={{ background: C.tabBar, borderBottom: `1px solid ${C.border}`, padding: "0 22px", display: "flex", gap: 4, flexShrink: 0 }}>
        {([["portfolio", "My Portfolio"], ["health", "Health Overview"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: "12px 16px 11px", border: "none", background: "transparent",
            font: `600 13.5px ${C.FF}`,
            color: tab === key ? "#fff" : "rgba(255,255,255,.45)",
            borderBottom: tab === key ? `2px solid ${C.blueL}` : "2px solid transparent",
            cursor: "pointer",
          }}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        {data.counts.total > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 4 }}>
            {data.counts.red > 0 && <span style={{ font: `600 11.5px ${C.FF}`, color: C.red, background: C.redBg, borderRadius: 4, padding: "2px 8px" }}>🔴 {data.counts.red} Red</span>}
            {data.counts.amber > 0 && <span style={{ font: `600 11.5px ${C.FF}`, color: C.amber, background: C.amberBg, borderRadius: 4, padding: "2px 8px" }}>🟡 {data.counts.amber} Amber</span>}
            <span style={{ font: `400 11.5px ${C.FF}`, color: "rgba(255,255,255,.45)" }}>{data.counts.total} projects</span>
          </div>
        )}
      </div>

      {/* ── Portfolio tab ───────────────────────────────── */}
      {tab === "portfolio" && (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* LEFT SIDEBAR */}
          <div style={{ width: 272, background: C.sidebarBg, display: "flex", flexDirection: "column", flexShrink: 0, borderRight: "1px solid rgba(255,255,255,.05)" }}>
            {/* Search */}
            <div style={{ padding: "11px 10px 7px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, height: 32, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "0 10px" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="rgba(255,255,255,.3)" strokeWidth="2" /><path d="M20 20l-3-3" stroke="rgba(255,255,255,.3)" strokeWidth="2" strokeLinecap="round" /></svg>
                <input type="text" placeholder="Search projects…" value={searchQ} onChange={e => setSearchQ(e.target.value)}
                  style={{ border: "none", background: "transparent", font: `400 12.5px ${C.FF}`, color: "rgba(255,255,255,.65)", outline: "none", flex: 1 }} />
              </div>
            </div>

            {/* Status chips */}
            <div style={{ padding: "0 10px 8px", display: "flex", gap: 5, flexWrap: "wrap" as const }}>
              {data.counts.red > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 5, padding: "3px 8px" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.red }} />
                  <span style={{ font: `600 10.5px ${C.FF}`, color: C.red }}>{data.counts.red} Red</span>
                </div>
              )}
              {data.counts.amber > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 5, padding: "3px 8px" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.amber }} />
                  <span style={{ font: `600 10.5px ${C.FF}`, color: C.amber }}>{data.counts.amber} Amber</span>
                </div>
              )}
              {data.counts.green > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 5, padding: "3px 8px" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.green }} />
                  <span style={{ font: `600 10.5px ${C.FF}`, color: C.green }}>{data.counts.green} Green</span>
                </div>
              )}
            </div>

            {/* Project list */}
            <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
              {allProjects.length === 0 ? (
                <div style={{ padding: "24px 14px", font: `400 13px ${C.FF}`, color: "rgba(255,255,255,.25)", textAlign: "center" as const }}>
                  {userRole === "pgm" ? "No projects in your assigned programs." : "No projects in your assigned accounts."}
                </div>
              ) : (
                <>
                  {filteredRed.length > 0 && (
                    <>
                      <div style={{ padding: "6px 14px 5px", display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.red, flexShrink: 0 }} />
                        <span style={{ font: `700 10px ${C.FF}`, letterSpacing: ".09em", textTransform: "uppercase" as const, color: "rgba(252,106,89,.9)" }}>Immediate Attention</span>
                      </div>
                      {filteredRed.map(p => <SidebarItem key={p.id} p={p} selected={selectedId === p.id} onClick={() => setSelectedId(p.id)} />)}
                    </>
                  )}
                  {filteredOther.length > 0 && (
                    <>
                      <div style={{ height: 1, background: "rgba(255,255,255,.05)", margin: "8px 10px" }} />
                      <div style={{ padding: "4px 14px 5px" }}>
                        <span style={{ font: `700 10px ${C.FF}`, letterSpacing: ".09em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.22)" }}>
                          Other Projects ({filteredOther.length})
                        </span>
                      </div>
                      {filteredOther.map(p => <SidebarItem key={p.id} p={p} selected={selectedId === p.id} onClick={() => setSelectedId(p.id)} />)}
                    </>
                  )}
                  {filteredRed.length === 0 && filteredOther.length === 0 && searchQ && (
                    <div style={{ padding: "24px 14px", font: `400 13px ${C.FF}`, color: "rgba(255,255,255,.25)", textAlign: "center" as const }}>No matches</div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: C.bg }}>
            {allProjects.length === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: C.textFaint, padding: 40 }}>
                <p style={{ font: `500 17px ${C.FF}`, margin: 0 }}>
                  {userRole === "pgm" ? "No projects in your assigned programs." : "No projects in your assigned accounts."}
                </p>
                <p style={{ font: `400 14px ${C.FF}`, margin: 0 }}>
                  {userRole === "pgm"
                    ? "Contact an administrator to assign programs to your profile."
                    : "Contact an administrator to assign accounts to your profile."}
                </p>
              </div>
            ) : !sel ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.textFaint }}>
                <p style={{ font: `400 15px ${C.FF}` }}>Select a project from the list</p>
              </div>
            ) : (
              <>
                <ProjectHeader
                  p={sel}
                  detail={detail}
                  escalated={escalatedIds.has(sel.id)}
                  onEscalate={() => setEscalatedIds(prev => new Set([...prev, sel.id]))}
                />
                {detailLoading ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ font: `400 14px ${C.FF}`, color: C.textFaint }}>Loading project data…</span>
                  </div>
                ) : (
                  <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 48px", display: "flex", flexDirection: "column", gap: 18 }}>
                    {detail && <IssuesRisks detail={detail} />}
                    {detail && (
                      <ActionItemsSection
                        detail={detail}
                        pmName={sel.pmName}
                        onRefresh={() => fetchDetail(sel.id)}
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Health Overview tab ─────────────────────────── */}
      {tab === "health" && (
        <HealthOverview data={data} onSelect={selectAndView} userRole={userRole} />
      )}
    </div>
  );
}
