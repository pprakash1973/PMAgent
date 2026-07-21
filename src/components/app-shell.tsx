"use client";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

const CAN_PORTFOLIO = ["dm", "dh", "admin"];
const CAN_EXECUTIVE = ["dh", "admin"];

// UST brand tokens
const UST_PETROL    = "#003C51";
const UST_TEAL      = "#006E74";
const UST_TEAL_L    = "#0097AC";
const UST_WASH      = "#F2F7F8";
const UST_SOFT_BLK  = "#231F20";
const UST_BORDER    = "#D7E0E3";

function initialsOf(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function LeftRail({ role, userName }: { role: string; userName: string }) {
  const path = usePathname();
  const isWorkspace = path.includes("/projects/") && !path.includes("/new");
  const isPortfolio = path.includes("/portfolio");
  const isExec = path.includes("/executive");
  const showPortfolio = CAN_PORTFOLIO.includes(role);
  const showExecutive = CAN_EXECUTIVE.includes(role);

  function railBtn(active: boolean, href: string, icon: React.ReactNode, label: string) {
    return (
      <Link href={href} style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 6, width: 56, height: 56, borderRadius: 14, cursor: "pointer",
        fontFamily: "'Aptos','Calibri',sans-serif", fontSize: "9.5px", fontWeight: 600,
        background: active ? "rgba(255,255,255,0.15)" : "transparent",
        color: active ? "#ffffff" : "rgba(255,255,255,0.55)",
        textDecoration: "none", border: "none", transition: "background .15s,color .15s",
      }}>
        {icon}
        {label}
      </Link>
    );
  }

  return (
    <div style={{
      width: 78, background: UST_PETROL, display: "flex", flexDirection: "column",
      alignItems: "center", padding: "16px 0", gap: 8, flexShrink: 0,
    }}>
      {/* UST Logo mark */}
      <div style={{
        width: 38, height: 38, borderRadius: 11,
        background: UST_TEAL,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 14, boxShadow: "0 3px 10px rgba(0,110,116,.45)",
      }}>
        <svg width="22" height="14" viewBox="0 0 44 28" fill="none">
          {/* UST wordmark simplified */}
          <text x="0" y="20" fontFamily="'Aptos','Calibri',sans-serif" fontWeight="700" fontSize="18" fill="#fff">UST</text>
        </svg>
      </div>

      {role !== "dh" && railBtn(isWorkspace || (!isPortfolio && !isExec), "/dashboard/projects",
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/></svg>,
        "Projects"
      )}
      {role !== "dh" && showPortfolio && railBtn(isPortfolio, "/dashboard/portfolio",
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 13h5v8H3zM10 8h5v13h-5zM17 3h4v18h-4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>,
        "Portfolio"
      )}
      {showExecutive && railBtn(isExec, "/dashboard/executive",
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16M8 15l3.5-4 3 2.5L20 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
        "Executive"
      )}

      <div style={{ flex: 1 }} />

      {/* Sign out */}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        title="Sign out"
        aria-label="Sign out"
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 5, width: 56, height: 52, borderRadius: 14, cursor: "pointer",
          background: "transparent", border: "none", color: "rgba(255,255,255,0.55)",
          fontFamily: "'Aptos','Calibri',sans-serif", fontSize: "9.5px", fontWeight: 600,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#fff"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 17l5-5-5-5M20 12H9M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Sign out
      </button>

      {/* User avatar */}
      <div
        title={userName}
        style={{
          width: 34, height: 34, borderRadius: "50%", background: UST_TEAL_L,
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          font: "600 12px 'Aptos','Calibri',sans-serif", marginTop: 6, marginBottom: 2,
        }}
      >{initialsOf(userName)}</div>
    </div>
  );
}

