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

type AiSummary = {
  healthBullets: string[];
  pmProductivityScore: number | null;
  pmProductivityRationale: string | null;
  areasToImprove: string[];
};

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

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function fmtMoney(v: number | null, currency = "USD") {
  if (v === null) return "—";
  if (v >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${currency} ${(v / 1_000).toFixed(0)}K`;
  return `${currency} ${v.toFixed(0)}`;
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

function Stat({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ background: UST_WASH, border: `1px solid ${UST_BORDER}`, borderRadius: 8, padding: "10px 16px", textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// ── 0. Overview ─────────────────────────────────────────────────────────────

function OverviewSection({ data }: { data: ReviewData }) {
  const proj = data.project;
  const rag = data.health?.ragStatus ?? proj.healthStatus;
  const ragColor = healthColor(rag);
  const ragLabel = rag === "red" ? "RED" : rag === "amber" ? "AMBER" : "GREEN";
  const health = data.health;

  return (
    <Section title="Overview">
      {/* RAG + phase strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 14px", borderRadius: 20,
          background: `${ragColor}15`, border: `1.5px solid ${ragColor}50`,
        }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: ragColor }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: ragColor }}>{ragLabel}</span>
        </div>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          {proj.currentPhase.replace(/_/g, " ")} · PM: <strong>{proj.pmName}</strong>
        </span>
      </div>

      {/* Key dates + budget */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Start date", value: fmtDate(proj.startDate) },
          { label: "End date", value: fmtDate(proj.endDate) },
          { label: "Budget", value: fmtMoney(proj.budget, proj.currency) },
          { label: "Burn to date", value: data.burnPct !== null ? `${data.burnPct}%` : "—" },
        ].map(r => (
          <div key={r.label} style={{ background: UST_WASH, border: `1px solid ${UST_BORDER}`, borderRadius: 7, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* EVM stats */}
      {health ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Stat
            label="Composite"
            value={health.compositeScore !== null ? `${health.compositeScore.toFixed(0)}` : "—"}
            color={ragColor}
            sub="out of 100"
          />
          <Stat
            label="Schedule (SPI)"
            value={health.spi !== null ? health.spi.toFixed(2) : "—"}
            color={health.spi !== null ? (health.spi < 0.85 ? "#cf3f3a" : health.spi < 0.95 ? "#c17d12" : "#158a5a") : "#64748b"}
            sub={health.spi !== null ? (health.spi < 1 ? "behind" : "on track") : "no data"}
          />
          <Stat
            label="Cost (CPI)"
            value={health.cpi !== null ? health.cpi.toFixed(2) : "—"}
            color={health.cpi !== null ? (health.cpi < 0.85 ? "#cf3f3a" : health.cpi < 0.95 ? "#c17d12" : "#158a5a") : "#64748b"}
            sub={health.cpi !== null ? (health.cpi < 1 ? "over budget" : "within budget") : "no data"}
          />
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", margin: 0 }}>
          No status report submitted — EVM data unavailable.
        </p>
      )}
    </Section>
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
                <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: milestoneColor }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#1e293b" }}>{m.name}</span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: dl.color, background: `${dl.color}12`, padding: "1px 7px", borderRadius: 5 }}>{dl.text}</span>
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

// ── 2. Critical / High Issues ───────────────────────────────────────────────

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
            <IssueRiskRow key={i.id} description={i.description} owner={i.owner} label="Critical" labelColor="#cf3f3a" />
          ))}
          {high.map(i => (
            <IssueRiskRow key={i.id} description={i.description} owner={i.owner} label="High" labelColor="#c17d12" />
          ))}
        </div>
      )}
    </Section>
  );
}

// ── 3. Critical / High Risks ────────────────────────────────────────────────

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

// ── 4. AI Generated Summary ─────────────────────────────────────────────────

function AiSummarySection({ projectId }: { projectId: string }) {
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/projects/${projectId}/ai-summary`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (!cancelled) { setSummary(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <Section title="AI Generated Summary" accent={UST_TEAL}>
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0", color: "#64748b", fontSize: 13 }}>
          <div style={{
            width: 16, height: 16, border: `2px solid ${UST_TEAL}`, borderTopColor: "transparent",
            borderRadius: "50%", animation: "spin 0.8s linear infinite",
          }} />
          Generating DM insights…
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {error && (
        <p style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", margin: 0 }}>
          AI summary unavailable — check API connection.
        </p>
      )}

      {summary && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Project Health bullets */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Project Health
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
              {summary.healthBullets.map((b, i) => (
                <li key={i} style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.5 }}>{b}</li>
              ))}
            </ul>
          </div>

          {/* PM Productivity Score */}
          {summary.pmProductivityScore !== null && (
            <div style={{ background: UST_WASH, border: `1px solid ${UST_BORDER}`, borderRadius: 10, padding: "12px 16px", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{
                  fontSize: 28, fontWeight: 700, lineHeight: 1,
                  color: summary.pmProductivityScore >= 7 ? "#158a5a" : summary.pmProductivityScore >= 5 ? "#c17d12" : "#cf3f3a",
                }}>{summary.pmProductivityScore}</div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>/ 10</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>PM Productivity Score</div>
                <p style={{ margin: 0, fontSize: 13, color: "#1e293b", lineHeight: 1.45 }}>
                  {summary.pmProductivityRationale}
                </p>
              </div>
            </div>
          )}

          {/* Areas to improve */}
          {summary.areasToImprove.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Areas to Improve
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {summary.areasToImprove.map((area, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 10, padding: "8px 12px", borderRadius: 7,
                    background: "#fffbeb", border: "1px solid #fde68a",
                  }}>
                    <span style={{ color: "#c17d12", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.45 }}>{area}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div style={{
            fontSize: 11, color: "#94a3b8", fontStyle: "italic",
            borderTop: `1px dashed ${UST_BORDER}`, paddingTop: 10,
          }}>
            ⚠ This summary is generated by AI using current project data. Review with professional judgment before acting. AI analysis does not replace formal project review processes.
          </div>
        </div>
      )}
    </Section>
  );
}

// ── ReviewTab (main layout) ─────────────────────────────────────────────────

function ReviewTab({ data }: { data: ReviewData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <OverviewSection data={data} />
      <MilestonesSection milestones={data.milestones} />
      <CriticalIssuesSection issues={data.issues} />
      <CriticalRisksSection risks={data.risks} />
      <AiSummarySection projectId={data.project.id} />
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function DrillDownPanel({ projectId, onClose }: {
  projectId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);

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
        </div>

        {/* Title bar */}
        <div style={{ padding: "10px 20px", borderBottom: `1px solid ${UST_BORDER}`, background: "#fff" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: UST_PETROL }}>Project Review</span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", paddingTop: 60, color: "#94a3b8" }}>Loading project data…</div>
          ) : data ? (
            <ReviewTab data={data} />
          ) : (
            <div style={{ textAlign: "center", paddingTop: 60, color: "#cf3f3a" }}>Failed to load project data</div>
          )}
        </div>
      </div>
    </>
  );
}
