"use client";
import { useEffect, useState, useCallback } from "react";

const UST_PETROL = "#003C51";
const UST_TEAL = "#006E74";
const UST_BORDER = "#D7E0E3";
const UST_WASH = "#F2F7F8";

type Evm = {
  spi: number | null; cpi: number | null;
  pvHours: number; evHours: number; svHours: number;
  eac: number | null; schedCompletionPct: number | null; taskCount: number;
};

type ReviewData = {
  project: {
    id: string; name: string; currentPhase: string; healthStatus: string; ragStatus: string;
    accountName: string | null; programName: string | null; pmName: string;
    budget: number | null; currency: string; startDate: string | null; endDate: string | null;
  };
  burnPct: number | null;
  totalSpent: number;
  evm: Evm | null;
  health: { compositeScore: number | null; spi: number | null; cpi: number | null; ragStatus: string | null } | null;
  risks: { id: string; description: string; probability: string; impact: string; status: string; owner: string | null; dueDate: string | null }[];
  issues: { id: string; description: string; severity: string; status: string; owner: string | null }[];
  milestones: { id: string; name: string; dueDate: string; status: string }[];
  actionItems: { id: string; reference: string; title: string; priority: string; status: string; dueDate: string | null; raisedByName: string }[];
  reviewNotes: { id: string; reviewType: string; body: string; visibility: string; createdAt: string; authorName: string }[];
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function healthColor(rag: string | null) {
  if (rag === "red") return "#cf3f3a";
  if (rag === "amber") return "#c17d12";
  return "#158a5a";
}
function healthLabel(rag: string | null) {
  if (rag === "red") return "Critical";
  if (rag === "amber") return "At Risk";
  return "On Track";
}

function spiColor(v: number | null) {
  if (v === null) return "#94a3b8";
  if (v >= 1) return "#158a5a";
  if (v >= 0.9) return "#c17d12";
  return "#cf3f3a";
}

function daysFromNow(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function dueBadge(iso: string) {
  const d = daysFromNow(iso);
  if (d < 0) return { text: `${Math.abs(d)}d overdue`, color: "#cf3f3a" };
  if (d === 0) return { text: "Due today", color: "#cf3f3a" };
  if (d <= 14) return { text: `${d}d`, color: "#c17d12" };
  return { text: `${d}d`, color: "#64748b" };
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

function fmtHours(h: number) {
  return `${h.toFixed(0)}h`;
}

// ── Shared UI primitives ─────────────────────────────────────────────────────

function Section({ title, children, accent, count }: {
  title: string; children: React.ReactNode; accent?: string; count?: number;
}) {
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 11, fontWeight: 700, color: accent ?? UST_PETROL,
        marginBottom: 10, paddingBottom: 6,
        borderBottom: `2px solid ${accent ?? UST_BORDER}`,
        textTransform: "uppercase", letterSpacing: "0.06em",
      }}>
        {title}
        {count !== undefined && count > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
            background: `${accent ?? UST_TEAL}18`, color: accent ?? UST_TEAL,
          }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: 13, color: "#94a3b8", margin: 0, fontStyle: "italic" }}>{text}</p>;
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      flex: 1, background: UST_WASH, border: `1px solid ${UST_BORDER}`,
      borderRadius: 8, padding: "10px 14px", textAlign: "center" as const,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      background: UST_WASH, border: `1px solid ${UST_BORDER}`,
      borderRadius: 7, padding: "8px 12px",
    }}>
      <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{value}</span>
    </div>
  );
}

function RiskIssueRow({ description, owner, label, labelColor, pastDue }: {
  description: string; owner: string | null; label: string; labelColor: string; pastDue?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "9px 12px", borderRadius: 8,
      background: pastDue ? "#fff7f7" : `${labelColor}08`,
      border: `1px solid ${pastDue ? "#fca5a5" : labelColor + "30"}`,
    }}>
      <div style={{ width: 3, alignSelf: "stretch", background: labelColor, borderRadius: 2, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#1e293b", lineHeight: 1.4 }}>{description}</p>
        {owner && <p style={{ margin: "3px 0 0", fontSize: 11, color: "#64748b" }}>Owner: {owner}</p>}
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, color: labelColor,
        background: `${labelColor}18`, border: `1px solid ${labelColor}40`,
        padding: "2px 7px", borderRadius: 5, flexShrink: 0, textTransform: "capitalize" as const,
      }}>{label}</span>
    </div>
  );
}

