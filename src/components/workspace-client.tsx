"use client";
import { useState } from "react";
import Link from "next/link";
import { ArtifactPanel } from "@/components/artifact-panel";
import { StatusForm } from "@/components/status-form";
import { BurndownDownloadButton } from "@/components/burndown-download-button";
import { formatDate, formatCurrency, methodologyLabel, ARTIFACT_FORMAT } from "@/lib/utils";

const C = {
  primary: "#4f5bd5", primaryLight: "#eef0fc", primaryBorder: "#cfd4f5",
  green: "#158a5a", greenLight: "#e3f3ea",
  amber: "#c17d12", amberLight: "#fbf0da",
  red: "#cf3f3a", redLight: "#fbe4e2",
  border: "#e2e5ea", borderLight: "#eceef2",
  surface: "#fff", surface2: "#f7f8fa",
  text: "#1a1d24", text2: "#5b616e", text3: "#8a909c",
};

function ragColor(s: string) {
  if (!s) return C.text3;
  const v = s.toLowerCase();
  if (v === "green" || v === "on track") return C.green;
  if (v === "amber" || v === "at risk") return C.amber;
  return C.red;
}
function ragBg(s: string) {
  const v = (s || "").toLowerCase();
  if (v === "green" || v === "on track") return C.greenLight;
  if (v === "amber" || v === "at risk") return C.amberLight;
  return C.redLight;
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color, background: bg,
      borderRadius: 6, padding: "3px 9px", whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: "8px 18px 4px",
      font: "700 10px 'IBM Plex Sans'",
      letterSpacing: ".05em", color: C.text3, textTransform: "uppercase" as const,
    }}>{label}</div>
  );
}

// ── Phase rail ─────────────────────────────────────────────────────────────────

const PHASES = ["Initiation", "Planning", "Execution", "Monitoring", "Closure"];

