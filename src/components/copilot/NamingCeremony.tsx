"use client";
import { useState } from "react";

interface Props {
  onComplete: (name: string) => void;
}

export function NamingCeremony({ onComplete }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { onComplete("Copilot"); return; }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/copilot/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantName: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong"); setSaving(false); return; }
      onComplete(data.assistantName);
    } catch {
      setError("Network error — please try again");
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: "40px 36px",
        maxWidth: 420, width: "90%", boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
      }}>
        {/* Avatar */}
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, #4f5bd5 0%, #2dd4bf 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, marginBottom: 20,
        }}>🤖</div>

        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1d24", margin: "0 0 8px" }}>
          Hi, I'm your project copilot!
        </h2>
        <p style={{ fontSize: 14, color: "#5b616e", margin: "0 0 24px", lineHeight: 1.6 }}>
          I can summarize project health, analyze risks, explain metrics, and answer any PM questions.
          What would you like to call me?
        </p>

        <form onSubmit={handleSubmit}>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            placeholder='e.g. "SAM", "Max", "Alex"'
            maxLength={20}
            autoFocus
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 10,
              border: error ? "1.5px solid #cf3f3a" : "1.5px solid #cfd4f5",
              fontSize: 15, outline: "none", boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
          {error && <p style={{ fontSize: 12, color: "#cf3f3a", margin: "6px 0 0" }}>{error}</p>}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1, padding: "11px 0", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg, #4f5bd5, #2dd4bf)",
                color: "#fff", fontWeight: 600, fontSize: 14, cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : name.trim() ? `Let's go, ${name.trim()}!` : "Get started"}
            </button>
            <button
              type="button"
              onClick={() => onComplete("Copilot")}
              style={{
                padding: "11px 16px", borderRadius: 10,
                border: "1.5px solid #e2e5ea", background: "transparent",
                color: "#5b616e", fontSize: 14, cursor: "pointer",
              }}
            >
              Skip
            </button>
          </div>
          <p style={{ fontSize: 11, color: "#8a909c", margin: "12px 0 0", textAlign: "center" }}>
            You can rename me any time from the assistant settings.
          </p>
        </form>
      </div>
    </div>
  );
}