function TopBar({ children, role }: { children?: React.ReactNode; role?: string }) {
  const router = useRouter();
  return (
    <div style={{
      height: 60, flexShrink: 0, background: "#fff", borderBottom: `1px solid ${UST_BORDER}`,
      display: "flex", alignItems: "center", padding: "0 22px", gap: 16,
    }}>
      {children}
      <div style={{ flex: 1 }} />
      <div style={{
        display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px",
        background: UST_WASH, border: `1px solid ${UST_BORDER}`, borderRadius: 9, width: 220, color: "#7A7480",
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        <span style={{ fontSize: "12.5px" }}>Search or ask…</span>
      </div>
      {role !== "dh" && (
        <button
          onClick={() => router.push("/dashboard/projects/new")}
          style={{
            height: 36, padding: "0 15px", background: UST_TEAL, color: "#fff", border: "none",
            borderRadius: 9, font: "600 12.5px 'Aptos','Calibri',sans-serif", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 7, boxShadow: "0 2px 6px rgba(0,110,116,.3)",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
          New Project
        </button>
      )}
    </div>
  );
}

type AskTurn = { question: string; answer: string; loading: boolean };

const PORTFOLIO_SUGGESTIONS: Record<string, string[]> = {
  pm: ["Summarize the top risks across my projects", "Which of my projects need attention this week?", "Draft a status update email to my sponsor"],
  delivery_manager: ["Which projects are trending red and why?", "Where are we over budget across the portfolio?", "Summarize open risks needing escalation"],
  delivery_head: ["Give me the portfolio health summary in 3 bullets", "What decisions need my sign-off this week?", "Which projects are the biggest cost risk?"],
  admin: ["Give me a portfolio-wide health and budget summary", "Which projects have the most open risks?", "Summarize this week's biggest delivery concerns"],
};

function DockedAIBar({ role }: { role: string }) {
  const [value, setValue] = useState("");
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [open, setOpen] = useState(false);

  async function ask(question: string) {
    if (!question.trim()) return;
    setValue("");
    setOpen(true);
    setTurns((t) => [...t, { question, answer: "", loading: true }]);
    try {
      const res = await fetch("/api/chat/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setTurns((t) => {
        const next = [...t];
        next[next.length - 1] = { question, answer: data.response || "Sorry, I couldn't process that.", loading: false };
        return next;
      });
    } catch {
      setTurns((t) => {
        const next = [...t];
        next[next.length - 1] = { question, answer: "Something went wrong. Please try again.", loading: false };
        return next;
      });
    }
  }

  const suggestions = PORTFOLIO_SUGGESTIONS[role] ?? PORTFOLIO_SUGGESTIONS.pm;

  return (
    <div style={{ flexShrink: 0, background: "#fff", borderTop: `1px solid ${UST_BORDER}` }}>
      {open && (
        <div style={{ maxHeight: 320, overflowY: "auto", padding: "14px 22px", borderBottom: `1px solid ${UST_BORDER}`, background: UST_WASH }}>
          {turns.map((t, i) => (
            <div key={i} style={{ marginBottom: i === turns.length - 1 ? 0 : 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#fff", background: UST_TEAL_L, borderRadius: 6,
                  padding: "2px 6px", flexShrink: 0, marginTop: 2,
                }}>YOU</span>
                <span style={{ fontSize: 13, color: UST_SOFT_BLK, fontWeight: 600 }}>{t.question}</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#fff", background: UST_TEAL, borderRadius: 6,
                  padding: "2px 6px", flexShrink: 0, marginTop: 2,
                }}>AI</span>
                {t.loading ? (
                  <span style={{ fontSize: 13, color: "#7A7480", fontStyle: "italic" as const }}>Analyzing portfolio data…</span>
                ) : (
                  <span style={{ fontSize: 13, color: UST_SOFT_BLK, lineHeight: 1.55, whiteSpace: "pre-wrap" as const }}>{t.answer}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: "11px 22px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: 10, height: 42,
          padding: "0 15px", background: UST_WASH, border: `1.5px solid ${UST_TEAL}30`,
          borderRadius: 12,
        }}>
          <span style={{ color: UST_TEAL, fontSize: 16 }}>✦</span>
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && value.trim()) ask(value); }}
            placeholder='Ask PM Agent anything about your portfolio — "which projects are at risk?", "draft a status email"…'
            style={{
              flex: 1, border: "none", background: "transparent", outline: "none",
              fontSize: 13, color: UST_SOFT_BLK, fontFamily: "'Aptos','Calibri',sans-serif",
            }}
          />
          <span
            onClick={() => value.trim() && ask(value)}
            style={{
              fontSize: 11, color: "#7A7480", border: `1px solid ${UST_BORDER}`,
              borderRadius: 6, padding: "2px 7px", fontFamily: "'Aptos Mono','Consolas',monospace",
              cursor: "pointer",
            }}
          >⏎</span>
        </div>
        {turns.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {suggestions.slice(0, 2).map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                style={{
                  fontSize: 11, color: UST_TEAL, background: `${UST_TEAL}12`, border: "none",
                  borderRadius: 999, padding: "6px 11px", cursor: "pointer", fontWeight: 600,
                  fontFamily: "'Aptos','Calibri',sans-serif", whiteSpace: "nowrap" as const,
                }}
              >{s}</button>
            ))}
          </div>
        ) : (
          <button
            onClick={() => setOpen((o) => !o)}
            style={{
              fontSize: 11, color: "#7A7480", background: "transparent", border: `1px solid ${UST_BORDER}`,
              borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontWeight: 600, flexShrink: 0,
            }}
          >{open ? "Hide" : "Show"} ({turns.length})</button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "11.5px", color: "#7A7480", flexShrink: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#01B27C", display: "inline-block" }} />
          AI Agent active
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  children,
  topBarContent,
  role,
  userName,
}: {
  children: React.ReactNode;
  topBarContent?: React.ReactNode;
  role: string;
  userName: string;
}) {
  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden" }}>
      <LeftRail role={role} userName={userName} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar role={role}>{topBarContent}</TopBar>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {children}
        </div>
        <DockedAIBar role={role} />
      </div>
    </div>
  );
}