function PhaseRail({ current }: { current: string }) {
  const currentIdx = PHASES.findIndex(p => p.toLowerCase() === current.toLowerCase());
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 26px 18px", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        {PHASES.map((phase, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={phase} style={{ display: "flex", alignItems: "flex-start", flex: i < PHASES.length - 1 ? "1 1 auto" : undefined }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 88, flexShrink: 0 }}>
                <div style={{
                  width: active ? 38 : 34, height: active ? 38 : 34,
                  marginTop: active ? -2 : 0,
                  borderRadius: "50%",
                  background: done ? C.green : active ? C.surface : "#f2f4f7",
                  border: active ? `3px solid ${C.primary}` : done ? "none" : "1.5px solid #d3d7de",
                  boxShadow: active ? `0 0 0 5px #eef0fc` : done ? `0 2px 6px rgba(21,138,90,.3)` : "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {done && <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  {active && <span style={{ width: 11, height: 11, borderRadius: "50%", background: C.primary, display: "block" }} />}
                  {!done && !active && <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="#a8adb8" strokeWidth="1.8"/><path d="M8 11V8a4 4 0 018 0v3" stroke="#a8adb8" strokeWidth="1.8"/></svg>}
                </div>
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 600, color: active ? C.primary : done ? C.text : "#8a909c", marginTop: 8 }}>{phase}</span>
                <span style={{ fontSize: 10, color: done ? C.green : active ? C.amber : "#a8adb8", marginTop: 2 }}>
                  {done ? "Gate passed" : active ? "In progress" : "Locked"}
                </span>
              </div>
              {i < PHASES.length - 1 && (
                <div style={{ flex: 1, height: 2.5, background: done ? C.green : C.border, marginTop: 16, borderRadius: 2 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Artifacts tab ──────────────────────────────────────────────────────────────

function ArtifactsTab({ project, catalog }: { project: any; catalog: any[] }) {
  const latestStatus = project.statusReports?.[0];
  const healthScore = latestStatus?.healthScore?.compositeScore;
  const healthStatus = project.healthStatus || "green";

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      {/* Artifact panel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <ArtifactPanel
          projectId={project.id}
          artifacts={project.artifacts}
          selections={project.artifactSelections}
          catalog={catalog}
        />
      </div>

      {/* Right rail */}
      <div style={{ width: 288, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Project health */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 17px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".05em", color: C.text3, textTransform: "uppercase" as const, marginBottom: 12 }}>Project Health</div>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: `conic-gradient(${ragColor(healthStatus)} 0 ${healthScore || 0}%,#eceef2 ${healthScore || 0}% 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: "50%", background: C.surface,
                display: "flex", alignItems: "center", justifyContent: "center",
                font: "700 16px 'IBM Plex Mono'", color: ragColor(healthStatus),
              }}>{healthScore ? Math.round(healthScore) : "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: ragColor(healthStatus), textTransform: "capitalize" as const }}>{healthStatus}</div>
              <div style={{ fontSize: "11.5px", color: C.text3, marginTop: 2 }}>
                {project.budget ? formatCurrency(project.budget, project.currency) : "Budget TBD"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
            {[
              { label: "SPI", value: latestStatus?.scheduleVariance != null ? (1 + latestStatus.scheduleVariance / 100).toFixed(2) : "—", color: C.amber },
              { label: "CPI", value: latestStatus?.budgetVariance != null ? (1 + latestStatus.budgetVariance / 100).toFixed(2) : "—", color: C.green },
              { label: "Budget", value: project.budget ? `${Math.round((Number(latestStatus?.actualCost || 0) / project.budget) * 100)}%` : "—", color: C.text },
            ].map(m => (
              <div key={m.label} style={{ flex: 1, background: C.surface2, borderRadius: 9, padding: "9px 10px" }}>
                <div style={{ fontSize: 10, color: C.text3 }}>{m.label}</div>
                <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Recommendations */}
        {latestStatus?.aiSummary && (
          <div style={{ background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: `1px solid ${C.primaryBorder}`, borderRadius: 14, padding: "16px 17px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 11 }}>
              <span style={{ color: C.primary, fontSize: 14 }}>✦</span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: C.primary, textTransform: "uppercase" as const }}>AI Summary</span>
            </div>
            <p style={{ fontSize: "12.5px", color: "#3a3f52", lineHeight: 1.6, margin: 0 }}>{latestStatus.aiSummary}</p>
          </div>
        )}

        {/* Quick actions */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 17px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".05em", color: C.text3, textTransform: "uppercase" as const, marginBottom: 11 }}>Quick Actions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <BurndownDownloadButton projectId={project.id} />
            <Link href={`/dashboard/projects/${project.id}/settings`} style={{
              display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 12px",
              background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8,
              fontSize: 12.5, color: C.text2, textDecoration: "none", fontWeight: 500,
            }}>⚙ Project settings</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── RAID tab ───────────────────────────────────────────────────────────────────

function RAIDTab({ project }: { project: any }) {
  const risks = project.risks || [];
  const issues = project.issues || [];

  function severityColor(s: string) {
    if (s === "critical" || s === "high") return { color: C.red, bg: C.redLight };
    if (s === "medium") return { color: C.amber, bg: C.amberLight };
    return { color: C.green, bg: C.greenLight };
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: C.primary, borderRadius: 8, padding: "6px 13px" }}>Risks · {risks.length}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.text2, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 13px" }}>Issues · {issues.length}</span>
        <div style={{ flex: 1 }} />
        <button style={{ height: 32, padding: "0 12px", background: C.surface, border: `1px solid #d3d7de`, borderRadius: 8, font: `500 12px 'IBM Plex Sans'`, color: C.text2, cursor: "pointer" }}>+ Add risk</button>
      </div>

      {/* Risks table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 18px", background: C.surface2, font: `600 10px 'IBM Plex Sans'`, letterSpacing: ".05em", color: C.text3, textTransform: "uppercase" as const }}>
          <span style={{ width: 64 }}>ID</span>
          <span style={{ flex: 1 }}>Description</span>
          <span style={{ width: 70 }}>Prob</span>
          <span style={{ width: 70 }}>Impact</span>
          <span style={{ width: 80 }}>Score</span>
          <span style={{ width: 90 }}>Owner</span>
          <span style={{ width: 74 }}>Status</span>
        </div>
        {risks.length === 0 && <div style={{ padding: "20px 18px", fontSize: 13, color: C.text3 }}>No open risks — generate a Risk Register to populate.</div>}
        {risks.map((r: any, i: number) => {
          const sc = severityColor(r.severity || r.impact || "");
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderTop: `1px solid ${C.borderLight}` }}>
              <span className="mono" style={{ width: 64, fontSize: 12, fontWeight: 600, color: C.text2 }}>R-{String(i + 1).padStart(3, "0")}</span>
              <span style={{ flex: 1, fontSize: "12.5px" }}>{r.description}</span>
              <span style={{ width: 70 }}><Badge label={r.probability || "Med"} color={sc.color} bg={sc.bg} /></span>
              <span style={{ width: 70 }}><Badge label={r.impact || "Med"} color={sc.color} bg={sc.bg} /></span>
              <span className="mono" style={{ width: 80, fontSize: 13, fontWeight: 600, color: sc.color }}>{r.riskScore || "—"}</span>
              <span style={{ width: 90, fontSize: 12, color: C.text2 }}>{r.owner || "—"}</span>
              <span style={{ width: 74 }}><Badge label={r.status || "Open"} color={C.text2} bg={C.surface2} /></span>
            </div>
          );
        })}
      </div>

      {/* Issues table */}
      {issues.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "13px 18px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 14, fontWeight: 600 }}>Open Issues</div>
          {issues.map((iss: any) => {
            const sc = severityColor(iss.severity || "medium");
            return (
              <div key={iss.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 18px", borderTop: `1px solid ${C.borderLight}` }}>
                <Badge label={iss.severity || "Medium"} color={sc.color} bg={sc.bg} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 500 }}>{iss.description}</div>
                  {iss.resolutionPlan && <div style={{ fontSize: 11.5, color: C.text3, marginTop: 3 }}>Plan: {iss.resolutionPlan}</div>}
                </div>
                <span style={{ fontSize: 12, color: C.text2, whiteSpace: "nowrap" as const }}>{iss.owner || "—"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Schedule tab ───────────────────────────────────────────────────────────────

function ScheduleTab({ project }: { project: any }) {
  const milestones = project.milestones || [];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Milestone Plan</div>
        <span style={{ fontSize: "11.5px", color: C.text3 }}>{milestones.length} milestones</span>
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 18px", background: C.surface2, font: `600 10px 'IBM Plex Sans'`, letterSpacing: ".05em", color: C.text3, textTransform: "uppercase" as const }}>
          <span style={{ flex: 1 }}>Milestone</span>
          <span style={{ width: 110 }}>Due Date</span>
          <span style={{ width: 90 }}>Status</span>
        </div>
        {milestones.length === 0 && <div style={{ padding: "20px 18px", fontSize: 13, color: C.text3 }}>No milestones defined. Generate a Milestone Plan to populate.</div>}
        {milestones.map((m: any) => {
          const isAchieved = m.status === "achieved";
          const isDelayed = m.status === "delayed";
          return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderTop: `1px solid ${C.borderLight}` }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: isAchieved ? C.green : isDelayed ? C.red : "#a8adb8", fontSize: 14 }}>◆</span>
                <span style={{ fontSize: "12.5px", fontWeight: 500 }}>{m.name}</span>
              </div>
              <span className="mono" style={{ width: 110, fontSize: 12, color: C.text2 }}>{formatDate(m.dueDate)}</span>
              <span style={{ width: 90 }}>
                <Badge
                  label={isAchieved ? "Complete" : isDelayed ? "Slipped" : "On Track"}
                  color={isAchieved ? C.green : isDelayed ? C.red : C.text2}
                  bg={isAchieved ? C.greenLight : isDelayed ? C.redLight : C.surface2}
                />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Requirements tab ───────────────────────────────────────────────────────────

function RequirementsTab({ project }: { project: any }) {
  const docs = project.requirementsDocs || [];
  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" as const }}>
        {docs.map((doc: any) => {
          const ext = doc.fileName?.split(".").pop()?.toUpperCase() || "DOC";
          const colors: Record<string, string> = { PDF: "#b83b3b", DOCX: "#2b5cb8", DOC: "#2b5cb8", XLSX: "#1b7a46", XLS: "#1b7a46" };
          return (
            <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: "10px 14px" }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: colors[ext] || "#5b616e", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", font: "700 9px 'IBM Plex Sans'" }}>{ext}</div>
              <div>
                <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{doc.fileName}</div>
                <div className="mono" style={{ fontSize: "10.5px", color: C.text3 }}>uploaded · {formatDate(doc.createdAt)}</div>
              </div>
            </div>
          );
        })}
        <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1.5px dashed ${C.primaryBorder}`, borderRadius: 11, padding: "10px 18px", color: C.primary, fontSize: "12.5px", fontWeight: 600, background: "#faf9ff", cursor: "pointer" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" stroke="#4f5bd5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Upload requirements
          <input type="file" style={{ display: "none" }} />
        </label>
      </div>
      {docs.length === 0 && (
        <div style={{ background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: `1px solid ${C.primaryBorder}`, borderRadius: 14, padding: "24px 20px", textAlign: "center" as const }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.primary, marginBottom: 6 }}>No requirements documents uploaded</div>
          <div style={{ fontSize: 13, color: C.text2 }}>Upload a BRD, SOW, or requirements document to let the AI extract scope, stakeholders, and constraints automatically.</div>
        </div>
      )}
    </div>
  );
}

// ── Status tab ─────────────────────────────────────────────────────────────────

function StatusTab({ project }: { project: any }) {
  const latestStatus = project.statusReports?.[0];
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <StatusForm projectId={project.id} mode={project.engagementMode} />
      </div>
      {latestStatus?.aiSummary && (
        <div style={{ width: 330, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: `1px solid ${C.primaryBorder}`, borderRadius: 14, padding: "16px 17px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 11 }}>
              <span style={{ color: C.primary, fontSize: 14 }}>✦</span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: C.primary, textTransform: "uppercase" as const }}>AI Executive Summary</span>
            </div>
            <p style={{ fontSize: "12.5px", color: "#3a3f52", lineHeight: 1.6, margin: 0 }}>{latestStatus.aiSummary}</p>
            <p style={{ fontSize: "10.5px", color: C.text3, marginTop: 10, marginBottom: 0, fontStyle: "italic" }}>Grounded in your inputs — no figures added.</p>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 17px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".05em", color: C.text3, textTransform: "uppercase" as const }}>Health score</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: ragColor(project.healthStatus) }}>{latestStatus.healthScore?.compositeScore ? `${Math.round(latestStatus.healthScore.compositeScore)} · ` : ""}{project.healthStatus}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main workspace ─────────────────────────────────────────────────────────────

const TABS = ["Artifacts", "RAID", "Schedule", "Requirements", "Weekly Status"];

export function WorkspaceClient({ project, catalog }: { project: any; catalog: any[] }) {
  const [tab, setTab] = useState("Artifacts");

  const currentPhase = project.status === "completed" ? "Closure"
    : project.status === "on_hold" ? "Monitoring"
    : project.artifacts?.length > 0 ? "Planning"
    : "Initiation";

  return (
    <div style={{ padding: "22px 26px 40px" }}>
      {/* Top bar content */}
      <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/dashboard/projects" style={{ color: "#8a909c", textDecoration: "none", fontSize: 13 }}>← Projects</Link>
        <span style={{ color: C.border }}>/</span>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{project.name}</span>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: ragColor(project.healthStatus), display: "inline-block" }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: C.text2, border: `1px solid #d3d7de`, borderRadius: 999, padding: "2px 9px" }}>
              {project.engagementMode === "high_level" ? "Governance Mode" : "Detailed Mode"}
            </span>
          </div>
          <span className="mono" style={{ fontSize: 11, color: C.text3 }}>
            {project.code} · {project.customer || "Internal"} · {project.methodology}
          </span>
        </div>
      </div>

      {/* Phase rail */}
      <PhaseRail current={currentPhase} />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 26, borderBottom: `1.5px solid ${C.border}`, marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "0 1px 13px", border: "none", background: "transparent", cursor: "pointer",
              fontFamily: "'IBM Plex Sans',sans-serif", fontSize: "13.5px",
              fontWeight: tab === t ? 700 : 500,
              color: tab === t ? C.text : C.text3,
              borderBottom: tab === t ? `2.5px solid ${C.primary}` : "2.5px solid transparent",
              marginBottom: "-1.5px", transition: "color .15s",
            }}
          >{t}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "Artifacts" && <ArtifactsTab project={project} catalog={catalog} />}
      {tab === "RAID" && <RAIDTab project={project} />}
      {tab === "Schedule" && <ScheduleTab project={project} />}
      {tab === "Requirements" && <RequirementsTab project={project} />}
      {tab === "Weekly Status" && <StatusTab project={project} />}
    </div>
  );
}
