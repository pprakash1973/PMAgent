"use client";
import { useState } from "react";

const SUGGESTIONS = ["SAM", "Maxi", "Ana", "Aria"];

const CAPABILITIES = [
  {
    title: "Proactive review",
    desc: "Runs 20 PMI checks on every project automatically — no prompting needed.",
    svg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12Z" stroke="currentColor" strokeWidth="1.5"/>
        <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    title: "EVM analysis",
    desc: "SPI, CPI, EAC, TCPI — interpreted in plain language, not just numbers.",
    svg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M3 17l4-4 4 2 4-6 4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 21h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    title: "Risk & issue gaps",
    desc: "Flags missing owners, unregistered risks, and stale registers before a gate does.",
    svg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    title: "One-click actions",
    desc: "Accept a finding and it auto-creates a stub risk or patches the issue — you confirm.",
    svg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export function NamingCeremony({ pmName, onComplete }: { pmName?: string; onComplete: (name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(chosen?: string) {
    const trimmed = (chosen ?? name).trim();
    const final = trimmed || "Advisor";
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/copilot/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantName: final }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong"); setSaving(false); return; }
      onComplete(data.assistantName);
    } catch {
      setError("Network error — try again");
      setSaving(false);
    }
  }

  const ff = "'IBM Plex Sans', system-ui, sans-serif";
  const displayName = name.trim() || "Advisor";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,20,30,0.72)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 22, maxWidth: 460, width: "100%",
        boxShadow: "0 40px 100px rgba(0,0,0,.28)", overflow: "hidden", fontFamily: ff,
      }}>

        {/* ── Gradient header ── */}
        <div style={{
          background: "linear-gradient(135deg, #006E74 0%, #0097AC 100%)",
          padding: "28px 28px 24px",
        }}>
          {/* Tag pill */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.3)",
            borderRadius: 20, padding: "3px 12px", marginBottom: 16,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", letterSpacing: ".07em", textTransform: "uppercase" }}>
              Your AI Advisor
            </span>
          </div>

          {/* Wave */}
          <div style={{ fontSize: 32, marginBottom: 10, lineHeight: 1 }}>👋</div>

          {/* Greeting */}
          <h2 style={{
            color: "#fff", fontSize: 19, fontWeight: 700,
            lineHeight: 1.3, margin: "0 0 10px", letterSpacing: "-.02em",
          }}>
            {pmName
              ? `Hello ${pmName}, I'm your personal project advisor — here to keep you ahead of every curve.`
              : "Hello — I'm your personal project advisor, here to keep you ahead of every curve."}
          </h2>

          <p style={{ color: "rgba(255,255,255,.75)", fontSize: 12.5, margin: 0, lineHeight: 1.65 }}>
            Think of me as the senior PMO voice in your pocket — always on, always watching, never surprised.
          </p>
        </div>

        {/* ── Capabilities ── */}
        <div style={{ padding: "18px 28px 0" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9aa0ab", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 11 }}>
            What I do for you
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
            {CAPABILITIES.map(c => (
              <div key={c.title} style={{ background: "#f7f9fb", borderRadius: 10, padding: "11px 12px" }}>
                <div style={{ color: "#0097AC", marginBottom: 5 }}>{c.svg}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1d24", marginBottom: 2 }}>{c.title}</div>
                <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.45 }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Naming ── */}
        <div style={{ padding: "20px 28px 26px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1d24", marginBottom: 4 }}>
            What should I call you? Give me a name.
          </div>
          <div style={{ fontSize: 12, color: "#9aa0ab", marginBottom: 12 }}>
            Pick a suggestion or type your own — you can change it any time.
          </div>

          {/* Chips */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" as const }}>
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => setName(s)}
                style={{
                  padding: "5px 16px", borderRadius: 20,
                  border: `1.5px solid ${name === s ? "#0097AC" : "#0097AC"}`,
                  background: name === s ? "#0097AC" : "transparent",
                  color: name === s ? "#fff" : "#0097AC",
                  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  fontFamily: ff, transition: "all .12s",
                }}
              >{s}</button>
            ))}
          </div>

          {/* Free text */}
          <input
            value={name}
            onChange={e => { setName(e.target.value); setError(""); }}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
            placeholder="Or type a name…"
            maxLength={20}
            style={{
              width: "100%", padding: "11px 14px", borderRadius: 10, boxSizing: "border-box" as const,
              border: error ? "1.5px solid #cf3f3a" : "1.5px solid #d1d9e0",
              fontSize: 14, outline: "none", fontFamily: ff, color: "#1a1d24",
              marginBottom: error ? 4 : 14, transition: "border-color .15s",
            }}
          />
          {error && <p style={{ fontSize: 12, color: "#cf3f3a", margin: "0 0 10px" }}>{error}</p>}

          {/* CTA */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => handleSubmit()}
              disabled={saving}
              style={{
                flex: 1, padding: "12px 0", borderRadius: 10, border: "none",
                background: saving ? "#9ca3af" : "#006E74",
                color: "#fff", fontWeight: 700, fontSize: 14,
                cursor: saving ? "not-allowed" : "pointer", fontFamily: ff,
                transition: "background .15s",
              }}
            >
              {saving ? "Activating…" : `Let's go, ${displayName} →`}
            </button>
            <button
              onClick={() => handleSubmit("Advisor")}
              style={{
                padding: "12px 18px", borderRadius: 10,
                border: "1.5px solid #e2e5ea", background: "transparent",
                color: "#6b7280", fontSize: 14, cursor: "pointer", fontFamily: ff,
              }}
            >
              Skip
            </button>
          </div>

          <p style={{ fontSize: 11, color: "#b0b8c1", margin: "10px 0 0", textAlign: "center" as const }}>
            Opens in Chat mode · Advisor tab always one tap away
          </p>
        </div>
      </div>
    </div>
  );
}
