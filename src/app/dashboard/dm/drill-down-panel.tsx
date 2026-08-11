"use client";
import { useEffect, useState, useCallback } from "react";

const UST_PETROL = "#003C51";
const UST_TEAL = "#006E74";
const UST_BORDER = "#D7E0E3";
const UST_WASH = "#F2F7F8";

type ReviewData = {
  project: {
    id: string; name: string; currentPhase: string; healthStatus: string;
    accountName: string | null; programName: string | null; pmName: string;
    budget: number | null; currency: string; startDate: string | null; endDate: string | null;
  };
  burnPct: number | null;
  health: { compositeScore: number | null; spi: number | null; cpi: number | null; ragStatus: string | null } | null;
  risks: { id: string; description: string; probability: string; impact: string; status: string; owner: string | null }[];
  issues: { id: string; description: string; severity: string; status: string; owner: string | null }[];
  milestones: { id: string; name: string; dueDate: string; status: string }[];
  artifacts: { artifactType: string; phase: string; status: string; updatedAt: string }[];
  actionItems: { id: string; reference: string; title: string; priority: string; status: string; dueDate: string | null; raisedByName: string }[];
  reviewNotes: { id: string; reviewType: string; body: string; visibility: string; createdAt: string; authorName: string }[];
};

type Tab = "review" | "action-item";

const CATEGORIES = [
  "schedule", "cost", "scope_change", "risk", "issue",
  "quality", "stakeholder", "resource", "governance", "artifact", "data_hygiene",
];

function badge(text: string, color: string) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
      background: `${color}18`, color, border: `1px solid ${color}40`,
      textTransform: "uppercase", letterSpacing: "0.04em",
    }}>{text}</span>
  );
}

function healthColor(status: string | null) {
  if (status === "red") return "#cf3f3a";
  if (status === "amber") return "#c17d12";
  return "#158a5a";
}

function daysLabel(dueDateStr: string): { text: string; color: string } {
  const now = Date.now();
  const due = new Date(dueDateStr).getTime();
  const days = Math.ceil((due - now) / 86400000);
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, color: "#cf3f3a" };
  if (days === 0) return { text: "Due today", color: "#cf3f3a" };
  if (days <= 7) return { text: `${days}d`, color: "#c17d12" };
  if (days <= 14) return { text: `${days}d`, color: "#c17d12" };
  return { text: `${days}d`, color: "#64748b" };
}

// ── Section header ──────────────────────────────────────────────────────────

function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div>
      <h3 style={{
        fontSize: 12, fontWeight: 700, color: accent ?? UST_PETROL,
        marginBottom: 10, paddingBottom: 6,
        borderBottom: `2px solid ${accent ?? UST_BORDER}`,
        textTransform: "uppercase", letterSpacing: "0.06em",
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: 13, color: "#94a3b8", margin: 0, fontStyle: "italic" }}>{text}</p>;
}

function Row({ left, right, badge: b, badge2 }: { left: string; right: string; badge?: React.ReactNode; badge2?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, padding: "6px 0", borderBottom: `1px solid #f1f5f9` }}>
      <span style={{ flex: 1, fontSize: 13, color: "#1e293b", lineHeight: 1.4 }}>{left}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {b}{badge2}
        <span style={{ fontSize: 12, color: "#94a3b8" }}>{right}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ background: UST_WASH, border: `1px solid ${UST_BORDER}`, borderRadius: 8, padding: "10px 16px", textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// ── 1. Upcoming Milestones ─────────────────────────────────────────────────

