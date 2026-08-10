"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { Plus, Copy, RefreshCw, UserX, Loader2, X, Check, ChevronRight, Lock, AlertTriangle, Pencil, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

// 4-role model. `pgm` is legacy (hidden from the picker; existing rows still render a label).
const ROLE_LABELS: Record<string, string> = {
  dh: "Delivery Head",
  dm: "Delivery Manager",
  pm: "Project Manager",
  admin: "Admin",
  pgm: "Delivery Manager (legacy)",
};
const CREATE_ROLES = [
  { v: "dh", label: "Delivery Head", desc: "Accountable for one or more clusters" },
  { v: "dm", label: "Delivery Manager", desc: "Manages accounts across one or more clusters" },
  { v: "pm", label: "Project Manager", desc: "Runs projects; assigned to projects directly" },
  { v: "admin", label: "Admin", desc: "Full platform access, no hierarchy restriction" },
];
const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  invited: "bg-amber-100 text-amber-700",
  deactivated: "bg-slate-100 text-slate-500",
  expired: "bg-red-100 text-red-600",
};

interface ClusterItem { id: string; name: string }
interface AccountItem { id: string; name: string; cluster: { id: string; name: string } }

interface User {
  id: string;
  uid: string | null;
  email: string;
  fullName: string;
  role: string;
  status: string;
  copilotEnabled: boolean;
  createdAt: string;
  invitations: { expiresAt: string }[];
  programAssignments: { program: { id: string; name: string; account: { name: string; cluster: { name: string } } } }[];
  accountAssignments: { account: { id: string; name: string; cluster: { id: string; name: string } } }[];
  clusterAssignments: { cluster: { id: string; name: string } }[];
}

