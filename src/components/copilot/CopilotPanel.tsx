"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useCopilot } from "./CopilotContext";
import { NamingCeremony } from "./NamingCeremony";
import { useSession } from "next-auth/react";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface ActionCard {
  id: string;
  actionType: string;
  tier: string;
  payload: any;
  status: string;
}

const C = {
  primary: "#4f5bd5",
  primaryLight: "#eef0fc",
  teal: "#2dd4bf",
  surface: "#fff",
  surface2: "#f7f8fa",
  border: "#e2e5ea",
  text: "#1a1d24",
  text2: "#5b616e",
  text3: "#8a909c",
  green: "#158a5a",
  greenLight: "#e6f4ed",
  amber: "#b45309",
  amberLight: "#fef3c7",
  red: "#cf3f3a",
  redLight: "#fef2f2",
};

const ACTION_LABELS: Record<string, string> = {
  LOG_RISK: "Risk Logged",
  LOG_ISSUE: "Issue Logged",
  REGEN_ARTIFACT: "Regenerate Artifact",
  CLOSE_TASK: "Task Closed",
  UPDATE_TASK_PROGRESS: "Task Progress Updated",
  CLOSE_RISK: "Risk Mitigated",
  CLOSE_ISSUE: "Issue Closed",
  CLOSE_MILESTONE: "Milestone Completed",
  BULK_CLOSE_TASKS: "Close All Open Tasks",
  UPDATE_PROJECT_STATUS: "Update Project Status",
};

const ACTION_ICONS: Record<string, string> = {
  LOG_RISK: "⚠️",
  LOG_ISSUE: "🔴",
  REGEN_ARTIFACT: "🔄",
  CLOSE_TASK: "✅",
  UPDATE_TASK_PROGRESS: "📊",
  CLOSE_RISK: "🛡️",
  CLOSE_ISSUE: "✔️",
  CLOSE_MILESTONE: "🏁",
  BULK_CLOSE_TASKS: "📋",
  UPDATE_PROJECT_STATUS: "🚦",
};

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, { bg: string; text: string; label: string }> = {
    a: { bg: "#e0f2fe", text: "#0369a1", label: "Tier A · Read" },
    b: { bg: C.greenLight, text: C.green, label: "Tier B · Auto-write" },
    c: { bg: C.amberLight, text: C.amber, label: "Tier C · Confirm required" },
  };
  const s = colors[tier] ?? colors.a;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

