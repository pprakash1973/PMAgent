"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { Plus, Pencil, Trash2, Loader2, X, Check, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = { geography: "Geography", industry: "Industry", service_line: "Service Line" };

interface DhUser { id: string; fullName: string; email: string; }
interface Cluster {
  id: string;
  name: string;
  code: string;
  type: string;
  clusterLead: string | null;
  description: string | null;
  status: string;
  createdAt: string;
  primaryDhId: string | null;
  clusterAssignments: { user: DhUser; isPrimary: boolean }[];
  _count: { accounts: number };
}

export default function ClustersPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [dhUsers, setDhUsers] = useState<DhUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Cluster | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", type: "geography", clusterLead: "", description: "" });

  // DH assignment panel
  const [assigningCluster, setAssigningCluster] = useState<Cluster | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignPrimary, setAssignPrimary] = useState(false);
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [clr, usr] = await Promise.all([
      fetch("/api/admin/clusters").then((r) => r.json()),
      fetch("/api/admin/users?role=dh").then((r) => r.json()),
    ]);
    setClusters(Array.isArray(clr) ? clr : []);
    setDhUsers(Array.isArray(usr) ? usr : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(c: Cluster) {
    setEditing(c);
    setForm({ name: c.name, type: c.type, clusterLead: c.clusterLead || "", description: c.description || "" });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url = editing ? `/api/admin/clusters/${editing.id}` : "/api/admin/clusters";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      toast({ title: editing ? "Cluster updated" : "Cluster created" });
      setShowForm(false);
      setEditing(null);
      setForm({ name: "", type: "geography", clusterLead: "", description: "" });
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this cluster?")) return;
    const res = await fetch(`/api/admin/clusters/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { toast({ title: "Cannot delete", description: data.error?.message, variant: "destructive" }); return; }
    toast({ title: "Cluster deleted" });
    load();
  }

  async function handleAssignDH(e: React.FormEvent) {
    e.preventDefault();
    if (!assigningCluster || !assignUserId) return;
    setAssignSubmitting(true);
    try {
      const res = await fetch(`/api/admin/clusters/${assigningCluster.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: assignUserId, isPrimary: assignPrimary }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      toast({ title: assignPrimary ? "Primary DH assigned" : "DH assigned" });
      setAssigningCluster(null); setAssignUserId(""); setAssignPrimary(false);
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAssignSubmitting(false);
    }
  }

  async function removeDH(clusterId: string, userId: string) {
    if (!confirm("Remove this DH assignment?")) return;
    const res = await fetch(`/api/admin/clusters/${clusterId}/assignments?userId=${userId}`, { method: "DELETE" });
    if (res.ok) { toast({ title: "DH removed" }); load(); }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Clusters</h1>
          <p className="text-slate-500 text-sm">Top-level hierarchy — geography, industry, or service line</p>
        </div>
        <Button onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ name: "", type: "geography", clusterLead: "", description: "" }); }} className="bg-[#006E74] hover:bg-[#004f54]">
          {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          {showForm ? "Cancel" : "New Cluster"}
        </Button>
      </div>

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-slate-800 mb-4">{editing ? "Edit Cluster" : "Create Cluster"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cluster Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Australia, Healthcare, Digital…" />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cluster Lead</Label>
              <Input value={form.clusterLead} onChange={(e) => setForm({ ...form, clusterLead: e.target.value })} placeholder="Name of delivery lead" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional notes" />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button type="submit" className="bg-[#006E74] hover:bg-[#004f54]" disabled={submitting}>
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : editing ? "Save Changes" : "Create Cluster"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* DH Assignment panel */}
      {assigningCluster && (
        <div className="bg-white border border-[#006E74] rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">Assign Delivery Head — <span className="text-[#006E74]">{assigningCluster.name}</span></h2>
            <Button variant="ghost" size="sm" onClick={() => setAssigningCluster(null)}><X className="w-4 h-4" /></Button>
          </div>
          {assigningCluster.clusterAssignments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {assigningCluster.clusterAssignments.map((a) => (
                <span key={a.user.id} className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border", a.isPrimary ? "bg-[#E1F5EE] border-[#9FE1CB] text-[#0F6E56]" : "bg-slate-50 border-slate-200 text-slate-600")}>
                  {a.isPrimary && <Check className="w-3 h-3" />}
                  {a.user.fullName}{a.isPrimary && " (Primary)"}
                  <button className="ml-1 text-slate-400 hover:text-red-500" onClick={() => removeDH(assigningCluster.id, a.user.id)}>×</button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={handleAssignDH} className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>Delivery Head</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger><SelectValue placeholder="Select DH…" /></SelectTrigger>
                <SelectContent>{dhUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName} ({u.email})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <input type="checkbox" id="isPrimary" checked={assignPrimary} onChange={(e) => setAssignPrimary(e.target.checked)} className="rounded" />
              <Label htmlFor="isPrimary" className="cursor-pointer">Set as Primary DH</Label>
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
        ) : clusters.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">No clusters yet. Create one to start building your hierarchy.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Code</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Primary DH</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Accounts</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {clusters.map((c) => {
                const primaryDh = c.clusterAssignments?.find((a) => a.isPrimary);
                return (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{c.code}</td>
                    <td className="px-4 py-3 text-slate-600">{TYPE_LABELS[c.type] || c.type}</td>
                    <td className="px-4 py-3">
                      {primaryDh ? (
                        <span className="text-sm font-medium text-[#006E74]">{primaryDh.user.fullName}</span>
                      ) : (
                        <span className="text-xs text-amber-600 font-medium">⚠ Not assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c._count.accounts}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", c.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-[#006E74]" onClick={() => { setAssigningCluster(c); setAssignUserId(""); setAssignPrimary(false); }}>
                          <UserPlus className="w-3 h-3 mr-1" />DH
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(c)}><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => handleDelete(c.id)}><Trash2 className="w-3 h-3" /></Button>
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
