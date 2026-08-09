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
  spi: number | null;
  cpi: number | null;
  savedAt?: string;
}

interface AnswerState {
  selected: string[];
  custom: string;
}

function blankAnswer(): AnswerState { return { selected: [], custom: "" }; }

function answerText(q: StatusQuestion, a: AnswerState): string {
  if (q.type === "number") return a.custom;
  if (q.type === "select") return a.selected[0] ?? "";
  const parts = [...a.selected];
  if (a.custom.trim()) parts.push(a.custom.trim());
  return parts.join("; ");
}

function isAnswered(q: StatusQuestion, a: AnswerState): boolean {
  return answerText(q, a).trim().length > 0;
}

function ChipSelector({ q, answer, onChange }: { q: StatusQuestion; answer: AnswerState; onChange: (a: AnswerState) => void }) {
  const multi = q.type === "multi-chips";
  function toggleChip(opt: string) {
    if (multi) {
      const already = answer.selected.includes(opt);
      onChange({ ...answer, selected: already ? answer.selected.filter((s) => s !== opt) : [...answer.selected, opt] });
    } else {
      onChange({ ...answer, selected: answer.selected[0] === opt ? [] : [opt] });
    }
  }
  return (
    <div>
      <div style={{ fontSize: 11, color: C.text3, marginBottom: 8 }}>
        {multi ? "Select all that apply" : "Select one"}{q.allowCustom ? " · or type a custom answer below" : ""}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 7 }}>
        {q.suggestedAnswers.map((opt) => {
          const active = answer.selected.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => toggleChip(opt)} style={{
              padding: "6px 13px", borderRadius: 999,
              border: `1.5px solid ${active ? C.primary : C.border}`,
              background: active ? C.primary : C.surface,
              color: active ? "#fff" : C.text2,
              fontSize: 12.5, fontFamily: "'IBM Plex Sans',sans-serif",
              fontWeight: active ? 600 : 400, cursor: "pointer", transition: "all .12s",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              {active && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              {opt}
            </button>
          );
        })}
      </div>
      {q.allowCustom && (
        <div style={{ marginTop: 10 }}>
          <textarea rows={2} placeholder={q.placeholder ?? "Add your own notes or additional context…"}
            value={answer.custom} onChange={(e) => onChange({ ...answer, custom: e.target.value })}
            style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8,
              font: `13px 'IBM Plex Sans'`, color: C.text, background: C.surface, resize: "vertical",
              boxSizing: "border-box" as const, lineHeight: 1.55 }} />
        </div>
      )}
    </div>
  );
}

