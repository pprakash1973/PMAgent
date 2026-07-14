"use client";
import { useState } from "react";

const TEAL = "#006E74";
const BORDER = "#D7E0E3";
const WASH = "#F2F7F8";

type ProjectOption = { id: string; name: string; healthStatus: string };

function ragDot(s: string) {
  return s === "green" ? "#01B27C" : s === "amber" ? "#B07C10" : "#cf3f3a";
}

export function SteeringDeckGenerator({ projects }: { projects: ProjectOption[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(projects.map((p) => p.id)));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function generate() {
    if (selected.size === 0) return;
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/portfolio/steering-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIds: Array.from(selected) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.code || "Deck generation failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Steering-Committee-Deck_${new Date().toISOString().slice(0, 10)}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ position: "relative" as const }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          height: 36, padding: "0 15px", background: TEAL, color: "#fff", border: "none",
          borderRadius: 9, font: "600 12.5px 'Aptos','Calibri',sans-serif", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 7, boxShadow: "0 2px 6px rgba(0,110,116,.3)",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="14" rx="2" stroke="#fff" strokeWidth="1.7" /><path d="M8 21h8M12 17v4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" /></svg>
        Steering Committee Deck
      </button>

      {open && (
        <div style={{
          position: "absolute" as const, top: 42, right: 0, width: 360, background: "#fff",
          border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 8px 28px rgba(0,0,0,.14)",
          zIndex: 50, overflow: "hidden",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, fontSize: 13, fontWeight: 700, color: "#1a1d24" }}>
            Select projects for the deck
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto" as const, padding: "6px 0" }}>
            {projects.map((p) => (
              <label key={p.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", cursor: "pointer",
                fontSize: 12.5, color: "#1a1d24",
              }}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: ragDot(p.healthStatus), flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }}>{p.name}</span>
              </label>
            ))}
            {projects.length === 0 && (
              <div style={{ padding: "16px", fontSize: 12.5, color: "#8a909c", textAlign: "center" as const }}>No projects available</div>
            )}
          </div>
          {error && <div style={{ padding: "8px 16px", fontSize: 11.5, color: "#cf3f3a" }}>{error}</div>}
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${BORDER}`, background: WASH, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: "#7A7480" }}>{selected.size} selected</span>
            <button
              onClick={generate}
              disabled={generating || selected.size === 0}
              style={{
                height: 32, padding: "0 14px", background: generating ? "#8fb7ba" : TEAL, color: "#fff",
                border: "none", borderRadius: 8, font: "600 12px 'Aptos','Calibri',sans-serif",
                cursor: generating ? "default" : "pointer",
              }}
            >
              {generating ? "Generating…" : "Generate & Download"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