function MilestonesSection({ milestones }: { milestones: ReviewData["milestones"] }) {
  const upcoming = milestones
    .filter(m => m.status !== "complete")
    .slice(0, 3);

  return (
    <Section title="Upcoming Milestones">
      {upcoming.length === 0 ? (
        <Empty text="No pending milestones" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {upcoming.map((m) => {
            const dl = daysLabel(m.dueDate);
            const dueStr = new Date(m.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
            const milestoneColor = m.status === "at_risk" ? "#cf3f3a" : dl.color === "#cf3f3a" ? "#cf3f3a" : UST_TEAL;
            return (
              <div key={m.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 8,
                background: m.status === "at_risk" ? "#fef2f2" : UST_WASH,
                border: `1px solid ${m.status === "at_risk" ? "#fca5a5" : UST_BORDER}`,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: milestoneColor,
                }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#1e293b" }}>{m.name}</span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: dl.color,
                    background: `${dl.color}12`, padding: "1px 7px", borderRadius: 5,
                  }}>{dl.text}</span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{dueStr}</span>
                </div>
                {m.status !== "pending" && badge(m.status.replace(/_/g, " "), milestoneColor)}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ── 2. Health & Metrics ─────────────────────────────────────────────────────

function HealthSection({ health, burnPct, healthStatus }: {
  health: ReviewData["health"];
  burnPct: number | null;
  healthStatus: string;
}) {
  const rag = health?.ragStatus ?? healthStatus;
  const ragColor = healthColor(rag);
  const ragLabel = rag === "red" ? "RED" : rag === "amber" ? "AMBER" : "GREEN";

  return (
    <Section title="Project Health & Metrics">
      {/* RAG pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 16px", borderRadius: 20,
          background: `${ragColor}15`, border: `1.5px solid ${ragColor}50`,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: ragColor }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: ragColor }}>{ragLabel}</span>
        </div>
        {!health && (
          <span style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
            No status report submitted yet
          </span>
        )}
      </div>

      {health ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Stat
            label="Composite Score"
            value={health.compositeScore !== null ? `${health.compositeScore.toFixed(0)}` : "—"}
            color={ragColor}
            sub="out of 100"
          />
          <Stat
            label="Schedule (SPI)"
            value={health.spi !== null ? health.spi.toFixed(2) : "—"}
            color={health.spi !== null ? (health.spi < 0.85 ? "#cf3f3a" : health.spi < 0.95 ? "#c17d12" : "#158a5a") : "#64748b"}
            sub={health.spi !== null && health.spi < 1 ? "behind" : health.spi !== null ? "on track" : undefined}
          />
          <Stat
            label="Cost (CPI)"
            value={health.cpi !== null ? health.cpi.toFixed(2) : "—"}
            color={health.cpi !== null ? (health.cpi < 0.85 ? "#cf3f3a" : health.cpi < 0.95 ? "#c17d12" : "#158a5a") : "#64748b"}
            sub={health.cpi !== null && health.cpi < 1 ? "over budget" : health.cpi !== null ? "within budget" : undefined}
          />
          {burnPct !== null && (
            <Stat
              label="Budget Burned"
              value={`${burnPct}%`}
              color={burnPct > 90 ? "#cf3f3a" : burnPct > 75 ? "#c17d12" : "#158a5a"}
              sub="of total budget"
            />
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {burnPct !== null && (
            <Stat
              label="Budget Burned"
              value={`${burnPct}%`}
              color={burnPct > 90 ? "#cf3f3a" : burnPct > 75 ? "#c17d12" : "#158a5a"}
              sub="of total budget"
            />
          )}
        </div>
      )}
    </Section>
  );
}

// ── 3. Critical / High Issues ───────────────────────────────────────────────

function CriticalIssuesSection({ issues }: { issues: ReviewData["issues"] }) {
  const critical = issues.filter(i => i.status === "open" && i.severity === "critical");
  const high = issues.filter(i => i.status === "open" && i.severity === "high");
  const total = critical.length + high.length;

  return (
    <Section title={`Critical & High Issues${total > 0 ? ` (${total})` : ""}`} accent={total > 0 ? "#cf3f3a" : undefined}>
      {total === 0 ? (
        <Empty text="No critical or high-severity open issues" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {critical.map(i => (
            <IssueRiskRow
              key={i.id}
              description={i.description}
              owner={i.owner}
              label="Critical"
              labelColor="#cf3f3a"
            />
          ))}
          {high.map(i => (
            <IssueRiskRow
              key={i.id}
              description={i.description}
              owner={i.owner}
              label="High"
              labelColor="#c17d12"
            />
          ))}
        </div>
      )}
    </Section>
  );
}

// ── 4. Critical / High Risks ────────────────────────────────────────────────

function CriticalRisksSection({ risks }: { risks: ReviewData["risks"] }) {
  const criticalRisks = risks.filter(r =>
    r.status === "open" &&
    (r.probability === "very_high" || r.impact === "very_high" ||
     (r.probability === "high" && r.impact === "high"))
  );
  const highRisks = risks.filter(r =>
    r.status === "open" &&
    !criticalRisks.includes(r) &&
    (r.probability === "high" || r.impact === "high")
  );
  const total = criticalRisks.length + highRisks.length;

  return (
    <Section title={`Critical & High Risks${total > 0 ? ` (${total})` : ""}`} accent={total > 0 ? "#c17d12" : undefined}>
      {total === 0 ? (
        <Empty text="No critical or high open risks" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {criticalRisks.map(r => (
            <IssueRiskRow
              key={r.id}
              description={r.description}
              owner={r.owner}
              label={`${r.probability.replace("_", " ")} prob / ${r.impact.replace("_", " ")} impact`}
              labelColor="#cf3f3a"
            />
          ))}
          {highRisks.map(r => (
            <IssueRiskRow
              key={r.id}
              description={r.description}
              owner={r.owner}
              label={`${r.probability.replace("_", " ")} prob / ${r.impact.replace("_", " ")} impact`}
              labelColor="#c17d12"
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function IssueRiskRow({ description, owner, label, labelColor }: {
  description: string; owner: string | null; label: string; labelColor: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "9px 12px", borderRadius: 8,
      background: `${labelColor}08`, border: `1px solid ${labelColor}30`,
    }}>
      <div style={{ width: 3, alignSelf: "stretch", background: labelColor, borderRadius: 2, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#1e293b", lineHeight: 1.4 }}>{description}</p>
        {owner && <p style={{ margin: "3px 0 0", fontSize: 11, color: "#64748b" }}>Owner: {owner}</p>}
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, color: labelColor,
        background: `${labelColor}18`, border: `1px solid ${labelColor}40`,
        padding: "2px 7px", borderRadius: 5, flexShrink: 0, textTransform: "capitalize",
      }}>{label}</span>
    </div>
  );
}

// ── ReviewTab (main layout) ─────────────────────────────────────────────────

function ReviewTab({ data }: { data: ReviewData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* 1. Upcoming Milestones */}
      <MilestonesSection milestones={data.milestones} />

      {/* 2. Health & Metrics */}
      <HealthSection health={data.health} burnPct={data.burnPct} healthStatus={data.project.healthStatus} />

      {/* 3. Critical / High Issues */}
      <CriticalIssuesSection issues={data.issues} />

      {/* 4. Critical / High Risks */}
      <CriticalRisksSection risks={data.risks} />

      {/* Artifacts */}
      <Section title="Artifacts">
        {data.artifacts.length === 0
          ? <Empty text="No artifacts generated yet" />
          : data.artifacts.map((a) => (
            <Row key={a.artifactType}
              left={a.artifactType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              right={new Date(a.updatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
              badge={badge(a.status, a.status === "final" ? "#158a5a" : "#c17d12")}
            />
          ))}
      </Section>

      {/* Review Notes */}
      <Section title={`Review Notes (${data.reviewNotes.length})`}>
        {data.reviewNotes.length === 0
          ? <Empty text="No review notes" />
          : data.reviewNotes.map((n) => (
            <div key={n.id} style={{ borderLeft: "3px solid #e2e8f0", paddingLeft: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: UST_TEAL }}>{n.reviewType.replace(/_/g, " ")}</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(n.createdAt).toLocaleDateString("en-AU")}</span>
                {n.visibility === "dm_only" && badge("DM only", "#6b7280")}
              </div>
              <p style={{ fontSize: 13, color: "#1e293b", margin: 0, whiteSpace: "pre-wrap" }}>{n.body}</p>
            </div>
          ))}
      </Section>
    </div>
  );
}

// ── Action Item Tab ─────────────────────────────────────────────────────────

function ActionItemTab({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: "", description: "", category: "schedule", priority: "p2",
    dueDate: "", expectedOutcome: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!form.title.trim()) { setError("Title is required"); return; }
    if (form.priority === "p1" && form.description.trim().length < 40) {
      setError("P1 items require a description of at least 40 characters"); return;
    }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/action-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, dueDate: form.dueDate || null }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed to create action item"); }
      else { onCreated(); }
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }

  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4, display: "block" };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", border: `1.5px solid ${UST_BORDER}`,
    borderRadius: 8, fontSize: 13, color: "#1e293b", background: "#fff",
    boxSizing: "border-box" as const,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
        Create a formal action item for the project PM. They will be notified immediately.
      </p>

      {error && <div style={{ background: "#fbe4e2", color: "#cf3f3a", fontSize: 13, padding: "8px 12px", borderRadius: 8 }}>{error}</div>}

      <div>
        <label style={labelStyle}>Title *</label>
        <input style={inputStyle} maxLength={140} value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Produce a recovery plan for the SIT slip with revised dates" />
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{form.title.length}/140</div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Category</label>
          <select style={inputStyle} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, " ").replace(/\b\w/g, x => x.toUpperCase())}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Priority</label>
          <select style={inputStyle} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
            <option value="p1">P1 — Immediate (≤2 days)</option>
            <option value="p2">P2 — This week (≤5 days)</option>
            <option value="p3">P3 — This cycle (≤15 days)</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Due Date</label>
          <input type="date" style={inputStyle} value={form.dueDate}
            onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>
          Description{form.priority === "p1" ? " * (min 40 chars for P1)" : ""}
        </label>
        <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" as const }}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Describe specifically what the PM needs to do and why..." />
        {form.priority === "p1" && (
          <div style={{ fontSize: 11, color: form.description.length < 40 ? "#cf3f3a" : "#158a5a", marginTop: 3 }}>
            {form.description.length}/40 minimum
          </div>
        )}
      </div>

      <div>
        <label style={labelStyle}>Expected Outcome (optional)</label>
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" as const }}
          value={form.expectedOutcome}
          onChange={e => setForm(f => ({ ...f, expectedOutcome: e.target.value }))}
          placeholder="What does 'done' look like?" />
      </div>

      {(() => {
        const titleOk = form.title.trim().length > 0;
        const descOk = form.priority !== "p1" || form.description.trim().length >= 40;
        const canSubmit = titleOk && descOk && !saving;
        return (
          <button
            onClick={submit}
            disabled={!canSubmit}
            style={{
              padding: "10px 20px", background: UST_PETROL, color: "#fff", border: "none",
              borderRadius: 8, fontSize: 14, fontWeight: 600,
              cursor: canSubmit ? "pointer" : "not-allowed",
              opacity: canSubmit ? 1 : 0.45, alignSelf: "flex-start",
            }}
          >
            {saving ? "Creating…" : "Create Action Item"}
          </button>
        );
      })()}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function DrillDownPanel({ projectId, onClose, initialTab, openActionItem, hideActionItem = false }: {
  projectId: string;
  onClose: () => void;
  initialTab: Tab;
  openActionItem: () => void;
  hideActionItem?: boolean;
}) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [actionItemCreated, setActionItemCreated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/dm-review`);
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function handleActionItemCreated() {
    setActionItemCreated(true);
    setTab("review");
    load();
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{
        fontSize: 13, fontWeight: 600, padding: "8px 16px", border: "none", cursor: "pointer",
        background: tab === t ? UST_PETROL : "transparent",
        color: tab === t ? "#fff" : "#64748b",
        borderRadius: 8,
      }}
    >{label}</button>
  );

  const project = data?.project;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 40 }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(680px, 95vw)",
        background: "#fff", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)", zIndex: 50,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${UST_BORDER}`, background: UST_WASH }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
                {project?.accountName ?? "—"}{project?.programName ? ` › ${project.programName}` : ""}
              </div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: UST_PETROL, margin: 0 }}>
                {project?.name ?? "Loading…"}
              </h2>
              {project && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                  PM: {project.pmName} · {project.currentPhase.replace(/_/g, " ")} · {project.healthStatus.toUpperCase()}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", color: "#94a3b8", lineHeight: 1, padding: 4 }}
              aria-label="Close"
            >✕</button>
          </div>

          {actionItemCreated && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: "#e3f3ea", borderRadius: 8, fontSize: 13, color: "#158a5a", fontWeight: 600 }}>
              ✓ Action item created — PM has been notified
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "10px 16px", borderBottom: `1px solid ${UST_BORDER}` }}>
          {tabBtn("review", "Project Review")}
          {!hideActionItem && tabBtn("action-item", "Create Action Item")}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", paddingTop: 60, color: "#94a3b8" }}>Loading project data…</div>
          ) : data ? (
            tab === "review"
              ? <ReviewTab data={data} />
              : <ActionItemTab projectId={projectId} onCreated={handleActionItemCreated} />
          ) : (
            <div style={{ textAlign: "center", paddingTop: 60, color: "#cf3f3a" }}>Failed to load project data</div>
          )}
        </div>
      </div>
    </>
  );
}
