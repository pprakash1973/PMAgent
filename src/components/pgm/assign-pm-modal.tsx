"use client";
import { useState, useEffect } from "react";

interface EligiblePm {
  id: string;
  fullName: string;
  email: string;
  activeCount: number;
  eligible: boolean;
  reason: string | null;
}

interface Props {
  projectId: string;
  projectName: string;
  currentPmName: string;
  onClose: () => void;
  onSuccess: (newPmName: string) => void;
}

const T = {
  bg: "#F2F7F8", border: "#D7E0E3", petrol: "#003C51", teal: "#006E74",
  text: "#231F20", muted: "#7A7480", card: "#fff",
};

export function AssignPmModal({ projectId, projectName, currentPmName, onClose, onSuccess }: Props) {
  const [pms, setPms]           = useState<EligiblePm[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selectedId, setSelected] = useState<string>("");
  const [reason, setReason]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [preview, setPreview]   = useState<{ outgoing: number; incoming: number } | null>(null);

  useEffect(() => {
    fetch(`/api/pgm/eligible-pms?projectId=${projectId}`)
      .then(r => r.json())
      .then(d => { setPms(d.pms ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  function selectPm(id: string) {
    setSelected(id);
    setError(null);
    const pm = pms.find(p => p.id === id);
    if (pm) {
      setPreview({ outgoing: 0, incoming: pm.activeCount + 1 });
    }
  }

  async function submit() {
    setError(null);
    if (!selectedId) { setError("Please select a PM"); return; }
    if (reason.length < 10) { setError("Reason must be at least 10 characters"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/pgm/reassign-pm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, newPmId: selectedId, reason }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "AT_LIMIT") {
          setError("This PM is at the 2-project limit. Choose a different PM or request an Admin override.");
        } else {
          setError(json.error ?? "Reassignment failed");
        }
        return;
      }
      onSuccess(json.newPmName);
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`,
    fontSize: 13, outline: "none", background: T.card, boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: T.muted, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: .4,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,60,81,.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: T.card, borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "90vh",
        overflow: "auto", padding: "28px 32px", boxShadow: "0 16px 48px rgba(0,0,0,.2)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.petrol }}>Assign / Replace PM</div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>{projectName}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: T.muted, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Current PM */}
        <div style={{ background: T.bg, borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12.5, color: T.muted }}>
          Current PM: <strong style={{ color: T.text }}>{currentPmName}</strong>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* PM picker */}
          <div>
            <label style={labelStyle}>Select New PM *</label>
            {loading ? (
              <div style={{ color: T.muted, fontSize: 13 }}>Loading eligible PMs…</div>
            ) : pms.length === 0 ? (
              <div style={{ color: T.muted, fontSize: 13 }}>No PM users found in this organisation.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pms.map(pm => (
                  <button
                    key={pm.id}
                    disabled={!pm.eligible}
                    onClick={() => pm.eligible && selectPm(pm.id)}
                    style={{
                      textAlign: "left", padding: "10px 14px", borderRadius: 10, cursor: pm.eligible ? "pointer" : "not-allowed",
                      border: `2px solid ${selectedId === pm.id ? T.teal : T.border}`,
                      background: !pm.eligible ? T.bg : selectedId === pm.id ? `${T.teal}10` : T.card,
                      opacity: pm.eligible ? 1 : .55,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 700, color: T.petrol, fontSize: 13.5 }}>{pm.fullName}</span>
                      <span style={{ fontSize: 12, color: pm.activeCount >= 2 ? "#cf3f3a" : T.muted }}>
                        {pm.activeCount}/2 active
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                      {pm.reason ? <span style={{ color: "#cf3f3a" }}>{pm.reason}</span> : pm.email}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Impact preview */}
          {preview && selectedId && (
            <div style={{ background: "#e3f3ea", borderRadius: 10, padding: "12px 16px", fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, color: "#158a5a", marginBottom: 6 }}>Impact Preview</div>
              <div style={{ color: T.text }}>Incoming PM will have <strong>{preview.incoming}</strong> active project{preview.incoming !== 1 ? "s" : ""} after this change.</div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label style={labelStyle}>Reason for Change * <span style={{ fontWeight: 400 }}>({reason.length}/500, min 10)</span></label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 500))}
              style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
              placeholder="Explain why the PM is being changed (required for audit trail)"
            />
          </div>

          {error && (
            <div style={{ background: "#fbe4e2", border: "1px solid #cf3f3a40", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#cf3f3a" }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.muted, fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={submit} disabled={submitting || !selectedId} style={{
              padding: "9px 20px", borderRadius: 8, border: "none", background: T.teal, color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: (submitting || !selectedId) ? "not-allowed" : "pointer",
              opacity: (submitting || !selectedId) ? .6 : 1,
            }}>
              {submitting ? "Reassigning…" : "Confirm Reassignment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
