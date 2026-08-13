"use client";

import { useState } from "react";
import { AlertCircle, CheckSquare } from "lucide-react";

type ActionItem = {
  id: string;
  reference: string;
  title: string;
  priority: string;
  status: string;
  dueDate: string | null;
  project: { id: string; name: string };
  raisedBy: { fullName: string };
};

const TERMINAL = new Set(["closed", "cancelled"]);
const ACTION_ENDPOINT: Record<string, string> = {
  in_progress: "start",
  closed: "close",
  cancelled: "cancel",
};

const STATUS_CHOICES = [
  { value: "in_progress", label: "In Progress", color: "#4338ca", bg: "rgba(67,56,202,.1)"   },
  { value: "closed",      label: "Closed",       color: "#158a5a", bg: "rgba(21,138,90,.1)"  },
  { value: "cancelled",   label: "N/A",           color: "#94a3b8", bg: "#f1f4f8"            },
];

const STATUS_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  open:         { label: "Open",         color: "#c17d12", bg: "rgba(193,125,18,.12)" },
  acknowledged: { label: "Acknowledged", color: "#006E74", bg: "rgba(0,110,116,.1)"  },
  in_progress:  { label: "In Progress",  color: "#4338ca", bg: "rgba(67,56,202,.1)"  },
  blocked:      { label: "Blocked",      color: "#c5392b", bg: "rgba(197,57,43,.1)"  },
  submitted:    { label: "Submitted",    color: "#7c3aed", bg: "rgba(124,58,237,.1)" },
  closed:       { label: "Closed",       color: "#158a5a", bg: "rgba(21,138,90,.1)"  },
  cancelled:    { label: "N/A",          color: "#94a3b8", bg: "#f1f4f8"             },
};

const PRIORITY_DOT:   Record<string, string> = { p1: "#c5392b", p2: "#c17d12", p3: "#94a3b8" };
const PRIORITY_COLOR: Record<string, string> = { p1: "#c5392b", p2: "#c17d12", p3: "#94a3b8" };
const PRIORITY_LABEL: Record<string, string> = { p1: "HIGH",    p2: "MED",     p3: "LOW"     };

function ActionItemRow({ item, now }: { item: ActionItem; now: Date }) {
  const [status, setStatus]   = useState(item.status);
  const [note, setNote]       = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const isOverdue = !!(item.dueDate && new Date(item.dueDate) < now && !TERMINAL.has(status));
  const isDone    = TERMINAL.has(status);

  const sc = STATUS_DISPLAY[status]           ?? STATUS_DISPLAY.open;
  const pd = PRIORITY_DOT[item.priority]     ?? "#94a3b8";
  const pc = PRIORITY_COLOR[item.priority]   ?? "#94a3b8";
  const pl = PRIORITY_LABEL[item.priority]   ?? item.priority.toUpperCase();

  async function updateStatus(toStatus: string) {
    if (toStatus === status || loading) return;
    setLoading(toStatus);
    setError(null);
    try {
      const endpoint = ACTION_ENDPOINT[toStatus];
      const body: Record<string, string> = {};
      if (toStatus === "closed"    && note.trim()) body.closureNote = note.trim();
      if (toStatus === "cancelled")                body.reason = note.trim() || "Not applicable";

      const res = await fetch(`/api/action-items/${item.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Update failed");
      } else {
        setStatus(toStatus);
        setNote("");
        setExpanded(false);
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(null);
    }
  }

  const dueLabel = item.dueDate
    ? new Date(item.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
    : null;

  return (
    <div style={{ borderBottom: "1px solid #f0f2f5" }}>
      {/* Main row */}
      <div
        role="button"
        tabIndex={isDone ? -1 : 0}
        onClick={() => !isDone && setExpanded(e => !e)}
        onKeyDown={e => { if (!isDone && (e.key === "Enter" || e.key === " ")) setExpanded(v => !v); }}
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "12px 18px",
          cursor: isDone ? "default" : "pointer",
          background: isOverdue ? "rgba(254,243,199,.5)" : "transparent",
          transition: "background .1s",
          outline: "none",
        }}
      >
        {/* Left: dot + title + project */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: pd, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
              {isOverdue && <AlertCircle size={12} color="#c5392b" style={{ flexShrink: 0 }} />}
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1d24", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.project.name}
            </div>
          </div>
        </div>

        {/* Right: priority · due date · status · chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: pc, textTransform: "uppercase", letterSpacing: ".06em", minWidth: 26, textAlign: "right" }}>
            {pl}
          </span>
          {dueLabel && (
            <span style={{ fontSize: 11, color: isOverdue ? "#c5392b" : "#94a3b8", fontVariantNumeric: "tabular-nums", minWidth: 60 }}>
              Due {dueLabel}
            </span>
          )}
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: sc.bg, color: sc.color, whiteSpace: "nowrap" }}>
            {sc.label}
          </span>
          {!isDone && (
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none"
              style={{ transition: "transform .15s", transform: expanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
              <path d="M1 1l4 4 4-4" stroke={expanded ? "#006E74" : "#94a3b8"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>

      {/* Expanded controls */}
      {expanded && !isDone && (
        <div style={{ padding: "4px 18px 14px 46px", background: "#fafbfc", borderTop: "1px solid #f5f7f9" }}>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional note for the DM…"
            rows={2}
            style={{
              width: "100%", fontSize: 12, border: "1px solid #e2e5ea", borderRadius: 8,
              padding: "8px 12px", resize: "none", outline: "none",
              fontFamily: "var(--font-inter),'Inter',system-ui,sans-serif",
              marginBottom: 10, boxSizing: "border-box", color: "#1a1d24", background: "#fff",
            }}
          />
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginRight: 2 }}>Update to:</span>
            {STATUS_CHOICES.map(choice => (
              <button
                key={choice.value}
                onClick={() => updateStatus(choice.value)}
                disabled={!!loading}
                style={{
                  fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8,
                  border: `1px solid ${status === choice.value ? choice.color + "50" : "#e2e5ea"}`,
                  cursor: loading ? "not-allowed" : "pointer",
                  background: status === choice.value ? choice.bg : "#fff",
                  color: status === choice.value ? choice.color : "#5b616e",
                  opacity: loading && loading !== choice.value ? 0.5 : 1,
                  fontFamily: "inherit",
                  transition: "all .1s",
                }}
              >
                {loading === choice.value ? "Saving…" : choice.label}
                {status === choice.value && <span style={{ opacity: 0.5, marginLeft: 4, fontSize: 10 }}>✓</span>}
              </button>
            ))}
            {error && <span style={{ fontSize: 11, color: "#c5392b", marginLeft: 4 }}>{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function ActionItemsClient({
  items,
  overdueCount: _overdueCount,
}: {
  items: ActionItem[];
  overdueCount: number;
}) {
  const now = new Date();

  if (items.length === 0) {
    return (
      <div style={{
        background: "#fff", border: "1px solid #DDE3E8", borderRadius: 12,
        padding: "48px 24px", textAlign: "center",
        boxShadow: "0 1px 4px rgba(0,0,0,.04)",
      }}>
        <CheckSquare size={36} color="#DDE3E8" style={{ margin: "0 auto 12px", display: "block" }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: "#6B7E8A", margin: 0 }}>No open action items</p>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>
          Action items assigned to you by the DM will appear here
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: "#fff", border: "1px solid #DDE3E8", borderRadius: 12,
      overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.04)",
    }}>
      {items.map(item => (
        <ActionItemRow key={item.id} item={item} now={now} />
      ))}
    </div>
  );
}
