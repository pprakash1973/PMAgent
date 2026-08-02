"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, Loader2, X, ChevronDown, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Account { id: string; name: string; code: string }
interface ArtifactTemplate {
  id: string; name: string; description: string | null;
  artifactType: string; scope: "global" | "account";
  accountId: string | null; account: Account | null;
  systemAddendum: string | null; userAddendum: string | null;
  isActive: boolean; createdAt: string; updatedAt: string;
}

const ARTIFACT_TYPES = [
  "all",
  "project_charter","business_case","stakeholder_register","assumption_log","benefits_register",
  "scope_statement","wbs","milestone_plan","resource_plan","cost_plan","raid_register",
  "risk_register","communication_plan","raci_matrix","quality_plan","action_log",
  "issue_register","decision_log","weekly_status","monthly_status","change_log",
  "traceability_matrix","dependencies_register","quarterly_business_review",
  "lessons_learned","closure_report","evm_analysis",
];

const TYPE_LABEL: Record<string, string> = {
  all: "All Types (catch-all)",
  project_charter: "Project Charter", business_case: "Business Case",
  stakeholder_register: "Stakeholder Register", assumption_log: "Assumption Log",
  benefits_register: "Benefits Register", scope_statement: "Scope Statement",
  wbs: "Work Breakdown Structure", milestone_plan: "Milestone Plan",
  resource_plan: "Resource Plan", cost_plan: "Cost Plan",
  raid_register: "RAID Register", risk_register: "Risk Register",
  communication_plan: "Communication Plan", raci_matrix: "RACI Matrix",
  quality_plan: "Quality Plan", action_log: "Action Log",
  issue_register: "Issue Register", decision_log: "Decision Log",
  weekly_status: "Weekly Status Report", monthly_status: "Monthly Status Report",
  change_log: "Change Log", traceability_matrix: "Traceability Matrix",
  dependencies_register: "Dependencies Register",
  quarterly_business_review: "Quarterly Business Review",
  lessons_learned: "Lessons Learned", closure_report: "Closure Report",
  evm_analysis: "EVM Analysis",
};

const EMPTY_FORM = {
  name: "", description: "", artifactType: "project_charter",
  scope: "global" as "global" | "account",
  accountId: "", systemAddendum: "", userAddendum: "", isActive: true,
};