function ActionCardUI({
  action,
  projectId,
  onComplete,
}: {
  action: ActionCard;
  projectId?: string;
  onComplete: (id: string, newStatus: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [undoTimer, setUndoTimer] = useState(30);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tier B: start 30-second undo countdown
  useEffect(() => {
    if (action.tier === "b" && action.status === "auto_executed") {
      timerRef.current = setInterval(() => {
        setUndoTimer((t) => {
          if (t <= 1) { clearInterval(timerRef.current!); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [action.tier, action.status]);

  async function handleConfirm() {
    setLoading(true);
    const artifactType = action.payload?.artifactType as string | undefined;
    // Signal artifact panel to show its spinner
    if (action.actionType === "REGEN_ARTIFACT" && artifactType) {
      window.dispatchEvent(new CustomEvent("copilot:artifact:generating", { detail: { artifactType } }));
    }
    const res = await fetch(`/api/copilot/actions/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "confirm", projectId }),
    });
    const data = res.ok ? await res.json().catch(() => ({})) : {};
    setLoading(false);
    if (res.ok) {
      // Signal artifact panel to update and stop spinner
      if (action.actionType === "REGEN_ARTIFACT" && artifactType) {
        window.dispatchEvent(new CustomEvent("copilot:artifact:generated", { detail: { artifactType, artifact: data.artifact } }));
      }
      onComplete(action.id, "confirmed");
    } else {
      // Stop spinner on error
      if (action.actionType === "REGEN_ARTIFACT" && artifactType) {
        window.dispatchEvent(new CustomEvent("copilot:artifact:generated", { detail: { artifactType, artifact: null } }));
      }
    }
  }

  async function handleUndo() {
    setLoading(true);
    const res = await fetch(`/api/copilot/actions/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "undo", projectId }),
    });
    setLoading(false);
    if (res.ok) onComplete(action.id, "undone");
  }

  async function handleDismiss() {
    await fetch(`/api/copilot/actions/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "dismiss", projectId }),
    });
    onComplete(action.id, "dismissed");
  }

  const p = action.payload;
  const isTierB = action.tier === "b";
  const isTierC = action.tier === "c";
  const isDone = ["confirmed", "undone", "dismissed"].includes(action.status);

  return (
    <div style={{
      border: `1.5px solid ${isTierC ? "#fcd34d" : isTierB ? "#86efac" : C.border}`,
      borderRadius: 12,
      background: isTierC ? "#fffbeb" : isTierB ? "#f0fdf4" : C.surface2,
      padding: "12px 14px",
      fontSize: 12.5,
      marginTop: 4,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>
          {ACTION_ICONS[action.actionType] ?? "🔄"}
        </span>
        <span style={{ fontWeight: 700, color: C.text }}>{ACTION_LABELS[action.actionType] || action.actionType}</span>
        <TierBadge tier={action.tier} />
      </div>

      {/* Payload summary */}
      <div style={{ color: C.text2, marginBottom: 10, lineHeight: 1.5 }}>
        {action.actionType === "LOG_RISK" && (
          <>
            <div><b>Risk ID:</b> {p.riskCode}</div>
            <div><b>Description:</b> {p.description}</div>
            <div><b>Category:</b> {p.category} · <b>Probability:</b> {p.probability} · <b>Impact:</b> {p.impact}</div>
          </>
        )}
        {action.actionType === "LOG_ISSUE" && (
          <>
            <div><b>Issue:</b> {p.title}</div>
            <div><b>Priority:</b> {p.priority}</div>
          </>
        )}
        {action.actionType === "REGEN_ARTIFACT" && (
          <div>Regenerate <b>{p.label}</b> using current project data and AI templates.</div>
        )}
        {action.actionType === "CLOSE_TASK" && (
          <div>Marked <b>{p.taskName}</b> as done (100%).</div>
        )}
        {action.actionType === "UPDATE_TASK_PROGRESS" && (
          <div>Set <b>{p.taskName}</b> to <b>{p.percent}%</b> complete.</div>
        )}
        {action.actionType === "CLOSE_RISK" && (
          <>
            <div><b>{p.riskCode}</b> — {p.description}</div>
            <div>Status changed to <b>mitigated</b>.</div>
          </>
        )}
        {action.actionType === "CLOSE_ISSUE" && (
          <div>Issue <b>{p.title}</b> marked as closed.</div>
        )}
        {action.actionType === "CLOSE_MILESTONE" && (
          <div>Milestone <b>{p.milestoneName}</b> marked as completed.</div>
        )}
        {action.actionType === "BULK_CLOSE_TASKS" && (
          <>
            <div style={{ marginBottom: 6 }}>Close <b>{p.count}</b> open task{p.count !== 1 ? "s" : ""}:</div>
            <div style={{ maxHeight: 100, overflowY: "auto", fontSize: 11.5 }}>
              {(p.tasks as { name: string; status: string }[]).map((t, i) => (
                <div key={i} style={{ padding: "2px 0", borderBottom: `1px solid ${C.border}` }}>
                  · {t.name} <span style={{ color: C.text3 }}>({t.status})</span>
                </div>
              ))}
            </div>
          </>
        )}
        {action.actionType === "UPDATE_PROJECT_STATUS" && (
          <div>Set project health status to <b style={{ color: p.healthStatus === "RED" ? C.red : p.healthStatus === "AMBER" ? C.amber : C.green }}>{p.healthStatus}</b>.</div>
        )}
      </div>

      {/* Actions */}
      {!isDone && (
        <div style={{ display: "flex", gap: 8 }}>
          {isTierC && (
            <button
              onClick={handleConfirm}
              disabled={loading}
              style={{
                padding: "6px 14px", borderRadius: 8, border: "none",
                background: loading ? C.border : C.primary, color: "#fff",
                fontSize: 12, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Generating…" : "✓ Confirm & Apply"}
            </button>
          )}
          {isTierB && undoTimer > 0 && (
            <button
              onClick={handleUndo}
              disabled={loading}
              style={{
                padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
                background: "#fff", color: C.text2,
                fontSize: 12, cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              ↩ Undo ({undoTimer}s)
            </button>
          )}
          <button
            onClick={handleDismiss}
            style={{
              padding: "6px 12px", borderRadius: 8, border: "none",
              background: "transparent", color: C.text3,
              fontSize: 12, cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Done state */}
      {isDone && (
        <div style={{ fontSize: 11, color: action.status === "undone" ? C.amber : C.green, fontWeight: 600 }}>
          {action.status === "confirmed" ? "✓ Applied successfully" :
           action.status === "undone" ? "↩ Undone" : "Dismissed"}
        </div>
      )}
    </div>
  );
}

export function CopilotPanel() {
  const { data: session } = useSession();
  const { tabContext, isOpen, openPanel, closePanel, prefillMessage, clearPrefill } = useCopilot();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [assistantName, setAssistantName] = useState("Copilot");
  const [showNaming, setShowNaming] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [actionCards, setActionCards] = useState<ActionCard[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [quickActions, setQuickActions] = useState<string[]>([]);
  const [showLedger, setShowLedger] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/copilot/preferences")
      .then((r) => r.json())
      .then((d) => {
        setEnabled(d.copilotEnabled);
        setAssistantName(d.assistantName || "Copilot");
        if (!d.isNamed && d.copilotEnabled) setShowNaming(true);
      })
      .catch(() => setEnabled(false));
  }, [session]);

  useEffect(() => {
    fetch(`/api/copilot/chat?tab=${tabContext.tab}`)
      .then((r) => r.json())
      .then((d) => setQuickActions(d.quickActions || []));
  }, [tabContext.tab]);

  // Reset conversation when project changes
  const prevProjectIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (tabContext.projectId && tabContext.projectId !== prevProjectIdRef.current) {
      setMessages([]);
      setActionCards([]);
      setInput("");
      setShowLedger(false);
      prevProjectIdRef.current = tabContext.projectId;
    }
  }, [tabContext.projectId]);

  useEffect(() => {
    if (prefillMessage && isOpen) {
      setInput(prefillMessage);
      clearPrefill();
      inputRef.current?.focus();
    }
  }, [prefillMessage, isOpen, clearPrefill]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) closePanel(); else openPanel();
      }
      if (e.key === "Escape" && isOpen) closePanel();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, openPanel, closePanel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, actionCards]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "", streaming: true }]);

    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          projectId: tabContext.projectId,
          tab: tabContext.tab,
          kpiSnapshot: tabContext.kpiSnapshot,
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: err.error || "Something went wrong." };
          return next;
        });
        setLoading(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = JSON.parse(line.slice(6));
          if (json.chunk) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, content: last.content + json.chunk };
              return next;
            });
          }
          if (json.action) {
            setActionCards((prev) => [...prev, json.action]);
          }
          if (json.done || json.error) break;
        }
      }

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], streaming: false };
        return next;
      });
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: "Connection error — please try again." };
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [loading, messages, tabContext]);

  if (!session?.user || enabled === false || enabled === null) return null;

  const TAB_LABEL: Record<string, string> = {
    schedule: "Schedule", artifacts: "Artifacts", risks: "RAID",
    costs: "Cost", status: "Status", resources: "Resources", default: "Project",
  };

  async function runReview() {
    if (!tabContext.projectId || reviewLoading) return;
    setReviewLoading(true);
    setShowReview(true);
    setReview(null);
    try {
      const res = await fetch(`/api/projects/${tabContext.projectId}/reviews`, { method: "POST" });
      const d = await res.json();
      setReview(d.review ?? null);
    } catch { setReview(null); }
    finally { setReviewLoading(false); }
  }

  const ledgerActions = actionCards.filter((a) => a.status !== "dismissed");
  const pendingCount = actionCards.filter((a) => a.status === "proposed").length;

  return (
    <>
      {showNaming && (
        <NamingCeremony
          pmName={(session?.user as any)?.name?.split(" ")[0] || ""}
          onComplete={(name) => { setAssistantName(name); setShowNaming(false); }}
        />
      )}

      {/* FAB */}
      <button
        onClick={() => isOpen ? closePanel() : openPanel()}
        title={`${assistantName} (Ctrl+K)`}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 1000,
          width: 52, height: 52, borderRadius: "50%", border: "none",
          background: isOpen ? "#003C51" : "linear-gradient(135deg, #006E74 0%, #0097AC 100%)",
          color: "#fff", fontSize: 22, cursor: "pointer",
          boxShadow: "0 4px 20px rgba(0,110,116,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s ease",
        }}
      >
        {isOpen ? "✕" : (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="8" r="3.5" stroke="#fff" strokeWidth="1.5"/>
            <path d="M5 19c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="17.5" cy="7.5" r="2" fill="#2dd4bf"/>
          </svg>
        )}
        {pendingCount > 0 && !isOpen && (
          <span style={{
            position: "absolute", top: -2, right: -2,
            width: 18, height: 18, borderRadius: "50%",
            background: "#ef4444", color: "#fff",
            fontSize: 10, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{pendingCount}</span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div style={{
          position: "fixed", bottom: 88, right: 24, zIndex: 999,
          width: 440, maxHeight: "calc(100vh - 120px)",
          background: C.surface, borderRadius: 18,
          boxShadow: "0 8px 48px rgba(0,0,0,0.18)",
          border: `1px solid ${C.border}`,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px 12px",
            background: "linear-gradient(135deg, #006E74 0%, #0097AC 100%)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="8" r="3.5" stroke="#fff" strokeWidth="1.5"/>
                <path d="M5 19c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="17.5" cy="7.5" r="2" fill="#2dd4bf"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{assistantName}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>
                {tabContext.projectName ?? "No project selected"}
              </div>
            </div>
            {tabContext.projectId && (
              <button
                onClick={runReview}
                disabled={reviewLoading}
                title="Run M1 Review Brief"
                style={{
                  padding: "3px 9px", borderRadius: 10, border: "none",
                  background: showReview ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.2)",
                  color: "#fff", fontSize: 11, cursor: reviewLoading ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {reviewLoading ? "⏳" : "📋 Review"}
              </button>
            )}
            {ledgerActions.length > 0 && (
              <button
                onClick={() => setShowLedger((v) => !v)}
                title="Action Ledger"
                style={{
                  padding: "3px 9px", borderRadius: 10, border: "none",
                  background: "rgba(255,255,255,0.25)", color: "#fff",
                  fontSize: 11, cursor: "pointer", fontWeight: 600,
                }}
              >
                🗂 {ledgerActions.length}
              </button>
            )}
            <button
              onClick={closePanel}
              style={{
                width: 28, height: 28, borderRadius: "50%", border: "none",
                background: "rgba(255,255,255,0.2)", color: "#fff",
                cursor: "pointer", fontSize: 14, display: "flex",
                alignItems: "center", justifyContent: "center",
              }}
            >✕</button>
          </div>

          {/* Action Ledger (collapsible) */}
          {showLedger && ledgerActions.length > 0 && (
            <div style={{ padding: "10px 14px", background: "#fafafa", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6 }}>ACTION LEDGER — THIS SESSION</div>
              {ledgerActions.map((a) => (
                <div key={a.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "4px 0", fontSize: 12, borderBottom: `1px solid ${C.border}`,
                }}>
                  <span style={{ color: C.text }}>
                    {ACTION_ICONS[a.actionType] ?? "🔄"}{" "}
                    {ACTION_LABELS[a.actionType] ?? a.actionType}
                    {a.payload?.riskCode ? ` · ${a.payload.riskCode}` : ""}
                    {a.payload?.taskName ? ` · ${a.payload.taskName}` : ""}
                    {a.payload?.label ? ` · ${a.payload.label}` : ""}
                  </span>
                  <TierBadge tier={a.tier} />
                </div>
              ))}
            </div>
          )}

          {/* Review Brief */}
          {showReview && (
            <div style={{ borderBottom: `1px solid ${C.border}`, background: "#fafbfc", maxHeight: 360, overflowY: "auto" }}>
              <div style={{ padding: "10px 14px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.text2, letterSpacing: ".05em" }}>M1 REVIEW BRIEF</span>
                <button onClick={() => setShowReview(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.text3, fontSize: 14 }}>×</button>
              </div>
              {reviewLoading && <div style={{ padding: "12px 14px", fontSize: 12, color: C.text3 }}>Running advisory sweep…</div>}
              {!reviewLoading && !review && <div style={{ padding: "12px 14px", fontSize: 12, color: C.text3 }}>No project selected.</div>}
              {!reviewLoading && review && (() => {
                const r = review;
                const sevColor: Record<string, string> = { s1: "#cf3f3a", s2: "#c17d12", s3: "#4f5bd5", s4: "#8a909c" };
                return (
                  <div style={{ padding: "6px 14px 14px", fontSize: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Position */}
                    <div>
                      <div style={{ fontWeight: 700, color: C.text, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 5 }}>Position</div>
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                        {[
                          { label: "Phase", value: r.position.phase ?? "—" },
                          { label: "Tasks", value: `${r.position.completedTasks}/${r.position.totalTasks}` },
                          { label: "SPI", value: r.position.spi != null ? r.position.spi.toFixed(2) : "—" },
                          { label: "CPI", value: r.position.cpi != null ? r.position.cpi.toFixed(2) : "—" },
                          { label: "Open Risks", value: r.position.openRisks },
                          { label: "Open Issues", value: r.position.openIssues },
                        ].map(kpi => (
                          <div key={kpi.label} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 10px", minWidth: 72, textAlign: "center" as const }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{kpi.value}</div>
                            <div style={{ fontSize: 10, color: C.text3 }}>{kpi.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Diagnosis */}
                    <div>
                      <div style={{ fontWeight: 700, color: C.text, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 4 }}>Diagnosis</div>
                      {r.diagnosis.map((line: string, i: number) => (
                        <div key={i} style={{ color: C.text2, lineHeight: 1.5, marginBottom: 3 }}>· {line}</div>
                      ))}
                    </div>
                    {/* Findings */}
                    {r.findings.length > 0 && (
                      <div>
                        <div style={{ fontWeight: 700, color: C.text, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 4 }}>
                          Findings ({r.findings.length})
                        </div>
                        {r.findings.map((f: any, i: number) => (
                          <div key={i} style={{ display: "flex", gap: 7, marginBottom: 5, alignItems: "flex-start" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: sevColor[f.severity] ?? C.text3, minWidth: 16, paddingTop: 1 }}>
                              {f.severity.toUpperCase()}
                            </span>
                            <div>
                              <div style={{ color: C.text, fontWeight: 600 }}>{f.statement}</div>
                              {f.evidenceSummary && <div style={{ color: C.text3, fontSize: 11 }}>{f.evidenceSummary}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Sequence */}
                    {r.sequence.length > 0 && (
                      <div>
                        <div style={{ fontWeight: 700, color: C.text, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 4 }}>Sequence</div>
                        {r.sequence.map((s: string, i: number) => (
                          <div key={i} style={{ color: C.text2, lineHeight: 1.5, marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, color: C.primary }}>{i + 1}.</span> {s}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Watch */}
                    {r.watch?.length > 0 && (
                      <div>
                        <div style={{ fontWeight: 700, color: C.amber, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 4 }}>Watch</div>
                        {r.watch.map((s: string, i: number) => (
                          <div key={i} style={{ color: C.text2, lineHeight: 1.5, marginBottom: 3 }}>⚠ {s}</div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: C.text3 }}>Generated {new Date(r.generatedAt).toLocaleString()}</div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "16px 16px 8px",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px 16px" }}>
                <div style={{
                  width: 52, height: 52, borderRadius: "50%",
                  background: "#1a1d24",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 12px",
                }}>
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="8" r="3.5" stroke="#fff" strokeWidth="1.5"/>
                    <path d="M5 19c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="17.5" cy="7.5" r="2" fill="#2dd4bf"/>
                  </svg>
                </div>
                <p style={{ fontSize: 13, color: C.text2, margin: 0 }}>
                  Hi! I'm {assistantName}. I can close tasks, update progress, mitigate risks, log issues, and regenerate your project decks.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "88%",
                    padding: "10px 14px",
                    borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    background: msg.role === "user" ? C.primary : C.surface2,
                    color: msg.role === "user" ? "#fff" : C.text,
                    fontSize: 13.5, lineHeight: 1.55,
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {msg.content}
                    {msg.streaming && <span style={{ display: "inline-block", animation: "pulse 1s infinite" }}>▋</span>}
                  </div>
                </div>

                {/* Show action cards after the last assistant message */}
                {msg.role === "assistant" && !msg.streaming && i === messages.length - 1 && (
                  actionCards.filter((a) => a.status !== "dismissed").map((a) => (
                    <ActionCardUI
                      key={a.id}
                      action={a}
                      projectId={tabContext.projectId}
                      onComplete={(id, newStatus) =>
                        setActionCards((prev) => prev.map((ac) => ac.id === id ? { ...ac, status: newStatus } : ac))
                      }
                    />
                  ))
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {messages.length === 0 && quickActions.length > 0 && (
            <div style={{ padding: "0 16px 8px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {quickActions.map((qa, i) => (
                <button key={i} onClick={() => sendMessage(qa)} style={{
                  padding: "5px 12px", borderRadius: 20,
                  border: `1px solid ${C.primaryLight}`,
                  background: C.primaryLight, color: C.primary,
                  fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                }}>
                  {qa}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: "10px 12px 14px",
            borderTop: `1px solid ${C.border}`,
            display: "flex", gap: 8, alignItems: "flex-end",
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder={`Ask ${assistantName}… (Enter to send)`}
              rows={1}
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 12,
                border: `1.5px solid ${C.border}`, fontSize: 13.5,
                resize: "none", outline: "none", fontFamily: "inherit",
                lineHeight: 1.5, maxHeight: 100, overflowY: "auto",
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              style={{
                width: 36, height: 36, borderRadius: 10, border: "none",
                background: !input.trim() || loading ? C.border : C.primary,
                color: !input.trim() || loading ? C.text3 : "#fff",
                cursor: !input.trim() || loading ? "not-allowed" : "pointer",
                fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
            >↑</button>
          </div>

          {/* Footer */}
          <div style={{ padding: "0 16px 10px", fontSize: 10, color: C.text3, textAlign: "center" }}>
            {assistantName} · Tier B writes auto-execute · Tier C requires confirmation · Ctrl+K to toggle
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </>
  );
}
