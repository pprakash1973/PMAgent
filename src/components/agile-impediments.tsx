"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, ShieldAlert, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const C = {
  primary: "#4f5bd5", primaryLight: "#eef0fc", primaryBorder: "#cfd4f5",
  green: "#158a5a", greenLight: "#e3f3ea",
  amber: "#c17d12", amberLight: "#fbf0da",
  red: "#cf3f3a", redLight: "#fbe4e2",
  border: "#e2e5ea", surface: "#fff", surface2: "#f7f8fa",
  text: "#1a1d24", text2: "#5b616e", text3: "#8a909c",
};

const SEV_COLOR: Record<string, string> = {
  low: C.text3, medium: C.amber, high: C.red, critical: "#7f1d1d",
};
const SEV_BG: Record<string, string> = {
  low: C.surface2, medium: C.amberLight, high: C.redLight, critical: "#fee2e2",
};

export function ImpedimentsPanel({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", severity: "medium" });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");

  const load = useCallback(async () => {
    try {
      const url = filter === "all"
        ? `/api/projects/${projectId}/impediments`
        : `/api/projects/${projectId}/impediments?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [projectId, filter]);

  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/impediments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Impediment raised" });
      setShowForm(false);
      setForm({ title: "", description: "", severity: "medium" });
      load();
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function resolve(id: string) {
    await fetch(`/api/projects/${projectId}/impediments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    toast({ title: "Impediment resolved" });
    load();
  }

  const open = items.filter(i => i.status === "open");
  const resolved = items.filter(i => i.status === "resolved");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldAlert size={15} color={open.length > 0 ? C.red : C.text3} />
            Impediments
            {open.length > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, background: C.red, color: "#fff",
                borderRadius: 99, padding: "1px 7px",
              }}>{open.length} open</span>
            )}
          </h3>
          <p style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>Blockers requiring escalation or resolution before the team can proceed.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {(["open", "resolved", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                fontSize: 11, fontWeight: filter === f ? 700 : 500,
                color: filter === f ? C.primary : C.text3,
                background: filter === f ? C.primaryLight : "transparent",
                border: `1px solid ${filter === f ? C.primaryBorder : C.border}`,
                borderRadius: 7, padding: "3px 9px", cursor: "pointer", textTransform: "capitalize",
              }}
            >{f}</button>
          ))}
          <button
            onClick={() => setShowForm(v => !v)}
            style={{
              fontSize: 12, fontWeight: 600, color: "#fff", background: C.red,
              border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <Plus size={13} />Raise Impediment
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={create} style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 16, marginBottom: 14, display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Raise an Impediment</div>
          <div>
            <Label className="text-xs">Title *</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="External dependency blocked" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Severity</Label>
              <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="What is blocked and why?" className="mt-1 text-xs" />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Raise Impediment
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Loader2 size={16} className="animate-spin" color={C.text3} /></div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: C.text3, fontSize: 13 }}>
          {filter === "open" ? "No open impediments — the team is unblocked 🎉" : "No items"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(item => {
            const sevColor = SEV_COLOR[item.severity] ?? C.text3;
            const sevBg = SEV_BG[item.severity] ?? C.surface2;
            return (
              <div key={item.id} style={{
                border: `1px solid ${item.status === "resolved" ? "#c1e4cf" : item.severity === "critical" ? "#fca5a5" : C.border}`,
                borderRadius: 10, background: C.surface, padding: "12px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: sevColor, background: sevBg,
                    borderRadius: 5, padding: "2px 7px", textTransform: "uppercase", flexShrink: 0, marginTop: 1,
                  }}>
                    {item.severity}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.title}</div>
                    {item.description && (
                      <div style={{ fontSize: 11.5, color: C.text2, marginTop: 3 }}>{item.description}</div>
                    )}
                    <div style={{ fontSize: 10, color: C.text3, marginTop: 5 }}>
                      Raised {new Date(item.createdAt).toLocaleDateString()}
                      {item.resolvedAt && ` · Resolved ${new Date(item.resolvedAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  {item.status === "open" && (
                    <button
                      onClick={() => resolve(item.id)}
                      style={{
                        fontSize: 11, fontWeight: 600, color: C.green, background: C.greenLight,
                        border: `1px solid #9FE1CB`, borderRadius: 7, padding: "4px 10px",
                        cursor: "pointer", display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
                      }}
                    >
                      <CheckCircle2 size={12} />Resolve
                    </button>
                  )}
                  {item.status === "resolved" && (
                    <CheckCircle2 size={16} color={C.green} style={{ flexShrink: 0 }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
