"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { Plus, Pencil, Trash2, Loader2, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = { geography: "Geography", industry: "Industry", service_line: "Service Line" };

interface Cluster {
  id: string;
  name: string;
  code: string;
  type: string;
  clusterLead: string | null;
  description: string | null;
  status: string;
  createdAt: string;
  _count: { clients: number };
}

export default function ClustersPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Cluster | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", type: "geography", clusterLead: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/clusters");
    const data = await res.json();
    setClusters(Array.isArray(data) ? data : []);
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
                <th className="text-left px-4 py-3 font-medium text-slate-600">Lead</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Clients</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {clusters.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500">{c.code}</td>
                  <td className="px-4 py-3 text-slate-600">{TYPE_LABELS[c.type] || c.type}</td>
                  <td className="px-4 py-3 text-slate-600">{c.clusterLead || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{c._count.clients}</td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", c.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>
                      {c.status}
                    </span>
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
