"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { Plus, Copy, RefreshCw, UserX, Loader2, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = { pm: "Project Manager", dm: "Delivery Manager", dh: "Delivery Head", admin: "Admin" };
const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  invited: "bg-amber-100 text-amber-700",
  deactivated: "bg-slate-100 text-slate-500",
  expired: "bg-red-100 text-red-600",
};

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  createdAt: string;
  invitations: { expiresAt: string }[];
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", role: "pm" });
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      setInviteUrl(data.inviteUrl);
      setForm({ fullName: "", email: "", role: "pm" });
      await load();
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
      toast({ title: "Invitation re-sent" });
    }
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Users</h1>
          <p className="text-slate-500 text-sm">Manage user accounts and invitations</p>
        </div>
        <Button onClick={() => { setShowForm(!showForm); setInviteUrl(null); }} className="bg-[#006E74] hover:bg-[#004f54]">
          {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          {showForm ? "Cancel" : "Invite User"}
        </Button>
      </div>

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-slate-800 mb-4">Invite New User</h2>
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
              <p className="text-xs text-slate-500">This link expires in 72 hours. Share it with the user via a secure channel.</p>
              <Button variant="outline" size="sm" onClick={() => { setInviteUrl(null); setShowForm(false); }}>Done</Button>
            </div>
          ) : (
            <form onSubmit={createUser} className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required placeholder="Jane Smith" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="jane@org.com" />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3 flex gap-2">
                <Button type="submit" className="bg-[#006E74] hover:bg-[#004f54]" disabled={submitting}>
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Sending…</> : "Send Invitation"}
                </Button>
              </div>
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
