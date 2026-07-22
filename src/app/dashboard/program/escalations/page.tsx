"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

interface Escalation {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium";
  status: string;
  targetType: string;
  situation: string;
  createdAt: string;
  slaDueAt: string | null;
  slaBreachedAt: string | null;
  raisedBy: { fullName: string };
  project: { id: string; name: string; program?: { name: string } | null } | null;
  risk: { id: string; description: string } | null;
  comments: { id: string; body: string; createdAt: string; user: { fullName: string } }[];
}

const SC: Record<string, { bg: string; text: string; label: string }> = {
  open:         { bg: "#fbe4e2", text: "#cf3f3a", label: "Open" },
  acknowledged: { bg: "#fbf0da", text: "#c17d12", label: "Acknowledged" },
  in_progress:  { bg: "#e3f3ea", text: "#158a5a", label: "In Progress" },
  resolved:     { bg: "#e3f3ea", text: "#158a5a", label: "Resolved" },
  withdrawn:    { bg: "#f7f8fa", text: "#8a909c", label: "Withdrawn" },
};
const SEV: Record<string, string> = { critical: "#cf3f3a", high: "#c17d12", medium: "#158a5a" };
const T = {
  bg: "#F2F7F8", border: "#D7E0E3", petrol: "#003C51", teal: "#006E74",
  text: "#231F20", muted: "#7A7480", card: "#fff",
};

function age(d: string) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return days === 0 ? "Today" : `${days}d ago`;
}

