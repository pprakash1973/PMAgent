"use client";
import { useState } from "react";

interface Props {
  pmName?: string;
  onComplete: (name: string) => void;
}

const CAPABILITIES = [
  { icon: "✅", text: "Close tasks & update progress" },
  { icon: "🛡️", text: "Log risks and resolve issues" },
  { icon: "📄", text: "Regenerate decks & reports" },
  { icon: "📊", text: "Analyze EVM, SPI & CPI" },
  { icon: "🏁", text: "Complete milestones & set health" },
  { icon: "💬", text: "Answer any project question" },
];

export function NamingCeremony({ pmName, onComplete }: Props) {
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

  const greeting = pmName ? `Hi ${pmName}, great to meet you!` : "Hi there, great to meet you!";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(10,14,22,0.72)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
    }}>
      <div style={{
        background: "#fff", borderRadius: 22,
        maxWidth: 460, width: "100%",
        boxShadow: "0 32px 80px rgba(0,0,0,0.22)",
        overflow: "hidden",
      }}>
        {/* Header band */}
        <div style={{
          background: "linear-gradient(135deg, #003C51 0%, #006E74 55%, #0097AC 100%)",
          padding: "28px 32px 24px",
        }}>
          {/* Brand row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round"/>
                <path d="M12 12l7-4M12 12v9M12 12L5 8" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round"/>
              </svg>
            </div>
            <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: 600, letterSpacing: "0.01em" }}>
              PM Agent · AI Copilot
            </span>
          </div>

          <h2 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            {greeting}
          </h2>
          <p style={{ color: "rgba(255,255,255,0.78)", fontSize: 13.5, margin: 0, lineHeight: 1.55 }}>
            I'm your personal AI assistant, here to work alongside you every step of the way. Just tell me what you need — I'll take care of the rest.
          </p>
        </div>

        {/* Capabilities grid */}
        <p style={{ margin: "16px 32px 0", fontSize: 10.5, fontWeight: 600, color: "#8a909c", letterSpacing: "0.07em", textTransform: "uppercase" }}>
          Here's what I can do for you (and more 🙂)
        </p>
        <div style={{ padding: "10px 32px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {CAPABILITIES.map((c) => (
            <div key={c.text} style={{
              display: "flex", alignItems: "flex-start", gap: 9,
              background: "#f7f8fa", borderRadius: 10, padding: "10px 12px",
            }}>
              <span style={{ fontSize: 16, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{c.icon}</span>
              <span style={{ fontSize: 12.5, color: "#3a3f4a", lineHeight: 1.45, fontWeight: 500 }}>{c.text}</span>
            </div>
          ))}
        </div>

        {/* Naming form */}
        <div style={{ padding: "20px 32px 28px" }}>
          <p style={{ fontSize: 13, color: "#5b616e", margin: "0 0 12px", fontWeight: 500 }}>
            What would you like to call your assistant?
          </p>
          <form onSubmit={handleSubmit}>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              placeholder='e.g. "SAM", "Max", "Alex"'
              maxLength={20}
              autoFocus
              style={{
                width: "100%", padding: "11px 14px", borderRadius: 10,
                border: error ? "1.5px solid #cf3f3a" : "1.5px solid #d1d9e0",
                fontSize: 14.5, outline: "none", boxSizing: "border-box",
                fontFamily: "inherit", color: "#1a1d24",
              }}
            />
            {error && <p style={{ fontSize: 12, color: "#cf3f3a", margin: "5px 0 0" }}>{error}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 10, border: "none",
                  background: saving ? "#b0bec5" : "linear-gradient(135deg, #006E74, #0097AC)",
                  color: "#fff", fontWeight: 700, fontSize: 14,
                  cursor: saving ? "not-allowed" : "pointer", letterSpacing: "0.01em",
                }}
              >
                {saving ? "Saving…" : name.trim() ? `Let's go, ${name.trim()}!` : "Get started"}
              </button>
              <button
                type="button"
                onClick={() => onComplete("Copilot")}
                style={{
                  padding: "12px 18px", borderRadius: 10,
                  border: "1.5px solid #e2e5ea", background: "transparent",
                  color: "#5b616e", fontSize: 14, cursor: "pointer",
                }}
              >
                Skip
              </button>
            </div>
            <p style={{ fontSize: 11, color: "#9aa0ab", margin: "10px 0 0", textAlign: "center" }}>
              You can rename your assistant any time from settings.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
