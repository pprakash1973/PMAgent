"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const REGION_LABELS: Record<string, string> = { au: "Australia", nz: "New Zealand", other: "Other" };

interface Cluster { id: string; name: string; }
interface Client {
  id: string; name: string; code: string; industry: string | null;
  region: string; accountOwner: string | null; status: string; createdAt: string;
  cluster: Cluster; _count: { programs: number; projects: number };
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ clusterId: "", name: "", industry: "", region: "other", accountOwner: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const [cr, clr] = await Promise.all([
      fetch("/api/admin/clients").then((r) => r.json()),
      fetch("/api/admin/clusters").then((r) => r.json()),
    ]);
    setClients(Array.isArray(cr) ? cr : []);
    setClusters(Array.isArray(clr) ? clr : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(c: Client) {
    setEditing(c);
    setForm({ clusterId: c.cluster.id, name: c.name, industry: c.industry || "", region: c.region, accountOwner: c.accountOwner || "" });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url = editing ? `/api/admin/clients/${editing.id}` : "/api/admin/clients";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      toast({ title: editing ? "Client updated" : "Client created" });
      setShowForm(false); setEditing(null); setForm({ clusterId: "", name: "", industry: "", region: "other", accountOwner: "" });
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this client?")) return;
    const res = await fetch(`/api/admin/clients/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { toast({ title: "Cannot delete", description: data.error?.message, variant: "destructive" }); return; }
    toast({ title: "Client deleted" }); load();
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 text-sm">Master list — source for the project creation dropdown</p>
        </div>
        <Button onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ clusterId: clusters[0]?.id || "", name: "", industry: "", region: "other", accountOwner: "" }); }} className="bg-[#006E74] hover:bg-[#004f54]">
          {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          {showForm ? "Cancel" : "New Client"}
        </Button>
      </div>

      {clusters.length === 0 && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          You need to create at least one Cluster before adding Clients.
        </div>
      )}

      {showForm && clusters.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-slate-800 mb-4">{editing ? "Edit Client" : "Create Client"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cluster *</Label>
              <Select value={form.clusterId} onValueChange={(v) => setForm({ ...form, clusterId: v })} required>
                <SelectTrigger><SelectValue placeholder="Select cluster" /></SelectTrigger>
                <SelectContent>{clusters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Client Name *</Label>
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
            <div className="space-y-2">
              <Label>Account Owner</Label>
              <Input value={form.accountOwner} onChange={(e) => setForm({ ...form, accountOwner: e.target.value })} placeholder="Account director name" />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button type="submit" className="bg-[#006E74] hover:bg-[#004f54]" disabled={submitting}>
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : editing ? "Save Changes" : "Create Client"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…</div>
        ) : clients.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">No clients yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Cluster</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Region</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Industry</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Programs</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{c.name}</p>
                    <p className="text-xs font-mono text-slate-400">{c.code}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.cluster.name}</td>
                  <td className="px-4 py-3 text-slate-600">{REGION_LABELS[c.region] || c.region}</td>
                  <td className="px-4 py-3 text-slate-500">{c.industry || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{c._count.programs}</td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", c.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(c)}><Pencil className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => handleDelete(c.id)}><Trash2 className="w-3 h-3" /></Button>
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
