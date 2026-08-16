"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { Plus, Pencil, Trash2, Loader2, X, UserPlus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const REGION_LABELS: Record<string, string> = { au: "Australia", nz: "New Zealand", other: "Other" };

interface Cluster { id: string; name: string; }
interface DhUser { id: string; fullName: string; email: string; }
interface Account {
  id: string; name: string; code: string; industry: string | null;
  region: string; status: string; createdAt: string;
  primaryDmId: string | null;
  cluster: Cluster;
  dmAssignments: { user: DhUser; isPrimary: boolean }[];
  _count: { programs: number; projects: number };
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [dmUsers, setDmUsers] = useState<DhUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ clusterId: "", name: "", industry: "", region: "other" });

  // DM assignment panel
  const [assigningAccount, setAssigningAccount] = useState<Account | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignPrimary, setAssignPrimary] = useState(false);
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [ar, clr, usr] = await Promise.all([
      fetch("/api/admin/accounts").then((r) => r.json()),
      fetch("/api/admin/clusters").then((r) => r.json()),
      fetch("/api/admin/users?role=dm").then((r) => r.json()),
    ]);
    setAccounts(Array.isArray(ar) ? ar : []);
    setClusters(Array.isArray(clr) ? clr : []);
    // Also fetch pgm role (old DM role name)
    const pgmUsers = await fetch("/api/admin/users?role=pgm").then((r) => r.json());
    const combined = [...(Array.isArray(usr) ? usr : []), ...(Array.isArray(pgmUsers) ? pgmUsers : [])];
    setDmUsers(combined.filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(a: Account) {
    setEditing(a);
    setForm({ clusterId: a.cluster.id, name: a.name, industry: a.industry || "", region: a.region });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url = editing ? `/api/admin/accounts/${editing.id}` : "/api/admin/accounts";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      toast({ title: editing ? "Account updated" : "Account created" });
      setShowForm(false); setEditing(null); setForm({ clusterId: "", name: "", industry: "", region: "other" });
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this account?")) return;
    const res = await fetch(`/api/admin/accounts/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { toast({ title: "Cannot delete", description: data.error?.message, variant: "destructive" }); return; }
    toast({ title: "Account deleted" }); load();
  }

  async function handleAssignDM(e: React.FormEvent) {
    e.preventDefault();
    if (!assigningAccount || !assignUserId) return;
    setAssignSubmitting(true);
    try {
      const res = await fetch(`/api/admin/accounts/${assigningAccount.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: assignUserId, isPrimary: assignPrimary }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      toast({ title: assignPrimary ? "Primary DM assigned" : "DM assigned" });
      setAssigningAccount(null); setAssignUserId(""); setAssignPrimary(false);
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAssignSubmitting(false);
    }
  }

  async function removeDM(accountId: string, userId: string) {
    if (!confirm("Remove this DM assignment?")) return;
    const res = await fetch(`/api/admin/accounts/${accountId}/assignments?userId=${userId}`, { method: "DELETE" });
    if (res.ok) { toast({ title: "DM removed" }); load(); }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Accounts</h1>
          <p className="text-slate-500 text-sm">UST customer accounts — source for the project creation cascade</p>
        </div>
        <Button
          onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ clusterId: clusters[0]?.id || "", name: "", industry: "", region: "other" }); }}
          className="bg-[#006E74] hover:bg-[#004f54]"
        >
          {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          {showForm ? "Cancel" : "New Account"}
        </Button>
      </div>

      {clusters.length === 0 && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          You need to create at least one Cluster before adding Accounts.
        </div>
      )}

      {showForm && clusters.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-slate-800 mb-4">{editing ? "Edit Account" : "Create Account"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cluster *</Label>
              <Select value={form.clusterId} onValueChange={(v) => setForm({ ...form, clusterId: v })} required>
                <SelectTrigger><SelectValue placeholder="Select cluster" /></SelectTrigger>
                <SelectContent>{clusters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Account Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="ACME Corp" />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Retail, Finance, Healthcare…" />
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <Select value={form.region} onValueChange={(v) => setForm({ ...form, region: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(REGION_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex gap-2">
              <Button type="submit" className="bg-[#006E74] hover:bg-[#004f54]" disabled={submitting}>
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : editing ? "Save Changes" : "Create Account"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* DM Assignment panel */}
      {assigningAccount && (
        <div className="bg-white border border-[#006E74] rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">Assign Delivery Manager — <span className="text-[#006E74]">{assigningAccount.name}</span></h2>
            <Button variant="ghost" size="sm" onClick={() => setAssigningAccount(null)}><X className="w-4 h-4" /></Button>
          </div>

          {/* Current assignments */}
          {assigningAccount.dmAssignments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {assigningAccount.dmAssignments.map((a) => (
                <span key={a.user.id} className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border", a.isPrimary ? "bg-[#E1F5EE] border-[#9FE1CB] text-[#0F6E56]" : "bg-slate-50 border-slate-200 text-slate-600")}>
                  {a.isPrimary && <Check className="w-3 h-3" />}
                  {a.user.fullName}
                  {a.isPrimary && " (Primary)"}
                  <button className="ml-1 text-slate-400 hover:text-red-500" onClick={() => removeDM(assigningAccount.id, a.user.id)}>×</button>
                </span>
              ))}
            </div>
          )}

          <form onSubmit={handleAssignDM} className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>Delivery Manager</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger><SelectValue placeholder="Select DM…" /></SelectTrigger>
                <SelectContent>{dmUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName} ({u.email})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <input type="checkbox" id="isPrimary" checked={assignPrimary} onChange={(e) => setAssignPrimary(e.target.checked)} className="rounded" />
              <Label htmlFor="isPrimary" className="cursor-pointer">Set as Primary DM</Label>
            </div>
            <Button type="submit" className="bg-[#006E74] hover:bg-[#004f54]" disabled={!assignUserId || assignSubmitting}>
              {assignSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Assign"}
            </Button>
          </form>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…</div>
        ) : accounts.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">No accounts yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Account</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Cluster</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Primary DM</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Region</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Industry</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Programs</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const primaryDm = a.dmAssignments.find((d) => d.isPrimary);
                return (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{a.name}</p>
                      <p className="text-xs font-mono text-slate-400">{a.code}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{a.cluster.name}</td>
                    <td className="px-4 py-3">
                      {primaryDm ? (
                        <span className="text-sm font-medium text-[#006E74]">{primaryDm.user.fullName}</span>
                      ) : (
                        <span className="text-xs text-amber-600 font-medium">⚠ Not assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{REGION_LABELS[a.region] || a.region}</td>
                    <td className="px-4 py-3 text-slate-500">{a.industry || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{a._count.programs}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", a.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>{a.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-[#006E74]" onClick={() => { setAssigningAccount(a); setAssignUserId(""); setAssignPrimary(false); }}>
                          <UserPlus className="w-3 h-3 mr-1" />DM
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(a)}><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => handleDelete(a.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
