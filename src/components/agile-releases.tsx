"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Rocket, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const C = {
  primary: "#4f5bd5", primaryLight: "#eef0fc", primaryBorder: "#cfd4f5",
  green: "#158a5a", greenLight: "#e3f3ea",
  amber: "#c17d12", amberLight: "#fbf0da", red: "#cf3f3a",
  border: "#e2e5ea", surface: "#fff", surface2: "#f7f8fa",
  text: "#1a1d24", text2: "#5b616e", text3: "#8a909c",
};

export function ReleasesPanel({ projectId }: { projectId: string }) {
  const [releases, setReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", targetDate: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/releases`);
      const data = await res.json();
      setReleases(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/releases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Release created" });
      setShowForm(false);
      setForm({ name: "", targetDate: "", notes: "" });
      load();
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function markReleased(id: string) {
    await fetch(`/api/projects/${projectId}/releases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "release", releaseId: id }),
    });
    toast({ title: "Release shipped 🚀" });
    load();
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
            <Rocket size={15} />Release Planning
          </h3>
          <p style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>
            {releases.filter(r => r.status !== "released").length} planned · {releases.filter(r => r.status === "released").length} shipped
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600,
            color: C.primary, background: C.primaryLight, border: `1px solid ${C.primaryBorder}`,
            borderRadius: 9, padding: "7px 14px", cursor: "pointer",
          }}
        >
          <Plus size={14} />New Release
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} style={{
          background: C.surface, border: `1px solid ${C.primaryBorder}`, borderRadius: 12,
          padding: 16, marginBottom: 14, display: "flex", flexDirection: "column", gap: 10,
          boxShadow: `0 0 0 2px ${C.primaryLight}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>New Release</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Release Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="v1.0 / MVP / Phase 1" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Target Date</Label>
              <Input type="date" value={form.targetDate} onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1 text-xs" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Create Release
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Loader2 size={16} className="animate-spin" color={C.text3} /></div>
      ) : releases.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: C.text3, fontSize: 13 }}>
          No releases defined yet. Create your first release above.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {releases.map(r => {
            const shipped = r.status === "released";
            const stats = r.stats ?? { total: 0, accepted: 0, points: 0 };
            const pct = stats.total > 0 ? Math.round((stats.accepted / stats.total) * 100) : 0;
            const overdue = r.targetDate && !shipped && new Date(r.targetDate) < new Date();

            return (
              <div key={r.id} style={{
                border: `1px solid ${shipped ? "#c1e4cf" : overdue ? "#fca5a5" : C.border}`,
                borderRadius: 12, background: C.surface, padding: "14px 16px",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <Rocket size={16} color={shipped ? C.green : overdue ? C.red : C.primary} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{r.name}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        color: shipped ? C.green : overdue ? C.red : C.primary,
                        border: `1px solid ${shipped ? "#c1e4cf" : overdue ? "#fca5a5" : C.primaryBorder}`,
                        borderRadius: 99, padding: "1px 7px",
                      }}>
                        {shipped ? "Shipped" : overdue ? "Overdue" : "Planned"}
                      </span>
                    </div>
                    {r.targetDate && (
                      <div style={{ fontSize: 11, color: overdue ? C.red : C.text3, marginTop: 3 }}>
                        {shipped ? `Released ${new Date(r.releasedAt).toLocaleDateString()}` : `Target: ${new Date(r.targetDate).toLocaleDateString()}`}
                      </div>
                    )}
                    {r.notes && <div style={{ fontSize: 11.5, color: C.text2, marginTop: 4 }}>{r.notes}</div>}

                    {/* Progress */}
                    {stats.total > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 10, color: C.text3 }}>
                          <span>{stats.accepted}/{stats.total} items accepted · {stats.points} pts</span>
                          <span>{pct}%</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: C.surface2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? C.green : C.primary, borderRadius: 2 }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {!shipped && (
                    <button
                      onClick={() => markReleased(r.id)}
                      style={{
                        fontSize: 11, fontWeight: 600, color: C.green, background: C.greenLight,
                        border: `1px solid #9FE1CB`, borderRadius: 7, padding: "5px 12px",
                        cursor: "pointer", display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
                      }}
                    >
                      <CheckCircle2 size={12} />Ship
                    </button>
                  )}
                  {shipped && <CheckCircle2 size={18} color={C.green} style={{ flexShrink: 0 }} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
