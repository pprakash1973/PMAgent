"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArtifactPanel } from "@/components/artifact-panel";
import { StatusQuestionnaire } from "@/components/status-questionnaire";
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

// Display phases (Monitoring runs alongside Execution in PMBOK, but we show it as a step)
const PHASES = ["Initiation", "Planning", "Execution", "Closure"];
// Map display names to DB values
const PHASE_DB: Record<string, string> = {
  Initiation: "initiation", Planning: "planning", Execution: "execution", Closure: "closure",
};

type GateItem = { key: string; label: string; met: boolean; hint?: string };
type GateData = { current: string; next: string | null; canAdvance: boolean; gates: GateItem[] };

function PhaseRail({ projectId, currentPhase, onPhaseAdvanced }: {
  projectId: string;
  currentPhase: string;
  onPhaseAdvanced: (newPhase: string) => void;
}) {
  const [gateData, setGateData] = useState<GateData | null>(null);
  const [showGate, setShowGate] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [overrideMode, setOverrideMode] = useState(false);
  const [justification, setJustification] = useState("");
  const [error, setError] = useState("");

  const currentIdx = PHASES.findIndex(p => PHASE_DB[p] === currentPhase);

  async function loadGate() {
    const res = await fetch(`/api/projects/${projectId}/phase-gate`);
    if (res.ok) setGateData(await res.json());
  }

  async function advance(override = false) {
    setAdvancing(true);
    setError("");
    const res = await fetch(`/api/projects/${projectId}/phase-gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ override, justification: justification || undefined }),
    });
    const data = await res.json();
    if (res.ok) {
      onPhaseAdvanced(data.current);
      setShowGate(false);
      setOverrideMode(false);
      setJustification("");
      setGateData(null);
    } else {
      setError(data.error === "GATE_BLOCKED" ? "Gate requirements not met. Use override with justification to proceed." : data.error === "JUSTIFICATION_REQUIRED" ? "Please enter a justification before overriding." : data.error || "Failed");
    }
    setAdvancing(false);
  }

  function openGate() {
    setShowGate(true);
    setOverrideMode(false);
    setError("");
    loadGate();
  }

  const nextPhaseName = PHASES.find(p => PHASE_DB[p] === gateData?.next);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 26px 16px", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "flex-start" }}>
          {PHASES.map((phase, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <div key={phase} style={{ display: "flex", alignItems: "flex-start", flex: i < PHASES.length - 1 ? "1 1 auto" : undefined }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 90, flexShrink: 0 }}>
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

        {/* Advance button — hidden if in Closure */}
        {currentIdx < PHASES.length - 1 && (
          <button
            onClick={openGate}
            style={{
              marginLeft: 20, marginTop: 2, height: 34, padding: "0 16px",
              background: C.primary, color: "#fff", border: "none",
              borderRadius: 9, font: `600 12px 'IBM Plex Sans',sans-serif`,
              cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
              boxShadow: "0 2px 6px rgba(79,91,213,.3)",
            }}
          >
            Advance phase →
          </button>
        )}
      </div>

      {/* Gate checklist panel */}
      {showGate && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                Gate Review: {PHASES[currentIdx]} → {nextPhaseName}
              </span>
              <div style={{ fontSize: 11.5, color: C.text3, marginTop: 2 }}>
                Complete all requirements to advance the project phase.
              </div>
            </div>
            <button onClick={() => setShowGate(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.text3 }}>×</button>
          </div>

          {!gateData ? (
            <div style={{ fontSize: 12.5, color: C.text3, padding: "8px 0" }}>Evaluating gate criteria…</div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {gateData.gates.map((g) => (
                  <div key={g.key} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px",
                    background: g.met ? "#e3f3ea" : "#f7f8fa",
                    borderRadius: 9, border: `1px solid ${g.met ? "#c1e4cf" : C.border}`,
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      background: g.met ? C.green : "#d3d7de",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {g.met
                        ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        : <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>
                      }
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: g.met ? C.green : C.text }}>{g.label}</div>
                      {!g.met && g.hint && <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{g.hint}</div>}
                    </div>
                  </div>
                ))}
              </div>

              {error && <div style={{ fontSize: 11.5, color: C.red, marginBottom: 10 }}>{error}</div>}

              {overrideMode && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.amber, marginBottom: 6 }}>Override justification (required)</div>
                  <textarea
                    value={justification}
                    onChange={e => setJustification(e.target.value)}
                    placeholder="Explain why gate criteria are being overridden…"
                    rows={2}
                    style={{
                      width: "100%", padding: "8px 10px", fontSize: 12.5,
                      border: `1px solid ${C.border}`, borderRadius: 8,
                      fontFamily: "'IBM Plex Sans',sans-serif", resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {gateData.canAdvance ? (
                  <button
                    onClick={() => advance(false)}
                    disabled={advancing}
                    style={{
                      height: 34, padding: "0 18px", background: advancing ? "#8a9ed4" : C.primary,
                      color: "#fff", border: "none", borderRadius: 9,
                      font: `600 12.5px 'IBM Plex Sans',sans-serif`, cursor: advancing ? "default" : "pointer",
                    }}
                  >{advancing ? "Advancing…" : `Advance to ${nextPhaseName}`}</button>
                ) : overrideMode ? (
                  <button
                    onClick={() => advance(true)}
                    disabled={advancing || !justification.trim()}
                    style={{
                      height: 34, padding: "0 18px",
                      background: advancing || !justification.trim() ? "#e2a060" : C.amber,
                      color: "#fff", border: "none", borderRadius: 9,
                      font: `600 12.5px 'IBM Plex Sans',sans-serif`,
                      cursor: advancing || !justification.trim() ? "default" : "pointer",
                    }}
                  >{advancing ? "Advancing…" : "Override & Advance"}</button>
                ) : (
                  <button
                    onClick={() => setOverrideMode(true)}
                    style={{
                      height: 34, padding: "0 14px", background: C.surface,
                      color: C.amber, border: `1px solid ${C.amber}40`, borderRadius: 9,
                      font: `500 12px 'IBM Plex Sans',sans-serif`, cursor: "pointer",
                    }}
                  >Override gate (manager)</button>
                )}
                {overrideMode && (
                  <button onClick={() => { setOverrideMode(false); setJustification(""); }}
                    style={{ background: "none", border: "none", fontSize: 12, color: C.text3, cursor: "pointer" }}>
                    Cancel override
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
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
          currentPhase={project.currentPhase || "initiation"}
          engagementMode={project.engagementMode || "detailed"}
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

// ── Recovery panel ─────────────────────────────────────────────────────────────

type RecoveryStep = { title: string; action: string; effort: string; impact: string };
type RecoveryPlan = { headline: string; steps: RecoveryStep[]; estimatedRecovery: string };

function effortColor(e: string) {
  if (e === "Low") return { color: C.green, bg: C.greenLight };
  if (e === "High") return { color: C.red, bg: C.redLight };
  return { color: C.amber, bg: C.amberLight };
}

function RecoveryPanel({ projectId, spi }: { projectId: string; spi: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<RecoveryPlan | null>(null);
  const [err, setErr] = useState("");

  async function load() {
    if (plan) { setOpen(true); return; }
    setOpen(true);
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule/recovery`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setPlan(data);
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Alert banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", background: C.redLight,
        border: `1px solid ${C.red}40`, borderRadius: open ? "12px 12px 0 0" : 12,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%", background: C.red,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>Schedule at risk — SPI {spi.toFixed(2)}</div>
          <div style={{ fontSize: 11.5, color: C.text2, marginTop: 1 }}>
            Project is significantly behind schedule. SPI below 0.80 requires corrective action.
          </div>
        </div>
        <button
          onClick={load}
          style={{
            height: 34, padding: "0 16px",
            background: C.red, color: "#fff",
            border: "none", borderRadius: 8,
            font: `700 12.5px 'IBM Plex Sans',sans-serif`, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
          }}
        >
          ⚡ Go To Green
        </button>
        {open && <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.text3, padding: "0 4px" }}>×</button>}
      </div>

      {/* Recovery plan panel */}
      {open && (
        <div style={{
          border: `1px solid ${C.red}40`, borderTop: "none",
          borderRadius: "0 0 12px 12px",
          background: "#fffcfc", padding: "18px 20px",
        }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.text3, fontSize: 13 }}>
              <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid #ccc", borderTopColor: C.red, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              Analysing schedule and generating recovery plan…
            </div>
          )}
          {err && <div style={{ fontSize: 13, color: C.red }}>{err}</div>}
          {plan && (
            <>
              {/* Headline */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18 }}>
                <span style={{ color: C.primary, fontSize: 16, flexShrink: 0 }}>✦</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: C.primary, textTransform: "uppercase" as const, marginBottom: 4 }}>AI Recovery Assessment</div>
                  <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6, margin: 0 }}>{plan.headline}</p>
                </div>
              </div>

              {/* Steps */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {plan.steps.map((s, i) => {
                  const effortC = effortColor(s.effort);
                  const impactC = effortColor(s.impact);
                  return (
                    <div key={i} style={{
                      display: "flex", gap: 14,
                      padding: "13px 15px",
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                    }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: "50%", background: C.primary,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        font: `700 12px 'IBM Plex Mono'`, color: "#fff", flexShrink: 0, marginTop: 1,
                      }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{s.title}</div>
                        <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.5 }}>{s.action}</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: effortC.color, background: effortC.bg, borderRadius: 5, padding: "2px 8px" }}>Effort: {s.effort}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: impactC.color, background: impactC.bg, borderRadius: 5, padding: "2px 8px" }}>Impact: {s.impact}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Recovery estimate */}
              <div style={{ padding: "10px 14px", background: C.primaryLight, border: `1px solid ${C.primaryBorder}`, borderRadius: 9, fontSize: 12.5, color: C.primary }}>
                <strong>Estimated recovery:</strong> {plan.estimatedRecovery}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Schedule tab ───────────────────────────────────────────────────────────────