export default function EscalationsPage() {
  const { data: session } = useSession();
  const user = (session?.user as any) ?? {};
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  async function load() {
    const res = await fetch("/api/escalations?raised_by=me");
    const d = await res.json();
    setEscalations(d.escalations ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const shown = filter === "all" ? escalations : escalations.filter(e => e.status === filter);
  const open = escalations.find(e => e.id === openId);

  async function addComment() {
    if (!openId || comment.trim().length < 2) return;
    setCommenting(true);
    await fetch(`/api/escalations/${openId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: comment.trim() }),
    });
    setComment("");
    await load();
    setCommenting(false);
  }

  async function transition(status: string, extra: Record<string, string> = {}) {
    if (!openId) return;
    const body: Record<string, string> = { status, ...extra };
    if (status === "withdrawn") {
      const reason = prompt("Reason for withdrawal (required):");
      if (!reason) return;
      body.withdrawalReason = reason;
    }
    if (status === "resolved") {
      const note = prompt("Resolution note (minimum 20 chars):");
      if (!note || note.length < 20) { alert("Note must be at least 20 characters"); return; }
      body.resolutionNote = note;
    }
    setTransitioning(true);
    await fetch(`/api/escalations/${openId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
    setTransitioning(false);
  }

  if (!session) return null;

  return (
    <div style={{ height: "100%", overflowY: "auto", background: T.bg, fontFamily: "'Aptos','Calibri',sans-serif" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px 48px" }}>

          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <Link href="/dashboard/program" style={{ fontSize: 12, color: T.teal, textDecoration: "none" }}>← Dashboard</Link>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.petrol, marginTop: 6 }}>My Escalations</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{escalations.length} total · {escalations.filter(e => e.status === "open").length} open</div>
          </div>

          {/* Status filter */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {["all","open","acknowledged","in_progress","resolved","withdrawn"].map(s => (
              <button key={s} onClick={() => setFilter(s)} style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${filter === s ? T.teal : T.border}`,
                background: filter === s ? T.teal : T.card,
                color: filter === s ? "#fff" : T.text,
              }}>{s === "all" ? "All" : SC[s]?.label ?? s}</button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: openId ? "1fr 380px" : "1fr", gap: 20 }}>
            {/* List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {loading ? (
                <div style={{ color: T.muted, fontSize: 13, padding: 20 }}>Loading…</div>
              ) : shown.length === 0 ? (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 40, textAlign: "center", color: T.muted, fontSize: 13 }}>
                  No escalations {filter !== "all" ? `with status "${SC[filter]?.label}"` : "yet"}.<br />
                  Raise one from the dashboard watchlist or a project's Team tab.
                </div>
              ) : shown.map(e => {
                const breached = e.slaBreachedAt && e.status === "open";
                return (
                  <div
                    key={e.id}
                    onClick={() => setOpenId(e.id === openId ? null : e.id)}
                    style={{
                      background: T.card, border: `1.5px solid ${openId === e.id ? T.teal : T.border}`,
                      borderLeft: `4px solid ${SEV[e.severity] ?? T.muted}`,
                      borderRadius: 12, padding: "16px 20px", cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.petrol, flex: 1, marginRight: 12 }}>{e.title}</div>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: SC[e.status]?.text, background: SC[e.status]?.bg, padding: "2px 10px", borderRadius: 99, whiteSpace: "nowrap" }}>
                        {SC[e.status]?.label}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 14, fontSize: 12, color: T.muted, flexWrap: "wrap" }}>
                      <span style={{ color: SEV[e.severity], fontWeight: 700, textTransform: "capitalize" }}>{e.severity}</span>
                      <span>{e.project?.name ?? "—"}</span>
                      <span>{age(e.createdAt)}</span>
                      {breached && <span style={{ color: "#cf3f3a", fontWeight: 700 }}>⚠ SLA breached</span>}
                      {e.comments.length > 0 && <span>{e.comments.length} comment{e.comments.length !== 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detail panel */}
            {open && (
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px", height: "fit-content", position: "sticky", top: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.petrol }}>{open.title}</div>
                  <button onClick={() => setOpenId(null)} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
                </div>

                {[
                  { label: "Severity", value: open.severity, color: SEV[open.severity] },
                  { label: "Status",   value: SC[open.status]?.label ?? open.status },
                  { label: "Project",  value: open.project?.name ?? "—" },
                  { label: "Program",  value: open.project?.program?.name ?? "—" },
                  { label: "Raised",   value: age(open.createdAt) },
                  { label: "SLA due",  value: open.slaDueAt ? new Date(open.slaDueAt).toLocaleDateString() : "—" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12.5 }}>
                    <span style={{ color: T.muted }}>{label}</span>
                    <span style={{ fontWeight: 600, color: color ?? T.text, textTransform: "capitalize" }}>{value}</span>
                  </div>
                ))}

                {open.situation && (
                  <div style={{ marginTop: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: .4, marginBottom: 5 }}>Situation</div>
                    <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.5 }}>{open.situation}</div>
                  </div>
                )}

                {/* Lifecycle actions */}
                {open.status === "open" && user.id === open.raisedBy.fullName && (
                  <button onClick={() => transition("withdrawn")} disabled={transitioning} style={{
                    width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.muted, fontSize: 12.5, cursor: "pointer", marginBottom: 12,
                  }}>Withdraw escalation</button>
                )}
                {["dh","admin"].includes(user.role) && open.status === "open" && (
                  <button onClick={() => transition("acknowledged")} disabled={transitioning} style={{
                    width: "100%", padding: "8px", borderRadius: 8, border: `1px solid #c17d12`, background: "#fbf0da", color: "#c17d12", fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginBottom: 12,
                  }}>Acknowledge</button>
                )}
                {["dh","admin"].includes(user.role) && open.status === "acknowledged" && (
                  <button onClick={() => transition("resolved")} disabled={transitioning} style={{
                    width: "100%", padding: "8px", borderRadius: 8, border: `1px solid #158a5a`, background: "#e3f3ea", color: "#158a5a", fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginBottom: 12,
                  }}>Mark Resolved</button>
                )}

                {/* Comments */}
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginTop: 4 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: .4 }}>
                    Comments ({open.comments.length})
                  </div>
                  {open.comments.map(c => (
                    <div key={c.id} style={{ marginBottom: 10, padding: "8px 10px", background: T.bg, borderRadius: 8 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.petrol, marginBottom: 2 }}>{c.user.fullName}</div>
                      <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.5 }}>{c.body}</div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{age(c.createdAt)}</div>
                    </div>
                  ))}
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Add a comment…"
                    rows={2}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12.5, resize: "vertical", boxSizing: "border-box", marginTop: 8 }}
                  />
                  <button onClick={addComment} disabled={commenting || comment.trim().length < 2} style={{
                    marginTop: 6, width: "100%", padding: "7px", borderRadius: 8, border: "none", background: T.teal, color: "#fff",
                    fontSize: 12.5, fontWeight: 700, cursor: "pointer", opacity: comment.trim().length < 2 ? .5 : 1,
                  }}>
                    {commenting ? "Adding…" : "Add Comment"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
