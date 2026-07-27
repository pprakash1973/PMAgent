"use client";
import { useState } from "react";

const SUGGESTIONS = ["SAM", "Maxi", "Ana", "Aria"];

export function NamingCeremony({ pmName, onComplete, onSkip }: { pmName?: string; onComplete: (name: string) => void; onSkip: () => void }) {
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

  const ff = "'Aptos','Calibri',system-ui,sans-serif";
  const displayName = name.trim() || "Advisor";

  const FEATURES = [
    { label: "Proactive review", note: "20 PMI checks on every project, automatic" },
    { label: "EVM analysis", note: "SPI, CPI, EAC, TCPI in plain language" },
    { label: "Risk & issue gaps", note: "flags missing owners and stale registers" },
    { label: "One-click actions", note: "accept a finding to auto-log a risk or issue" },
  ];

  return (
    /* Floating card above the FAB — no full-screen backdrop */
    <div style={{
      position: "fixed", bottom: 88, right: 24, zIndex: 9999,
      width: 288, borderRadius: 16,
      background: "#fff",
      boxShadow: "0 8px 40px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.12)",
      overflow: "hidden", fontFamily: ff,
      animation: "fadeUp .22s ease",
    }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #006E74 0%, #0097AC 100%)",
        padding: "14px 16px 12px",
        position: "relative",
      }}>
        <button onClick={onSkip} title="Dismiss" style={{
          position: "absolute", top: 10, right: 10,
          width: 22, height: 22, borderRadius: "50%",
          background: "rgba(255,255,255,.2)", border: "none",
          color: "#fff", fontSize: 13, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          lineHeight: 1,
        }}>×</button>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>👋</span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.7)", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 1 }}>AI Advisor</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.25 }}>
              {pmName ? `Hello ${pmName}!` : "Hello!"} Name your advisor.
            </div>
          </div>
        </div>

        <p style={{ color: "rgba(255,255,255,.75)", fontSize: 11, margin: 0, lineHeight: 1.5 }}>
          Your AI copilot reviews every project automatically — always on, never surprised.
        </p>
      </div>

      {/* What I do for you — 2×2 bullet grid */}
      <div style={{ padding: "10px 16px 0", borderBottom: "1px solid #eef0f3" }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: "#9ca3af", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8 }}>
          What I do for you
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, marginBottom: 10 }}>
          {FEATURES.map((f, i) => (
            <div key={f.label} style={{
              display: "flex", gap: 7, alignItems: "flex-start",
              padding: "5px 8px 5px 0",
              borderRight: i % 2 === 0 ? "1px solid #eef0f3" : "none",
              paddingRight: i % 2 === 0 ? 8 : 0,
              paddingLeft: i % 2 === 1 ? 8 : 0,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#0F6E56", flexShrink: 0, marginTop: 5 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1d24", lineHeight: 1.3 }}>{f.label}</div>
                <div style={{ fontSize: 10, color: "#6b7280", lineHeight: 1.35 }}>{f.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Naming */}
      <div style={{ padding: "14px 16px 16px" }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#1a1d24", marginBottom: 8 }}>
          What should I call you? Give me a name.
        </div>

        {/* Chips */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" as const }}>
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => setName(s)}
              style={{
                padding: "3px 12px", borderRadius: 20,
                border: `1.5px solid #0097AC`,
                background: name === s ? "#0097AC" : "transparent",
                color: name === s ? "#fff" : "#0097AC",
                fontSize: 11.5, fontWeight: 600, cursor: "pointer",
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
            width: "100%", padding: "8px 11px", borderRadius: 8, boxSizing: "border-box" as const,
            border: error ? "1.5px solid #cf3f3a" : "1.5px solid #d1d9e0",
            fontSize: 13, outline: "none", fontFamily: ff, color: "#1a1d24",
            marginBottom: error ? 4 : 10, transition: "border-color .15s",
            background: "#fafbfc",
          }}
        />
        {error && <p style={{ fontSize: 11, color: "#cf3f3a", margin: "0 0 8px" }}>{error}</p>}

        {/* CTA */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => handleSubmit()}
            disabled={saving}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 8, border: "none",
              background: saving ? "#9ca3af" : "#006E74",
              color: "#fff", fontWeight: 700, fontSize: 12.5,
              cursor: saving ? "not-allowed" : "pointer", fontFamily: ff,
              transition: "background .15s",
            }}
          >
            {saving ? "Activating…" : `${displayName} →`}
          </button>
          <button
            onClick={onSkip}
            style={{
              padding: "9px 12px", borderRadius: 8,
              border: "1.5px solid #e2e5ea", background: "transparent",
              color: "#6b7280", fontSize: 12, cursor: "pointer", fontFamily: ff,
            }}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