// ── Tab 1: Overview (PM-style EVM view) ─────────────────────────────────────

function OverviewTab({ data }: { data: ReviewData }) {
  const proj = data.project;
  const rag = data.project.ragStatus ?? proj.healthStatus;
  const ragColor = healthColor(rag);
  const evm = data.evm;
  const spi = evm?.spi ?? null;
  const cpi = evm?.cpi ?? null;
  const sv = evm ? evm.svHours : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* RAG + phase */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 14px", borderRadius: 20,
          background: `${ragColor}15`, border: `1.5px solid ${ragColor}50`,
        }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: ragColor }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: ragColor }}>{healthLabel(rag)}</span>
        </div>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          {proj.currentPhase.replace(/_/g, " ")} · PM: <strong>{proj.pmName}</strong>
        </span>
        {proj.accountName && (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{proj.accountName}</span>
        )}
      </div>

      {/* Project info grid */}
      <Section title="Project Info">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <InfoRow label="Start date" value={fmtDate(proj.startDate)} />
          <InfoRow label="End date" value={fmtDate(proj.endDate)} />
          <InfoRow label="Budget" value={fmtMoney(proj.budget, proj.currency)} />
          <InfoRow label="Burn to date" value={data.burnPct !== null ? `${data.burnPct}%` : "—"} />
          <InfoRow label="Spent" value={fmtMoney(data.totalSpent, proj.currency)} />
          {evm?.eac !== null && evm?.eac !== undefined && (
            <InfoRow label="EAC" value={fmtMoney(evm.eac, proj.currency)} />
          )}
        </div>
      </Section>

      {/* Schedule EVM */}
      <Section title="Schedule Performance">
        {evm && evm.taskCount > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
              <KpiCard
                label="SPI"
                value={spi !== null ? spi.toFixed(2) : "—"}
                color={spiColor(spi)}
                sub={spi !== null ? (spi >= 1 ? "On schedule" : spi >= 0.9 ? "Slight delay" : "Behind schedule") : "no data"}
              />
              <KpiCard
                label="CPI"
                value={cpi !== null ? cpi.toFixed(2) : "—"}
                color={spiColor(cpi)}
                sub={cpi !== null ? (cpi >= 1 ? "Within budget" : cpi >= 0.9 ? "Slight overrun" : "Over budget") : "no data"}
              />
              {evm.schedCompletionPct !== null && (
                <KpiCard
                  label="Tasks Done"
                  value={`${evm.schedCompletionPct}%`}
                  color={UST_TEAL}
                  sub={`of ${evm.taskCount} tasks`}
                />
              )}
            </div>

            {/* PV / EV / SV row */}
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { label: "PV", value: fmtHours(evm.pvHours), sub: "Planned value" },
                { label: "EV", value: fmtHours(evm.evHours), sub: "Earned value" },
                {
                  label: "SV", sub: "Schedule variance",
                  value: sv !== null ? `${sv >= 0 ? "+" : ""}${fmtHours(sv)}` : "—",
                },
              ].map(k => (
                <div key={k.label} style={{
                  flex: 1, background: UST_WASH, border: `1px solid ${UST_BORDER}`,
                  borderRadius: 8, padding: "10px 14px",
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: UST_PETROL }}>{k.value}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginTop: 2 }}>{k.label}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{k.sub}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Empty text="No schedule tasks — EVM data unavailable." />
        )}
      </Section>
    </div>
  );
}

// ── Tab 2: Project Data ──────────────────────────────────────────────────────