function SelectInput({ q, answer, onChange }: { q: StatusQuestion; answer: AnswerState; onChange: (a: AnswerState) => void }) {
  return (
    <select value={answer.selected[0] ?? ""}
      onChange={(e) => onChange({ ...answer, selected: e.target.value ? [e.target.value] : [] })}
      style={{ width: "100%", height: 38, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 8,
        font: `13px 'IBM Plex Sans'`, color: answer.selected[0] ? C.text : C.text3, background: C.surface, cursor: "pointer" }}>
      <option value="">Select…</option>
      {q.suggestedAnswers.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  );
}

function NumberInput({ q, answer, onChange }: { q: StatusQuestion; answer: AnswerState; onChange: (a: AnswerState) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input type="number" placeholder={q.placeholder ?? "0"} value={answer.custom}
        onChange={(e) => onChange({ ...answer, custom: e.target.value })}
        style={{ width: 120, height: 38, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 8,
          font: `14px 'IBM Plex Mono'`, color: C.text, background: C.surface }} />
      {q.unit && <span style={{ fontSize: 13, color: C.text3 }}>{q.unit}</span>}
    </div>
  );
}

// ── SVG helpers ─────────────────────────────────────────────────────────────

function HealthDial({ score, color }: { score: number; color: string }) {
  const R = 20, CX = 26, CY = 26;
  const circ = 2 * Math.PI * R;
  const dash = (Math.min(score, 100) / 100) * circ;
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" aria-label={`Health score ${Math.round(score)}`} style={{ flexShrink: 0 }}>
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#e2e5ea" strokeWidth="5"/>
      <circle cx={CX} cy={CY} r={R} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash.toFixed(1)} ${(circ - dash).toFixed(1)}`}
        strokeDashoffset={`${(circ / 4).toFixed(1)}`}
        strokeLinecap="round" transform={`rotate(-90 ${CX} ${CY})`}/>
      <text x={CX} y={CY + 5} textAnchor="middle" fontSize="13" fontWeight="500" fill={color}>{Math.round(score)}</text>
    </svg>
  );
}

function SemiGauge({ value, max = 1.5, color, label, sub, display }: {
  value: number | null; max?: number; color: string; label: string; sub: string; display: string;
}) {
  const CX = 50, CY = 52, R = 36;
  const f = value != null ? Math.min(1, value / max) : 0;
  const track = `M ${CX - R},${CY} A ${R},${R} 0 0,1 ${CX + R},${CY}`;
  let arc = "";
  if (value != null && f > 0.01) {
    const angle = Math.PI * (1 - Math.min(f, 0.999));
    const ex = (CX + R * Math.cos(angle)).toFixed(1);
    const ey = (CY - R * Math.sin(angle)).toFixed(1);
    arc = `M ${CX - R},${CY} A ${R},${R} 0 0,1 ${ex},${ey}`;
  }
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 10px 12px", textAlign: "center" as const }}>
      <svg viewBox="0 0 100 62" style={{ width: "100%", maxWidth: 110, display: "block", margin: "0 auto" }} aria-hidden="true">
        <path d={track} fill="none" stroke="#e2e5ea" strokeWidth="8" strokeLinecap="round"/>
        {arc && <path d={arc} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"/>}
      </svg>
      <div style={{ fontSize: 20, fontWeight: 500, color, margin: "-4px 0 2px", fontFamily: "'IBM Plex Mono',monospace" }}>{display}</div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" as const, color: C.text3 }}>{label}</div>
      <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function StatusQuestionnaire({ projectId }: { projectId: string }) {
  const [phase, setPhase] = useState<"idle" | "loading-q" | "answering" | "generating" | "wsr" | "saving" | "saved">("idle");
  const [questions, setQuestions] = useState<StatusQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const [wsr, setWsr] = useState<WSRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportingPpt, setExportingPpt] = useState(false);

  function setAnswer(id: number, a: AnswerState) {
    setAnswers((prev) => ({ ...prev, [id]: a }));
  }

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

  const [qaPayload, setQaPayload] = useState<object[]>([]);

  async function generateWSR() {
    setPhase("generating");
    setError(null);
    try {
      const payload = questions.map((q) => ({
        category: q.category,
        question: q.question,
        answer: answerText(q, answers[q.id] ?? blankAnswer()),
      }));
      setQaPayload(payload);
      const res = await fetch(`/api/projects/${projectId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionnaire: payload, source: "questionnaire", preview: true }),
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
        spi: data.spi ?? null,
        cpi: data.cpi ?? null,
      });
      setPhase("wsr");
    } catch (e: any) {
      setError(e.message);
      setPhase("answering");
    }
  }

  async function confirmSave() {
    setPhase("saving");
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionnaire: qaPayload,
          source: "questionnaire",
          preview: false,
          previewResult: wsr ? {
            summary: wsr.summary, ragStatus: wsr.ragStatus,
            recommendations: wsr.recommendations, accomplishments: wsr.accomplishments,
            nextWeekPlan: wsr.nextWeekPlan, metricsNarrative: wsr.metricsNarrative,
          } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Failed to save WSR");
      setWsr((prev) => prev ? { ...prev, savedAt: data.savedAt } : prev);
      setPhase("saved");
    } catch (e: any) {
      setError(e.message);
      setPhase("wsr");
    }
  }

  async function handleExportPpt() {
    setExportingPpt(true);
    setError(null);
    try {
      // Auto-save first if still in preview
      if (phase === "wsr") {
        setPhase("saving");
        const saveRes = await fetch(`/api/projects/${projectId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionnaire: qaPayload,
            source: "questionnaire",
            preview: false,
            previewResult: wsr ? {
              summary: wsr.summary, ragStatus: wsr.ragStatus,
              recommendations: wsr.recommendations, accomplishments: wsr.accomplishments,
              nextWeekPlan: wsr.nextWeekPlan, metricsNarrative: wsr.metricsNarrative,
            } : undefined,
          }),
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok) throw new Error(saveData.error?.message ?? "Failed to save before export");
        setWsr((prev) => prev ? { ...prev, savedAt: saveData.savedAt } : prev);
        setPhase("saved");
      }
      const res = await fetch(`/api/projects/${projectId}/status/export`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "WSR.pptx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Export failed");
      setPhase("wsr");
    } finally {
      setExportingPpt(false);
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
        <button onClick={startQuestionnaire} disabled={phase === "loading-q"} style={{
          height: 42, padding: "0 28px",
          background: phase === "loading-q" ? C.surface2 : C.primary,
          color: phase === "loading-q" ? C.text3 : "#fff",
          border: "none", borderRadius: 10,
          font: `700 13.5px 'IBM Plex Sans'`, cursor: phase === "loading-q" ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", gap: 10,
        }}>
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
        <div style={{ height: 4, background: C.borderLight, borderRadius: 2, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(answeredCount / questions.length) * 100}%`, background: C.primary, borderRadius: 2, transition: "width .3s" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
          {questions.map((q, i) => {
            const ans = answers[q.id] ?? blankAnswer();
            const answered = isAnswered(q, ans);
            return (
              <div key={q.id} style={{
                background: C.surface, border: `1.5px solid ${answered ? C.primaryBorder : C.border}`,
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
                {(q.type === "chips" || q.type === "multi-chips") && <ChipSelector q={q} answer={ans} onChange={(a) => setAnswer(q.id, a)} />}
                {q.type === "select" && <SelectInput q={q} answer={ans} onChange={(a) => setAnswer(q.id, a)} />}
                {q.type === "number" && <NumberInput q={q} answer={ans} onChange={(a) => setAnswer(q.id, a)} />}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
          {!canSubmit && requiredUnanswered > 0 && (
            <span style={{ fontSize: 12, color: C.text3 }}>{requiredUnanswered} required {requiredUnanswered === 1 ? "question" : "questions"} remaining</span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={generateWSR} disabled={!canSubmit || phase === "generating"} style={{
            height: 40, padding: "0 24px",
            background: !canSubmit || phase === "generating" ? C.surface2 : C.primary,
            color: !canSubmit || phase === "generating" ? C.text3 : "#fff",
            border: "none", borderRadius: 9, font: `700 13px 'IBM Plex Sans'`,
            cursor: !canSubmit || phase === "generating" ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            {phase === "generating" ? <><Spinner col="#9199d4" /> Generating WSR…</> : <>✦ Generate Status Report</>}
          </button>
        </div>
        {error && <div style={{ marginTop: 12, padding: "10px 14px", background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 9, fontSize: 13, color: C.red }}>{error}</div>}
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── WSR result ────────────────────────────────────────────────────────────
  if ((phase === "wsr" || phase === "saving" || phase === "saved") && wsr) {
    const rc = ragColor(wsr.ragStatus);
    const rb = ragBg(wsr.ragStatus);
    const isSaved = phase === "saved";
    const isSaving = phase === "saving";

    function kpiColor(val: number | null): string {
      if (val === null) return C.text3;
      return val >= 1 ? C.green : val >= 0.8 ? C.amber : C.red;
    }

    const showGauges = wsr.spi !== null || wsr.cpi !== null;
    const gaugeCount = (wsr.spi !== null ? 1 : 0) + (wsr.cpi !== null ? 1 : 0);

    return (
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>

        {/* ── Report header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 }}>
          <HealthDial score={wsr.healthScore} color={rc} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Weekly Status Report</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>
              {isSaved && wsr.savedAt ? (
                <span>Saved <span style={{ color: C.green, fontWeight: 600 }}>
                  {new Date(wsr.savedAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  {" at "}{new Date(wsr.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span></span>
              ) : (
                <span style={{ color: C.amber }}>Preview — not yet saved · Export will auto-save</span>
              )}
            </div>
          </div>
          <span style={{ flexShrink: 0, borderRadius: 999, padding: "5px 14px", fontSize: 12, fontWeight: 700, color: rc, background: rb }}>
            {ragLabel(wsr.ragStatus)}
          </span>
          <button
            onClick={handleExportPpt}
            disabled={exportingPpt || isSaving}
            style={{
              flexShrink: 0, background: exportingPpt || isSaving ? C.surface2 : "#006E74",
              color: exportingPpt || isSaving ? C.text3 : "#fff",
              border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600,
              cursor: exportingPpt || isSaving ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 7,
            }}>
            {exportingPpt ? <><Spinner col="#9199d4" /> Exporting…</> : <>📊 Export PPT</>}
          </button>
        </div>

        {/* ── KPI gauges ── */}
        {showGauges && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${gaugeCount}, minmax(0, 1fr))`, gap: 10 }}>
            {wsr.spi !== null && (
              <SemiGauge value={wsr.spi} max={1.5} color={kpiColor(wsr.spi)} label="SPI" display={wsr.spi.toFixed(2)} sub="schedule performance" />
            )}
            {wsr.cpi !== null && (
              <SemiGauge value={wsr.cpi} max={1.5} color={kpiColor(wsr.cpi)} label="CPI" display={wsr.cpi.toFixed(2)} sub="cost performance" />
            )}
          </div>
        )}

        {/* ── Executive Summary ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: "3px solid #006E74", borderRadius: "0 12px 12px 0", padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: "#006E74", marginBottom: 8 }}>Executive Summary</div>
          <p style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.65, margin: 0 }}>{wsr.summary}</p>
        </div>

        {/* ── Accomplishments + Next Week ── */}
        {(wsr.accomplishments.length > 0 || wsr.nextWeekPlan.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {wsr.accomplishments.length > 0 && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.green, marginBottom: 9 }}>✓ Accomplishments</div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {wsr.accomplishments.map((a, i) => (
                    <li key={i} style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, paddingBottom: 4, marginBottom: 4, borderBottom: i < wsr.accomplishments.length - 1 ? `0.5px solid ${C.borderLight}` : "none" }}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            {wsr.nextWeekPlan.length > 0 && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: "#0097AC", marginBottom: 9 }}>→ Next Week</div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {wsr.nextWeekPlan.map((p, i) => (
                    <li key={i} style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, paddingBottom: 4, marginBottom: 4, borderBottom: i < wsr.nextWeekPlan.length - 1 ? `0.5px solid ${C.borderLight}` : "none" }}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── Schedule & Budget narrative ── */}
        {wsr.metricsNarrative && (
          <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 8 }}>Schedule & Budget</div>
            <p style={{ fontSize: 13, color: C.text2, lineHeight: 1.65, margin: 0 }}>{wsr.metricsNarrative}</p>
          </div>
        )}

        {/* ── AI Recommendations ── */}
        {wsr.recommendations.length > 0 && (
          <div style={{ background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: `1px solid ${C.primaryBorder}`, borderLeft: "3px solid #4f5bd5", borderRadius: "0 12px 12px 0", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 11 }}>
              <span style={{ color: C.primary }}>✦</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" as const, color: C.primary }}>AI Recommendations</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 0 }}>
              {wsr.recommendations.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", paddingTop: i > 0 ? 8 : 0, paddingBottom: i < wsr.recommendations.length - 1 ? 8 : 0, borderTop: i > 0 ? `0.5px solid ${C.primaryBorder}` : "none" }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: C.primary, color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{i + 1}</span>
                  <span style={{ fontSize: 13, color: "#3a3f52", lineHeight: 1.6 }}>{r}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", paddingTop: 4 }}>
          {!isSaved && (
            <button onClick={() => setPhase("answering")} disabled={isSaving || exportingPpt}
              style={{ height: 36, padding: "0 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, font: `500 12.5px 'IBM Plex Sans'`, color: C.text2, cursor: isSaving || exportingPpt ? "not-allowed" : "pointer" }}>
              ← Revise answers
            </button>
          )}
          <div style={{ flex: 1 }} />
          {error && <span style={{ fontSize: 12, color: C.red }}>{error}</span>}
          {isSaved ? (
            <button onClick={() => { setPhase("idle"); setWsr(null); setQuestions([]); setAnswers({}); setQaPayload([]); }}
              style={{ height: 36, padding: "0 18px", background: C.primary, border: "none", borderRadius: 8, font: `700 12.5px 'IBM Plex Sans'`, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
              ✦ Generate new WSR
            </button>
          ) : (
            <button onClick={confirmSave} disabled={isSaving || exportingPpt}
              style={{ height: 36, padding: "0 20px", background: isSaving || exportingPpt ? C.surface2 : C.green, border: "none", borderRadius: 8, font: `700 12.5px 'IBM Plex Sans'`, color: isSaving || exportingPpt ? C.text3 : "#fff", cursor: isSaving || exportingPpt ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              {isSaving ? <><Spinner col="#9199d4" /> Saving…</> : <>Confirm & save ✓</>}
            </button>
          )}
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return null;
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
