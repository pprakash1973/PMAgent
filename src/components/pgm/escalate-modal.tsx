"use client";
import { useState } from "react";

interface Project {
  id: string;
  name: string;
  rag?: string;
  spi?: number | null;
  cpi?: number | null;
  schedPct?: number;
}

interface Risk {
  id: string;
  description: string;
}

interface Props {
  project: Project;
  risk?: Risk;
  onClose: () => void;
  onSuccess: () => void;
}

const T = {
  bg: "#F2F7F8", border: "#D7E0E3", petrol: "#003C51", teal: "#006E74",
  text: "#231F20", muted: "#7A7480", card: "#fff", red: "#cf3f3a",
};

export function EscalateModal({ project, risk, onClose, onSuccess }: Props) {
  const [severity, setSeverity]         = useState<"critical"|"high"|"medium">("high");
  const [title, setTitle]               = useState(risk ? `Risk: ${risk.description.slice(0,80)}` : `Escalation: ${project.name}`);
  const [situation, setSituation]       = useState("");
  const [impact, setImpact]             = useState("");
  const [supportRequired, setSupport]   = useState("");
  const [targetDate, setTargetDate]     = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const contextSnapshot = {
    rag:      project.rag,
    spi:      project.spi,
    cpi:      project.cpi,
    schedPct: project.schedPct,
  };

  async function submit() {
    setError(null);
    if (!title.trim() || title.length < 3) { setError("Title is required"); return; }
    if (situation.length < 30) { setError("Situation must be at least 30 characters"); return; }
    if (impact.length < 10)    { setError("Impact is required"); return; }
    if (supportRequired.length < 10) { setError("Support required is required"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/escalations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType:           risk ? "risk" : "project",
          projectId:            project.id,
          riskId:               risk?.id,
          severity,
          title:                title.trim(),
          situation,
          impact,
          supportRequired,
          targetResolutionDate: targetDate || undefined,
          contextSnapshot,
        }),
      });
      const json = await res.json();
      if (res.status === 409) {
        setError("An open escalation already exists for this target. Use the Escalations page to add a comment.");
        return;
      }
      if (!res.ok) {
        setError(json.error ?? "Failed to create escalation");
        return;
      }
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`,
    fontSize: 13, outline: "none", background: T.card, boxSizing: "border-box",
  };
  const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 80, resize: "vertical" };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: T.muted, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: .4,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,60,81,.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: T.card, borderRadius: 16, width: "100%", maxWidth: 580, maxHeight: "90vh",
        overflow: "auto", padding: "28px 32px", boxShadow: "0 16px 48px rgba(0,0,0,.2)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.petrol }}>Escalate to Delivery Head</div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>
              {risk ? `Risk on: ${project.name}` : project.name}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: T.muted, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Context snapshot */}
        {(project.rag || project.spi !== undefined) && (
          <div style={{ background: T.bg, borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12.5, color: T.muted, display: "flex", gap: 16 }}>
            <span>Health: <strong style={{ color: project.rag === "red" ? T.red : project.rag === "amber" ? "#c17d12" : "#158a5a" }}>{project.rag?.toUpperCase()}</strong></span>
            {project.spi !== null && project.spi !== undefined && <span>SPI: <strong>{project.spi.toFixed(2)}</strong></span>}
            {project.cpi !== null && project.cpi !== undefined && <span>CPI: <strong>{project.cpi.toFixed(2)}</strong></span>}
            {project.schedPct !== undefined && <span>Done: <strong>{project.schedPct}%</strong></span>}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Severity */}
          <div>
            <label style={labelStyle}>Severity *</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["critical","high","medium"] as const).map(s => (
                <button key={s} onClick={() => setSeverity(s)} style={{
                  flex: 1, padding: "8px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12.5, textTransform: "capitalize",
                  border: `2px solid ${severity === s ? (s === "critical" ? "#cf3f3a" : s === "high" ? "#c17d12" : "#158a5a") : T.border}`,
                  background: severity === s ? (s === "critical" ? "#fbe4e2" : s === "high" ? "#fbf0da" : "#e3f3ea") : T.card,
                  color: severity === s ? (s === "critical" ? "#cf3f3a" : s === "high" ? "#c17d12" : "#158a5a") : T.muted,
                }}>{s}</button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label style={labelStyle}>Title * <span style={{ fontWeight: 400 }}>({title.length}/120)</span></label>
            <input value={title} onChange={e => setTitle(e.target.value.slice(0,120))} style={inputStyle} placeholder="Brief escalation title" />
          </div>

          {/* Situation */}
          <div>
            <label style={labelStyle}>Situation * <span style={{ fontWeight: 400 }}>(min 30 chars — {situation.length})</span></label>
            <textarea value={situation} onChange={e => setSituation(e.target.value)} style={textareaStyle} placeholder="What is happening? Describe the current state and what changed." />
          </div>

          {/* Impact */}
          <div>
            <label style={labelStyle}>Impact *</label>
            <textarea value={impact} onChange={e => setImpact(e.target.value)} style={{ ...textareaStyle, minHeight: 60 }} placeholder="Consequence to schedule, cost, quality or client relationship." />
          </div>

          {/* Support required */}
          <div>
            <label style={labelStyle}>Support Required *</label>
            <textarea value={supportRequired} onChange={e => setSupport(e.target.value)} style={{ ...textareaStyle, minHeight: 60 }} placeholder="The specific ask of the Delivery Head — what decision or action is needed." />
          </div>

          {/* Target resolution date */}
          <div>
            <label style={labelStyle}>Target Resolution Date (optional)</label>
            <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} style={inputStyle} />
          </div>

          {error && (
            <div style={{ background: "#fbe4e2", border: "1px solid #cf3f3a40", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: T.red }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.muted, fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={submit} disabled={submitting} style={{
              padding: "9px 20px", borderRadius: 8, border: "none", background: T.red, color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: submitting ? "wait" : "pointer", opacity: submitting ? .7 : 1,
            }}>
              {submitting ? "Escalating…" : "Escalate to DH"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