function ProjectDataTab({ data }: { data: ReviewData }) {
  const now = Date.now();
  // Mirror PM view: status can be "completed" or "complete" — match by substring
  const isComplete = (s: string) => s.toLowerCase().includes("complet");
  const completed = data.milestones.filter(m => isComplete(m.status));
  const upcoming = data.milestones
    .filter(m => !isComplete(m.status))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  // Critical/High risks past their end date
  const pastDueRisks = data.risks.filter(r => {
    const isCritOrHigh =
      r.probability === "very_high" || r.impact === "very_high" ||
      r.probability === "high" || r.impact === "high";
    const pastDue = r.dueDate ? new Date(r.dueDate).getTime() < now : false;
    return r.status === "open" && isCritOrHigh && pastDue;
  });

  const inProgressIssues = data.issues.filter(i => i.status === "in_progress");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Completed Milestones */}
      <Section title="Completed Milestones" count={completed.length}>
        {completed.length === 0 ? (
          <Empty text="No milestones completed yet" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {completed.slice(0, 10).map(m => (
              <div key={m.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 8,
                background: "#f0fdf4", border: "1px solid #86efac",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#158a5a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ flex: 1, fontSize: 13, color: "#166534", fontWeight: 500 }}>{m.name}</span>
                <span style={{ fontSize: 11, color: "#64748b" }}>{fmtDate(m.dueDate)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Upcoming Milestones */}
      <Section title="Upcoming Milestones" count={upcoming.length}>
        {upcoming.length === 0 ? (
          <Empty text="No pending milestones" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {upcoming.slice(0, 8).map(m => {
              const db = dueBadge(m.dueDate);
              return (
                <div key={m.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 8,
                  background: m.status === "at_risk" ? "#fff7f7" : UST_WASH,
                  border: `1px solid ${m.status === "at_risk" ? "#fca5a5" : UST_BORDER}`,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: db.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#1e293b" }}>{m.name}</span>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: db.color, background: `${db.color}12`, padding: "1px 7px", borderRadius: 5 }}>{db.text}</span>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>{fmtDate(m.dueDate)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Critical & High Risks Past End Date */}
      <Section
        title="Critical & High Risks — Past End Date"
        accent={pastDueRisks.length > 0 ? "#cf3f3a" : undefined}
        count={pastDueRisks.length}
      >
        {pastDueRisks.length === 0 ? (
          <Empty text="No critical or high risks past their end date" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pastDueRisks.map(r => {
              const isCritical = r.probability === "very_high" || r.impact === "very_high" ||
                (r.probability === "high" && r.impact === "high");
              return (
                <RiskIssueRow
                  key={r.id}
                  description={r.description}
                  owner={r.owner}
                  label={`${r.probability.replace("_", " ")} / ${r.impact.replace("_", " ")} — due ${fmtDate(r.dueDate)}`}
                  labelColor={isCritical ? "#cf3f3a" : "#c17d12"}
                  pastDue
                />
              );
            })}
          </div>
        )}
      </Section>

      {/* Issues In Progress */}
      <Section
        title="Issues In Progress"
        accent={inProgressIssues.length > 0 ? "#c17d12" : undefined}
        count={inProgressIssues.length}
      >
        {inProgressIssues.length === 0 ? (
          <Empty text="No issues currently in progress" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {inProgressIssues.map(i => {
              const color = i.severity === "critical" ? "#cf3f3a" : i.severity === "high" ? "#c17d12" : "#64748b";
              return (
                <RiskIssueRow
                  key={i.id}
                  description={i.description}
                  owner={i.owner}
                  label={i.severity}
                  labelColor={color}
                />
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

type Tab = "overview" | "project_data";

export function DrillDownPanel({ projectId, onClose }: {
  projectId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

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

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview",     label: "Overview" },
    { id: "project_data", label: "Project Data" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 40 }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(700px, 95vw)",
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
                  PM: {project.pmName} · {project.currentPhase.replace(/_/g, " ")}
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

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: `1px solid ${UST_BORDER}`, background: "#fff", padding: "0 20px" }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 16px", fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? UST_TEAL : "#64748b",
                background: "none", border: "none", cursor: "pointer",
                borderBottom: `2px solid ${tab === t.id ? UST_TEAL : "transparent"}`,
                marginBottom: -1, transition: "color .15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", paddingTop: 60, color: "#94a3b8" }}>Loading project data…</div>
          ) : data ? (
            tab === "overview"
              ? <OverviewTab data={data} />
              : <ProjectDataTab data={data} />
          ) : (
            <div style={{ textAlign: "center", paddingTop: 60, color: "#cf3f3a" }}>Failed to load project data</div>
          )}
        </div>
      </div>
    </>
  );
}
