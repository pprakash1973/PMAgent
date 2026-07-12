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

// ── Answer state per question ────────────────────────────────────────────────
// For chips / multi-chips: selected[] + optional customText
// For select: a single string
// For number: a string (numeric)
interface AnswerState {
  selected: string[];   // chosen chips or select value (index 0) or empty
  custom: string;       // freetext typed by PM
}

function blankAnswer(): AnswerState { return { selected: [], custom: "" }; }

function answerText(q: StatusQuestion, a: AnswerState): string {
  if (q.type === "number") return a.custom;
  if (q.type === "select") return a.selected[0] ?? "";
  // chips / multi-chips: join selected chips + custom
  const parts = [...a.selected];
  if (a.custom.trim()) parts.push(a.custom.trim());
  return parts.join("; ");
}

function isAnswered(q: StatusQuestion, a: AnswerState): boolean {
  return answerText(q, a).trim().length > 0;
}

// ── Chip selector ────────────────────────────────────────────────────────────
function ChipSelector({
  q, answer, onChange,
}: {
  q: StatusQuestion;
  answer: AnswerState;
  onChange: (a: AnswerState) => void;
}) {
  const multi = q.type === "multi-chips";

  function toggleChip(opt: string) {
    if (multi) {
      const already = answer.selected.includes(opt);
      onChange({
        ...answer,
        selected: already
          ? answer.selected.filter((s) => s !== opt)
          : [...answer.selected, opt],
      });
    } else {
      // single-select: toggle off if already selected
      onChange({
        ...answer,
        selected: answer.selected[0] === opt ? [] : [opt],
      });
    }
  }

  return (
    <div>
      {/* instruction tag */}
      <div style={{ fontSize: 11, color: C.text3, marginBottom: 8 }}>
        {multi ? "Select all that apply" : "Select one"}{q.allowCustom ? " · or type a custom answer below" : ""}
      </div>

      {/* chips */}
      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 7 }}>
        {q.suggestedAnswers.map((opt) => {
          const active = answer.selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggleChip(opt)}
              style={{
                padding: "6px 13px",
                borderRadius: 999,
                border: `1.5px solid ${active ? C.primary : C.border}`,
                background: active ? C.primary : C.surface,
                color: active ? "#fff" : C.text2,
                fontSize: 12.5,
                fontFamily: "'IBM Plex Sans',sans-serif",
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                transition: "all .12s",
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              {active && (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {opt}
            </button>
          );
        })}
      </div>

      {/* custom text input */}
      {q.allowCustom && (
        <div style={{ marginTop: 10 }}>
          <textarea
            rows={2}
            placeholder={q.placeholder ?? "Add your own notes or additional context…"}
            value={answer.custom}
            onChange={(e) => onChange({ ...answer, custom: e.target.value })}
            style={{
              width: "100%", padding: "8px 10px",
              border: `1px solid ${C.border}`, borderRadius: 8,
              font: `13px 'IBM Plex Sans'`, color: C.text,
              background: C.surface, resize: "vertical",
              boxSizing: "border-box" as const, lineHeight: 1.55,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Select dropdown ──────────────────────────────────────────────────────────
function SelectInput({ q, answer, onChange }: { q: StatusQuestion; answer: AnswerState; onChange: (a: AnswerState) => void }) {
  return (
    <select
      value={answer.selected[0] ?? ""}
      onChange={(e) => onChange({ ...answer, selected: e.target.value ? [e.target.value] : [] })}
      style={{
        width: "100%", height: 38, padding: "0 10px",
        border: `1px solid ${C.border}`, borderRadius: 8,
        font: `13px 'IBM Plex Sans'`, color: answer.selected[0] ? C.text : C.text3,
        background: C.surface, cursor: "pointer",
      }}
    >
      <option value="">Select…</option>
      {q.suggestedAnswers.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

// ── Number input ─────────────────────────────────────────────────────────────
function NumberInput({ q, answer, onChange }: { q: StatusQuestion; answer: AnswerState; onChange: (a: AnswerState) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        type="number"
        placeholder={q.placeholder ?? "0"}
        value={answer.custom}
        onChange={(e) => onChange({ ...answer, custom: e.target.value })}
        style={{
          width: 120, height: 38, padding: "0 10px",
          border: `1px solid ${C.border}`, borderRadius: 8,
          font: `14px 'IBM Plex Mono'`, color: C.text, background: C.surface,
        }}
      />
      {q.unit && <span style={{ fontSize: 13, color: C.text3 }}>{q.unit}</span>}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function StatusQuestionnaire({ projectId }: { projectId: string }) {
  const [phase, setPhase] = useState<"idle" | "loading-q" | "answering" | "generating" | "wsr" | "saved">("idle");
  const [questions, setQuestions] = useState<StatusQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const [wsr, setWsr] = useState<WSRResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setAnswer(id: number, a: AnswerState) {
    setAnswers((prev) => ({ ...prev, [id]: a }));
  }

  // Step 1 — generate questions
  async function startQuestionnaire() {
    setPhase("loading-q");
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/status/questions`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate questions");
      setQuestions(data.questions);
      const blank: Record<number, AnswerState> = {};
      for (const q of data.questions) blank[q.id] = blankAnswer();
      setAnswers(blank);
      setPhase("answering");
    } catch (e: any) {
      setError(e.message);
      setPhase("idle");
    }
  }

  // Step 2 — submit answers → WSR
  async function generateWSR() {
    setPhase("generating");
    setError(null);
    try {
      const qaPayload = questions.map((q) => ({
        category: q.category,
        question: q.question,
        answer: answerText(q, answers[q.id] ?? blankAnswer()),
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

  const answeredCount = questions.filter((q) => isAnswered(q, answers[q.id] ?? blankAnswer())).length;
  const requiredUnanswered = questions.filter((q) => q.required && !isAnswered(q, answers[q.id] ?? blankAnswer())).length;
  const canSubmit = requiredUnanswered === 0 && answeredCount >= Math.min(7, questions.length);

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (phase === "idle" || phase === "loading-q") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", gap: 20 }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: C.primaryLight, border: `2px solid ${C.primaryBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
        }}>📋</div>
        <div style={{ textAlign: "center" as const }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>Weekly Status Report</div>
          <div style={{ fontSize: 13, color: C.text2, maxWidth: 420, lineHeight: 1.6 }}>
            The AI reads your project — schedule, risks, open issues, milestones — and generates 10 targeted questions with suggested answers. Select, tweak, and confirm. Done in under 3 minutes.
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
          {phase === "loading-q" ? <><Spinner col="#9199d4" /> Generating questions…</> : <>✦ Generate WSR</>}
        </button>
        <div style={{ fontSize: 11, color: C.text3 }}>Powered by AI · ~10 seconds</div>
      </div>
    );
  }

  // ── Answering ─────────────────────────────────────────────────────────────
  if (phase === "answering" || phase === "generating") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Weekly Status Questionnaire</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{answeredCount} of {questions.length} answered</div>
          </div>
          <button onClick={() => { setPhase("idle"); setQuestions([]); setAnswers({}); }}
            style={{ fontSize: 12, color: C.text3, background: "none", border: "none", cursor: "pointer" }}>
            ✕ Cancel
          </button>
        </div>

        {/* progress */}
        <div style={{ height: 4, background: C.borderLight, borderRadius: 2, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(answeredCount / questions.length) * 100}%`, background: C.primary, borderRadius: 2, transition: "width .3s" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
          {questions.map((q, i) => {
            const ans = answers[q.id] ?? blankAnswer();
            const answered = isAnswered(q, ans);
            return (
              <div key={q.id} style={{
                background: C.surface,
                border: `1.5px solid ${answered ? C.primaryBorder : C.border}`,
                borderRadius: 12, padding: "16px 18px", transition: "border-color .15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, background: C.primaryLight, borderRadius: 6, padding: "2px 8px", letterSpacing: ".03em" }}>
                    {q.category.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 11, color: C.text3 }}>{i + 1} / {questions.length}</span>
                  {q.type === "multi-chips" && (
                    <span style={{ fontSize: 10, color: C.text3, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 5, padding: "1px 7px" }}>multi-select</span>
                  )}
                  {q.required && !answered && <span style={{ fontSize: 10, color: C.red, marginLeft: "auto" }}>Required</span>}
                  {answered && <span style={{ fontSize: 14, marginLeft: "auto", color: C.green }}>✓</span>}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, marginBottom: 12, lineHeight: 1.5 }}>{q.question}</div>

                {(q.type === "chips" || q.type === "multi-chips") && (
                  <ChipSelector q={q} answer={ans} onChange={(a) => setAnswer(q.id, a)} />
                )}
                {q.type === "select" && (
                  <SelectInput q={q} answer={ans} onChange={(a) => setAnswer(q.id, a)} />
                )}
                {q.type === "number" && (
                  <NumberInput q={q} answer={ans} onChange={(a) => setAnswer(q.id, a)} />
                )}
              </div>
            );
          })}
        </div>

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
              font: `700 13px 'IBM Plex Sans'`,
              cursor: !canSubmit || phase === "generating" ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            {phase === "generating" ? <><Spinner col="#9199d4" /> Generating WSR…</> : <>✦ Generate Status Report</>}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 9, fontSize: 13, color: C.red }}>
            {error}
          </div>
        )}
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── WSR result ────────────────────────────────────────────────────────────
  if ((phase === "wsr" || phase === "saved") && wsr) {
    const rc = ragColor(wsr.ragStatus);
    const rb = ragBg(wsr.ragStatus);
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Weekly Status Report</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 1 }}>
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              {phase === "saved" && <span style={{ marginLeft: 8, color: C.green, fontWeight: 600 }}>· Saved ✓</span>}
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: rc, background: rb, borderRadius: 999, padding: "5px 14px" }}>
            {ragLabel(wsr.ragStatus)}
          </span>
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

        <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
          <WSRSection title="Executive Summary" icon="📌">
            <p style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.65, margin: 0 }}>{wsr.summary}</p>
          </WSRSection>

          {wsr.metricsNarrative && (
            <WSRSection title="Schedule & Budget" icon="📊">
              <p style={{ fontSize: 13, color: C.text2, lineHeight: 1.65, margin: 0 }}>{wsr.metricsNarrative}</p>
            </WSRSection>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {wsr.accomplishments.length > 0 && (
              <WSRSection title="Accomplishments" icon="✅">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {wsr.accomplishments.map((a, i) => (
                    <li key={i} style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, marginBottom: 3 }}>{a}</li>
                  ))}
                </ul>
              </WSRSection>
            )}
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

          {wsr.recommendations.length > 0 && (
            <div style={{ background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: `1px solid ${C.primaryBorder}`, borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ color: C.primary, fontSize: 14 }}>✦</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: C.primary, textTransform: "uppercase" as const }}>AI Recommendations</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
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

        {phase === "wsr" && (
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={() => setPhase("answering")}
              style={{ height: 36, padding: "0 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, font: `500 12.5px 'IBM Plex Sans'`, color: C.text2, cursor: "pointer" }}>
              ← Revise answers
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => setPhase("saved")}
              style={{ height: 36, padding: "0 20px", background: C.green, border: "none", borderRadius: 8, font: `700 12.5px 'IBM Plex Sans'`, color: "#fff", cursor: "pointer" }}>
              Confirm & save ✓
            </button>
          </div>
        )}
        {phase === "saved" && (
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => { setPhase("idle"); setWsr(null); setQuestions([]); setAnswers({}); }}
              style={{ height: 36, padding: "0 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, font: `500 12.5px 'IBM Plex Sans'`, color: C.text2, cursor: "pointer" }}>
              Submit another report
            </button>
          </div>
        )}
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return null;
}

function WSRSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: C.text3, textTransform: "uppercase" as const }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Spinner({ col = "#fff" }: { col?: string }) {
  return (
    <span style={{
      display: "inline-block", width: 13, height: 13,
      border: `2px solid ${col}44`, borderTopColor: col,
      borderRadius: "50%", animation: "spin .7s linear infinite",
    }} />
  );
}
