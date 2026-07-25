"use client";
import { useState } from "react";

const SUGGESTIONS = ["SAM", "Maxi", "Ana", "Aria"];

const CAPABILITIES = [
  {
    title: "Proactive review",
    desc: "Runs 20 PMI checks on every project automatically — no prompting needed.",
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12Z" stroke="currentColor" strokeWidth="1.5"/>
        <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    title: "EVM analysis",
    desc: "SPI, CPI, EAC, TCPI — interpreted in plain language, not just numbers.",
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M3 17l4-4 4 2 4-6 4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 21h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    title: "Risk & issue gaps",
    desc: "Flags missing owners, unregistered risks, and stale issue registers before a gate does.",
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    title: "One-click actions",
    desc: "Accept a finding and it auto-creates a stub risk or patches the issue — you confirm.",
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export function NamingCeremony({ pmName, onComplete }: { pmName?: string; onComplete: (name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const display = name.trim() || "your reviewer";

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

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,20,30,0.78)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 22, maxWidth: 480, width: "100%",
        boxShadow: "0 40px 100px rgba(0,0,0,0.28)", overflow: "hidden", fontFamily: ff,
      }}>

        {/* Header */}
        <div style={{ background: "#003C51", padding: "30px 32px 26px" }}>
          {/* Avatar */}
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 18,
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 3C9.2 3 7 5.2 7 8s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5Z" stroke="#2dd4bf" strokeWidth="1.5"/>
              <path d="M3 21c0-4.4 4-8 9-8s9 3.6 9 8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="18" cy="6" r="3" fill="#0097AC"/>
              <path d="M16.5 6h3M18 4.5v3" stroke="#fff" strokeWidth="1"/>
            </svg>
          </div>

          <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>
            Meet your reviewer
          </div>
          <h2 style={{ color: "#fff", fontSize: 21, fontWeight: 700, margin: "0 0 9px", lineHeight: 1.25, letterSpacing: "-.02em" }}>
            {pmName ? `${pmName}, your senior project advisor is ready.` : "Your senior project advisor is ready."}
          </h2>
          <p style={{ color: "rgba(255,255,255,0.62)", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            Proactively monitors every project — flags risks, validates EVM, and challenges gaps the way a PMBOK peer reviewer would.
          </p>
        </div>

        {/* Capabilities */}
        <div style={{ padding: "18px 32px 0" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#8a909c", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 11 }}>
            What your advisor does
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
            {CAPABILITIES.map(c => (
              <div key={c.title} style={{ background: "#f7f8fa", borderRadius: 11, padding: "11px 13px" }}>
                <div style={{ color: "#006E74", marginBottom: 6 }}>{c.svg}</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1a1d24", marginBottom: 3 }}>{c.title}</div>
                <div style={{ fontSize: 11.5, color: "#5b616e", lineHeight: 1.45 }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Naming */}
        <div style={{ padding: "20px 32px 28px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1d24", marginBottom: 5 }}>
            Give your advisor a name
          </div>
          <div style={{ fontSize: 12, color: "#8a909c", marginBottom: 12 }}>
            Pick a suggestion or type your own — you can change it any time.
          </div>

          {/* Suggestion chips */}
          <div style={{ display: "flex", gap: 7, marginBottom: 12, flexWrap: "wrap" }}>
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => setName(s)}
                style={{
                  padding: "5px 14px", borderRadius: 20, border: "none",
                  background: name === s ? "#006E74" : "#eef0fc",
                  color: name === s ? "#fff" : "#4f5bd5",
                  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  fontFamily: ff, transition: "all .12s",
                }}
              >{s}</button>
            ))}
          </div>

          {/* Free input */}
          <input
            value={name}
            onChange={e => { setName(e.target.value); setError(""); }}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
            placeholder="Or type a name…"
            maxLength={20}
            style={{
              width: "100%", padding: "11px 14px", borderRadius: 10, boxSizing: "border-box",
              border: error ? "1.5px solid #cf3f3a" : "1.5px solid #d1d9e0",
              fontSize: 14.5, outline: "none", fontFamily: ff, color: "#1a1d24",
              marginBottom: error ? 4 : 12,
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
                background: saving ? "#b0bec5" : "#003C51",
                color: "#fff", fontWeight: 700, fontSize: 14,
                cursor: saving ? "not-allowed" : "pointer", fontFamily: ff,
              }}
            >
              {saving ? "Activating…" : name.trim() ? `Activate ${name.trim()}` : "Get started"}
            </button>
            <button
              onClick={() => handleSubmit("Advisor")}
              style={{
                padding: "12px 18px", borderRadius: 10,
                border: "1.5px solid #e2e5ea", background: "transparent",
                color: "#5b616e", fontSize: 14, cursor: "pointer", fontFamily: ff,
              }}
            >
              Skip
            </button>
          </div>

          <p style={{ fontSize: 11, color: "#9aa0ab", margin: "10px 0 0", textAlign: "center" }}>
            Opens in Chat mode by default · Advisor tab always one tap away
          </p>
        </div>
      </div>
    </div>
  );
}