const emptyForm = { uid: "", fullName: "", email: "", role: "pm" };
const UID_RE = /^[A-Za-z0-9]{1,10}$/;

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [duplicateInfo, setDuplicateInfo] = useState<{ id: string; fullName: string; role: string; status: string; mapping: string } | null>(null);

  // hierarchy state
  const [clusters, setClusters] = useState<ClusterItem[]>([]);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [selClusters, setSelClusters] = useState<string[]>([]);   // DM + DH: multi cluster
  const [selAccounts, setSelAccounts] = useState<string[]>([]);   // DM: multi account

  // edit state
  const [editUser, setEditUser] = useState<User | null>(null);
  const [pwUser, setPwUser] = useState<User | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load clusters whenever a create/edit panel is open
  const panelOpen = showForm || !!editUser;
  useEffect(() => {
    if (!panelOpen) return;
    fetch("/api/admin/clusters").then((r) => r.json()).then((d) => setClusters(Array.isArray(d) ? d : []));
  }, [panelOpen]);

  // Load accounts across the selected clusters (DM flow)
  useEffect(() => {
    if (selClusters.length === 0) { setAccounts([]); return; }
    fetch(`/api/admin/accounts?clusterIds=${selClusters.join(",")}`)
      .then((r) => r.json())
      .then((d) => setAccounts(Array.isArray(d) ? d : []));
  }, [selClusters]);

  function resetWizard() {
    setForm(emptyForm);
    setStep(1);
    setInviteUrl(null);
    setDuplicateInfo(null);
    setSelClusters([]);
    setSelAccounts([]);
  }

  function openForm() { resetWizard(); setEditUser(null); setShowForm(true); }
  function closeForm() { setShowForm(false); resetWizard(); }

  function toggleCluster(id: string) {
    setSelClusters((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id];
      // Drop accounts that belong to a now-deselected cluster
      if (!next.includes(id)) {
        setSelAccounts((accs) => accs.filter((aid) => {
          const acc = accounts.find((a) => a.id === aid);
          return acc ? next.includes(acc.cluster.id) : true;
        }));
      }
      return next;
    });
  }
  function toggleAccount(id: string) {
    setSelAccounts((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]);
  }

  const uidError = form.uid.length > 0 && !UID_RE.test(form.uid);

  async function createUser(e?: React.FormEvent) {
    e?.preventDefault();
    setSubmitting(true);
    setDuplicateInfo(null);
    try {
      const payload: any = { uid: form.uid, fullName: form.fullName, email: form.email, role: form.role };
      if (form.role === "dm") payload.accountIds = selAccounts;
      if (form.role === "dh") payload.clientIds = selClusters;

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.status === 409 && data.error?.existingUser) {
        setDuplicateInfo(data.error.existingUser);
        return;
      }
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      setInviteUrl(data.inviteUrl);
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────────
  function openEdit(u: User) {
    setShowForm(false);
    setForm({ uid: u.uid ?? "", fullName: u.fullName, email: u.email, role: u.role });
    setSelClusters(
      u.role === "dh" ? u.clusterAssignments.map((a) => a.cluster.id)
      : u.role === "dm" ? Array.from(new Set(u.accountAssignments.map((a) => a.account.cluster.id)))
      : []
    );
    setSelAccounts(u.role === "dm" ? u.accountAssignments.map((a) => a.account.id) : []);
    setEditUser(u);
  }
  function closeEdit() { setEditUser(null); resetWizard(); }

  async function saveEdit() {
    if (!editUser) return;
    setSubmitting(true);
    try {
      const payload: any = { uid: form.uid, fullName: form.fullName, role: form.role };
      if (form.role === "dm") payload.accountIds = selAccounts;
      if (form.role === "dh") payload.clientIds = selClusters;
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      toast({ title: "User updated" });
      closeEdit();
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function deactivateAndRetry() {
    if (!duplicateInfo) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${duplicateInfo.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Deactivation failed");
      setDuplicateInfo(null);
      await load();
      toast({ title: "User deactivated", description: "You can now re-invite them with a new mapping." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function resendInvite(userId: string) {
    const res = await fetch(`/api/admin/users/${userId}/resend-invite`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setInviteUrl(data.inviteUrl);
      setShowForm(true);
      toast({ title: "New invite link ready", description: "Copy the link below and share it with the user." });
    }
  }

  async function deactivate(userId: string) {
    if (!confirm("Deactivate this user?")) return;
    await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    toast({ title: "User deactivated" });
    load();
  }

  async function toggleCopilot(userId: string, current: boolean) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copilotEnabled: !current }),
    });
    if (res.ok) {
      toast({ title: !current ? "AI Assistant enabled" : "AI Assistant disabled" });
      load();
    }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url);
    toast({ title: "Invite link copied!" });
  }

  const filtered = users.filter(
    (u) => u.fullName.toLowerCase().includes(search.toLowerCase())
      || u.email.toLowerCase().includes(search.toLowerCase())
      || (u.uid ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // Accounts grouped by cluster for the DM picker
  const accountsByCluster = selClusters.map((cid) => ({
    cluster: clusters.find((c) => c.id === cid),
    accounts: accounts.filter((a) => a.cluster.id === cid),
  }));

  // ── Shared mapping editor (used by both create step 2 and edit) ──────
  function MappingFields({ role }: { role: string }) {
    if (role === "pm") {
      return <p className="text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
        Project Managers are assigned to projects directly — no cluster or account mapping needed.
      </p>;
    }
    if (role === "admin") {
      return <p className="text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
        Admins have full platform access — no hierarchy mapping.
      </p>;
    }
    if (role === "dh") {
      return (
        <div className="space-y-1.5">
          <Label>Clusters (DH is accountable for all accounts within each selected cluster)</Label>
          {clusters.length === 0 && <p className="text-xs text-slate-400">No clusters available. Create clusters first.</p>}
          <div className="flex flex-wrap gap-2">
            {clusters.map((c) => (
              <button key={c.id} type="button" onClick={() => toggleCluster(c.id)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all",
                  selClusters.includes(c.id) ? "bg-[#EEEDFE] border-[#AFA9EC] text-[#3C3489] font-medium" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300")}>
                {selClusters.includes(c.id) && <Check className="w-3 h-3" />}{c.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {selClusters.length === 0 ? "No clusters selected — DH will have no project access." : `${selClusters.length} cluster${selClusters.length > 1 ? "s" : ""} selected`}
          </p>
        </div>
      );
    }
    // DM: multi-cluster → multi-account
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Clusters (select all that apply)</Label>
          {clusters.length === 0 && <p className="text-xs text-slate-400">No clusters available. Create clusters first.</p>}
          <div className="flex flex-wrap gap-2">
            {clusters.map((c) => (
              <button key={c.id} type="button" onClick={() => toggleCluster(c.id)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all",
                  selClusters.includes(c.id) ? "bg-[#E1F5EE] border-[#9FE1CB] text-[#0F6E56] font-medium" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300")}>
                {selClusters.includes(c.id) && <Check className="w-3 h-3" />}{c.name}
              </button>
            ))}
          </div>
        </div>

        {selClusters.length > 0 && (
          <div className="space-y-2">
            <Label>Accounts (grouped by cluster — select all this DM manages)</Label>
            {accountsByCluster.map(({ cluster, accounts: accs }) => (
              <div key={cluster?.id} className="rounded-lg border border-slate-100 p-3">
                <p className="text-xs font-medium text-slate-500 mb-2">{cluster?.name}</p>
                {accs.length === 0 ? (
                  <p className="text-xs text-slate-400">No accounts under this cluster yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {accs.map((a) => (
                      <button key={a.id} type="button" onClick={() => toggleAccount(a.id)}
                        className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all",
                          selAccounts.includes(a.id) ? "bg-[#E1F5EE] border-[#9FE1CB] text-[#0F6E56] font-medium" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300")}>
                        {selAccounts.includes(a.id) && <Check className="w-3 h-3" />}{a.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <p className="text-xs text-slate-400">
              {selAccounts.length === 0 ? "No accounts selected — DM will have no project access." : `${selAccounts.length} account${selAccounts.length > 1 ? "s" : ""} selected. The first selected account is set as primary.`}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Users</h1>
          <p className="text-slate-500 text-sm">Manage user accounts and hierarchy assignments</p>
        </div>
        <Button onClick={showForm ? closeForm : openForm} className="bg-[#006E74] hover:bg-[#004f54]">
          {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          {showForm ? "Cancel" : "Invite User"}
        </Button>
      </div>

      {/* ── CREATE WIZARD ──────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          {inviteUrl ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <Check className="w-4 h-4 text-green-600 shrink-0" />
                <p className="text-sm text-green-800 font-medium">User created. Share this invite link:</p>
              </div>
              <div className="flex items-center gap-2">
                <Input value={inviteUrl} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={() => copyLink(inviteUrl)}><Copy className="w-4 h-4" /></Button>
              </div>
              <p className="text-xs text-slate-500">This link expires in 72 hours. Share it via a secure channel.</p>
              <Button variant="outline" size="sm" onClick={closeForm}>Done</Button>
            </div>
          ) : (
            <form onSubmit={createUser}>
              {duplicateInfo && (
                <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-800">User already exists for this email</p>
                      <p className="text-sm text-amber-700 mt-0.5">
                        <span className="font-medium">{duplicateInfo.fullName}</span>{" "}({ROLE_LABELS[duplicateInfo.role] || duplicateInfo.role}){" "}
                        — status: <span className="font-medium capitalize">{duplicateInfo.status}</span>
                      </p>
                      {duplicateInfo.mapping && <p className="text-xs text-amber-700 mt-1">Current mapping: <span className="font-medium">{duplicateInfo.mapping}</span></p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {duplicateInfo.status !== "deactivated" && (
                      <Button type="button" size="sm" variant="outline" className="border-amber-400 text-amber-800 hover:bg-amber-100 text-xs" disabled={submitting} onClick={deactivateAndRetry}>
                        {submitting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <UserX className="w-3 h-3 mr-1" />}Deactivate existing account
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" className="text-xs text-slate-500" onClick={() => setDuplicateInfo(null)}>Dismiss</Button>
                  </div>
                </div>
              )}

              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-5">
                {[1, 2].map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                      step >= s ? "bg-[#006E74] text-white" : "bg-slate-100 text-slate-400")}>
                      {step > s ? <Check className="w-3 h-3" /> : s}
                    </div>
                    <span className={cn("text-xs", step === s ? "text-slate-800 font-medium" : "text-slate-400")}>
                      {s === 1 ? "Identity & role" : "Hierarchy assignment"}
                    </span>
                    {s < 2 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                  </div>
                ))}
              </div>

              {step === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label>UID</Label>
                      <Input value={form.uid} onChange={(e) => setForm({ ...form, uid: e.target.value })} required placeholder="e.g. U12345" maxLength={10}
                        className={cn(uidError && "border-red-400 focus-visible:ring-red-400")} />
                      {uidError
                        ? <p className="text-[11px] text-red-500">Alphanumeric, max 10 characters.</p>
                        : <p className="text-[11px] text-slate-400">In production, UID auto-fills name &amp; email from AD.</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Full name</Label>
                      <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required placeholder="Jane Smith" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="jane@org.com" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Role</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {CREATE_ROLES.map(({ v, label, desc }) => (
                        <button key={v} type="button" onClick={() => { setForm({ ...form, role: v }); setSelClusters([]); setSelAccounts([]); }}
                          className={cn("text-left p-3 rounded-lg border transition-all",
                            form.role === v ? "border-[#006E74] bg-[#E1F5EE]" : "border-slate-200 hover:border-slate-300")}>
                          <div className={cn("text-sm font-medium", form.role === v ? "text-[#0F6E56]" : "text-slate-800")}>{label}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button type="button" className="bg-[#006E74] hover:bg-[#004f54]"
                      disabled={!form.uid || uidError || !form.fullName || !form.email}
                      onClick={() => (form.role === "admin" || form.role === "pm") ? createUser() : setStep(2)}>
                      {(form.role === "admin" || form.role === "pm")
                        ? (submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send invitation")
                        : <>Next <ChevronRight className="w-4 h-4 ml-1" /></>}
                    </Button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                    <span className="font-mono text-xs bg-white border border-slate-200 rounded px-1.5 py-0.5">{form.uid}</span>
                    <span className="font-medium">{form.fullName}</span><span>·</span><span>{form.email}</span><span>·</span>
                    <span className="font-medium text-[#006E74]">{ROLE_LABELS[form.role]}</span>
                  </div>
                  <MappingFields role={form.role} />
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>← Back</Button>
                    <Button type="submit" className="bg-[#006E74] hover:bg-[#004f54]" disabled={submitting}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Send invitation
                    </Button>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      )}

      {/* ── EDIT PANEL ─────────────────────────────────────────────── */}
      {editUser && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Edit user</h2>
            <Button variant="ghost" size="icon" onClick={closeEdit}><X className="w-4 h-4" /></Button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>UID</Label>
                <Input value={form.uid} onChange={(e) => setForm({ ...form, uid: e.target.value })} maxLength={10}
                  className={cn(uidError && "border-red-400 focus-visible:ring-red-400")} />
                {uidError && <p className="text-[11px] text-red-500">Alphanumeric, max 10 characters.</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={form.email} readOnly disabled className="bg-slate-50 text-slate-400" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="grid grid-cols-2 gap-2">
                {CREATE_ROLES.map(({ v, label }) => (
                  <button key={v} type="button" onClick={() => { setForm({ ...form, role: v }); setSelClusters([]); setSelAccounts([]); }}
                    className={cn("text-left px-3 py-2 rounded-lg border text-sm transition-all",
                      form.role === v ? "border-[#006E74] bg-[#E1F5EE] text-[#0F6E56] font-medium" : "border-slate-200 text-slate-700 hover:border-slate-300")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <MappingFields role={form.role} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeEdit}>Cancel</Button>
              <Button className="bg-[#006E74] hover:bg-[#004f54]" disabled={submitting || uidError || !form.uid || !form.fullName} onClick={saveEdit}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Save changes
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <Input placeholder="Search by UID, name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">No users found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">UID</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Assignments</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">AI Assistant</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{u.uid ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{u.fullName}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3 text-slate-600">{ROLE_LABELS[u.role] || u.role}</td>
                  <td className="px-4 py-3">
                    {u.role === "dm" && u.accountAssignments?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {u.accountAssignments.map((a) => (
                          <span key={a.account.id} className="text-xs bg-[#E1F5EE] text-[#0F6E56] px-2 py-0.5 rounded-full">
                            {a.account.cluster?.name} › {a.account.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {u.role === "pgm" && u.programAssignments?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {u.programAssignments.map((a) => (
                          <span key={a.program.id} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {a.program.account?.cluster?.name} › {a.program.account?.name} › {a.program.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {u.role === "dh" && u.clusterAssignments?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {u.clusterAssignments.map((a) => (
                          <span key={a.cluster.id} className="text-xs bg-[#EEEDFE] text-[#3C3489] px-2 py-0.5 rounded-full">{a.cluster.name}</span>
                        ))}
                      </div>
                    )}
                    {u.role === "admin" && <span className="text-xs text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Full access</span>}
                    {u.role === "pm" && <span className="text-xs text-slate-400">Project-level</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[u.status] || "bg-slate-100 text-slate-600")}>{u.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleCopilot(u.id, u.copilotEnabled ?? true)} title={u.copilotEnabled ? "Disable AI Assistant" : "Enable AI Assistant"}
                      className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
                        u.copilotEnabled !== false ? "bg-[#006E74]" : "bg-slate-200")}>
                      <span className={cn("pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200",
                        u.copilotEnabled !== false ? "translate-x-4" : "translate-x-0")} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {u.role !== "admin" && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(u)}>
                          <Pencil className="w-3 h-3 mr-1" />Edit
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPwUser(u)}>
                        <KeyRound className="w-3 h-3 mr-1" />Password
                      </Button>
                      {u.status === "invited" && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => resendInvite(u.id)}>
                          <RefreshCw className="w-3 h-3 mr-1" />Resend
                        </Button>
                      )}
                      {u.status === "active" && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => deactivate(u.id)}>
                          <UserX className="w-3 h-3 mr-1" />Deactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pwUser && <ResetPasswordModal user={pwUser} onClose={() => setPwUser(null)} />}
    </div>
  );
}

// ── Reset password modal ────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose }: { user: { id: string; fullName: string }; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = confirm.length > 0 && pw !== confirm;
  const valid = pw.length >= 8 && pw === confirm;

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      toast({ title: "Password reset", description: `New password set for ${user.fullName}.` });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-[#006E74]" />
          <h3 className="text-sm font-semibold text-slate-900">Reset password</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Set a new password for <span className="font-medium">{user.fullName}</span>. Share it securely — self-service reset is coming later.</p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min 8 characters"
              className={cn(tooShort && "border-red-400 focus-visible:ring-red-400")} />
            {tooShort && <p className="text-[11px] text-red-500">At least 8 characters.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Confirm password</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className={cn(mismatch && "border-red-400 focus-visible:ring-red-400")} />
            {mismatch && <p className="text-[11px] text-red-500">Passwords do not match.</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#006E74] hover:bg-[#004f54]" disabled={!valid || saving} onClick={submit}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Reset password
          </Button>
        </div>
      </div>
    </div>
  );
}