// ── Colors ────────────────────────────────────────────────────────────────────
const T = {
  teal: "#006E74", tealLight: "#e6f4f5", tealBorder: "#b3dde0",
  text: "#1a2332", text2: "#4a5568", text3: "#718096",
  border: "#e2e8f0", surface: "#ffffff", surface2: "#f7fafc",
  green: "#276749", greenLight: "#c6f6d5", greenBorder: "#9ae6b4",
  amber: "#975a16", amberLight: "#fefcbf", amberBorder: "#f6e05e",
  red: "#c53030", redLight: "#fed7d7",
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ArtifactTemplate[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [filterScope, setFilterScope] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ArtifactTemplate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tmplRes, acctRes] = await Promise.all([
        fetch("/api/admin/templates"),
        fetch("/api/admin/accounts"),
      ]);
      const [tmplData, acctData] = await Promise.all([tmplRes.json(), acctRes.json()]);
      setTemplates(Array.isArray(tmplData) ? tmplData : []);
      setAccounts(Array.isArray(acctData) ? acctData : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(t: ArtifactTemplate) {
    setEditing(t);
    setForm({
      name: t.name,
      description: t.description ?? "",
      artifactType: t.artifactType,
      scope: t.scope,
      accountId: t.accountId ?? "",
      systemAddendum: t.systemAddendum ?? "",
      userAddendum: t.userAddendum ?? "",
      isActive: t.isActive,
    });
    setShowForm(true);
  }

  async function submit() {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (form.scope === "account" && !form.accountId) {
      toast({ title: "Select a client account", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        artifactType: form.artifactType,
        scope: form.scope,
        accountId: form.scope === "account" ? form.accountId : null,
        systemAddendum: form.systemAddendum.trim() || null,
        userAddendum: form.userAddendum.trim() || null,
        isActive: form.isActive,
      };
      const url = editing ? `/api/admin/templates/${editing.id}` : "/api/admin/templates";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast({ title: editing ? "Template updated" : "Template created" });
      setShowForm(false);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function del(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast({ title: "Template deleted" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  }

  async function toggleActive(t: ArtifactTemplate) {
    try {
      await fetch(`/api/admin/templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      load();
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  }

  const filtered = templates.filter(t => {
    if (filterType && t.artifactType !== filterType) return false;
    if (filterScope && t.scope !== filterScope) return false;
    return true;
  });

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 4 }}>Artifact Templates</h1>
          <p style={{ fontSize: 13, color: T.text3 }}>
            Customise AI generation by adding prompt addenda per artifact type — scoped globally or to a specific client account.
            When a PM generates an artifact for a matching project, the template is merged automatically.
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 16px", background: T.teal, color: "#fff",
            border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}
        >
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Artifact Types</option>
          {ARTIFACT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}
        </select>
        <select
          value={filterScope}
          onChange={e => setFilterScope(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Scopes</option>
          <option value="global">Global</option>
          <option value="account">Account</option>
        </select>
        {(filterType || filterScope) && (
          <button
            onClick={() => { setFilterType(""); setFilterScope(""); }}
            style={{ fontSize: 12, color: T.text3, background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: T.text3 }}>
          <Loader2 className="w-5 h-5 animate-spin inline-block" />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "48px 24px",
          background: T.surface2, borderRadius: 12,
          border: `1px solid ${T.border}`, color: T.text3,
        }}>
          <p style={{ fontSize: 14, marginBottom: 8 }}>No templates yet</p>
          <p style={{ fontSize: 12 }}>
            Create a template to start customising artifact generation for a client account or across the whole org.
          </p>
        </div>
      ) : (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                {["Name", "Artifact Type", "Scope", "Account", "Active", "Modified", ""].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700,
                    letterSpacing: ".05em", textTransform: "uppercase", color: T.text3,
                    borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: "11px 14px", verticalAlign: "top" }}>
                    <div style={{ fontWeight: 600, color: T.text, marginBottom: 2 }}>{t.name}</div>
                    {t.description && <div style={{ fontSize: 11, color: T.text3 }}>{t.description}</div>}
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 4, display: "flex", gap: 6 }}>
                      {t.systemAddendum && <span style={tagStyle}>Role addendum</span>}
                      {t.userAddendum && <span style={tagStyle}>Content addendum</span>}
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px", verticalAlign: "middle" }}>
                    <code style={{ fontSize: 11, background: T.surface2, padding: "2px 6px", borderRadius: 4, color: T.text2 }}>
                      {t.artifactType}
                    </code>
                  </td>
                  <td style={{ padding: "11px 14px", verticalAlign: "middle" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 99, padding: "2px 8px",
                      ...(t.scope === "global"
                        ? { background: T.tealLight, color: T.teal, border: `1px solid ${T.tealBorder}` }
                        : { background: T.greenLight, color: T.green, border: `1px solid ${T.greenBorder}` }),
                    }}>
                      {t.scope === "global" ? "Global" : "Account"}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px", verticalAlign: "middle", color: T.text2 }}>
                    {t.account ? `${t.account.name} (${t.account.code})` : <span style={{ color: T.text3 }}>—</span>}
                  </td>
                  <td style={{ padding: "11px 14px", verticalAlign: "middle" }}>
                    <button onClick={() => toggleActive(t)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      {t.isActive
                        ? <ToggleRight size={22} color={T.green} />
                        : <ToggleLeft size={22} color={T.text3} />}
                    </button>
                  </td>
                  <td style={{ padding: "11px 14px", verticalAlign: "middle", color: T.text3, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    {new Date(t.updatedAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "11px 14px", verticalAlign: "middle" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => openEdit(t)} style={iconBtnStyle} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Delete "${t.name}"?`)) del(t.id); }}
                        disabled={deleting === t.id}
                        style={{ ...iconBtnStyle, color: T.red }}
                        title="Delete"
                      >
                        {deleting === t.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-over form */}
      {showForm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,.35)", display: "flex", justifyContent: "flex-end",
        }} onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{
            width: "min(720px, 100vw)", background: T.surface,
            height: "100%", overflowY: "auto", display: "flex", flexDirection: "column",
            boxShadow: "-4px 0 24px rgba(0,0,0,.15)",
          }}>
            {/* Form header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "20px 24px", borderBottom: `1px solid ${T.border}`, flexShrink: 0,
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>
                  {editing ? "Edit Template" : "New Artifact Template"}
                </div>
                <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>
                  Define addenda that layer on top of the system default AI instructions
                </div>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: T.text3 }}>
                <X size={20} />
              </button>
            </div>

            {/* Form body */}
            <div style={{ padding: "24px", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Name + Description */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={fGroup}>
                  <label style={fLabel}>Template Name <span style={{ color: T.red }}>*</span></label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. UNICON Charter Style" style={fInput} />
                </div>
                <div style={fGroup}>
                  <label style={fLabel}>Description <span style={{ color: T.text3, fontWeight: 400 }}>(optional)</span></label>
                  <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="What this template customises…" style={fInput} />
                </div>
              </div>

              {/* Artifact type + Scope */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={fGroup}>
                  <label style={fLabel}>Artifact Type <span style={{ color: T.red }}>*</span></label>
                  <select value={form.artifactType} onChange={e => setForm(f => ({ ...f, artifactType: e.target.value }))} style={fSelect}>
                    {ARTIFACT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}
                  </select>
                </div>
                <div style={fGroup}>
                  <label style={fLabel}>Scope</label>
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    {(["global", "account"] as const).map(s => (
                      <label key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: T.text2, cursor: "pointer" }}>
                        <input type="radio" name="scope" value={s} checked={form.scope === s}
                          onChange={() => setForm(f => ({ ...f, scope: s, accountId: "" }))}
                          style={{ accentColor: T.teal }} />
                        {s === "global" ? "Global (all projects)" : "Account-specific"}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Account selector — only when scope=account */}
              {form.scope === "account" && (
                <div style={fGroup}>
                  <label style={fLabel}>Client Account <span style={{ color: T.red }}>*</span></label>
                  <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>
                    Only projects linked to this account will use this template
                  </div>
                  <select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))} style={fSelect}>
                    <option value="">Select account…</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                  </select>
                </div>
              )}

              <hr style={{ border: "none", borderTop: `1px solid ${T.border}` }} />

              {/* System addendum */}
              <div style={fGroup}>
                <label style={fLabel}>System Role Addendum</label>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 6, lineHeight: 1.5 }}>
                  Appended after the PMBOK expert role instruction. Use for client-specific methodology, terminology, governance framework, or standards (e.g. PRINCE2, ISO 21500).
                </div>
                <textarea
                  value={form.systemAddendum}
                  onChange={e => setForm(f => ({ ...f, systemAddendum: e.target.value }))}
                  rows={5}
                  placeholder={`e.g. This client follows PRINCE2 stage-gate governance. Use PRINCE2 terminology throughout (Executive not Sponsor, Stage not Phase). All deliverables must reference the client's Benefits Management Strategy.`}
                  style={fTextarea}
                />
              </div>

              {/* User/content addendum */}
              <div style={fGroup}>
                <label style={fLabel}>Content Addendum</label>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 6, lineHeight: 1.5 }}>
                  Appended after the artifact-specific structure instructions. Use to require additional sections, specific subsections, mandatory tables, or formatting rules.
                </div>
                <textarea
                  value={form.userAddendum}
                  onChange={e => setForm(f => ({ ...f, userAddendum: e.target.value }))}
                  rows={5}
                  placeholder={`e.g. The project charter must include:\n1. An Executive Summary as the first section (max 150 words)\n2. A RACI summary table listing top 5 roles\n3. A Risk Appetite statement referencing the client's governance framework`}
                  style={fTextarea}
                />
              </div>

              {/* Prompt chain preview */}
              <div style={{
                background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.text3, marginBottom: 10 }}>
                  Effective prompt chain at generation time
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {[
                    { label: "System default — PMBOK expert role (ai.ts)", custom: false },
                    { label: form.systemAddendum.trim() ? "↳ + Your system role addendum" : "↳ (no system addendum)", custom: !!form.systemAddendum.trim() },
                    { label: "Content instruction — per artifact-type JSON structure (ai.ts)", custom: false },
                    { label: form.userAddendum.trim() ? "↳ + Your content addendum" : "↳ (no content addendum)", custom: !!form.userAddendum.trim() },
                    { label: "Project context — name, dates, team, requirements", custom: false },
                  ].map((step, i) => (
                    <div key={i} style={{
                      fontSize: 11, fontFamily: "monospace", padding: "4px 8px", borderRadius: 4,
                      border: `1px solid ${step.custom ? T.tealBorder : T.border}`,
                      background: step.custom ? T.tealLight : T.surface,
                      color: step.custom ? T.teal : T.text3,
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
                      {step.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Active toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {form.isActive
                    ? <ToggleRight size={26} color={T.green} />
                    : <ToggleLeft size={26} color={T.text3} />}
                </button>
                <span style={{ fontSize: 13, color: T.text2 }}>
                  {form.isActive ? "Active — will apply to new artifact generation" : "Inactive — template saved but not applied"}
                </span>
              </div>
            </div>

            {/* Form footer */}
            <div style={{
              display: "flex", justifyContent: "flex-end", gap: 8,
              padding: "16px 24px", borderTop: `1px solid ${T.border}`, flexShrink: 0,
            }}>
              <button onClick={() => setShowForm(false)} style={ghostBtnStyle}>Cancel</button>
              <button onClick={submit} disabled={submitting} style={primaryBtnStyle}>
                {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                {editing ? "Save Changes" : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const T2 = {
  teal: "#006E74", text: "#1a2332", text2: "#4a5568", text3: "#718096",
  border: "#e2e8f0", surface: "#ffffff", surface2: "#f7fafc",
};

const selectStyle: React.CSSProperties = {
  fontFamily: "'IBM Plex Sans', -apple-system, sans-serif", fontSize: 13, color: T2.text2,
  background: T2.surface, border: `1px solid ${T2.border}`, borderRadius: 6,
  padding: "6px 10px", cursor: "pointer",
};
const tagStyle: React.CSSProperties = {
  background: "#e8edf5", color: "#4a5568", borderRadius: 4, padding: "1px 5px",
  fontSize: 10, fontWeight: 500,
};
const iconBtnStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", color: T2.text3,
  padding: "4px", borderRadius: 4, display: "flex", alignItems: "center",
};
const fGroup: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const fLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: T2.text2 };
const fInput: React.CSSProperties = {
  fontFamily: "'IBM Plex Sans', -apple-system, sans-serif", fontSize: 13, color: T2.text,
  background: T2.surface, border: `1px solid ${T2.border}`, borderRadius: 6, padding: "7px 10px",
};
const fSelect: React.CSSProperties = { ...fInput, cursor: "pointer" };
const fTextarea: React.CSSProperties = {
  fontFamily: "monospace", fontSize: 12, color: T2.text,
  background: T2.surface, border: `1px solid ${T2.border}`, borderRadius: 6,
  padding: "9px 10px", resize: "vertical", lineHeight: 1.6,
};
const primaryBtnStyle: React.CSSProperties = {
  fontFamily: "'IBM Plex Sans', -apple-system, sans-serif", fontSize: 13, fontWeight: 600,
  background: T2.teal, color: "#fff", border: "none", borderRadius: 8,
  padding: "9px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
};
const ghostBtnStyle: React.CSSProperties = {
  fontFamily: "'IBM Plex Sans', -apple-system, sans-serif", fontSize: 13, fontWeight: 500,
  background: "transparent", color: T2.text2, border: `1px solid ${T2.border}`,
  borderRadius: 8, padding: "9px 18px", cursor: "pointer",
};
