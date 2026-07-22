"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { Plus, Copy, RefreshCw, UserX, Loader2, X, Check, ChevronRight, Lock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  pm: "Project Manager",
  pgm: "Program Manager",
  dm: "Program Manager",
  dh: "Delivery Head",
  admin: "Admin",
};
const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  invited: "bg-amber-100 text-amber-700",
  deactivated: "bg-slate-100 text-slate-500",
  expired: "bg-red-100 text-red-600",
};

interface HierarchyItem { id: string; name: string }
interface ClusterItem extends HierarchyItem {}
interface ClientItem extends HierarchyItem { cluster: { id: string; name: string } }
interface ProgramItem extends HierarchyItem { client: { id: string; name: string; cluster: { id: string; name: string } } }

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  createdAt: string;
  invitations: { expiresAt: string }[];
  programAssignments: { program: { id: string; name: string; client: { name: string; cluster: { name: string } } } }[];
  clientAssignments: { client: { id: string; name: string; cluster: { name: string } } }[];
}

const emptyForm = { fullName: "", email: "", role: "pm" };

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
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [programs, setPrograms] = useState<ProgramItem[]>([]);
  const [selCluster, setSelCluster] = useState("");
  const [selClient, setSelClient] = useState("");
  const [selPrograms, setSelPrograms] = useState<string[]>([]);   // PM: max 1, DM: multi
  const [selClients, setSelClients] = useState<string[]>([]);     // DH: multi

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load clusters once when wizard opens
  useEffect(() => {
    if (!showForm) return;
    fetch("/api/admin/clusters").then((r) => r.json()).then((d) => setClusters(Array.isArray(d) ? d : []));
  }, [showForm]);

  // Load clients when cluster selected
  useEffect(() => {
    if (!selCluster) { setClients([]); setSelClient(""); return; }
    fetch(`/api/admin/clients?clusterId=${selCluster}`).then((r) => r.json()).then((d) => setClients(Array.isArray(d) ? d : []));
    setSelClient("");
    setSelPrograms([]);
  }, [selCluster]);

  // Load programs when client selected
  useEffect(() => {
    if (!selClient) { setPrograms([]); setSelPrograms([]); return; }
    fetch(`/api/admin/programs?clientId=${selClient}`).then((r) => r.json()).then((d) => setPrograms(Array.isArray(d) ? d : []));
    setSelPrograms([]);
  }, [selClient]);

  function resetWizard() {
    setForm(emptyForm);
    setStep(1);
    setInviteUrl(null);
    setDuplicateInfo(null);
    setSelCluster("");
    setSelClient("");
    setSelPrograms([]);
    setSelClients([]);
  }

  function openForm() { resetWizard(); setShowForm(true); }
  function closeForm() { setShowForm(false); resetWizard(); }

  function toggleProgram(id: string) {
    if (form.role === "pm") {
      setSelPrograms([id]);
    } else {
      setSelPrograms((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
    }
  }

  function toggleClientDH(id: string) {
    setSelClients((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setDuplicateInfo(null);
    try {
      const payload: any = { ...form };
      if (form.role === "pm" || form.role === "pgm") payload.programIds = selPrograms;
      if (form.role === "dh") payload.clientIds = selClients;

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
    if (res.ok) { setInviteUrl(data.inviteUrl); toast({ title: "Invitation re-sent" }); }
  }

  async function deactivate(userId: string) {
    if (!confirm("Deactivate this user?")) return;
    await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    toast({ title: "User deactivated" });
    load();
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url);
    toast({ title: "Invite link copied!" });
  }

  const filtered = users.filter(
    (u) => u.fullName.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  // All clients from clusters (for DH picker — no cluster filter needed since DH picks across clients)
  const allClients = clients; // populated from cluster selection in DH mode

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
              {/* Duplicate user conflict banner */}
              {duplicateInfo && (
                <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-800">User already exists for this email</p>
                      <p className="text-sm text-amber-700 mt-0.5">
                        <span className="font-medium">{duplicateInfo.fullName}</span>
                        {" "}({ROLE_LABELS[duplicateInfo.role] || duplicateInfo.role})
                        {" "}— status: <span className="font-medium capitalize">{duplicateInfo.status}</span>
                      </p>
                      {duplicateInfo.mapping && (
                        <p className="text-xs text-amber-700 mt-1">
                          Current mapping: <span className="font-medium">{duplicateInfo.mapping}</span>
                        </p>
                      )}
                      <p className="text-xs text-amber-600 mt-2">
                        Deactivate the existing account first, then re-invite with the new mapping.
                      </p>
                    </div>
                  </div>
                  {duplicateInfo.status !== "deactivated" && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-amber-400 text-amber-800 hover:bg-amber-100 text-xs"
                        disabled={submitting}
                        onClick={deactivateAndRetry}
                      >
                        {submitting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <UserX className="w-3 h-3 mr-1" />}
                        Deactivate existing account
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-xs text-slate-500"
                        onClick={() => setDuplicateInfo(null)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-5">
                {[1, 2].map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                      step > s ? "bg-[#006E74] text-white" : step === s ? "bg-[#006E74] text-white" : "bg-slate-100 text-slate-400"
                    )}>
                      {step > s ? <Check className="w-3 h-3" /> : s}
                    </div>
                    <span className={cn("text-xs", step === s ? "text-slate-800 font-medium" : "text-slate-400")}>
                      {s === 1 ? "Basic info & role" : "Hierarchy assignment"}
                    </span>
                    {s < 2 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                  </div>
                ))}
              </div>

              {step === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
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
                      {[
                        { v: "pm", label: "Project Manager", desc: "Manages individual projects in a program" },
                        { v: "pgm", label: "Program Manager", desc: "Oversees multiple programs for a client" },
                        { v: "dh", label: "Delivery Head", desc: "Accountable for one or more clients" },
                        { v: "admin", label: "Admin", desc: "Full platform access, no hierarchy restriction" },
                      ].map(({ v, label, desc }) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setForm({ ...form, role: v })}
                          className={cn(
                            "text-left p-3 rounded-lg border transition-all",
                            form.role === v
                              ? "border-[#006E74] bg-[#E1F5EE]"
                              : "border-slate-200 hover:border-slate-300"
                          )}
                        >
                          <div className={cn("text-sm font-medium", form.role === v ? "text-[#0F6E56]" : "text-slate-800")}>{label}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      className="bg-[#006E74] hover:bg-[#004f54]"
                      disabled={!form.fullName || !form.email}
                      onClick={() => form.role === "admin" ? createUser({ preventDefault: () => {} } as any) : setStep(2)}
                    >
                      {form.role === "admin" ? (submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send invitation") : <>Next <ChevronRight className="w-4 h-4 ml-1" /></>}
                    </Button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                    <span className="font-medium">{form.fullName}</span>
                    <span>·</span>
                    <span>{form.email}</span>
                    <span>·</span>
                    <span className="font-medium text-[#006E74]">{ROLE_LABELS[form.role]}</span>
                  </div>

                  {/* PM and PGM: cluster → client → program(s) */}
                  {(form.role === "pm" || form.role === "pgm") && (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Cluster</Label>
                        <select
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#006E74]"
                          value={selCluster}
                          onChange={(e) => setSelCluster(e.target.value)}
                        >
                          <option value="">Select cluster…</option>
                          {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>

                      {selCluster && (
                        <div className="space-y-1.5">
                          <Label>Client</Label>
                          <select
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#006E74]"
                            value={selClient}
                            onChange={(e) => setSelClient(e.target.value)}
                          >
                            <option value="">Select client…</option>
                            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                      )}

                      {selClient && programs.length > 0 && (
                        <div className="space-y-1.5">
                          <Label>
                            {form.role === "pm" ? "Program (select one)" : "Programs (select all that apply for this Program Manager)"}
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            {programs.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => toggleProgram(p.id)}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all",
                                  selPrograms.includes(p.id)
                                    ? "bg-[#E1F5EE] border-[#9FE1CB] text-[#0F6E56] font-medium"
                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                                )}
                              >
                                {selPrograms.includes(p.id) && <Check className="w-3 h-3" />}
                                {p.name}
                              </button>
                            ))}
                          </div>
                          {selClient && programs.length === 0 && (
                            <p className="text-xs text-slate-400">No programs found for this client. Create programs first.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* DH: pick clients across all clusters */}
                  {form.role === "dh" && (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Filter by cluster (optional)</Label>
                        <select
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#006E74]"
                          value={selCluster}
                          onChange={(e) => setSelCluster(e.target.value)}
                        >
                          <option value="">All clusters</option>
                          {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Clients (all programs under each client are accessible)</Label>
                        {clients.length === 0 && !selCluster && (
                          <p className="text-xs text-slate-400">Select a cluster to filter, or clients will appear once loaded.</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {clients.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleClientDH(c.id)}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all",
                                selClients.includes(c.id)
                                  ? "bg-[#EEEDFE] border-[#AFA9EC] text-[#3C3489] font-medium"
                                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                              )}
                            >
                              {selClients.includes(c.id) && <Check className="w-3 h-3" />}
                              {c.name}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {selClients.length === 0
                            ? "No clients selected — DH will have no project access."
                            : `${selClients.length} client${selClients.length > 1 ? "s" : ""} selected`}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>← Back</Button>
                    <Button type="submit" className="bg-[#006E74] hover:bg-[#004f54]" disabled={submitting}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Send invitation
                    </Button>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      )}

      <div className="mb-4">
        <Input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
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
                <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Assignments</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{u.fullName}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3 text-slate-600">{ROLE_LABELS[u.role] || u.role}</td>
                  <td className="px-4 py-3">
                    {(u.role === "pm" || u.role === "pgm" || u.role === "dm") && u.programAssignments?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {u.programAssignments.map((a) => (
                          <span key={a.program.id} className="text-xs bg-[#E1F5EE] text-[#0F6E56] px-2 py-0.5 rounded-full">
                            {a.program.client.cluster.name} › {a.program.client.name} › {a.program.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {u.role === "dh" && u.clientAssignments?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {u.clientAssignments.map((a) => (
                          <span key={a.client.id} className="text-xs bg-[#EEEDFE] text-[#3C3489] px-2 py-0.5 rounded-full">
                            {a.client.cluster.name} › {a.client.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {u.role === "admin" && (
                      <span className="text-xs text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Full access</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[u.status] || "bg-slate-100 text-slate-600")}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
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
    </div>
  );
}
