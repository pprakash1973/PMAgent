"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Client { id: string; name: string; cluster: { name: string }; }
interface DM { id: string; fullName: string; email: string; }
interface Program {
  id: string; name: string; code: string; description: string | null;
  sponsor: string | null; status: string; createdAt: string;
  client: Client & { cluster: { name: string } };
  assignments: { user: DM }[];
  _count: { projects: number };
}

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [dms, setDms] = useState<DM[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ clientId: "", name: "", description: "", sponsor: "", dmIds: [] as string[] });

  const load = useCallback(async () => {
    setLoading(true);
    const [pr, cl, us] = await Promise.all([
      fetch("/api/admin/programs").then((r) => r.json()),
      fetch("/api/admin/clients").then((r) => r.json()),
      fetch("/api/admin/users?role=pgm").then((r) => r.json()),
    ]);
    setPrograms(Array.isArray(pr) ? pr : []);
    setClients(Array.isArray(cl) ? cl : []);
    setDms(Array.isArray(us) ? us : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(p: Program) {
    setEditing(p);
    setForm({ clientId: p.client.id, name: p.name, description: p.description || "", sponsor: p.sponsor || "", dmIds: p.assignments.map((a) => a.user.id) });
    setShowForm(true);
  }

  function toggleDm(id: string) {
    setForm((f) => ({ ...f, dmIds: f.dmIds.includes(id) ? f.dmIds.filter((d) => d !== id) : [...f.dmIds, id] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url = editing ? `/api/admin/programs/${editing.id}` : "/api/admin/programs";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      toast({ title: editing ? "Program updated" : "Program created" });
      setShowForm(false); setEditing(null); setForm({ clientId: "", name: "", description: "", sponsor: "", dmIds: [] });
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this program?")) return;
    const res = await fetch(`/api/admin/programs/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { toast({ title: "Cannot delete", description: data.error?.message, variant: "destructive" }); return; }
    toast({ title: "Program deleted" }); load();
  }

  const STATUS_COLORS: Record<string, string> = { active: "bg-green-100 text-green-700", on_hold: "bg-amber-100 text-amber-700", closed: "bg-slate-100 text-slate-500" };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Programs</h1>
          <p className="text-slate-500 text-sm">Group projects under programs; assign Delivery Managers</p>
        </div>
        <Button onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ clientId: "", name: "", description: "", sponsor: "", dmIds: [] }); }} className="bg-[#006E74] hover:bg-[#004f54]">
          {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          {showForm ? "Cancel" : "New Program"}
        </Button>
      </div>

      {clients.length === 0 && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          You need to create at least one Client before adding Programs.
        </div>
      )}

      {showForm && clients.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-slate-800 mb-4">{editing ? "Edit Program" : "Create Program"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })} required>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.cluster.name} › {c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Program Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Digital Transformation 2026" />
            </div>
            <div className="space-y-2">
              <Label>Sponsor</Label>
              <Input value={form.sponsor} onChange={(e) => setForm({ ...form, sponsor: e.target.value })} placeholder="Executive sponsor name" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief program description" />
            </div>
            {dms.length > 0 && (
              <div className="col-span-2 space-y-2">
                <Label>Assign Delivery Manager(s)</Label>
                <div className="flex flex-wrap gap-2">
                  {dms.map((dm) => (
                    <button
                      key={dm.id}
                      type="button"
                      onClick={() => toggleDm(dm.id)}
                      className={cn("px-3 py-1.5 rounded-lg border text-sm transition-all", form.dmIds.includes(dm.id) ? "bg-[#006E74] text-white border-[#006E74]" : "bg-white text-slate-600 border-slate-200 hover:border-[#006E74]")}
                    >
                      {dm.fullName}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="col-span-2 flex gap-2">
              <Button type="submit" className="bg-[#006E74] hover:bg-[#004f54]" disabled={submitting}>
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : editing ? "Save Changes" : "Create Program"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…</div>
        ) : programs.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">No programs yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Program</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Client › Cluster</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Delivery Manager(s)</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Projects</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs font-mono text-slate-400">{p.code}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.client.name} › {p.client.cluster.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.assignments.length === 0 ? <span className="text-slate-400 text-xs">Unassigned</span> : p.assignments.map((a) => a.user.fullName).join(", ")}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p._count.projects}</td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[p.status] || "bg-slate-100 text-slate-600")}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(p)}><Pencil className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => handleDelete(p.id)}><Trash2 className="w-3 h-3" /></Button>
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
