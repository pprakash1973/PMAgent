"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Check, Calendar } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const C = {
  primary: "#4f5bd5", primaryLight: "#eef0fc", primaryBorder: "#cfd4f5",
  green: "#158a5a", greenLight: "#e3f3ea",
  amber: "#c17d12", amberLight: "#fbf0da",
  border: "#e2e5ea", surface: "#fff", surface2: "#f7f8fa",
  text: "#1a1d24", text2: "#5b616e", text3: "#8a909c",
};

const CEREMONY_LABELS: Record<string, string> = {
  planning: "Sprint Planning",
  daily_standup: "Daily Standup",
  review: "Sprint Review",
  retrospective: "Retrospective",
  refinement: "Backlog Refinement",
  other: "Other",
};

const CEREMONY_COLORS: Record<string, string> = {
  planning: "#4f5bd5",
  daily_standup: "#158a5a",
  review: "#c17d12",
  retrospective: "#881E87",
  refinement: "#0097AC",
  other: "#8a909c",
};

export function CeremoniesPanel({ projectId, sprintId }: { projectId: string; sprintId?: string }) {
  const [ceremonies, setCeremonies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "planning", scheduledAt: "", durationMin: "60", facilitator: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const url = sprintId
        ? `/api/projects/${projectId}/ceremonies?sprintId=${sprintId}`
        : `/api/projects/${projectId}/ceremonies`;
      const res = await fetch(url);
      const data = await res.json();
      setCeremonies(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [projectId, sprintId]);

  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ceremonies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          sprintId,
          scheduledAt: form.scheduledAt || undefined,
          durationMin: form.durationMin ? parseInt(form.durationMin) : undefined,
          facilitator: form.facilitator || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Ceremony scheduled" });
      setShowForm(false);
      setForm({ type: "planning", scheduledAt: "", durationMin: "60", facilitator: "" });
      load();
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function markHeld(id: string) {
    await fetch(`/api/projects/${projectId}/ceremonies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heldAt: new Date().toISOString() }),
    });
    load();
  }

  if (loading) return <div style={{ padding: "12px 0", display: "flex", justifyContent: "center" }}><Loader2 size={16} className="animate-spin" color={C.text3} /></div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
          <Calendar size={13} />Ceremonies
        </span>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            fontSize: 11, fontWeight: 600, color: C.primary, background: C.primaryLight,
            border: `1px solid ${C.primaryBorder}`, borderRadius: 7, padding: "3px 9px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          <Plus size={11} />Add
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} style={{
          background: C.surface2, borderRadius: 9, padding: 12, marginBottom: 10,
          border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="mt-1 h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CEREMONY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Duration (min)</Label>
              <Input value={form.durationMin} onChange={e => setForm(f => ({ ...f, durationMin: e.target.value }))} className="mt-1 h-7 text-xs" placeholder="60" />
            </div>
            <div>
              <Label className="text-xs">Scheduled At</Label>
              <Input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} className="mt-1 h-7 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Facilitator</Label>
              <Input value={form.facilitator} onChange={e => setForm(f => ({ ...f, facilitator: e.target.value }))} className="mt-1 h-7 text-xs" placeholder="Name or email" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Schedule"}
            </Button>
          </div>
        </form>
      )}

      {ceremonies.length === 0 && (
        <div style={{ fontSize: 11.5, color: C.text3, textAlign: "center", padding: "10px 0" }}>No ceremonies scheduled</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {ceremonies.map(c => {
          const color = CEREMONY_COLORS[c.type] ?? C.text3;
          const held = !!c.heldAt;
          return (
            <div key={c.id} style={{
              display: "flex", alignItems: "center", gap: 9, padding: "7px 10px",
              background: held ? C.greenLight : C.surface2,
              border: `1px solid ${held ? "#c1e4cf" : C.border}`, borderRadius: 8,
            }}>
              <span style={{
                fontSize: 9, fontWeight: 700, color, background: `${color}18`,
                borderRadius: 4, padding: "2px 5px", textTransform: "uppercase", flexShrink: 0,
              }}>
                {CEREMONY_LABELS[c.type] ?? c.type}
              </span>
              {c.scheduledAt && (
                <span style={{ fontSize: 11, color: C.text2 }}>
                  {new Date(c.scheduledAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                </span>
              )}
              {c.durationMin && (
                <span style={{ fontSize: 10, color: C.text3 }}>{c.durationMin}m</span>
              )}
              {c.facilitator && (
                <span style={{ fontSize: 10, color: C.text3, flex: 1 }}>{c.facilitator}</span>
              )}
              {!held && (
                <button
                  onClick={() => markHeld(c.id)}
                  style={{
                    fontSize: 10, fontWeight: 600, color: C.green, background: C.greenLight,
                    border: `1px solid #9FE1CB`, borderRadius: 6, padding: "2px 7px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 3, flexShrink: 0,
                  }}
                >
                  <Check size={10} />Done
                </button>
              )}
              {held && <Check size={13} color={C.green} style={{ flexShrink: 0 }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