function fmt(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function spiColor(spi: number | null) {
  if (spi === null) return C.text3;
  if (spi >= 1) return C.green;
  if (spi >= 0.85) return C.amber;
  return C.red;
}

function ScheduleTab({ project }: { project: any }) {
  const isGovernance = project.engagementMode === "high_level";
  const [tasks, setTasks] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [kpi, setKpi] = useState<{ pv: number; ev: number; spi: number | null; sv: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editPct, setEditPct] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [dateEditId, setDateEditId] = useState<string | null>(null);
  const [dateEditField, setDateEditField] = useState<"actualStart" | "actualFinish" | null>(null);
  const [dateEditVal, setDateEditVal] = useState("");
  const [assignEditId, setAssignEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadSchedule = useCallback(async () => {
    const [schedRes, resRes] = await Promise.all([
      fetch(`/api/projects/${project.id}/schedule`),
      fetch(`/api/projects/${project.id}/resources`),
    ]);
    if (schedRes.ok) {
      const data = await schedRes.json();
      setTasks(data.tasks ?? []);
      setKpi(data.kpi ?? null);
    }
    if (resRes.ok) setResources(await resRes.json());
    setLoading(false);
  }, [project.id]);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);
  useEffect(() => { if (editId && inputRef.current) inputRef.current.focus(); }, [editId]);
  useEffect(() => {
    if (!assignEditId) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("select")) setAssignEditId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [assignEditId]);

  async function generate() {
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/projects/${project.id}/schedule/generate`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to generate schedule"); setGenerating(false); return; }
    await loadSchedule();
    setGenerating(false);
  }

  async function saveProgress(taskId: string, pct: number) {
    setSavingId(taskId);
    const res = await fetch(`/api/projects/${project.id}/schedule/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percentComplete: pct }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks(ts => ts.map(t => t.id === taskId ? { ...t, ...updated } : t));
      await loadSchedule();
    }
    setSavingId(null);
    setEditId(null);
  }

  async function saveActualDate(taskId: string, field: "actualStart" | "actualFinish", val: string) {
    setDateEditId(null);
    setDateEditField(null);
    if (!val) return;
    const body: Record<string, string> = { [field]: new Date(val).toISOString() };
    const res = await fetch(`/api/projects/${project.id}/schedule/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks(ts => ts.map(t => t.id === taskId ? { ...t, ...updated } : t));
    }
  }

  async function saveAssignee(taskId: string, resourceId: string | null) {
    setAssignEditId(null);
    const res = await fetch(`/api/projects/${project.id}/schedule/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId }),
    });
    if (res.ok) {
      const updated = await res.json();
      // merge resource object from local resources list
      const resource = resourceId ? resources.find(r => r.id === resourceId) ?? null : null;
      setTasks(ts => ts.map(t => t.id === taskId ? { ...t, ...updated, resource } : t));
    }
  }

  // Gantt timeline bounds
  const minStart = tasks.length
    ? new Date(Math.min(...tasks.map(t => new Date(t.baselineStart).getTime())))
    : new Date();
  const maxFinish = tasks.length
    ? new Date(Math.max(...tasks.map(t => new Date(t.baselineFinish).getTime())))
    : new Date();
  const totalMs = Math.max(maxFinish.getTime() - minStart.getTime(), 1);
  const today = new Date();
  const todayPct = Math.max(0, Math.min(100, ((today.getTime() - minStart.getTime()) / totalMs) * 100));

  // Group tasks by phase
  const phases = Array.from(new Set(tasks.map(t => t.phase)));

  function barStyle(t: any) {
    const left = ((new Date(t.baselineStart).getTime() - minStart.getTime()) / totalMs) * 100;
    const width = ((new Date(t.baselineFinish).getTime() - new Date(t.baselineStart).getTime()) / totalMs) * 100;
    return { left: `${left}%`, width: `${Math.max(width, 0.5)}%` };
  }

  function statusColor(t: any) {
    if (t.percentComplete === 100) return C.green;
    if (t.percentComplete > 0) return C.primary;
    return "#c5cadb";
  }

  if (loading) {
    return <div style={{ padding: "40px 0", textAlign: "center" as const, color: C.text3, fontSize: 13 }}>Loading schedule…</div>;
  }

  return (
    <div>
      {/* ── Header bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Project Schedule</div>
        {tasks.length > 0 && (
          <span style={{ fontSize: "11.5px", color: C.text3 }}>
            {isGovernance
              ? `${tasks.filter(t => t.phase !== "Milestones").length} deliverables · ${tasks.filter(t => t.phase === "Milestones").length} milestones`
              : `${tasks.length} tasks · ${phases.length} phases`}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {tasks.length > 0 && (
          <a
            href={`/api/projects/${project.id}/schedule/export`}
            download
            style={{
              height: 32, padding: "0 14px",
              background: C.surface, color: C.text2,
              border: `1px solid ${C.border}`, borderRadius: 8,
              font: `600 12.5px 'IBM Plex Sans'`, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6, textDecoration: "none",
            }}
          >
            ↓ Export XLSX
          </a>
        )}
        <button
          onClick={generate}
          disabled={generating}
          style={{
            height: 32, padding: "0 14px",
            background: generating ? C.surface2 : C.primary,
            color: generating ? C.text3 : "#fff",
            border: "none", borderRadius: 8,
            font: `600 12.5px 'IBM Plex Sans'`, cursor: generating ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 7,
          }}
        >
          {generating
            ? <><span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid #ccc", borderTopColor: C.primary, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Generating…</>
            : tasks.length > 0
              ? (isGovernance ? "↺ Regenerate Timeline" : "↺ Regenerate from WBS")
              : (isGovernance ? "✦ Generate High-Level Timeline" : "✦ Generate from WBS")
          }
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 9, fontSize: 13, color: C.red, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {tasks.length === 0 && !error && (
        <div style={{ background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: `1px solid ${C.primaryBorder}`, borderRadius: 14, padding: "32px 24px", textAlign: "center" as const }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>📅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.primary, marginBottom: 8 }}>
            {isGovernance ? "No high-level timeline yet" : "No schedule yet"}
          </div>
          <div style={{ fontSize: 13, color: C.text2, maxWidth: 480, margin: "0 auto 18px" }}>
            {isGovernance
              ? "Generate a week-level deliverable timeline from your WBS. Each deliverable becomes a weekly band — milestones from your Milestone Plan are shown as diamond markers. Day-to-day task tracking stays in your client tool."
              : "Generate a schedule from your WBS artifact. The AI will sequence all work packages using critical-path scheduling, respecting dependencies and a 5-day working week."}
          </div>
          <div style={{ fontSize: 12, color: C.text3 }}>
            {isGovernance
              ? "You need a WBS artifact (and optionally a Milestone Plan) in the Artifacts tab first."
              : "You can also upload a new WBS (via the Artifacts tab) and then regenerate."}
          </div>
        </div>
      )}

      {tasks.length > 0 && isGovernance && (
        <GovernanceTimeline tasks={tasks} project={project} onProgress={async (taskId, pct) => {
          const res = await fetch(`/api/projects/${project.id}/schedule/${taskId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ percentComplete: pct }),
          });
          if (res.ok) { const u = await res.json(); setTasks(ts => ts.map(t => t.id === taskId ? { ...t, ...u } : t)); }
        }} />
      )}

      {tasks.length > 0 && !isGovernance && (
        <>
          {/* ── EVM KPI strip ── */}
          <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
            {[
              { label: "SPI", value: kpi?.spi != null ? kpi.spi.toFixed(2) : "—", sub: "Schedule Performance Index", color: spiColor(kpi?.spi ?? null), bg: kpi?.spi == null ? C.surface2 : kpi.spi >= 1 ? C.greenLight : kpi.spi >= 0.85 ? C.amberLight : C.redLight },
              { label: "SV", value: kpi?.sv != null ? `${kpi.sv > 0 ? "+" : ""}${kpi.sv.toFixed(1)}d` : "—", sub: "Schedule Variance (task-days)", color: (kpi?.sv ?? 0) >= 0 ? C.green : C.red, bg: (kpi?.sv ?? 0) >= 0 ? C.greenLight : C.redLight },
              { label: "EV", value: kpi?.ev != null ? `${kpi.ev.toFixed(1)}d` : "—", sub: "Earned Value (days)", color: C.primary, bg: C.primaryLight },
              { label: "PV", value: kpi?.pv != null ? `${kpi.pv.toFixed(1)}d` : "—", sub: "Planned Value (days)", color: C.text2, bg: C.surface2 },
            ].map(k => (
              <div key={k.label} style={{ flex: 1, background: k.bg, borderRadius: 12, padding: "13px 15px" }}>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: k.color, marginTop: 2 }}>{k.label}</div>
                <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Recovery alert ── */}
          {kpi?.spi != null && kpi.spi < 0.8 && (
            <RecoveryPanel projectId={project.id} spi={kpi.spi} />
          )}

          {/* ── Gantt ── */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            {/* Timeline header */}
            <div style={{ display: "flex", background: C.surface2, borderBottom: `1px solid ${C.borderLight}` }}>
              <div style={{ width: 320, flexShrink: 0, padding: "8px 16px", font: `600 10px 'IBM Plex Sans'`, letterSpacing: ".05em", color: C.text3, textTransform: "uppercase" as const }}>Task</div>
              <div style={{ width: 44, flexShrink: 0, padding: "8px 4px", font: `600 10px 'IBM Plex Sans'`, color: C.text3, textAlign: "center" as const, textTransform: "uppercase" as const }}>%</div>
              <div style={{ flex: 1, position: "relative", padding: "8px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", font: `500 10px 'IBM Plex Mono'`, color: C.text3 }}>
                  <span>{fmt(minStart)}</span>
                  <span>{fmt(maxFinish)}</span>
                </div>
              </div>
            </div>

            {phases.map(phase => (
              <div key={phase}>
                {/* Phase group header */}
                <div style={{ display: "flex", alignItems: "center", background: "#f0f1f9", borderTop: `1px solid ${C.borderLight}`, padding: "6px 16px" }}>
                  <div style={{ width: 320, font: `700 10.5px 'IBM Plex Sans'`, color: C.primary, letterSpacing: ".03em", textTransform: "uppercase" as const }}>{phase}</div>
                  <div style={{ flex: 1 }} />
                </div>

                {tasks.filter(t => t.phase === phase).map(t => {
                  const bar = barStyle(t);
                  const isEditing = editId === t.id;
                  const isSaving = savingId === t.id;
                  const pctColor = t.percentComplete === 100 ? C.green : t.percentComplete > 0 ? C.primary : C.text3;

                  return (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", borderTop: `1px solid ${C.borderLight}`, minHeight: 38 }}>
                      {/* Task name + meta + actual dates */}
                      <div style={{ width: 320, flexShrink: 0, padding: "9px 16px 9px 20px" }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: C.text, lineHeight: 1.3 }}>{t.name}</div>
                        <div style={{ fontSize: 12, color: C.text3, marginTop: 2, fontFamily: "'IBM Plex Mono',monospace" }}>
                          {t.wbsCode} · {t.baselineDays}d
                        </div>
                        {/* Assignee selector */}
                        {assignEditId === t.id ? (
                          <select
                            autoFocus
                            defaultValue={t.resource?.id ?? ""}
                            onBlur={e => saveAssignee(t.id, e.target.value || null)}
                            onChange={e => saveAssignee(t.id, e.target.value || null)}
                            style={{ fontSize: 11, height: 22, border: `1px solid ${C.primary}`, borderRadius: 5, padding: "0 4px", marginTop: 4, fontFamily: "'IBM Plex Sans',sans-serif", background: C.surface, maxWidth: 240 }}
                          >
                            <option value="">— Unassigned —</option>
                            {resources.map(r => <option key={r.id} value={r.id}>{r.name} ({r.role})</option>)}
                          </select>
                        ) : (
                          <div
                            onClick={() => resources.length > 0 && setAssignEditId(t.id)}
                            title={resources.length === 0 ? "Add team members in the Resources tab first" : "Click to assign"}
                            style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: t.resource ? C.primary : C.text3, background: t.resource ? C.primaryLight : "transparent", border: t.resource ? `1px solid ${C.primaryBorder}` : "1px dashed " + C.borderLight, borderRadius: 5, padding: "1px 7px", cursor: resources.length > 0 ? "pointer" : "default", maxWidth: 200 }}
                          >
                            {t.resource ? `👤 ${t.resource.name}` : resources.length > 0 ? "+ Assign" : "No resources"}
                          </div>
                        )}
                        {/* Actual start / finish — click to edit */}
                        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                          {(["actualStart", "actualFinish"] as const).map(field => {
                            const label = field === "actualStart" ? "Started" : "Finished";
                            const val = t[field];
                            const isDateEditing = dateEditId === t.id && dateEditField === field;
                            const chip = val ? fmt(val) : `+ ${label}`;
                            const chipColor = val ? C.text2 : C.text3;
                            const chipBg = val ? C.surface2 : "transparent";
                            const chipBorder = val ? C.border : "dashed 1px " + C.borderLight;
                            if (isDateEditing) {
                              return (
                                <input
                                  key={field}
                                  type="date"
                                  autoFocus
                                  defaultValue={val ? new Date(val).toISOString().slice(0, 10) : ""}
                                  onBlur={e => saveActualDate(t.id, field, e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") saveActualDate(t.id, field, (e.target as HTMLInputElement).value);
                                    if (e.key === "Escape") { setDateEditId(null); setDateEditField(null); }
                                  }}
                                  style={{ fontSize: 10, height: 20, border: `1px solid ${C.primary}`, borderRadius: 4, padding: "0 3px", fontFamily: "'IBM Plex Mono',monospace" }}
                                />
                              );
                            }
                            return (
                              <span
                                key={field}
                                onClick={() => { setDateEditId(t.id); setDateEditField(field); setDateEditVal(val ? new Date(val).toISOString().slice(0, 10) : ""); }}
                                title={`Click to set actual ${label.toLowerCase()} date`}
                                style={{ fontSize: 10, color: chipColor, background: chipBg, border: chipBorder, borderRadius: 4, padding: "1px 5px", cursor: "pointer", whiteSpace: "nowrap" as const }}
                              >
                                {chip}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* % complete cell — click to edit */}
                      <div
                        style={{ width: 44, flexShrink: 0, textAlign: "center" as const, cursor: "pointer", padding: "0 2px" }}
                        onClick={() => { if (!isEditing) { setEditId(t.id); setEditPct(t.percentComplete); } }}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            type="number" min={0} max={100}
                            value={editPct}
                            onChange={e => setEditPct(Number(e.target.value))}
                            onKeyDown={e => {
                              if (e.key === "Enter") saveProgress(t.id, editPct);
                              if (e.key === "Escape") setEditId(null);
                            }}
                            onBlur={() => saveProgress(t.id, editPct)}
                            style={{ width: 36, height: 24, textAlign: "center", fontSize: 11, border: `1px solid ${C.primary}`, borderRadius: 5, fontFamily: "'IBM Plex Mono',monospace", padding: 0 }}
                          />
                        ) : (
                          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, fontWeight: 600, color: pctColor }}>
                            {isSaving ? "…" : `${t.percentComplete}%`}
                          </span>
                        )}
                      </div>

                      {/* Gantt bar area */}
                      <div style={{ flex: 1, position: "relative", height: 38 }}>
                        {/* Today line */}
                        {todayPct >= 0 && todayPct <= 100 && (
                          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${todayPct}%`, width: 1.5, background: C.red, opacity: 0.5, zIndex: 2 }} />
                        )}
                        {/* Baseline bar */}
                        <div style={{
                          position: "absolute", top: "50%", transform: "translateY(-50%)",
                          ...bar,
                          height: 16, borderRadius: 4,
                          background: "#e2e5ea",
                          overflow: "hidden",
                        }}>
                          {/* Progress fill */}
                          <div style={{
                            position: "absolute", top: 0, left: 0, bottom: 0,
                            width: `${t.percentComplete}%`,
                            background: statusColor(t),
                            borderRadius: 4,
                            transition: "width .3s",
                          }} />
                        </div>
                        {/* Start / finish labels on hover area */}
                        <div style={{
                          position: "absolute", ...bar,
                          top: "50%", transform: "translateY(-50%)",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "0 4px", pointerEvents: "none",
                        }}>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Legend */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 18px", borderTop: `1px solid ${C.borderLight}`, background: C.surface2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 20, height: 8, borderRadius: 3, background: C.green }} />
                <span style={{ fontSize: 10.5, color: C.text3 }}>Complete</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 20, height: 8, borderRadius: 3, background: C.primary }} />
                <span style={{ fontSize: 10.5, color: C.text3 }}>In Progress</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 20, height: 8, borderRadius: 3, background: "#e2e5ea" }} />
                <span style={{ fontSize: 10.5, color: C.text3 }}>Not Started</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 1.5, height: 14, background: C.red, opacity: 0.5 }} />
                <span style={{ fontSize: 10.5, color: C.text3 }}>Today</span>
              </div>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: C.text3 }}>Click % to update progress · click date chips to set actuals</span>
            </div>
          </div>
        </>
      )}
      {/* end !isGovernance */}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Governance week-level timeline ─────────────────────────────────────────────

function GovernanceTimeline({ tasks, project, onProgress }: {
  tasks: any[];
  project: any;
  onProgress: (taskId: string, pct: number) => Promise<void>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editPct, setEditPct] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editId && inputRef.current) inputRef.current.focus(); }, [editId]);

  const deliverables = tasks.filter(t => t.phase !== "Milestones");
  const milestones = tasks.filter(t => t.phase === "Milestones");

  // Build week headers spanning the full project
  const allDates = tasks.flatMap(t => [new Date(t.baselineStart), new Date(t.baselineFinish)]);
  const minMs = Math.min(...allDates.map(d => d.getTime()));
  const maxMs = Math.max(...allDates.map(d => d.getTime()));
  // Snap to Monday for start
  const timelineStart = new Date(minMs);
  while (timelineStart.getDay() !== 1) timelineStart.setDate(timelineStart.getDate() - 1);
  // Snap to Sunday for end
  const timelineEnd = new Date(maxMs);
  while (timelineEnd.getDay() !== 0) timelineEnd.setDate(timelineEnd.getDate() + 1);
  const totalMs = Math.max(timelineEnd.getTime() - timelineStart.getTime(), 1);

  // Generate week buckets
  const weeks: Date[] = [];
  const cur = new Date(timelineStart);
  while (cur <= timelineEnd) {
    weeks.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }

  const today = new Date();
  const todayPct = Math.max(0, Math.min(100, ((today.getTime() - timelineStart.getTime()) / totalMs) * 100));

  function leftPct(d: Date) {
    return ((d.getTime() - timelineStart.getTime()) / totalMs) * 100;
  }
  function widthPct(s: Date, e: Date) {
    return Math.max(0.8, ((e.getTime() - s.getTime()) / totalMs) * 100);
  }

  const fmtWeek = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const phases = Array.from(new Set(deliverables.map(t => t.phase)));

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      {/* Week header */}
      <div style={{ display: "flex", background: C.surface2, borderBottom: `1px solid ${C.borderLight}` }}>
        <div style={{ width: 260, flexShrink: 0, padding: "8px 16px", font: `600 10px 'IBM Plex Sans'`, color: C.text3, letterSpacing: ".05em", textTransform: "uppercase" as const }}>
          Deliverable
        </div>
        <div style={{ width: 40, flexShrink: 0, padding: "8px 4px", font: `600 10px 'IBM Plex Sans'`, color: C.text3, textAlign: "center" as const }}>%</div>
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", height: "100%" }}>
            {weeks.map((w, i) => (
              <div key={i} style={{
                flex: 1, borderLeft: `1px solid ${C.borderLight}`, padding: "6px 2px 4px",
                font: `500 9px 'IBM Plex Mono'`, color: C.text3, textAlign: "center" as const, whiteSpace: "nowrap" as const,
                overflow: "hidden",
              }}>
                {weeks.length <= 20 ? fmtWeek(w) : i % 2 === 0 ? fmtWeek(w) : ""}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Phase groups + deliverable rows */}
      {phases.map(phase => (
        <div key={phase}>
          <div style={{ display: "flex", alignItems: "center", background: "#f0f1f9", borderTop: `1px solid ${C.borderLight}`, padding: "6px 16px" }}>
            <div style={{ width: 260, font: `700 10.5px 'IBM Plex Sans'`, color: C.primary, letterSpacing: ".03em", textTransform: "uppercase" as const }}>{phase}</div>
            <div style={{ flex: 1 }} />
          </div>
          {deliverables.filter(t => t.phase === phase).map(t => {
            const s = new Date(t.baselineStart);
            const e = new Date(t.baselineFinish);
            const left = leftPct(s);
            const width = widthPct(s, e);
            const weeks = Math.round(t.baselineDays / 5);
            const pctColor = t.percentComplete === 100 ? C.green : t.percentComplete > 0 ? C.primary : C.text3;
            const isEditing = editId === t.id;

            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", borderTop: `1px solid ${C.borderLight}`, minHeight: 44 }}>
                <div style={{ width: 260, flexShrink: 0, padding: "8px 16px 8px 20px" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: C.text, lineHeight: 1.3 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 2, fontFamily: "'IBM Plex Mono',monospace" }}>
                    {fmtWeek(s)} → {fmtWeek(e)} · {weeks}w
                  </div>
                </div>
                {/* % complete */}
                <div style={{ width: 40, flexShrink: 0, textAlign: "center" as const, cursor: "pointer" }}
                  onClick={() => { if (!isEditing) { setEditId(t.id); setEditPct(t.percentComplete); } }}>
                  {isEditing ? (
                    <input ref={inputRef} type="number" min={0} max={100} value={editPct}
                      onChange={ev => setEditPct(Number(ev.target.value))}
                      onKeyDown={ev => {
                        if (ev.key === "Enter") { onProgress(t.id, editPct); setEditId(null); }
                        if (ev.key === "Escape") setEditId(null);
                      }}
                      onBlur={() => { onProgress(t.id, editPct); setEditId(null); }}
                      style={{ width: 34, height: 22, textAlign: "center", fontSize: 11, border: `1px solid ${C.primary}`, borderRadius: 5, padding: 0 }}
                    />
                  ) : (
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600, color: pctColor }}>
                      {t.percentComplete}%
                    </span>
                  )}
                </div>
                {/* Week bar */}
                <div style={{ flex: 1, position: "relative", height: 44 }}>
                  {todayPct >= 0 && todayPct <= 100 && (
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: `${todayPct}%`, width: 1.5, background: C.red, opacity: 0.45, zIndex: 2 }} />
                  )}
                  <div style={{
                    position: "absolute", top: "50%", transform: "translateY(-50%)",
                    left: `${left}%`, width: `${width}%`,
                    height: 20, borderRadius: 5, background: "#e2e5ea", overflow: "hidden",
                  }}>
                    <div style={{
                      position: "absolute", top: 0, left: 0, bottom: 0,
                      width: `${t.percentComplete}%`,
                      background: t.percentComplete === 100 ? C.green : C.primary,
                      borderRadius: 5, transition: "width .3s",
                    }} />
                  </div>
                  {/* Week count label inside bar */}
                  {width > 4 && (
                    <div style={{
                      position: "absolute", top: "50%", transform: "translateY(-50%)",
                      left: `${left + 0.4}%`,
                      font: `600 10px 'IBM Plex Mono'`, color: t.percentComplete > 50 ? "#fff" : C.text3,
                      pointerEvents: "none", zIndex: 3,
                    }}>
                      {weeks}w
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Milestone row */}
      {milestones.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", background: "#fef8ec", borderTop: `1px solid ${C.borderLight}`, padding: "6px 16px" }}>
            <div style={{ width: 260, font: `700 10.5px 'IBM Plex Sans'`, color: "#b45309", letterSpacing: ".03em", textTransform: "uppercase" as const }}>Milestones</div>
          </div>
          <div style={{ display: "flex", borderTop: `1px solid ${C.borderLight}`, minHeight: 44, alignItems: "center" }}>
            <div style={{ width: 300, flexShrink: 0 }} />
            <div style={{ flex: 1, position: "relative", height: 44 }}>
              {todayPct >= 0 && todayPct <= 100 && (
                <div style={{ position: "absolute", top: 0, bottom: 0, left: `${todayPct}%`, width: 1.5, background: C.red, opacity: 0.45, zIndex: 2 }} />
              )}
              {milestones.map(m => {
                const d = new Date(m.baselineStart);
                const left = leftPct(d);
                return (
                  <div key={m.id} title={`${m.name} — ${fmtWeek(d)}`} style={{
                    position: "absolute", top: "50%", left: `${left}%`,
                    transform: "translate(-50%, -50%) rotate(45deg)",
                    width: 12, height: 12,
                    background: "#f59e0b", border: "2px solid #b45309",
                    zIndex: 4, cursor: "default",
                  }} />
                );
              })}
            </div>
          </div>
          {/* Milestone labels below */}
          {milestones.map(m => {
            const d = new Date(m.baselineStart);
            const left = leftPct(d);
            return (
              <div key={m.id + "-lbl"} style={{ display: "flex", borderTop: `1px solid ${C.borderLight}`, minHeight: 28, alignItems: "center" }}>
                <div style={{ width: 300, flexShrink: 0, padding: "4px 16px 4px 20px", fontSize: 12, color: "#b45309", fontWeight: 500 }}>{m.name}</div>
                <div style={{ flex: 1, position: "relative", height: 28 }}>
                  <div style={{ position: "absolute", top: "50%", left: `${left}%`, transform: "translateY(-50%)", font: `500 10px 'IBM Plex Mono'`, color: C.text3, whiteSpace: "nowrap" as const }}>
                    {fmtWeek(d)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 18px", borderTop: `1px solid ${C.borderLight}`, background: C.surface2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 20, height: 8, borderRadius: 3, background: C.green }} />
          <span style={{ fontSize: 10.5, color: C.text3 }}>Complete</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 20, height: 8, borderRadius: 3, background: C.primary }} />
          <span style={{ fontSize: 10.5, color: C.text3 }}>In Progress</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 14, height: 14, background: "#f59e0b", border: "2px solid #b45309", transform: "rotate(45deg)" }} />
          <span style={{ fontSize: 10.5, color: C.text3, marginLeft: 4 }}>Milestone</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 1.5, height: 14, background: C.red, opacity: 0.5 }} />
          <span style={{ fontSize: 10.5, color: C.text3 }}>Today</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: C.text3 }}>Click % to update delivery progress · day-to-day tasks tracked in client tool</span>
      </div>
    </div>
  );
}

// ── Resources tab ──────────────────────────────────────────────────────────────

const ROLES = ["Project Manager", "Business Analyst", "Developer", "QA Engineer", "Architect", "Designer", "DevOps", "Scrum Master", "Data Engineer", "Product Owner", "Consultant", "Other"];

function ResourcesTab({ project }: { project: any }) {
  const [resources, setResources] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const emptyForm = { name: "", role: "Developer", email: "", allocationPct: 100, startDate: "", endDate: "", ratePerDay: "", skills: "", notes: "" };
  const [form, setForm] = React.useState(emptyForm);

  async function load() {
    const res = await fetch(`/api/projects/${project.id}/resources`);
    if (res.ok) setResources(await res.json());
    setLoading(false);
  }
  React.useEffect(() => { load(); }, [project.id]);

  function openAdd() { setForm(emptyForm); setEditId(null); setShowForm(true); }
  function openEdit(r: any) {
    setForm({
      name: r.name, role: r.role, email: r.email || "", allocationPct: r.allocationPct,
      startDate: r.startDate ? r.startDate.slice(0, 10) : "",
      endDate: r.endDate ? r.endDate.slice(0, 10) : "",
      ratePerDay: r.ratePerDay ?? "", skills: r.skills || "", notes: r.notes || "",
    });
    setEditId(r.id); setShowForm(true);
  }

  async function save() {
    setSaving(true);
    const url = editId ? `/api/projects/${project.id}/resources/${editId}` : `/api/projects/${project.id}/resources`;
    const method = editId ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) { await load(); setShowForm(false); }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Remove this resource? Tasks assigned to them will become unassigned.")) return;
    setDeleting(id);
    await fetch(`/api/projects/${project.id}/resources/${id}`, { method: "DELETE" });
    await load();
    setDeleting(null);
  }

  const allocationColor = (pct: number) => pct > 100 ? C.red : pct >= 80 ? C.amber : C.green;

  if (loading) return <div style={{ padding: "40px 0", textAlign: "center" as const, color: C.text3, fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Resource Roster</div>
        {resources.length > 0 && <span style={{ fontSize: 11.5, color: C.text3, marginLeft: 10 }}>{resources.length} team member{resources.length !== 1 ? "s" : ""}</span>}
        <div style={{ flex: 1 }} />
        <button onClick={openAdd} style={{ height: 32, padding: "0 14px", background: C.primary, color: "#fff", border: "none", borderRadius: 8, font: `600 12.5px 'IBM Plex Sans'`, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          + Add Resource
        </button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div style={{ background: C.surface, border: `1.5px solid ${C.primaryBorder}`, borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 14 }}>{editId ? "Edit Resource" : "Add Team Member"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            {[
              { label: "Name *", key: "name", type: "text", placeholder: "Full name" },
              { label: "Email", key: "email", type: "email", placeholder: "m365@company.com" },
              { label: "Rate / Day ($)", key: "ratePerDay", type: "number", placeholder: "0" },
            ].map(f => (
              <label key={f.key} style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.text2 }}>{f.label}</span>
                <input type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ height: 32, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 10px", fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", outline: "none" }} />
              </label>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <label style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.text2 }}>Role *</span>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                style={{ height: 32, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 8px", fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", background: C.surface }}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.text2 }}>Allocation %</span>
              <input type="number" min={10} max={200} value={form.allocationPct}
                onChange={e => setForm(p => ({ ...p, allocationPct: Number(e.target.value) }))}
                style={{ height: 32, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 10px", fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.text2 }}>Start Date</span>
              <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                style={{ height: 32, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 8px", fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.text2 }}>End Date</span>
              <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                style={{ height: 32, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 8px", fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif" }} />
            </label>
          </div>
          <label style={{ display: "flex", flexDirection: "column" as const, gap: 4, marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.text2 }}>Skills / Technologies</span>
            <input type="text" placeholder="e.g. React, Node.js, AWS" value={form.skills}
              onChange={e => setForm(p => ({ ...p, skills: e.target.value }))}
              style={{ height: 32, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 10px", fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif" }} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} disabled={saving || !form.name.trim()}
              style={{ height: 32, padding: "0 18px", background: form.name.trim() ? C.primary : C.surface2, color: form.name.trim() ? "#fff" : C.text3, border: "none", borderRadius: 8, font: `600 12.5px 'IBM Plex Sans'`, cursor: form.name.trim() ? "pointer" : "not-allowed" }}>
              {saving ? "Saving…" : editId ? "Save Changes" : "Add Resource"}
            </button>
            <button onClick={() => setShowForm(false)} style={{ height: 32, padding: "0 14px", background: "none", border: `1px solid ${C.border}`, borderRadius: 8, font: `600 12.5px 'IBM Plex Sans'`, cursor: "pointer", color: C.text2 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Roster table */}
      {resources.length === 0 && !showForm ? (
        <div style={{ background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: `1px solid ${C.primaryBorder}`, borderRadius: 14, padding: "32px 24px", textAlign: "center" as const }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.primary, marginBottom: 8 }}>No team members yet</div>
          <div style={{ fontSize: 13, color: C.text2, maxWidth: 420, margin: "0 auto 18px" }}>Add your project team here. Once added, you can assign resources directly to schedule tasks.</div>
          <button onClick={openAdd} style={{ height: 34, padding: "0 18px", background: C.primary, color: "#fff", border: "none", borderRadius: 8, font: `600 13px 'IBM Plex Sans'`, cursor: "pointer" }}>+ Add First Resource</button>
        </div>
      ) : resources.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 2fr 80px 80px 80px 80px", background: C.surface2, borderBottom: `1px solid ${C.border}`, padding: "8px 16px", gap: 8 }}>
            {["Name", "Role", "Email", "Alloc %", "Start", "End", ""].map((h, i) => (
              <div key={i} style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".05em" }}>{h}</div>
            ))}
          </div>
          {resources.map((r, idx) => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 2fr 80px 80px 80px 80px", padding: "11px 16px", gap: 8, borderTop: idx === 0 ? "none" : `1px solid ${C.borderLight}`, alignItems: "center", background: idx % 2 === 0 ? C.surface : C.surface2 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.name}</div>
                {r.skills && <div style={{ fontSize: 10.5, color: C.text3, marginTop: 1 }}>{r.skills}</div>}
              </div>
              <div style={{ fontSize: 12, color: C.text2 }}>{r.role}</div>
              <div style={{ fontSize: 11.5, color: C.text3, fontFamily: "'IBM Plex Mono',monospace" }}>{r.email || "—"}</div>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: allocationColor(r.allocationPct), background: allocationColor(r.allocationPct) + "20", borderRadius: 6, padding: "2px 7px" }}>
                  {r.allocationPct}%
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: C.text3, fontFamily: "'IBM Plex Mono',monospace" }}>{r.startDate ? r.startDate.slice(0, 10) : "—"}</div>
              <div style={{ fontSize: 11.5, color: C.text3, fontFamily: "'IBM Plex Mono',monospace" }}>{r.endDate ? r.endDate.slice(0, 10) : "—"}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => openEdit(r)} title="Edit" style={{ width: 28, height: 28, border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.text2, fontSize: 13 }}>✎</button>
                <button onClick={() => remove(r.id)} disabled={deleting === r.id} title="Remove" style={{ width: 28, height: 28, border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.red, fontSize: 13, opacity: deleting === r.id ? 0.5 : 1 }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Requirements tab ───────────────────────────────────────────────────────────

const DOC_CLASS_OPTIONS = [
  { value: "sow",        label: "Statement of Work (SOW)",   pts: 30 },
  { value: "brd",        label: "Business Requirements (BRD)", pts: 25 },
  { value: "srs",        label: "Software Requirements (SRS)", pts: 20 },
  { value: "estimation", label: "Estimation Sheet",           pts: 15 },
  { value: "proposal",   label: "Proposal",                   pts: 10 },
  { value: "contract",   label: "Contract",                   pts: 10 },
  { value: "cr",         label: "Change Request",              pts: 5  },
  { value: "other",      label: "Other",                      pts: 5  },
];

const EXT_COLORS: Record<string, string> = { PDF: "#b83b3b", DOCX: "#2b5cb8", DOC: "#2b5cb8", XLSX: "#1b7a46", XLS: "#1b7a46", TXT: "#5b616e", CSV: "#5b616e" };
const CLASS_LABELS: Record<string, string> = { sow: "SOW", brd: "BRD", srs: "SRS", estimation: "Est.", proposal: "Proposal", contract: "Contract", cr: "CR", other: "Other" };

function ReadinessBadge({ band, score }: { band: string; score: number }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    strong:       { bg: "#e3f3ea", color: "#158a5a", label: "Strong" },
    adequate:     { bg: "#eef0fc", color: "#4f5bd5", label: "Adequate" },
    marginal:     { bg: "#fbf0da", color: "#c17d12", label: "Marginal" },
    insufficient: { bg: "#fbe4e2", color: "#cf3f3a", label: "Insufficient" },
  };
  const s = cfg[band] ?? cfg.insufficient;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: s.bg, borderRadius: 10, padding: "8px 14px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>{Math.round(score)}</div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label} evidence</div>
        <div style={{ fontSize: 10, color: s.color, opacity: 0.7 }}>readiness score / 100</div>
      </div>
    </div>
  );
}

const REQ_STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  proposed:  { color: "#c17d12", bg: "#fbf0da", label: "Proposed" },
  confirmed: { color: "#158a5a", bg: "#e3f3ea", label: "Confirmed" },
  rejected:  { color: "#cf3f3a", bg: "#fbe4e2", label: "Rejected" },
};

function RequirementsTab({ project }: { project: any }) {
  const router = useRouter();
  const [docs, setDocs] = React.useState<any[]>(project.requirementsDocs || []);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [extracted, setExtracted] = React.useState<any | null>(null);
  const [docClass, setDocClass] = React.useState("sow");
  const [readiness, setReadiness] = React.useState<{ score: number; band: string; missingMandatory: string[] } | null>(null);
  const [showUploadForm, setShowUploadForm] = React.useState(false);

  // Requirements state
  const [reqs, setReqs] = React.useState<any[]>([]);
  const [extracting, setExtracting] = React.useState(false);
  const [extractError, setExtractError] = React.useState<string | null>(null);
  const [activeView, setActiveView] = React.useState<"docs" | "reqs">("docs");
  const [amendingId, setAmendingId] = React.useState<string | null>(null);
  const [amendText, setAmendText] = React.useState("");

  React.useEffect(() => {
    fetch(`/api/projects/${project.id}/evidence-readiness`)
      .then(r => r.json())
      .then(d => setReadiness(d))
      .catch(() => null);
    // Load existing requirements
    fetch(`/api/projects/${project.id}/requirements/list`)
      .then(r => r.json())
      .then(d => Array.isArray(d) && setReqs(d))
      .catch(() => null);
  }, [project.id, docs.length]);

  async function handleExtract() {
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/requirements/extract`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      // Reload requirements
      const listRes = await fetch(`/api/projects/${project.id}/requirements/list`);
      const list = await listRes.json();
      if (Array.isArray(list)) setReqs(list);
      setActiveView("reqs");
    } catch (err: any) {
      setExtractError(err.message);
    } finally {
      setExtracting(false);
    }
  }

  async function handleReqAction(reqId: string, action: "confirm" | "reject" | "amend") {
    const body: Record<string, string> = { requirementId: reqId, action };
    if (action === "amend") body.amendedStatement = amendText;
    const res = await fetch(`/api/projects/${project.id}/requirements/list`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setReqs(prev => prev.map(r => r.id === reqId ? { ...r, ...updated } : r));
      setAmendingId(null);
      setAmendText("");
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setExtracted(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("docClass", docClass);
      const res = await fetch(`/api/projects/${project.id}/requirements`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({ error: res.statusText || "Upload failed" }));
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      setDocs((prev) => [data.doc, ...prev]);
      setExtracted(data.extractedContent);
      setShowUploadForm(false);
      router.refresh();
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const confirmedCount = reqs.filter(r => r.status === "confirmed").length;
  const proposedCount  = reqs.filter(r => r.status === "proposed").length;

  return (
    <div>
      {/* Evidence readiness strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18, flexWrap: "wrap" as const }}>
        {readiness && <ReadinessBadge band={readiness.band} score={readiness.score} />}
        {readiness?.missingMandatory?.length ? (
          <div style={{ fontSize: 12, color: "#c17d12", background: "#fbf0da", borderRadius: 8, padding: "6px 12px" }}>
            Missing for adequate coverage: <strong>{readiness.missingMandatory.join(", ")}</strong>
          </div>
        ) : readiness?.score ? (
          <div style={{ fontSize: 12, color: "#158a5a" }}>All mandatory document classes present</div>
        ) : null}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {docs.length > 0 && (
            <button
              onClick={handleExtract}
              disabled={extracting}
              style={{ display: "flex", alignItems: "center", gap: 7, background: extracting ? C.surface2 : "#0f766e", color: extracting ? C.text3 : "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: extracting ? "not-allowed" : "pointer", opacity: extracting ? 0.7 : 1 }}
            >
              {extracting ? (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10" stroke={C.text3} strokeWidth="2" strokeDasharray="31" strokeDashoffset="10" /></svg>Extracting…</>
              ) : (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg>Extract Requirements</>
              )}
            </button>
          )}
          <button
            onClick={() => setShowUploadForm(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 7, background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Upload document
          </button>
        </div>
      </div>
      {extractError && <div style={{ color: "#cf3f3a", fontSize: 12, marginBottom: 10 }}>{extractError}</div>}

      {/* Upload form */}
      {showUploadForm && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Upload source document</div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 4 }}>Document class</div>
              <select
                value={docClass}
                onChange={e => setDocClass(e.target.value)}
                style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", fontSize: 13, background: C.surface, color: C.text }}
              >
                {DOC_CLASS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label} (+{o.pts} pts)</option>
                ))}
              </select>
            </div>
            <label style={{
              display: "flex", alignItems: "center", gap: 8,
              background: uploading ? C.surface2 : C.primary,
              color: uploading ? C.text3 : "#fff",
              border: "none", borderRadius: 8, padding: "8px 16px",
              fontSize: 13, fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer",
              opacity: uploading ? 0.7 : 1,
            }}>
              {uploading ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10" stroke={C.text3} strokeWidth="2" strokeDasharray="31" strokeDashoffset="10" /></svg>
                  Processing…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Choose file
                </>
              )}
              <input type="file" accept=".pdf,.docx,.xlsx,.xls,.txt,.csv" style={{ display: "none" }} disabled={uploading} onChange={handleFileChange} />
            </label>
          </div>
          {uploadError && <div style={{ color: "#cf3f3a", fontSize: 12, marginTop: 8 }}>{uploadError}</div>}
        </div>
      )}

      {/* View toggle */}
      {docs.length > 0 && (
        <div style={{ display: "flex", gap: 4, background: C.surface2, borderRadius: 10, padding: 4, marginBottom: 16, alignSelf: "flex-start" as const, width: "fit-content" }}>
          {(["docs", "reqs"] as const).map(v => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              style={{
                background: activeView === v ? C.surface : "transparent",
                color: activeView === v ? C.text : C.text3,
                border: "none", borderRadius: 7, padding: "6px 14px",
                fontSize: 13, fontWeight: activeView === v ? 600 : 400, cursor: "pointer",
                boxShadow: activeView === v ? `0 1px 3px ${C.border}` : "none",
              }}
            >
              {v === "docs" ? `Documents (${docs.length})` : `Requirements (${reqs.length})`}
            </button>
          ))}
        </div>
      )}

      {/* Extracted content panel — legacy, shown only in docs view */}
      {activeView === "docs" && extracted && (
        <div style={{ background: "#f0faf5", border: "1px solid #01B27C", borderRadius: 12, padding: "16px 18px", marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#007a55", marginBottom: 10 }}>AI Extracted Content</div>
          {(["objectives","inScope","constraints","assumptions"] as const).map(key => {
            const items = extracted[key];
            if (!items?.length) return null;
            const labels: Record<string, string> = { objectives: "Objectives", inScope: "In Scope", constraints: "Constraints", assumptions: "Assumptions" };
            return (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 }}>{labels[key]}</div>
                {items.map((o: string, i: number) => <div key={i} style={{ fontSize: 12, color: C.text, marginBottom: 2 }}>• {o}</div>)}
              </div>
            );
          })}
          {extracted.stakeholders?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 }}>Stakeholders</div>
              {extracted.stakeholders.map((s: any, i: number) => <div key={i} style={{ fontSize: 12, color: C.text, marginBottom: 2 }}>• {s.name} — {s.role}</div>)}
            </div>
          )}
        </div>
      )}

      {/* ── DOCS VIEW ── */}
      {activeView === "docs" && (
        docs.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {docs.map((doc: any) => {
              const ext = doc.fileName?.split(".").pop()?.toUpperCase() || "DOC";
              const cls = CLASS_LABELS[doc.docClass] ?? "Other";
              return (
                <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 7, background: EXT_COLORS[ext] || "#5b616e", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{ext}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{doc.fileName}</div>
                    <div style={{ fontSize: 11, color: C.text3 }}>{formatDate(doc.createdAt)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.primary, background: "#eef0fc", borderRadius: 5, padding: "2px 8px" }}>{cls}</span>
                    {doc.chunkCount > 0 && (
                      <span style={{ fontSize: 11, color: C.text3 }}>{doc.chunkCount} chunks</span>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#158a5a", background: "#e3f3ea", borderRadius: 5, padding: "2px 8px" }}>
                      {doc.ingestionState === "ready" ? "Ready" : doc.ingestionState}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: `1px solid ${C.primaryBorder}`, borderRadius: 14, padding: "28px 20px", textAlign: "center" as const }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.primary, marginBottom: 6 }}>No source documents uploaded</div>
            <div style={{ fontSize: 13, color: C.text2 }}>Upload a SOW, BRD, or estimation sheet to ground artifact generation in your project&apos;s actual content.</div>
          </div>
        )
      )}

      {/* ── REQUIREMENTS VIEW ── */}
      {activeView === "reqs" && (
        reqs.length === 0 ? (
          <div style={{ background: "linear-gradient(160deg,#f0faf5,#e3f3ea)", border: "1px solid #01B27C", borderRadius: 14, padding: "28px 20px", textAlign: "center" as const }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⬡</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#007a55", marginBottom: 6 }}>No requirements extracted yet</div>
            <div style={{ fontSize: 13, color: C.text2 }}>Click &ldquo;Extract Requirements&rdquo; above to have AI identify and structure requirements from your uploaded documents.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
            {/* Summary strip */}
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.text3, marginBottom: 4 }}>
              <span><strong style={{ color: C.text }}>{reqs.length}</strong> total</span>
              <span><strong style={{ color: "#158a5a" }}>{confirmedCount}</strong> confirmed</span>
              <span><strong style={{ color: "#c17d12" }}>{proposedCount}</strong> proposed</span>
              <span><strong style={{ color: "#cf3f3a" }}>{reqs.filter(r => r.status === "rejected").length}</strong> rejected</span>
            </div>

            {reqs.map((req: any) => {
              const cfg = REQ_STATUS_CFG[req.status as keyof typeof REQ_STATUS_CFG] ?? REQ_STATUS_CFG.proposed;
              const isAmending = amendingId === req.id;
              return (
                <div key={req.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" as const }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.text3, fontFamily: "monospace", background: C.surface2, borderRadius: 5, padding: "2px 6px" }}>{req.requirementKey}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.primary, background: "#eef0fc", borderRadius: 5, padding: "2px 7px" }}>{req.type}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg, borderRadius: 5, padding: "2px 7px" }}>{cfg.label}</span>
                    {req.category && <span style={{ fontSize: 11, color: C.text3 }}>{req.category}</span>}
                    {req.confidence && <span style={{ fontSize: 11, color: C.text3 }}>{Math.round(req.confidence * 100)}% conf.</span>}
                  </div>

                  {/* Statement */}
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, marginBottom: req.amendedStatement ? 6 : 0 }}>
                    {req.amendedStatement ? (
                      <>
                        <span style={{ textDecoration: "line-through", color: C.text3 }}>{req.statement}</span>
                        <span style={{ marginLeft: 8, color: "#158a5a" }}>{req.amendedStatement}</span>
                      </>
                    ) : req.statement}
                  </div>

                  {/* Source quote (collapsible) */}
                  {req.sourceQuote && (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ fontSize: 11, color: C.text3, cursor: "pointer" }}>Source quote</summary>
                      <div style={{ fontSize: 11, color: C.text2, background: C.surface2, borderRadius: 6, padding: "6px 10px", marginTop: 4, fontStyle: "italic" }}>
                        &ldquo;{req.sourceQuote}&rdquo;
                        {req.sourceChunk?.sectionTitle && <span style={{ marginLeft: 6, color: C.text3 }}>— {req.sourceChunk.sectionTitle}</span>}
                      </div>
                    </details>
                  )}

                  {/* Amend form */}
                  {isAmending && (
                    <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <textarea
                        value={amendText}
                        onChange={e => setAmendText(e.target.value)}
                        placeholder="Enter amended statement…"
                        rows={2}
                        style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 10px", fontSize: 12, resize: "vertical" as const, background: C.surface }}
                      />
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                        <button onClick={() => handleReqAction(req.id, "amend")} style={{ fontSize: 12, fontWeight: 600, background: "#158a5a", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>Save</button>
                        <button onClick={() => { setAmendingId(null); setAmendText(""); }} style={{ fontSize: 12, background: C.surface2, color: C.text3, border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  {!isAmending && req.status !== "confirmed" && req.status !== "rejected" && (
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <button onClick={() => handleReqAction(req.id, "confirm")} style={{ fontSize: 11, fontWeight: 600, background: "#e3f3ea", color: "#158a5a", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Confirm</button>
                      <button onClick={() => { setAmendingId(req.id); setAmendText(req.statement); }} style={{ fontSize: 11, fontWeight: 600, background: "#eef0fc", color: C.primary, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Amend</button>
                      <button onClick={() => handleReqAction(req.id, "reject")} style={{ fontSize: 11, fontWeight: 600, background: "#fde8e8", color: "#cf3f3a", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Reject</button>
                    </div>
                  )}
                  {!isAmending && (req.status === "confirmed" || req.status === "rejected") && (
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => handleReqAction(req.id, "confirm")} style={{ fontSize: 11, color: C.text3, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 9px", cursor: "pointer" }}>Reset to Proposed</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ── Status tab ─────────────────────────────────────────────────────────────────

function StatusTab({ project }: { project: any }) {
  const latestStatus = project.statusReports?.[0];
  const [exportingPpt, setExportingPpt] = React.useState(false);

  async function handleExportPpt() {
    setExportingPpt(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/status/export`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "WSR.pptx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || "Export failed");
    } finally {
      setExportingPpt(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <StatusQuestionnaire projectId={project.id} />
      </div>
      {latestStatus?.aiSummary && (
        <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#fff4ed", border: "1px solid #f97316", borderRadius: 10 }}>
            <span style={{ fontSize: 14 }}>📊</span>
            <span style={{ fontSize: 12, color: "#c2410c", fontWeight: 500, flex: 1 }}>Export last report as PowerPoint</span>
            <button
              onClick={handleExportPpt}
              disabled={exportingPpt}
              style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: exportingPpt ? "#9a3412" : "#ea580c", border: "none", borderRadius: 6, padding: "5px 12px", cursor: exportingPpt ? "not-allowed" : "pointer" }}
            >
              {exportingPpt ? "Generating…" : "Export PPT"}
            </button>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 17px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".05em", color: C.text3, textTransform: "uppercase" as const, marginBottom: 10 }}>Last Report</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.text2 }}>Health</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: ragColor(project.healthStatus), textTransform: "capitalize" as const }}>{project.healthStatus}</span>
            </div>
            {latestStatus.healthScore?.compositeScore != null && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: C.text2 }}>Score</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700, color: ragColor(project.healthStatus) }}>{Math.round(latestStatus.healthScore.compositeScore)}</span>
              </div>
            )}
            {latestStatus.healthScore?.spi != null && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: C.text2 }}>SPI</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, color: C.text2 }}>{latestStatus.healthScore.spi.toFixed(2)}</span>
              </div>
            )}
            {latestStatus.healthScore?.cpi != null && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: C.text2 }}>CPI</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, color: C.text2 }}>{latestStatus.healthScore.cpi.toFixed(2)}</span>
              </div>
            )}
            <div style={{ fontSize: 11, color: C.text3, marginTop: 10 }}>
              {new Date(latestStatus.reportDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </div>
          </div>
          <div style={{ background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: `1px solid ${C.primaryBorder}`, borderRadius: 14, padding: "14px 15px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
              <span style={{ color: C.primary, fontSize: 13 }}>✦</span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: C.primary, textTransform: "uppercase" as const }}>Last Summary</span>
            </div>
            <p style={{ fontSize: 12, color: "#3a3f52", lineHeight: 1.6, margin: 0 }}>{latestStatus.aiSummary}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cost Tab ───────────────────────────────────────────────────────────────────

const COST_CATEGORIES = ["labor", "materials", "travel", "software", "training", "other"];

function fmt$(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

function CostBurndownChart({ series, currency }: { series: any[]; currency: string }) {
  if (!series.length) return null;

  const W = 700; const H = 220; const PAD = { top: 16, right: 20, bottom: 36, left: 72 };
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

  const allVals = series.flatMap((s) => [s.pv, s.ev, s.ac]).filter((v) => v > 0);
  const maxV = allVals.length ? Math.max(...allVals) * 1.08 : 1;

  function xOf(i: number) { return PAD.left + (i / Math.max(series.length - 1, 1)) * inner.w; }
  function yOf(v: number) { return PAD.top + inner.h - (v / maxV) * inner.h; }

  function linePath(key: "pv" | "ev" | "ac") {
    return series
      .map((s, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(s[key]).toFixed(1)}`)
      .join(" ");
  }

  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => (maxV * i) / tickCount);
  const xTicks = series.filter((_, i) => i % Math.max(1, Math.floor(series.length / 6)) === 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, display: "block" }}>
      {/* Grid */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W - PAD.right} y1={yOf(v)} y2={yOf(v)} stroke={C.border} strokeWidth={0.5} />
          <text x={PAD.left - 6} y={yOf(v) + 4} textAnchor="end" fontSize={9} fill={C.text3}>
            {fmt$(v, currency).replace(/\.00$/, "")}
          </text>
        </g>
      ))}
      {/* X axis labels */}
      {xTicks.map((s, i) => {
        const idx = series.indexOf(s);
        return (
          <text key={i} x={xOf(idx)} y={H - 6} textAnchor="middle" fontSize={8.5} fill={C.text3}>
            {s.date.slice(5)}
          </text>
        );
      })}
      {/* Today line */}
      {(() => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const ti = series.findIndex((s) => s.date >= todayStr);
        if (ti < 0) return null;
        return <line x1={xOf(ti)} x2={xOf(ti)} y1={PAD.top} y2={H - PAD.bottom} stroke={C.text3} strokeWidth={1} strokeDasharray="4 3" />;
      })()}
      {/* PV line */}
      <path d={linePath("pv")} fill="none" stroke={C.text3} strokeWidth={1.5} strokeDasharray="5 3" />
      {/* EV line */}
      <path d={linePath("ev")} fill="none" stroke={C.primary} strokeWidth={2} />
      {/* AC line */}
      <path d={linePath("ac")} fill="none" stroke={C.red} strokeWidth={2} />
      {/* Legend */}
      {[
        { color: C.text3, label: "PV (Planned)", dash: true },
        { color: C.primary, label: "EV (Earned)", dash: false },
        { color: C.red, label: "AC (Actual)", dash: false },
      ].map((l, i) => (
        <g key={i} transform={`translate(${PAD.left + i * 130}, ${H - 10})`}>
          <line x1={0} x2={18} y1={0} y2={0} stroke={l.color} strokeWidth={2} strokeDasharray={l.dash ? "4 2" : undefined} />
          <text x={22} y={4} fontSize={9} fill={C.text2}>{l.label}</text>
        </g>
      ))}
    </svg>
  );
}

function CostTab({ project }: { project: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), amount: "", category: "labor", description: "" });
  const [formErr, setFormErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/projects/${project.id}/costs/burndown`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || isNaN(Number(form.amount))) { setFormErr("Enter a valid amount"); return; }
    setAdding(true); setFormErr("");
    const res = await fetch(`/api/projects/${project.id}/costs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: form.date, amount: Number(form.amount), category: form.category, description: form.description }),
    });
    if (res.ok) { setForm({ date: new Date().toISOString().slice(0, 10), amount: "", category: "labor", description: "" }); await load(); }
    else setFormErr("Failed to save entry");
    setAdding(false);
  }

  async function handleDelete(entryId: string) {
    setDeleting(entryId);
    await fetch(`/api/projects/${project.id}/costs/${entryId}`, { method: "DELETE" });
    await load();
    setDeleting(null);
  }

  const s = data?.summary;
  const currency = s?.currency ?? "USD";
  const cpiColor = !s ? C.text : s.cpi >= 1 ? C.green : s.cpi >= 0.9 ? C.amber : C.red;
  const spiColor2 = !s ? C.text : s.spi >= 1 ? C.green : s.spi >= 0.9 ? C.amber : C.red;

  return (
    <div style={{ maxWidth: 900 }}>
      {/* ── EVM KPI strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10, marginBottom: 22 }}>
        {[
          { label: "BAC", value: s ? fmt$(s.bac, currency) : "—", sub: "Budget at Completion", color: C.primary, bg: C.primaryLight },
          { label: "AC", value: s ? fmt$(s.totalAC, currency) : "—", sub: "Actual Cost", color: C.text, bg: C.surface2 },
          { label: "EV", value: s ? fmt$(s.totalEV, currency) : "—", sub: "Earned Value", color: C.primary, bg: C.primaryLight },
          { label: "CPI", value: s ? s.cpi.toFixed(2) : "—", sub: s?.cpi >= 1 ? "Under budget" : "Over budget", color: cpiColor, bg: !s ? C.surface2 : s.cpi >= 1 ? C.greenLight : s.cpi >= 0.9 ? C.amberLight : C.redLight },
          { label: "EAC", value: s ? fmt$(s.eac, currency) : "—", sub: "Forecast at Completion", color: C.text, bg: C.surface2 },
          { label: "VAC", value: s ? fmt$(s.vac, currency) : "—", sub: s?.vac >= 0 ? "Under forecast" : "Cost overrun", color: !s ? C.text : s.vac >= 0 ? C.green : C.red, bg: !s ? C.surface2 : s.vac >= 0 ? C.greenLight : C.redLight },
        ].map((k) => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, lineHeight: 1.2 }}>{loading ? "…" : k.value}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, marginTop: 2 }}>{k.label}</div>
            <div style={{ fontSize: 9.5, color: C.text3, marginTop: 1 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Budget progress bar ── */}
      {s && s.bac > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11.5, color: C.text2, fontWeight: 500 }}>Budget consumed</span>
            <span style={{ fontSize: 11.5, color: s.percentSpent > 100 ? C.red : C.text2 }}>{s.percentSpent}% of {fmt$(s.bac, currency)}</span>
          </div>
          <div style={{ height: 8, background: C.surface2, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(s.percentSpent, 100)}%`, background: s.percentSpent > 100 ? C.red : s.percentSpent > 85 ? C.amber : C.green, borderRadius: 4, transition: "width .4s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: C.text3 }}>SPI: <strong style={{ color: spiColor2 }}>{s?.spi?.toFixed(2) ?? "—"}</strong></span>
            <span style={{ fontSize: 10, color: C.text3 }}>ETC remaining: <strong>{s ? fmt$(s.etc, currency) : "—"}</strong></span>
          </div>
        </div>
      )}

      {/* ── Burndown chart ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px", marginBottom: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Cost Burndown — PV / EV / AC</div>
        {loading ? (
          <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: C.text3, fontSize: 12 }}>Loading…</div>
        ) : data?.series?.length ? (
          <CostBurndownChart series={data.series} currency={currency} />
        ) : (
          <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: C.text3, fontSize: 12 }}>
            No cost data yet. Add entries below to see the burndown chart.
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 18, alignItems: "start" }}>
        {/* ── Add cost entry form ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Log Cost Entry</div>
          <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: C.text2, display: "block", marginBottom: 3 }}>Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: C.surface2, color: C.text, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.text2, display: "block", marginBottom: 3 }}>Amount ({currency})</label>
              <input type="number" step="0.01" min="0" placeholder="0.00" value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: C.surface2, color: C.text, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.text2, display: "block", marginBottom: 3 }}>Category</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: C.surface2, color: C.text, boxSizing: "border-box" }}>
                {COST_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.text2, display: "block", marginBottom: 3 }}>Description (optional)</label>
              <input type="text" placeholder="e.g. Sprint 3 dev hours" value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: C.surface2, color: C.text, boxSizing: "border-box" }} />
            </div>
            {formErr && <div style={{ fontSize: 11, color: C.red }}>{formErr}</div>}
            <button type="submit" disabled={adding}
              style={{ marginTop: 4, padding: "8px 0", background: C.primary, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: adding ? "not-allowed" : "pointer", opacity: adding ? 0.7 : 1 }}>
              {adding ? "Saving…" : "+ Add Entry"}
            </button>
          </form>
        </div>

        {/* ── Cost entries list ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            Cost Entries
            {data?.entries?.length > 0 && <span style={{ fontSize: 11, color: C.text3, fontWeight: 400, marginLeft: 8 }}>{data.entries.length} records · Total {fmt$(data.entries.reduce((s: number, e: any) => s + e.amount, 0), currency)}</span>}
          </div>
          {loading ? (
            <div style={{ color: C.text3, fontSize: 12 }}>Loading…</div>
          ) : !data?.entries?.length ? (
            <div style={{ color: C.text3, fontSize: 12, padding: "20px 0", textAlign: "center" }}>No cost entries yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto" }}>
              {[...data.entries].reverse().map((e: any) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: C.surface2, borderRadius: 7, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10.5, color: C.text3, minWidth: 72 }}>{e.date}</div>
                  <div style={{ fontSize: 10, padding: "1px 7px", background: C.primaryLight, color: C.primary, borderRadius: 10, fontWeight: 600 }}>{e.category}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, minWidth: 70, textAlign: "right" }}>{fmt$(e.amount, currency)}</div>
                  <div style={{ fontSize: 11, color: C.text2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.description}</div>
                  <button onClick={() => handleDelete(e.id)} disabled={deleting === e.id}
                    style={{ fontSize: 11, color: C.text3, background: "none", border: "none", cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}>
                    {deleting === e.id ? "…" : "✕"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Variance summary ── */}
      {s && (
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[
            { label: "Cost Variance (CV)", value: fmt$(s.cv, currency), good: s.cv >= 0, tip: s.cv >= 0 ? "Under budget" : "Over budget" },
            { label: "Schedule Variance (SV)", value: fmt$(s.sv, currency), good: s.sv >= 0, tip: s.sv >= 0 ? "Ahead of plan" : "Behind plan" },
            { label: "To-Complete (TCPI)", value: s.bac > 0 && s.totalAC < s.bac ? ((s.bac - s.totalEV) / (s.bac - s.totalAC)).toFixed(2) : "—", good: true, tip: "Work efficiency needed to finish on budget" },
          ].map((k) => (
            <div key={k.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: k.good ? C.green : C.red }}>{k.value}</div>
              <div style={{ fontSize: 10, color: C.text3, marginTop: 2 }}>{k.tip}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main workspace ─────────────────────────────────────────────────────────────

const TABS = ["Artifacts", "RAID", "Schedule", "Resources", "Cost", "Requirements", "Weekly Status"];

export function WorkspaceClient({ project, catalog }: { project: any; catalog: any[] }) {
  const [tab, setTab] = useState("Artifacts");
  const [currentPhase, setCurrentPhase] = useState<string>(project.currentPhase || "initiation");

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
      <PhaseRail
        projectId={project.id}
        currentPhase={currentPhase}
        onPhaseAdvanced={setCurrentPhase}
      />

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
      {tab === "Resources" && <ResourcesTab project={project} />}
      {tab === "Cost" && <CostTab project={project} />}
      {tab === "Requirements" && <RequirementsTab project={project} />}
      {tab === "Weekly Status" && <StatusTab project={project} />}
    </div>
  );
}
