"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useCopilot } from "./CopilotContext";
import { NamingCeremony } from "./NamingCeremony";
import { useSession } from "next-auth/react";

interface Message { role: "user" | "assistant"; content: string; streaming?: boolean; }
interface ActionCard { id: string; actionType: string; tier: string; payload: any; status: string; }
interface Advisory {
  id: string; ruleId: string; severity: string; class: string; tab: string;
  statement: string; evidenceSummary: string; draftPayload: any; state: string;
}

const C = {
  primary: "#4f5bd5", primaryLight: "#eef0fc",
  teal: "#2dd4bf", petrol: "#003C51", darkTeal: "#006E74", lightTeal: "#0097AC",
  surface: "#fff", surface2: "#f7f8fa",
  border: "#e2e5ea", text: "#1a1d24", text2: "#5b616e", text3: "#8a909c",
  green: "#158a5a", greenLight: "#e6f4ed",
  amber: "#b45309", amberLight: "#fef3c7",
  red: "#cf3f3a", redLight: "#fef2f2",
};

const SEV: Record<string, { bg: string; color: string; label: string }> = {
  s1: { bg: "#fbe4e2", color: "#cf3f3a", label: "Critical" },
  s2: { bg: "#fbf0da", color: "#c17d12", label: "High" },
  s3: { bg: "#eef0fc", color: "#4f5bd5", label: "Medium" },
  s4: { bg: "#f7f8fa", color: "#8a909c", label: "Low" },
};

const ACTION_LABELS: Record<string, string> = {
  LOG_RISK: "Risk Logged", LOG_ISSUE: "Issue Logged", REGEN_ARTIFACT: "Regenerate Artifact",
  CLOSE_TASK: "Task Closed", UPDATE_TASK_PROGRESS: "Task Progress Updated",
  CLOSE_RISK: "Risk Mitigated", CLOSE_ISSUE: "Issue Closed",
  CLOSE_MILESTONE: "Milestone Completed", BULK_CLOSE_TASKS: "Close All Open Tasks",
  UPDATE_PROJECT_STATUS: "Update Project Status",
};
const ACTION_ICONS: Record<string, string> = {
  LOG_RISK: "⚠️", LOG_ISSUE: "🔴", REGEN_ARTIFACT: "🔄", CLOSE_TASK: "✅",
  UPDATE_TASK_PROGRESS: "📊", CLOSE_RISK: "🛡️", CLOSE_ISSUE: "✔️",
  CLOSE_MILESTONE: "🏁", BULK_CLOSE_TASKS: "📋", UPDATE_PROJECT_STATUS: "🚦",
};

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, { bg: string; text: string; label: string }> = {
    a: { bg: "#e0f2fe", text: "#0369a1", label: "Tier A · Read" },
    b: { bg: C.greenLight, text: C.green, label: "Tier B · Auto-write" },
    c: { bg: C.amberLight, text: C.amber, label: "Tier C · Confirm" },
  };
  const s = colors[tier] ?? colors.a;
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: s.bg, color: s.text }}>{s.label}</span>;
}

