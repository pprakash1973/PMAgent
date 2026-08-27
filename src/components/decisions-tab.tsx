"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Plus, Download, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "@/components/ui/toaster";

const STATUS_CHIP: Record<string, { label: string; color: string; bg: string }> = {
  open:       { label: "Open",       color: "#d97706", bg: "rgba(217,119,6,.12)" },
  agreed:     { label: "Agreed",     color: "#16a34a", bg: "rgba(22,163,74,.12)" },
  superseded: { label: "Superseded", color: "#6b7280", bg: "rgba(107,114,128,.10)" },
};

const CATEGORIES = ["Architecture", "Scope", "Process", "Tooling", "Team", "Other"];
const WATERFALL_LINKED_TYPES = [
  { value: "milestone", label: "Milestone" },
  { value: "cr",        label: "Change Request" },
];

function StatusChip({ status }: { status: string }) {
  const s = STATUS_CHIP[status] ?? STATUS_CHIP.open;
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 10,
      fontSize: 11, fontWeight: 700, color: s.color, background: s.bg,
    }}>{s.label}</span>
  );
}

function isOverdue(date?: string | null) {
  if (!date) return false;
  return new Date(date) < new Date();
}

interface DecisionFormData {
  title: string;
  rationale: string;
  madeBy: string;
  madeAt: string;
  reviewAt: string;
  linkedRef: string;
  linkedType: string;
  sprintId: string;
  sprintLabel: string;
  category: string;
}

const EMPTY_FORM: DecisionFormData = {
  title: "", rationale: "", madeBy: "",
  madeAt: new Date().toISOString().slice(0, 10),
  reviewAt: "", linkedRef: "", linkedType: "",
  sprintId: "", sprintLabel: "", category: "Scope",
};

interface Props {
  project: any;
}

