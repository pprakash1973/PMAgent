"use client";
import { useState } from "react";
import type { StatusQuestion } from "@/lib/ai";

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
  if (s === "green") return C.green;
  if (s === "amber") return C.amber;
  return C.red;
}
function ragBg(s: string) {
  if (s === "green") return C.greenLight;
  if (s === "amber") return C.amberLight;
  return C.redLight;
}
function ragLabel(s: string) {
  if (s === "green") return "On Track";
  if (s === "amber") return "At Risk";
  return "Critical";
}

interface WSRResult {
  summary: string;
  ragStatus: string;
  healthScore: number;
  recommendations: string[];
  accomplishments: string[];
  nextWeekPlan: string[];
  metricsNarrative: string;
}

export function StatusQuestionnaire({ projectId }: { projectId: string }) {
  const [phase, setPhase] = useState<"idle" | "loading-q" | "answering" | "generating" | "wsr" | "saved">("idle");
  const [questions, setQuestions] = useState<StatusQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [wsr, setWsr] = useState<WSRResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Step 1: Generate questions ──────────────────────────────────────────────
  async function startQuestionnaire() {
    setPhase("loading-q");
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/status/questions`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate questions");
      setQuestions(data.questions);
      setAnswers({});
      setPhase("answering");
    } catch (e: any) {
      setError(e.message);
      setPhase("idle");
    }
  }

  // ── Step 2: Submit answers → generate WSR ──────────────────────────────────
  async function generateWSR() {
    setPhase("generating");
    setError(null);
    try {
      const qaPayload = questions.map((q) => ({
        category: q.category,
        question: q.question,
        answer: answers[q.id] ?? "",
      }));
      const res = await fetch(`/api/projects/${projectId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionnaire: qaPayload, source: "questionnaire" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Failed to generate WSR");
      setWsr({
        summary: data.summary,
        ragStatus: data.ragStatus,
        healthScore: data.healthScore,
        recommendations: data.recommendations ?? [],
        accomplishments: data.accomplishments ?? [],
        nextWeekPlan: data.nextWeekPlan ?? [],
        metricsNarrative: data.metricsNarrative ?? "",
      });
      setPhase("wsr");
    } catch (e: any) {
      setError(e.message);
      setPhase("answering");
    }
  }

  const answeredCount = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
  const requiredUnanswered = questions.filter((q) => q.required && !(answers[q.id] ?? "").trim()).length;
  const canSubmit = requiredUnanswered === 0 && answeredCount >= 7;

  // ── Idle state ──────────────────────────────────────────────────────────────
  if (phase === "idle" || phase === "loading-q") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", gap: 20 }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: C.primaryLight, border: `2px solid ${C.primaryBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28,
        }}>📋</div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>Weekly Status Report</div>
          <div style={{ fontSize: 13, color: C.text2, maxWidth: 420, lineHeight: 1.6 }}>
            The AI will analyse your project — schedule, risks, open issues, milestones — and ask you 10 targeted questions.
            Your answers generate a formatted WSR, update health scores, and feed the Portfolio and Executive dashboards.
          </div>
        </div>
        {error && (
          <div style={{ padding: "10px 14px", background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 9, fontSize: 13, color: C.red, maxWidth: 420, width: "100%" }}>
            {error}
          </div>
        )}
        <button
          onClick={startQuestionnaire}
          disabled={phase === "loading-q"}
          style={{
            height: 42, padding: "0 28px",
            background: phase === "loading-q" ? C.surface2 : C.primary,
            color: phase === "loading-q" ? C.text3 : "#fff",
            border: "none", borderRadius: 10,
            font: `700 13.5px 'IBM Plex Sans'`, cursor: phase === "loading-q" ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 10,
          }}
        >
          {phase === "loading-q"
            ? <><Spinner /> Generating questions…</>
            : <>✦ Generate WSR</>}
        </button>
        <div style={{ fontSize: 11, color: C.text3 }}>Powered by AI · takes ~10 seconds</div>
      </div>
    );
  }

  // ── Questionnaire ───────────────────────────────────────────────────────────
  if (phase === "answering" || phase === "generating") {
    return (
      <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Weekly Status Questionnaire</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{answeredCount} of {questions.length} answered</div>
          </div>
          <button
            onClick={() => { setPhase("idle"); setQuestions([]); setAnswers({}); }}
            style={{ fontSize: 12, color: C.text3, background: "none", border: "none", cursor: "pointer" }}
          >✕ Cancel</button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 4, background: C.borderLight, borderRadius: 2, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(answeredCount / questions.length) * 100}%`, background: C.primary, borderRadius: 2, transition: "width .3s" }} />
        </div>

        {/* Questions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {questions.map((q, i) => {
            const answered = (answers[q.id] ?? "").trim().length > 0;
            return (
              <div key={q.id} style={{
                background: C.surface, border: `1.5px solid ${answered ? C.primaryBorder : C.border}`,
                borderRadius: 12, padding: "16px 18px",
                transition: "border-color .15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: C.primary, background: C.primaryLight,
                    borderRadius: 6, padding: "2px 8px", letterSpacing: ".03em",
                  }}>{q.category.toUpperCase()}</span>
                  <span style={{ fontSize: 11, color: C.text3 }}>{i + 1} of {questions.length}</span>
                  {q.required && !answered && <span style={{ fontSize: 10, color: C.red, marginLeft: "auto" }}>Required</span>}
                  {answered && <span style={{ fontSize: 14, marginLeft: "auto" }}>✓</span>}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, marginBottom: 10, lineHeight: 1.5 }}>{q.question}</div>

                {q.type === "select" ? (
                  <select
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                    style={{
                      width: "100%", height: 36, padding: "0 10px",
                      border: `1px solid ${C.border}`, borderRadius: 7,
                      font: `13px 'IBM Plex Sans'`, color: C.text,
                      background: C.surface, cursor: "pointer",
                    }}
                  >
                    <option value="">Select…</option>
                    {(q.options ?? ["Green — On Track", "Amber — At Risk", "Red — Critical"]).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : q.type === "number" ? (
                  <input
                    type="number"
                    placeholder={q.placeholder ?? "Enter a number"}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                    style={{
                      width: "100%", height: 36, padding: "0 10px",
                      border: `1px solid ${C.border}`, borderRadius: 7,
                      font: `13px 'IBM Plex Mono'`, color: C.text,
                      background: C.surface, boxSizing: "border-box",
                    }}
                  />
                ) : q.type === "text" ? (
                  <input
                    type="text"
                    placeholder={q.placeholder ?? "Your answer…"}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                    style={{
                      width: "100%", height: 36, padding: "0 10px",
                      border: `1px solid ${C.border}`, borderRadius: 7,
                      font: `13px 'IBM Plex Sans'`, color: C.text,
                      background: C.surface, boxSizing: "border-box",
                    }}
                  />
                ) : (
                  <textarea
                    rows={3}
                    placeholder={q.placeholder ?? "Describe in a few sentences…"}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                    style={{
                      width: "100%", padding: "9px 10px",
                      border: `1px solid ${C.border}`, borderRadius: 7,
                      font: `13px 'IBM Plex Sans'`, color: C.text,
                      background: C.surface, resize: "vertical", boxSizing: "border-box",
                      lineHeight: 1.55,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
          {!canSubmit && requiredUnanswered > 0 && (
            <span style={{ fontSize: 12, color: C.text3 }}>
              {requiredUnanswered} required {requiredUnanswered === 1 ? "question" : "questions"} remaining
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={generateWSR}
            disabled={!canSubmit || phase === "generating"}
            style={{
              height: 40, padding: "0 24px",
              background: !canSubmit || phase === "generating" ? C.surface2 : C.primary,
              color: !canSubmit || phase === "generating" ? C.text3 : "#fff",
              border: "none", borderRadius: 9,
              font: `700 13px 'IBM Plex Sans'`, cursor: !canSubmit || phase === "generating" ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            {phase === "generating" ? <><Spinner /> Generating WSR…</> : <>✦ Generate Status Report</>}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 9, fontSize: 13, color: C.red }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  // ── WSR Result ──────────────────────────────────────────────────────────────
  if ((phase === "wsr" || phase === "saved") && wsr) {
    const rc = ragColor(wsr.ragStatus);
    const rb = ragBg(wsr.ragStatus);

    return (
      <div>
        {/* WSR header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Weekly Status Report</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 1 }}>
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              {phase === "saved" && <span style={{ marginLeft: 8, color: C.green, fontWeight: 600 }}>· Saved ✓</span>}
            </div>
          </div>
          <span style={{
            fontSize: 12, fontWeight: 700, color: rc, background: rb,
            borderRadius: 999, padding: "5px 14px",
          }}>{ragLabel(wsr.ragStatus)}</span>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: `conic-gradient(${rc} 0 ${wsr.healthScore}%, #eceef2 ${wsr.healthScore}% 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%", background: C.surface,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700, color: rc,
            }}>{Math.round(wsr.healthScore)}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Executive Summary */}
          <WSRSection title="Executive Summary" icon="📌">
            <p style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.65, margin: 0 }}>{wsr.summary}</p>
          </WSRSection>

          {/* Metrics */}
          {wsr.metricsNarrative && (
            <WSRSection title="Schedule & Budget" icon="📊">
              <p style={{ fontSize: 13, color: C.text2, lineHeight: 1.65, margin: 0 }}>{wsr.metricsNarrative}</p>
            </WSRSection>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Accomplishments */}
            {wsr.accomplishments.length > 0 && (
              <WSRSection title="Accomplishments" icon="✅">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {wsr.accomplishments.map((a, i) => (
                    <li key={i} style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, marginBottom: 3 }}>{a}</li>
                  ))}
                </ul>
              </WSRSection>
            )}

            {/* Next week plan */}
            {wsr.nextWeekPlan.length > 0 && (
              <WSRSection title="Plan for Next Week" icon="🗓️">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {wsr.nextWeekPlan.map((p, i) => (
                    <li key={i} style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, marginBottom: 3 }}>{p}</li>
                  ))}
                </ul>
              </WSRSection>
            )}
          </div>

          {/* AI Recommendations */}
          {wsr.recommendations.length > 0 && (
            <div style={{
              background: "linear-gradient(160deg,#f4f5ff,#eef0fc)",
              border: `1px solid ${C.primaryBorder}`, borderRadius: 12, padding: "16px 18px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ color: C.primary, fontSize: 14 }}>✦</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: C.primary, textTransform: "uppercase" as const }}>AI Recommendations</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {wsr.recommendations.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", background: C.primary,
                      color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
                    }}>{i + 1}</span>
                    <span style={{ fontSize: 13, color: "#3a3f52", lineHeight: 1.6 }}>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {phase === "wsr" && (
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button
              onClick={() => { setPhase("answering"); }}
              style={{
                height: 36, padding: "0 16px",
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                font: `500 12.5px 'IBM Plex Sans'`, color: C.text2, cursor: "pointer",
              }}
            >← Revise answers</button>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setPhase("saved")}
              style={{
                height: 36, padding: "0 20px",
                background: C.green, border: "none", borderRadius: 8,
                font: `700 12.5px 'IBM Plex Sans'`, color: "#fff", cursor: "pointer",
              }}
            >Confirm & save ✓</button>
          </div>
        )}

        {phase === "saved" && (
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => { setPhase("idle"); setWsr(null); setQuestions([]); setAnswers({}); }}
              style={{
                height: 36, padding: "0 16px",
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                font: `500 12.5px 'IBM Plex Sans'`, color: C.text2, cursor: "pointer",
              }}
            >Submit another report</button>
          </div>
        )}
      </div>
    );
  }

  return null;
}

function WSRSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: C.text3, textTransform: "uppercase" as const }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 13, height: 13,
      border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff",
      borderRadius: "50%", animation: "spin .7s linear infinite",
    }} />
  );
}