function ActionCardUI({ action, projectId, onComplete }: { action: ActionCard; projectId?: string; onComplete: (id: string, s: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [undoTimer, setUndoTimer] = useState(30);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (action.tier === "b" && action.status === "auto_executed") {
      timerRef.current = setInterval(() => {
        setUndoTimer(t => { if (t <= 1) { clearInterval(timerRef.current!); return 0; } return t - 1; });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [action.tier, action.status]);

  async function doOp(op: string) {
    setLoading(true);
    if (op === "confirm" && action.actionType === "REGEN_ARTIFACT") {
      window.dispatchEvent(new CustomEvent("copilot:artifact:generating", { detail: { artifactType: action.payload?.artifactType } }));
    }
    const res = await fetch(`/api/copilot/actions/${action.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: op, projectId }),
    });
    const data = res.ok ? await res.json().catch(() => ({})) : {};
    setLoading(false);
    if (op === "confirm" && action.actionType === "REGEN_ARTIFACT") {
      window.dispatchEvent(new CustomEvent("copilot:artifact:generated", { detail: { artifactType: action.payload?.artifactType, artifact: data.artifact ?? null } }));
    }
    if (res.ok) onComplete(action.id, op === "dismiss" ? "dismissed" : op === "undo" ? "undone" : "confirmed");
  }

  const p = action.payload;
  const isDone = ["confirmed", "undone", "dismissed"].includes(action.status);

  return (
    <div style={{ border: `1.5px solid ${action.tier === "c" ? "#fcd34d" : action.tier === "b" ? "#86efac" : C.border}`, borderRadius: 12, background: action.tier === "c" ? "#fffbeb" : action.tier === "b" ? "#f0fdf4" : C.surface2, padding: "12px 14px", fontSize: 12.5, marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>{ACTION_ICONS[action.actionType] ?? "🔄"}</span>
        <span style={{ fontWeight: 700, color: C.text }}>{ACTION_LABELS[action.actionType] || action.actionType}</span>
        <TierBadge tier={action.tier} />
      </div>
      <div style={{ color: C.text2, marginBottom: 10, lineHeight: 1.5 }}>
        {action.actionType === "LOG_RISK" && <><div><b>Risk:</b> {p.riskCode}</div><div>{p.description}</div></>}
        {action.actionType === "LOG_ISSUE" && <><div><b>Issue:</b> {p.title}</div><div><b>Priority:</b> {p.priority}</div></>}
        {action.actionType === "REGEN_ARTIFACT" && <div>Regenerate <b>{p.label}</b>.</div>}
        {action.actionType === "CLOSE_TASK" && <div>Marked <b>{p.taskName}</b> as done.</div>}
        {action.actionType === "UPDATE_TASK_PROGRESS" && <div><b>{p.taskName}</b> → <b>{p.percent}%</b></div>}
        {action.actionType === "CLOSE_RISK" && <div><b>{p.riskCode}</b> → mitigated.</div>}
        {action.actionType === "CLOSE_ISSUE" && <div>Issue <b>{p.title}</b> closed.</div>}
        {action.actionType === "CLOSE_MILESTONE" && <div>Milestone <b>{p.milestoneName}</b> completed.</div>}
        {action.actionType === "BULK_CLOSE_TASKS" && <div>Close <b>{p.count}</b> open task(s).</div>}
        {action.actionType === "UPDATE_PROJECT_STATUS" && <div>Health → <b style={{ color: p.healthStatus === "RED" ? C.red : p.healthStatus === "AMBER" ? C.amber : C.green }}>{p.healthStatus}</b></div>}
      </div>
      {!isDone && (
        <div style={{ display: "flex", gap: 8 }}>
          {action.tier === "c" && <button onClick={() => doOp("confirm")} disabled={loading} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: loading ? C.border : C.primary, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{loading ? "Applying…" : "✓ Confirm"}</button>}
          {action.tier === "b" && undoTimer > 0 && <button onClick={() => doOp("undo")} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.text2, fontSize: 12, cursor: "pointer" }}>↩ Undo ({undoTimer}s)</button>}
          <button onClick={() => doOp("dismiss")} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "transparent", color: C.text3, fontSize: 12, cursor: "pointer" }}>Dismiss</button>
        </div>
      )}
      {isDone && <div style={{ fontSize: 11, color: action.status === "undone" ? C.amber : C.green, fontWeight: 600 }}>{action.status === "confirmed" ? "✓ Applied" : action.status === "undone" ? "↩ Undone" : "Dismissed"}</div>}
    </div>
  );
}

// ── Advisor mode ──────────────────────────────────────────────────────────────

function AdvisorView({ projectId, tab, onBadgeChange }: { projectId: string; tab: string; onBadgeChange?: (n: number) => void }) {
  const [advisories, setAdvisories] = useState<Advisory[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [dismissInput, setDismissInput] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [review, setReview] = useState<any>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const load = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/projects/${projectId}/advisories?tab=${tab}`)
      .then(r => r.json())
      .then(d => {
        setAdvisories(d.advisories ?? []);
        onBadgeChange?.((d.badges ?? {})[tab] ?? 0);
      })
      .finally(() => setLoading(false));
  }, [projectId, tab, onBadgeChange]);

  useEffect(() => { load(); }, [load]);

  async function doAction(advId: string, action: "accept" | "dismiss" | "defer", reason?: string) {
    setActing(advId);
    await fetch(`/api/projects/${projectId}/advisories/${advId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, dismissalReason: reason }),
    });
    setAdvisories(prev => prev.filter(a => a.id !== advId));
    setActing(null); setDismissInput(null); setDismissReason("");
    onBadgeChange?.(Math.max(0, advisories.length - 2));
  }

  async function runReview() {
    setReviewLoading(true); setShowReview(true); setReview(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reviews`, { method: "POST" });
      const d = await res.json();
      setReview(d.review ?? null);
    } catch { setReview(null); }
    finally { setReviewLoading(false); }
  }

  const sevColor: Record<string, string> = { s1: C.red, s2: C.amber, s3: C.primary, s4: C.text3 };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
      {/* Review Brief */}
      <button
        onClick={runReview}
        disabled={reviewLoading}
        style={{
          width: "100%", padding: "9px 0", borderRadius: 9, marginBottom: 14,
          background: C.primaryLight, border: `1px solid #cfd4f5`,
          color: C.primary, fontSize: 12, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          fontFamily: "inherit",
        }}
      >
        {reviewLoading ? "Running review…" : "📋 Run full M1 review brief"}
      </button>

      {/* Review output */}
      {showReview && (
        <div style={{ background: "#f7f8fa", border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
          <div style={{ padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.text2, letterSpacing: ".05em" }}>M1 REVIEW BRIEF</span>
            <button onClick={() => setShowReview(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.text3, fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
          {reviewLoading && <div style={{ padding: "12px", fontSize: 12, color: C.text3 }}>Running advisory sweep…</div>}
          {!reviewLoading && !review && <div style={{ padding: "12px", fontSize: 12, color: C.text3 }}>Could not load review.</div>}
          {!reviewLoading && review && (
            <div style={{ padding: "10px 12px", fontSize: 12 }}>
              {/* Position */}
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 7, marginBottom: 10 }}>
                {[
                  { l: "SPI", v: review.position.spi != null ? review.position.spi.toFixed(2) : "—" },
                  { l: "CPI", v: review.position.cpi != null ? review.position.cpi.toFixed(2) : "—" },
                  { l: "Risks", v: review.position.openRisks },
                  { l: "Issues", v: review.position.openIssues },
                ].map(k => (
                  <div key={k.l} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 10px", textAlign: "center" as const, minWidth: 54 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{k.v}</div>
                    <div style={{ fontSize: 10, color: C.text3 }}>{k.l}</div>
                  </div>
                ))}
              </div>
              {/* Diagnosis */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 4 }}>Diagnosis</div>
                {review.diagnosis.map((d: string, i: number) => (
                  <div key={i} style={{ color: C.text2, lineHeight: 1.5, marginBottom: 3, fontSize: 11.5 }}>· {d}</div>
                ))}
              </div>
              {/* Findings */}
              {review.findings.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 4 }}>Findings ({review.findings.length})</div>
                  {review.findings.map((f: any, i: number) => (
                    <div key={i} style={{ display: "flex", gap: 7, marginBottom: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: sevColor[f.severity] ?? C.text3, minWidth: 18 }}>{f.severity.toUpperCase()}</span>
                      <div style={{ fontSize: 11.5, color: C.text, lineHeight: 1.4 }}>{f.statement}</div>
                    </div>
                  ))}
                </div>
              )}
              {/* Sequence */}
              {review.sequence.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 4 }}>Sequence</div>
                  {review.sequence.map((s: string, i: number) => (
                    <div key={i} style={{ color: C.text2, lineHeight: 1.5, marginBottom: 3, fontSize: 11.5 }}>
                      <span style={{ fontWeight: 700, color: C.primary }}>{i + 1}.</span> {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Advisory cards */}
      {loading && <div style={{ color: C.text3, fontSize: 12, padding: "8px 0" }}>Loading findings…</div>}
      {!loading && advisories.length === 0 && (
        <div style={{ textAlign: "center", padding: "24px 0", color: C.text3, fontSize: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
          No open findings for this tab.
        </div>
      )}
      {advisories.map(adv => {
        const sev = SEV[adv.severity] ?? SEV.s4;
        return (
          <div key={adv.id} style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, marginBottom: 10, overflow: "hidden", background: "#fff" }}>
            <div style={{ background: sev.bg, padding: "6px 11px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: sev.color, textTransform: "uppercase" as const, letterSpacing: ".06em" }}>{sev.label}</span>
              <span style={{ fontSize: 10, color: C.text3, fontFamily: "monospace" }}>{adv.ruleId}</span>
            </div>
            <div style={{ padding: "9px 11px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, lineHeight: 1.4, marginBottom: 4 }}>{adv.statement}</div>
              {adv.evidenceSummary && <div style={{ fontSize: 11.5, color: C.text2, marginBottom: 8, lineHeight: 1.45 }}>{adv.evidenceSummary}</div>}
              {dismissInput === adv.id ? (
                <div>
                  <input
                    value={dismissReason}
                    onChange={e => setDismissReason(e.target.value)}
                    placeholder="Reason (optional)"
                    style={{ width: "100%", fontSize: 12, padding: "5px 8px", border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 6, boxSizing: "border-box" as const, fontFamily: "inherit" }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => doAction(adv.id, "dismiss", dismissReason)} disabled={acting === adv.id} style={{ flex: 1, fontSize: 11, padding: "4px 0", border: "none", borderRadius: 6, background: "#fbe4e2", color: C.red, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>Confirm dismiss</button>
                    <button onClick={() => setDismissInput(null)} style={{ fontSize: 11, padding: "4px 10px", border: `1px solid ${C.border}`, borderRadius: 6, background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                  <button onClick={() => doAction(adv.id, "accept")} disabled={acting === adv.id} style={{ fontSize: 11, padding: "4px 10px", border: "none", borderRadius: 6, background: "#e3f3ea", color: "#158a5a", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>Accept</button>
                  <button onClick={() => doAction(adv.id, "defer")} disabled={acting === adv.id} style={{ fontSize: 11, padding: "4px 10px", border: `1px solid ${C.border}`, borderRadius: 6, background: "#fff", color: C.text2, cursor: "pointer", fontFamily: "inherit" }}>Defer 28d</button>
                  <button onClick={() => setDismissInput(adv.id)} style={{ fontSize: 11, padding: "4px 10px", border: "none", borderRadius: 6, background: "transparent", color: C.text3, cursor: "pointer", fontFamily: "inherit" }}>Dismiss</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function CopilotPanel() {
  const { data: session } = useSession();
  const { tabContext, isOpen, openPanel, closePanel, prefillMessage, clearPrefill } = useCopilot();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [assistantName, setAssistantName] = useState("Advisor");
  const [showNaming, setShowNaming] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [actionCards, setActionCards] = useState<ActionCard[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [quickActions, setQuickActions] = useState<string[]>([]);
  const [showLedger, setShowLedger] = useState(false);
  const [mode, setMode] = useState<"chat" | "advisor">("chat");
  const [advBadge, setAdvBadge] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/copilot/preferences")
      .then(r => r.json())
      .then(d => {
        setEnabled(d.copilotEnabled);
        setAssistantName(d.assistantName || "Advisor");
        if (!d.isNamed && d.copilotEnabled) setShowNaming(true);
      })
      .catch(() => setEnabled(false));
  }, [session]);

  useEffect(() => {
    fetch(`/api/copilot/chat?tab=${tabContext.tab}`)
      .then(r => r.json())
      .then(d => setQuickActions(d.quickActions || []));
  }, [tabContext.tab]);

  const prevProjectIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (tabContext.projectId && tabContext.projectId !== prevProjectIdRef.current) {
      setMessages([]); setActionCards([]); setInput(""); setShowLedger(false);
      prevProjectIdRef.current = tabContext.projectId;
    }
  }, [tabContext.projectId]);

  useEffect(() => {
    if (prefillMessage && isOpen) { setInput(prefillMessage); clearPrefill(); inputRef.current?.focus(); }
  }, [prefillMessage, isOpen, clearPrefill]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); if (isOpen) closePanel(); else openPanel(); }
      if (e.key === "Escape" && isOpen) closePanel();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, openPanel, closePanel]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, actionCards]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    setMessages(prev => [...prev, { role: "assistant", content: "", streaming: true }]);

    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, projectId: tabContext.projectId, tab: tabContext.tab, kpiSnapshot: tabContext.kpiSnapshot, history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })) }),
      });

      if (!res.ok) {
        const err = await res.json();
        setMessages(prev => { const n = [...prev]; n[n.length - 1] = { role: "assistant", content: err.error || "Something went wrong." }; return n; });
        setLoading(false); return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n"); buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = JSON.parse(line.slice(6));
          if (json.chunk) setMessages(prev => { const n = [...prev]; const l = n[n.length - 1]; n[n.length - 1] = { ...l, content: l.content + json.chunk }; return n; });
          if (json.action) setActionCards(prev => [...prev, json.action]);
          if (json.done || json.error) break;
        }
      }
      setMessages(prev => { const n = [...prev]; n[n.length - 1] = { ...n[n.length - 1], streaming: false }; return n; });
    } catch {
      setMessages(prev => { const n = [...prev]; n[n.length - 1] = { role: "assistant", content: "Connection error — please try again." }; return n; });
    } finally { setLoading(false); }
  }, [loading, messages, tabContext]);

  if (!session?.user || enabled === false || enabled === null) return null;

  const ledgerActions = actionCards.filter(a => a.status !== "dismissed");
  const pendingCount = actionCards.filter(a => a.status === "proposed").length;
  const totalBadge = advBadge + pendingCount;

  return (
    <>
      {showNaming && (
        <NamingCeremony
          pmName={(session?.user as any)?.name?.split(" ")[0] || ""}
          onComplete={n => { setAssistantName(n); setShowNaming(false); }}
        />
      )}

      {/* FAB */}
      <button
        onClick={() => isOpen ? closePanel() : openPanel()}
        title={`${assistantName} (Ctrl+K)`}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 1000,
          width: 52, height: 52, borderRadius: "50%", border: "none",
          background: isOpen ? C.petrol : `linear-gradient(135deg, ${C.darkTeal} 0%, ${C.lightTeal} 100%)`,
          color: "#fff", fontSize: 22, cursor: "pointer",
          boxShadow: "0 4px 20px rgba(0,110,116,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s ease",
        }}
      >
        {isOpen ? "✕" : (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <path d="M12 3C9.2 3 7 5.2 7 8s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5Z" stroke="#fff" strokeWidth="1.5"/>
            <path d="M3 21c0-4.4 4-8 9-8s9 3.6 9 8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="17.5" cy="7.5" r="2" fill="#2dd4bf"/>
          </svg>
        )}
        {totalBadge > 0 && !isOpen && (
          <span style={{ position: "absolute", top: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{totalBadge}</span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div style={{
          position: "fixed", bottom: 88, right: 24, zIndex: 999,
          width: 440, maxHeight: "calc(100vh - 120px)",
          background: C.surface, borderRadius: 18,
          boxShadow: "0 8px 48px rgba(0,0,0,0.18)", border: `1px solid ${C.border}`,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "14px 18px 12px", background: C.petrol, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                <path d="M12 3C9.2 3 7 5.2 7 8s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5Z" stroke="#2dd4bf" strokeWidth="1.5"/>
                <path d="M3 21c0-4.4 4-8 9-8s9 3.6 9 8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="17.5" cy="7.5" r="2" fill={C.lightTeal}/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{assistantName} · Senior Reviewer</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                {tabContext.projectName ?? "No project selected"}
                {advBadge > 0 ? ` · ${advBadge} finding${advBadge !== 1 ? "s" : ""}` : ""}
              </div>
            </div>
            {ledgerActions.length > 0 && (
              <button onClick={() => setShowLedger(v => !v)} style={{ padding: "3px 9px", borderRadius: 10, border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                🗂 {ledgerActions.length}
              </button>
            )}
            <button onClick={closePanel} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>

          {/* Mode bar */}
          <div style={{ display: "flex", background: C.surface2, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            {(["chat", "advisor"] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex: 1, padding: "10px 0", border: "none", background: "transparent", cursor: "pointer",
                  fontSize: 12.5, fontWeight: mode === m ? 700 : 400,
                  color: mode === m ? C.primary : C.text3,
                  borderBottom: `2px solid ${mode === m ? C.primary : "transparent"}`,
                  fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  transition: "color .12s",
                }}
              >
                {m === "chat" ? "Chat" : "Advisor"}
                {m === "advisor" && advBadge > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: "#ef4444", color: "#fff", borderRadius: 99, padding: "1px 5px", minWidth: 16, textAlign: "center" }}>{advBadge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Action Ledger */}
          {showLedger && ledgerActions.length > 0 && (
            <div style={{ padding: "10px 14px", background: "#fafafa", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6 }}>ACTION LEDGER — THIS SESSION</div>
              {ledgerActions.map(a => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 12, borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.text }}>{ACTION_ICONS[a.actionType] ?? "🔄"} {ACTION_LABELS[a.actionType] ?? a.actionType}</span>
                  <TierBadge tier={a.tier} />
                </div>
              ))}
            </div>
          )}

          {/* Advisor mode */}
          {mode === "advisor" && tabContext.projectId && (
            <AdvisorView
              projectId={tabContext.projectId}
              tab={tabContext.tab ?? "risk"}
              onBadgeChange={setAdvBadge}
            />
          )}
          {mode === "advisor" && !tabContext.projectId && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.text3, fontSize: 13 }}>
              Open a project to see advisory findings.
            </div>
          )}

          {/* Chat mode */}
          {mode === "chat" && (
            <>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: "center", padding: "20px 16px" }}>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.petrol, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                        <path d="M12 3C9.2 3 7 5.2 7 8s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5Z" stroke="#2dd4bf" strokeWidth="1.5"/>
                        <path d="M3 21c0-4.4 4-8 9-8s9 3.6 9 8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="17.5" cy="7.5" r="2" fill={C.lightTeal}/>
                      </svg>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: "0 0 5px" }}>
                      {assistantName} · Senior Project Reviewer
                    </p>
                    <p style={{ fontSize: 12, color: C.text2, margin: 0, lineHeight: 1.55 }}>
                      Ask me anything — or switch to <b>Advisor</b> to see what I've already found in your project.
                    </p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "88%", padding: "10px 14px",
                        borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        background: msg.role === "user" ? C.petrol : C.surface2,
                        color: msg.role === "user" ? "#fff" : C.text,
                        fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {msg.content}
                        {msg.streaming && <span style={{ display: "inline-block", animation: "pulse 1s infinite" }}>▋</span>}
                      </div>
                    </div>
                    {msg.role === "assistant" && !msg.streaming && i === messages.length - 1 && (
                      actionCards.filter(a => a.status !== "dismissed").map(a => (
                        <ActionCardUI key={a.id} action={a} projectId={tabContext.projectId}
                          onComplete={(id, s) => setActionCards(prev => prev.map(ac => ac.id === id ? { ...ac, status: s } : ac))}
                        />
                      ))
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {messages.length === 0 && quickActions.length > 0 && (
                <div style={{ padding: "0 16px 8px", display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0 }}>
                  {quickActions.map((qa, i) => (
                    <button key={i} onClick={() => sendMessage(qa)} style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${C.primaryLight}`, background: C.primaryLight, color: C.primary, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                      {qa}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ padding: "10px 12px 14px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder={`Ask ${assistantName}… (Enter to send)`}
                  rows={1}
                  style={{ flex: 1, padding: "9px 12px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 13.5, resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5, maxHeight: 100, overflowY: "auto" }}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: !input.trim() || loading ? C.border : C.petrol, color: !input.trim() || loading ? C.text3 : "#fff", cursor: !input.trim() || loading ? "not-allowed" : "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                >↑</button>
              </div>

              <div style={{ padding: "0 16px 10px", fontSize: 10, color: C.text3, textAlign: "center", flexShrink: 0 }}>
                {assistantName} · Tier B auto-executes · Tier C requires confirmation · Ctrl+K
              </div>
            </>
          )}
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </>
  );
}