export function DecisionsTab({ project }: Props) {
  const isAgile = project.deliveryMethod === "agile_scrum" || project.methodology === "agile_scrum";

  const [decisions, setDecisions] = useState<any[]>([]);
  const [sprints, setSprints] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "agreed" | "superseded">("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DecisionFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, sRes, mRes] = await Promise.all([
        fetch(`/api/projects/${project.id}/decisions`),
        isAgile ? fetch(`/api/projects/${project.id}/sprints`) : Promise.resolve(null),
        !isAgile ? fetch(`/api/projects/${project.id}/milestones`) : Promise.resolve(null),
      ]);
      if (dRes.ok) setDecisions(await dRes.json());
      if (sRes?.ok) setSprints(await sRes.json());
      if (mRes?.ok) setMilestones(await mRes.json());
    } finally {
      setLoading(false);
    }
  }, [project.id, isAgile]);

  useEffect(() => { load(); }, [load]);

  const filtered = decisions.filter(d => filter === "all" || d.status === filter);

  const counts = {
    open:       decisions.filter(d => d.status === "open").length,
    agreed:     decisions.filter(d => d.status === "agreed").length,
    superseded: decisions.filter(d => d.status === "superseded").length,
  };

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const url = editingId
        ? `/api/projects/${project.id}/decisions/${editingId}`
        : `/api/projects/${project.id}/decisions`;
      const method = editingId ? "PATCH" : "POST";
      const payload: any = { ...form };
      if (!isAgile) { delete payload.sprintId; delete payload.sprintLabel; delete payload.category; }
      else { delete payload.linkedRef; delete payload.linkedType; }
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        setShowForm(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
        await load();
        toast({ title: editingId ? "Decision updated" : "Decision recorded" });
      } else {
        toast({ title: "Failed to save", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickStatus(id: string, status: string) {
    const res = await fetch(`/api/projects/${project.id}/decisions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) { await load(); toast({ title: `Decision marked ${status}` }); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this decision?")) return;
    await fetch(`/api/projects/${project.id}/decisions/${id}`, { method: "DELETE" });
    await load();
    toast({ title: "Decision deleted" });
  }

  function openEdit(d: any) {
    setForm({
      title: d.title ?? "",
      rationale: d.rationale ?? "",
      madeBy: d.madeBy ?? "",
      madeAt: d.madeAt ? new Date(d.madeAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      reviewAt: d.reviewAt ? new Date(d.reviewAt).toISOString().slice(0, 10) : "",
      linkedRef: d.linkedRef ?? "",
      linkedType: d.linkedType ?? "",
      sprintId: d.sprintId ?? "",
      sprintLabel: d.sprintLabel ?? "",
      category: d.category ?? "Scope",
    });
    setEditingId(d.id);
    setShowForm(true);
  }

  function handleSprintSelect(sprintId: string) {
    const s = sprints.find((x: any) => x.id === sprintId);
    setForm(f => ({ ...f, sprintId, sprintLabel: s ? `Sprint ${s.number ?? s.name}` : sprintId }));
  }

  // ── Agile: group decisions by sprint ──────────────────────────────────────────
  function groupBySprintForDisplay() {
    const sprintMap: Record<string, { label: string; state: string; items: any[] }> = {};
    const noSprint: any[] = [];
    for (const d of filtered) {
      if (d.sprintId && d.sprintLabel) {
        if (!sprintMap[d.sprintId]) {
          const sp = sprints.find((s: any) => s.id === d.sprintId);
          sprintMap[d.sprintId] = { label: d.sprintLabel, state: sp?.state ?? "closed", items: [] };
        }
        sprintMap[d.sprintId].items.push(d);
      } else {
        noSprint.push(d);
      }
    }
    const ordered = Object.entries(sprintMap).sort(([, a], [, b]) => {
      const rank = (s: string) => s === "active" ? 0 : s === "planned" ? 1 : 2;
      return rank(a.state) - rank(b.state);
    });
    return { ordered, noSprint };
  }

  // ── C style tokens ─────────────────────────────────────────────────────────────
  const C = {
    bg:      "var(--background, #fff)",
    surface: "var(--card, #f9fafb)",
    border:  "var(--border, #e5e7eb)",
    text:    "var(--foreground, #111827)",
    text2:   "var(--muted-foreground, #6b7280)",
    text3:   "#9ca3af",
    green:   "#16a34a",
    amber:   "#d97706",
    red:     "#dc2626",
    accent:  "#2563eb",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "7px 10px", fontSize: 13, color: C.text, outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em",
    color: C.text2, display: "block", marginBottom: 4,
  };

  // ── Summary strip ──────────────────────────────────────────────────────────────
  const strip = (
    <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
      {[
        { label: "Agreed",     val: counts.agreed,     color: C.green },
        { label: "Open",       val: counts.open,       color: C.amber },
        { label: "Superseded", val: counts.superseded, color: C.text3 },
      ].map(({ label, val, color }) => (
        <div key={label} style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
          <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{label}</div>
        </div>
      ))}
      {isAgile && (
        <div style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#7c3aed" }}>
            {sprints.find((s: any) => s.state === "active")?.name ?? "—"}
          </div>
          <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>Active sprint</div>
        </div>
      )}
    </div>
  );

  // ── Add / Edit form ────────────────────────────────────────────────────────────
  const form_el = showForm && (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>
        {editingId ? "Edit Decision" : "New Decision"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Decision Statement *</label>
          <input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What was decided?" />
        </div>
        <div>
          <label style={labelStyle}>Rationale / Context</label>
          <input style={inputStyle} value={form.rationale} onChange={e => setForm(f => ({ ...f, rationale: e.target.value }))} placeholder="Why was this decided?" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Made By</label>
          <input style={inputStyle} value={form.madeBy} onChange={e => setForm(f => ({ ...f, madeBy: e.target.value }))} placeholder="Name or role" />
        </div>
        <div>
          <label style={labelStyle}>Decision Date</label>
          <input type="date" style={inputStyle} value={form.madeAt} onChange={e => setForm(f => ({ ...f, madeAt: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Review Date (optional)</label>
          <input type="date" style={inputStyle} value={form.reviewAt} onChange={e => setForm(f => ({ ...f, reviewAt: e.target.value }))} />
        </div>

        {isAgile ? (
          <>
            <div>
              <label style={labelStyle}>Sprint</label>
              <select style={inputStyle} value={form.sprintId} onChange={e => handleSprintSelect(e.target.value)}>
                <option value="">— none —</option>
                {sprints.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.state})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select style={inputStyle} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label style={labelStyle}>Linked To (optional)</label>
              <input style={inputStyle} value={form.linkedRef} onChange={e => setForm(f => ({ ...f, linkedRef: e.target.value }))} placeholder="e.g. M3 – UAT or CR-04" />
            </div>
            <div>
              <label style={labelStyle}>Link Type</label>
              <select style={inputStyle} value={form.linkedType} onChange={e => setForm(f => ({ ...f, linkedType: e.target.value }))}>
                <option value="">— none —</option>
                {WATERFALL_LINKED_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
        <button onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}
          style={{ padding: "6px 14px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, color: C.text2, background: "transparent", cursor: "pointer" }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving || !form.title.trim()}
          style={{ padding: "6px 16px", background: "rgba(22,163,74,.12)", border: "1px solid rgba(22,163,74,.4)", borderRadius: 6, fontSize: 13, fontWeight: 700, color: C.green, cursor: saving ? "wait" : "pointer" }}>
          {saving ? "Saving…" : editingId ? "Update" : "Save Decision"}
        </button>
      </div>
    </div>
  );

  // ── Table renderer ─────────────────────────────────────────────────────────────
  function DecisionTable({ rows }: { rows: any[] }) {
    if (!rows.length) return (
      <div style={{ textAlign: "center", padding: "32px 0", color: C.text3, fontSize: 13 }}>
        No decisions yet for this filter.
      </div>
    );
    return (
      <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
          <thead>
            <tr>
              {["#", "Decision", "Made By", "Date", "Review", isAgile ? "Category" : "Linked To", "Status", ""].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: C.text2, background: C.surface, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(d => {
              const overdue = isOverdue(d.reviewAt) && d.status !== "superseded";
              const dimmed = d.status === "superseded";
              return (
                <tr key={d.id} style={{ opacity: dimmed ? 0.5 : 1 }}>
                  <td style={{ padding: "10px 12px", color: C.text3, fontSize: 11, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{d.decisionId}</td>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, maxWidth: 280 }}>
                    <div style={{ fontWeight: 600, color: C.text, lineHeight: 1.4 }}>{d.title}</div>
                    {d.rationale && <div style={{ fontSize: 11, color: C.text2, marginTop: 3, lineHeight: 1.4 }}>{d.rationale}</div>}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: C.text2, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{d.madeBy ?? "—"}</td>
                  <td style={{ padding: "10px 12px", fontSize: 11, color: C.text2, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                    {d.madeAt ? new Date(d.madeAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short" }) : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 11, color: overdue ? C.amber : C.text2, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                    {d.reviewAt ? `${new Date(d.reviewAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}${overdue ? " ⚠" : ""}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
                    {isAgile && d.category && (
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "rgba(124,58,237,.12)", color: "#7c3aed" }}>{d.category}</span>
                    )}
                    {!isAgile && d.linkedRef && (
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "rgba(37,99,235,.10)", color: C.accent }}>{d.linkedRef}</span>
                    )}
                    {!isAgile && !d.linkedRef && <span style={{ color: C.text3 }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                    <StatusChip status={d.status} />
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {d.status === "open" && (
                        <button onClick={() => handleQuickStatus(d.id, "agreed")}
                          style={{ padding: "2px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11, color: C.green, background: "transparent", cursor: "pointer" }}>
                          Agree
                        </button>
                      )}
                      <button onClick={() => openEdit(d)}
                        style={{ padding: "2px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11, color: C.text2, background: "transparent", cursor: "pointer" }}>
                        Edit
                      </button>
                      <button onClick={() => handleDelete(d.id)}
                        style={{ padding: "2px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11, color: C.red, background: "transparent", cursor: "pointer" }}>
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Agile sprint-grouped view ──────────────────────────────────────────────────
  function AgileGrouped() {
    const { ordered, noSprint } = groupBySprintForDisplay();
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {ordered.map(([sprintId, group]) => {
          const collapsed = collapsedSprints.has(sprintId);
          const isActive = group.state === "active";
          const borderCol = isActive ? "rgba(124,58,237,.3)" : C.border;
          const bgCol = isActive ? "rgba(124,58,237,.05)" : C.surface;
          return (
            <div key={sprintId} style={{ border: `1px solid ${borderCol}`, borderRadius: 8, overflow: "hidden" }}>
              <div onClick={() => setCollapsedSprints(s => { const n = new Set(s); n.has(sprintId) ? n.delete(sprintId) : n.add(sprintId); return n; })}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: bgCol, cursor: "pointer" }}>
                {collapsed ? <ChevronRight size={14} color="#7c3aed" /> : <ChevronDown size={14} color="#7c3aed" />}
                <span style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed" }}>{group.label}</span>
                <span style={{ fontSize: 11, color: C.text2 }}>· {group.state}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: C.text3 }}>{group.items.length} decision{group.items.length !== 1 ? "s" : ""}</span>
              </div>
              {!collapsed && <div style={{ padding: "0 0 0 0" }}><DecisionTable rows={group.items} /></div>}
            </div>
          );
        })}
        {noSprint.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>No Sprint</div>
            <DecisionTable rows={noSprint} />
          </div>
        )}
        {ordered.length === 0 && noSprint.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: C.text3, fontSize: 13 }}>
            No decisions recorded yet. Add the first one above.
          </div>
        )}
      </div>
    );
  }

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: C.text2 }}>Loading decisions…</div>;

  return (
    <div style={{ padding: 20 }}>
      {strip}

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["all", "open", "agreed", "superseded"] as const).map(f => {
            const label = f === "all" ? `All (${decisions.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f as keyof typeof counts] ?? 0})`;
            return (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, border: `1px solid ${filter === f ? "rgba(22,163,74,.4)" : C.border}`, background: filter === f ? "rgba(22,163,74,.08)" : "transparent", color: filter === f ? C.green : C.text2, cursor: "pointer" }}>
                {label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text2, background: "transparent", cursor: "pointer" }}>
            <Download size={13} /> Export
          </button>
          <button onClick={() => { setShowForm(s => !s); setEditingId(null); setForm(EMPTY_FORM); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px", background: "rgba(22,163,74,.1)", border: "1px solid rgba(22,163,74,.35)", borderRadius: 6, fontSize: 12, fontWeight: 700, color: C.green, cursor: "pointer" }}>
            <Plus size={13} /> Add Decision
          </button>
        </div>
      </div>

      {form_el}

      {/* Content */}
      {isAgile ? <AgileGrouped /> : <DecisionTable rows={filtered} />}
    </div>
  );
}
