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
  red: "#cf3f3a",
};

export function CopilotPanel() {
  const { data: session } = useSession();
  const { tabContext, isOpen, openPanel, closePanel, prefillMessage, clearPrefill } = useCopilot();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [assistantName, setAssistantName] = useState("Copilot");
  const [showNaming, setShowNaming] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [quickActions, setQuickActions] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load preferences on mount
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

  // Load quick actions when tab changes
  useEffect(() => {
    fetch(`/api/copilot/chat?tab=${tabContext.tab}`)
      .then((r) => r.json())
      .then((d) => setQuickActions(d.quickActions || []));
  }, [tabContext.tab]);

  // Handle prefill message
  useEffect(() => {
    if (prefillMessage && isOpen) {
      setInput(prefillMessage);
      clearPrefill();
      inputRef.current?.focus();
    }
  }, [prefillMessage, isOpen, clearPrefill]);

  // Keyboard shortcut
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
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    const assistantIdx = messages.length + 1;
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

  if (!session?.user || enabled === false) return null;
  if (enabled === null) return null; // loading preferences

  const TAB_LABEL: Record<string, string> = {
    schedule: "Schedule", artifacts: "Artifacts", risks: "RAID",
    costs: "Cost", status: "Status", resources: "Resources", default: "Project",
  };

  return (
    <>
      {showNaming && (
        <NamingCeremony
          onComplete={(name) => {
            setAssistantName(name);
            setShowNaming(false);
          }}
        />
      )}

      {/* Floating Action Button */}
      <button
        onClick={() => isOpen ? closePanel() : openPanel()}
        title={`${assistantName} (Ctrl+K)`}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 1000,
          width: 52, height: 52, borderRadius: "50%", border: "none",
          background: isOpen
            ? "#1a1d24"
            : "linear-gradient(135deg, #4f5bd5 0%, #2dd4bf 100%)",
          color: "#fff", fontSize: 22, cursor: "pointer",
          boxShadow: "0 4px 20px rgba(79,91,213,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s ease",
        }}
      >
        {isOpen ? "✕" : "🤖"}
      </button>

      {/* Panel */}
      {isOpen && (
        <div style={{
          position: "fixed", bottom: 88, right: 24, zIndex: 999,
          width: 420, maxHeight: "calc(100vh - 120px)",
          background: C.surface, borderRadius: 18,
          boxShadow: "0 8px 48px rgba(0,0,0,0.18)",
          border: `1px solid ${C.border}`,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px 12px",
            background: "linear-gradient(135deg, #4f5bd5 0%, #2dd4bf 100%)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            }}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{assistantName}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>
                {TAB_LABEL[tabContext.tab] ?? "Project"} · AI Read-only Mode
                {tabContext.projectName && ` · ${tabContext.projectName}`}
              </div>
            </div>
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

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "16px 16px 8px",
            display: "flex", flexDirection: "column", gap: 12,
          }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px 16px" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
                <p style={{ fontSize: 13, color: C.text2, margin: 0 }}>
                  Hi! I'm {assistantName}. Ask me anything about this project.
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  maxWidth: "85%",
                  padding: "10px 14px",
                  borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background: msg.role === "user" ? C.primary : C.surface2,
                  color: msg.role === "user" ? "#fff" : C.text,
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {msg.content}
                  {msg.streaming && (
                    <span style={{ display: "inline-block", animation: "pulse 1s infinite" }}>▋</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {messages.length === 0 && quickActions.length > 0 && (
            <div style={{ padding: "0 16px 8px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {quickActions.map((qa, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(qa)}
                  style={{
                    padding: "5px 12px", borderRadius: 20,
                    border: `1px solid ${C.primaryLight}`,
                    background: C.primaryLight,
                    color: C.primary, fontSize: 12, cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
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
            >
              ↑
            </button>
          </div>

          {/* Footer */}
          <div style={{
            padding: "0 16px 10px",
            fontSize: 10, color: C.text3, textAlign: "center",
          }}>
            {assistantName} · Read-only analysis · Ctrl+K to toggle
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </>
  );
}
