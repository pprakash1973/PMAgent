"use client";
import { useState } from "react";
import Link from "next/link";
import { EscalateModal } from "@/components/pgm/escalate-modal";
import { AssignPmModal } from "@/components/pgm/assign-pm-modal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Risk {
  id: string; description: string; probability: string; impact: string;
  status: string; owner: string | null; category: string | null;
}
interface Milestone { id: string; name: string; dueDate: string; status: string }
interface Artifact  { id: string; artifactType: string; createdAt: string }
interface Task      { id: string; name: string | null; baselineStart: string | null; baselineFinish: string | null; percentComplete: number }
interface Report    { id: string; reportDate: string; healthScore: { ragStatus: string | null; spi: number | null; cpi: number | null } | null }
interface Assignment { id: string; effectiveFrom: string; effectiveTo: string | null; reason: string; user: { fullName: string; email: string } }
interface Escalation { id: string; title: string; severity: string; status: string; createdAt: string; raisedBy: { fullName: string } }
interface Project {
  id: string; name: string; code: string | null; status: string; budget: number | null; startDate: string | null; endDate: string | null;
  healthStatus: string;
  pmOwner: { id: string; fullName: string; email: string };
  program: { name: string; client: { name: string } } | null;
  milestones: Milestone[]; risks: Risk[]; issues: { id: string; title: string; status: string; priority: string }[];
  artifacts: Artifact[]; scheduleTasks: Task[]; statusReports: Report[];
  pmAssignments: Assignment[]; escalations: Escalation[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RC: Record<string, string> = { red: "#cf3f3a", amber: "#c17d12", green: "#158a5a" };
const RL: Record<string, string> = { red: "Critical", amber: "At Risk", green: "On Track" };
const T = { bg: "#F2F7F8", border: "#D7E0E3", petrol: "#003C51", teal: "#006E74", text: "#231F20", muted: "#7A7480", card: "#fff" };

function spiColor(v: number | null) { return v === null ? T.muted : v >= 1 ? "#158a5a" : v >= 0.85 ? "#c17d12" : "#cf3f3a"; }
function fmtDate(s: string | null) { return s ? new Date(s).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "—"; }
function fmtCcy(n: number) { return new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", maximumFractionDigits:0 }).format(n); }

// ─── Component ────────────────────────────────────────────────────────────────

export default function PgmProjectDetailClient({
  project, spi, cpi, schedPct, budPct, totalSpent, rag, userRole, userId,
}: {
  project: Project; spi: number | null; cpi: number | null; schedPct: number;
  budPct: number; totalSpent: number; rag: string; userRole: string; userId: string;
}) {
  const [tab, setTab]         = useState<"overview"|"health"|"artifacts"|"risks"|"team"|"activity">("overview");
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalateRisk, setEscalateRisk] = useState<Risk | null>(null);
  const [showAssignPm, setShowAssignPm] = useState(false);
  const [currentPmName, setCurrentPmName] = useState(project.pmOwner.fullName);
  const [escalated, setEscalated] = useState(false);

  const tabs = [
    { id: "overview",  label: "Overview" },
    { id: "health",    label: "Health & EVM" },
    { id: "artifacts", label: "Artifacts" },
    { id: "risks",     label: `Risks & Issues (${project.risks.length + project.issues.length})` },
    { id: "team",      label: "Team" },
    { id: "activity",  label: "Activity" },
  ] as const;

  const canEscalate = ["pgm","dh","admin","pm"].includes(userRole);
  const canAssignPm = ["pgm","admin"].includes(userRole);

  return (
    <div style={{ height: "100%", overflowY: "auto", background: T.bg, fontFamily: "'Aptos','Calibri',sans-serif" }}>
      {showEscalate && (
        <EscalateModal
          project={{ id: project.id, name: project.name, rag, spi, cpi, schedPct }}
          risk={escalateRisk ?? undefined}
          onClose={() => { setShowEscalate(false); setEscalateRisk(null); }}
          onSuccess={() => { setShowEscalate(false); setEscalateRisk(null); setEscalated(true); }}
        />
      )}
      {showAssignPm && (
        <AssignPmModal
          projectId={project.id}
          projectName={project.name}
          currentPmName={currentPmName}
          onClose={() => setShowAssignPm(false)}
          onSuccess={(name) => { setCurrentPmName(name); setShowAssignPm(false); }}
        />
      )}

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "28px 32px 60px" }}>
        {/* Nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, fontSize: 12 }}>
          <Link href="/dashboard/program" style={{ color: T.teal, textDecoration: "none" }}>Dashboard</Link>
          <span style={{ color: T.muted }}>›</span>
          <Link href="/dashboard/program/projects" style={{ color: T.teal, textDecoration: "none" }}>Projects</Link>
          <span style={{ color: T.muted }}>›</span>
          <span style={{ color: T.muted }}>{project.name}</span>
        </div>

        {/* Read-only badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 8, padding: "5px 12px", marginBottom: 20, fontSize: 12, color: T.muted }}>
          🔍 Read-only · Program oversight view
        </div>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.petrol }}>{project.name}</h1>
              <span style={{ background: `${RC[rag]}18`, border: `1px solid ${RC[rag]}40`, borderRadius: 99, padding: "3px 10px", fontSize: 12, fontWeight: 700, color: RC[rag] }}>{RL[rag] ?? rag}</span>
              {project.escalations.length > 0 && (
                <span style={{ background: "#fbe4e2", border: "1px solid #cf3f3a40", borderRadius: 99, padding: "3px 10px", fontSize: 11.5, fontWeight: 700, color: "#cf3f3a" }}>
                  ⚠ {project.escalations.length} open escalation{project.escalations.length !== 1 ? "s" : ""}
                </span>
              )}
              {escalated && <span style={{ color: "#158a5a", fontSize: 12, fontWeight: 700 }}>✓ Escalated</span>}
            </div>
            <div style={{ fontSize: 13, color: T.muted }}>
              {project.program?.client?.name} · {project.program?.name} · PM: <strong style={{ color: T.text }}>{currentPmName}</strong>
            </div>
          </div>
          {canEscalate && (
            <button onClick={() => setShowEscalate(true)} style={{
              padding: "8px 16px", borderRadius: 8, border: `1px solid #cf3f3a`, background: "#fbe4e2",
              color: "#cf3f3a", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>↑ Escalate to DH</button>
          )}
        </div>

        {/* KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10, marginBottom: 24 }}>
          {[
            { label:"SPI",         value: spi?.toFixed(2) ?? "—",       color: spiColor(spi) },
            { label:"CPI",         value: cpi?.toFixed(2) ?? "—",       color: spiColor(cpi) },
            { label:"% Complete",  value: `${schedPct}%`,                color: T.petrol },
            { label:"Budget Used", value: `${budPct}%`,                  color: budPct>90?"#cf3f3a":T.petrol },
            { label:"Open Risks",  value: project.risks.filter(r=>r.status!=="closed").length, color: project.risks.filter(r=>r.status!=="closed").length>3?"#c17d12":T.petrol },
            { label:"Milestones",  value: project.milestones.length,     color: T.petrol },
          ].map(k => (
            <div key={k.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4, marginBottom: 3 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: `2px solid ${T.border}`, marginBottom: 24, overflowX: "auto" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "10px 18px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? T.teal : T.muted,
              borderBottom: tab === t.id ? `2px solid ${T.teal}` : "2px solid transparent",
              marginBottom: -2, whiteSpace: "nowrap",
            }}>{t.label}</button>
          ))}
        </div>

        {/* ─── Overview ─── */}
        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
              {[
                ["Status",       project.status],
                ["Phase",        (project as any).currentPhase ?? "—"],
                ["PM Owner",     currentPmName],
                ["Start Date",   fmtDate(project.startDate)],
                ["End Date",     fmtDate(project.endDate)],
                ["Budget",       project.budget ? fmtCcy(project.budget) : "—"],
                ["Spent",        fmtCcy(totalSpent)],
                ["Client",       project.program?.client?.name ?? "—"],
                ["Program",      project.program?.name ?? "—"],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 12.5, color: T.muted }}>{label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text, textTransform: "capitalize" }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.muted, marginBottom: 12, textTransform: "uppercase", letterSpacing: .4 }}>Milestones</div>
              {project.milestones.length === 0 ? (
                <div style={{ color: T.muted, fontSize: 13 }}>No milestones.</div>
              ) : project.milestones.map(m => {
                const overdue = new Date(m.dueDate) < new Date() && m.status !== "completed";
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 13, color: T.petrol, fontWeight: 600 }}>{m.name}</span>
                    <span style={{ fontSize: 12, color: overdue ? "#cf3f3a" : T.muted, fontWeight: overdue ? 700 : 400 }}>
                      {fmtDate(m.dueDate)} {m.status === "completed" ? "✓" : overdue ? "⚠" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Health & EVM ─── */}
        {tab === "health" && (
          <div>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.petrol }}>Status Report History</div>
              {project.statusReports.length === 0 ? (
                <div style={{ padding: 24, color: T.muted, fontSize: 13 }}>No status reports submitted yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: T.bg }}>
                      {["Report Date","RAG","SPI","CPI"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: T.muted }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {project.statusReports.map(r => {
                      const rr = r.healthScore?.ragStatus ?? "green";
                      return (
                        <tr key={r.id} style={{ borderTop: `1px solid ${T.border}` }}>
                          <td style={{ padding: "10px 16px", fontWeight: 600, color: T.petrol }}>{fmtDate(r.reportDate)}</td>
                          <td style={{ padding: "10px 16px" }}>
                            <span style={{ color: RC[rr], fontWeight: 700, fontSize: 12, textTransform: "capitalize" }}>● {RL[rr] ?? rr}</span>
                          </td>
                          <td style={{ padding: "10px 16px", color: spiColor(r.healthScore?.spi ?? null), fontWeight: 600 }}>{r.healthScore?.spi?.toFixed(2) ?? "—"}</td>
                          <td style={{ padding: "10px 16px", color: spiColor(r.healthScore?.cpi ?? null), fontWeight: 600 }}>{r.healthScore?.cpi?.toFixed(2) ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {project.scheduleTasks.length > 0 && (
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.petrol }}>Schedule Tasks</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: T.bg }}>
                      {["Task","Start","Finish","% Done"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: T.muted }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {project.scheduleTasks.map((t, i) => (
                      <tr key={t.id} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={{ padding: "9px 16px", color: T.text }}>{t.name ?? `Task ${i+1}`}</td>
                        <td style={{ padding: "9px 16px", color: T.muted }}>{fmtDate(t.baselineStart)}</td>
                        <td style={{ padding: "9px 16px", color: T.muted }}>{fmtDate(t.baselineFinish)}</td>
                        <td style={{ padding: "9px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 4, background: "#eef0f3", borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${t.percentComplete}%`, background: t.percentComplete===100?"#158a5a":T.teal, borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 11.5, color: T.muted, minWidth: 30 }}>{t.percentComplete}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── Artifacts ─── */}
        {tab === "artifacts" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
            {project.artifacts.length === 0 ? (
              <div style={{ gridColumn: "1/-1", background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 40, textAlign: "center", color: T.muted, fontSize: 13 }}>No artifacts generated yet.</div>
            ) : project.artifacts.map(a => (
              <div key={a.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: T.petrol, textTransform: "capitalize", marginBottom: 4 }}>{a.artifactType.replace(/_/g," ")}</div>
                <div style={{ fontSize: 12, color: T.muted }}>{fmtDate(a.createdAt)}</div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Risks & Issues ─── */}
        {tab === "risks" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.petrol }}>Risk Register ({project.risks.length})</span>
              </div>
              {project.risks.length === 0 ? (
                <div style={{ padding: 24, color: T.muted, fontSize: 13 }}>No risks recorded.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: T.bg }}>
                      {["Risk","Probability","Impact","Owner","Status",""].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: 11.5, fontWeight: 700, color: T.muted }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {project.risks.map(r => {
                      const pHigh = ["high","very_high"].includes(r.probability.toLowerCase());
                      const iHigh = ["high","very_high"].includes(r.impact.toLowerCase());
                      return (
                        <tr key={r.id} style={{ borderTop: `1px solid ${T.border}` }}>
                          <td style={{ padding: "10px 14px", fontWeight: 600, color: T.petrol, maxWidth: 240 }}>{r.description.slice(0,80)}</td>
                          <td style={{ padding: "10px 14px", color: pHigh?"#cf3f3a":T.muted, fontWeight: pHigh?700:400, textTransform:"capitalize" }}>{r.probability}</td>
                          <td style={{ padding: "10px 14px", color: iHigh?"#c17d12":T.muted, fontWeight: iHigh?700:400, textTransform:"capitalize" }}>{r.impact}</td>
                          <td style={{ padding: "10px 14px", color: T.muted }}>{r.owner ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: T.muted, textTransform: "capitalize" }}>{r.status}</td>
                          <td style={{ padding: "10px 14px" }}>
                            {canEscalate && r.status !== "closed" && (
                              <button
                                onClick={() => { setEscalateRisk(r); setShowEscalate(true); }}
                                style={{ fontSize: 11.5, color: "#cf3f3a", background: "#fbe4e2", border: "1px solid #cf3f3a30", padding: "3px 9px", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}
                              >Escalate</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.petrol }}>Issue Log ({project.issues.length})</div>
              {project.issues.length === 0 ? (
                <div style={{ padding: 24, color: T.muted, fontSize: 13 }}>No issues recorded.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: T.bg }}>
                      {["Issue","Priority","Status"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: 11.5, fontWeight: 700, color: T.muted }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {project.issues.map(iss => (
                      <tr key={iss.id} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={{ padding: "10px 14px", color: T.petrol, fontWeight: 600 }}>{iss.title}</td>
                        <td style={{ padding: "10px 14px", color: iss.priority==="high"?"#c17d12":T.muted, textTransform:"capitalize" }}>{iss.priority}</td>
                        <td style={{ padding: "10px 14px", color: T.muted, textTransform:"capitalize" }}>{iss.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ─── Team ─── */}
        {tab === "team" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.petrol, marginBottom: 3 }}>Current PM Owner</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: T.petrol }}>{currentPmName}</div>
                </div>
                {canAssignPm && project.status !== "archived" && (
                  <button onClick={() => setShowAssignPm(true)} style={{
                    padding: "9px 18px", borderRadius: 8, border: `1px solid ${T.teal}`, background: T.card,
                    color: T.teal, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  }}>↔ Assign / Replace PM</button>
                )}
              </div>
            </div>

            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.petrol }}>PM Assignment History</div>
              {project.pmAssignments.length === 0 ? (
                <div style={{ padding: 24, color: T.muted, fontSize: 13 }}>No assignment history recorded.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: T.bg }}>
                      {["PM","From","To","Reason"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: T.muted }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {project.pmAssignments.map(a => (
                      <tr key={a.id} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={{ padding: "10px 16px", fontWeight: 600, color: T.petrol }}>{a.user.fullName}</td>
                        <td style={{ padding: "10px 16px", color: T.muted }}>{fmtDate(a.effectiveFrom)}</td>
                        <td style={{ padding: "10px 16px", color: T.muted }}>{a.effectiveTo ? fmtDate(a.effectiveTo) : <span style={{ color: "#158a5a", fontWeight: 700 }}>Current</span>}</td>
                        <td style={{ padding: "10px 16px", color: T.muted, fontSize: 12 }}>{a.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ─── Activity ─── */}
        {tab === "activity" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.petrol }}>
                Open Escalations ({project.escalations.length})
              </div>
              {project.escalations.length === 0 ? (
                <div style={{ padding: 24, color: T.muted, fontSize: 13 }}>No open escalations.</div>
              ) : project.escalations.map(e => (
                <div key={e.id} style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: T.petrol, fontSize: 13.5 }}>{e.title}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: e.severity==="critical"?"#cf3f3a":e.severity==="high"?"#c17d12":"#158a5a", textTransform: "capitalize" }}>{e.severity}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.muted }}>
                    Raised by {e.raisedBy.fullName} · {e.status} · {new Date(e.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>

            {canEscalate && project.escalations.length === 0 && rag === "red" && (
              <div style={{ background: "#fbe4e2", border: "1px solid #cf3f3a40", borderRadius: 12, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#cf3f3a", fontWeight: 700 }}>⚠ This project is Critical with no open escalation</span>
                <button onClick={() => setShowEscalate(true)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#cf3f3a", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Escalate Now
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
