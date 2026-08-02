"use client";
import React, { useState, useEffect, useCallback } from "react";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, ChevronRight, ChevronDown, Flame, Target, Zap } from "lucide-react";
import { CeremoniesPanel } from "@/components/agile-ceremonies";
import { ImpedimentsPanel } from "@/components/agile-impediments";
import { ReleasesPanel } from "@/components/agile-releases";
import { formatDate } from "@/lib/utils";

const C = {
  primary: "#4f5bd5", primaryLight: "#eef0fc", primaryBorder: "#cfd4f5",
  green: "#158a5a", greenLight: "#e3f3ea",
  amber: "#c17d12", amberLight: "#fbf0da",
  red: "#cf3f3a", redLight: "#fbe4e2",
  border: "#e2e5ea", surface: "#fff", surface2: "#f7f8fa",
  text: "#1a1d24", text2: "#5b616e", text3: "#8a909c",
};

type BacklogItem = {
  id: string; title: string; level: string; itemType: string;
  state: string; points?: number; sprintId?: string | null;
  priorityRank?: number; children?: BacklogItem[];
};

type Sprint = {
  id: string; projectId: string; sprintNumber: number; label: string; goal?: string;
  startDate: string; endDate: string; state: string;
  plannedCapacityPoints?: number; committedPoints?: number;
  acceptedPoints?: number; carriedPoints?: number;
  backlogItems?: BacklogItem[];
};

function stateColor(state: string) {
  const s = state?.toLowerCase() ?? "";
  if (s === "accepted" || s === "done") return { color: C.green, bg: C.greenLight };
  if (s === "in_progress" || s === "in_review") return { color: C.amber, bg: C.amberLight };
  if (s === "removed") return { color: C.red, bg: C.redLight };
  return { color: C.text3, bg: C.surface2 };
}

function StateChip({ state }: { state: string }) {
  const { color, bg } = stateColor(state);
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, color, background: bg,
      borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap",
    }}>
      {state.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

function PointsBadge({ points }: { points?: number }) {
  if (points == null) return <span style={{ fontSize: 11, color: C.text3 }}>—</span>;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: C.primary, background: C.primaryLight,
      borderRadius: 5, padding: "1px 6px",
    }}>{points} pts</span>
  );
}

// ── Sprint card ──────────────────────────────────────────────────────────────

function SprintCard({ sprint, projectId, onRefresh }: { sprint: Sprint; projectId: string; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(sprint.state === "active");
  const [updating, setUpdating] = useState(false);

  const items = sprint.backlogItems ?? [];
  const accepted = items.filter(i => i.state === "accepted").length;
  const total = items.length;
  const pct = total > 0 ? Math.round((accepted / total) * 100) : 0;

  async function changeState(state: string) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sprints/${sprint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: state === "active" ? "Sprint started" : "Sprint closed" });
      onRefresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  }

  const sprintStateColor = sprint.state === "active" ? C.primary : sprint.state === "closed" ? C.green : C.text3;

  return (
    <div style={{
      border: `1px solid ${sprint.state === "active" ? C.primaryBorder : C.border}`,
      borderRadius: 12, background: C.surface, marginBottom: 10,
      boxShadow: sprint.state === "active" ? `0 0 0 2px ${C.primaryLight}` : "none",
    }}>
      <div
        style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? <ChevronDown size={15} color={C.text3} /> : <ChevronRight size={15} color={C.text3} />}

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{sprint.label}</span>
            <span style={{
              fontSize: 10, fontWeight: 600, color: sprintStateColor,
              border: `1px solid ${sprintStateColor}30`, borderRadius: 99, padding: "1px 7px",
            }}>
              {sprint.state.replace(/_/g, " ").toUpperCase()}
            </span>
          </div>
          {sprint.goal && (
            <div style={{ fontSize: 11.5, color: C.text2, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
              <Target size={11} color={C.text3} />{sprint.goal}
            </div>
          )}
          <div style={{ fontSize: 11, color: C.text3, marginTop: 3 }}>
            {formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}
          </div>
        </div>

        {/* Metrics */}
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexShrink: 0 }}>
          {sprint.plannedCapacityPoints != null && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{sprint.plannedCapacityPoints}</div>
              <div style={{ fontSize: 10, color: C.text3 }}>capacity</div>
            </div>
          )}
          {sprint.committedPoints != null && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>{sprint.committedPoints}</div>
              <div style={{ fontSize: 10, color: C.text3 }}>committed</div>
            </div>
          )}
          {total > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>{accepted}/{total}</div>
              <div style={{ fontSize: 10, color: C.text3 }}>accepted</div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div style={{ width: 80, flexShrink: 0 }}>
            <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: C.green, borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 10, color: C.text3, marginTop: 3, textAlign: "right" }}>{pct}%</div>
          </div>
        )}

        {/* Actions */}
        <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 6 }}>
          {sprint.state === "planned" && (
            <button
              onClick={() => changeState("active")}
              disabled={updating}
              style={{
                fontSize: 11, fontWeight: 600, color: C.primary, background: C.primaryLight,
                border: `1px solid ${C.primaryBorder}`, borderRadius: 7, padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              {updating ? <Loader2 size={11} className="animate-spin" /> : "Start Sprint"}
            </button>
          )}
          {sprint.state === "active" && (
            <button
              onClick={() => changeState("closed")}
              disabled={updating}
              style={{
                fontSize: 11, fontWeight: 600, color: "#fff", background: C.green,
                border: "none", borderRadius: 7, padding: "4px 10px", cursor: "pointer",
              }}
            >
              {updating ? <Loader2 size={11} className="animate-spin" /> : "Close Sprint"}
            </button>
          )}
        </div>
      </div>

      {/* Item list + ceremonies */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {items.length > 0 && (
            <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
              {items.map(item => (
                <div key={item.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "6px 8px",
                  borderRadius: 7, background: C.surface2,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: C.text3, textTransform: "uppercase", width: 40, flexShrink: 0 }}>
                    {item.level}
                  </span>
                  <span style={{ flex: 1, fontSize: 12.5, color: C.text }}>{item.title}</span>
                  <StateChip state={item.state} />
                  <PointsBadge points={item.points} />
                </div>
              ))}
            </div>
          )}
          {items.length === 0 && (
            <div style={{ padding: "10px 16px", fontSize: 12, color: C.text3, textAlign: "center" }}>
              No items in this sprint yet.
            </div>
          )}
          {/* Ceremonies panel */}
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
            <CeremoniesPanel projectId={sprint.projectId} sprintId={sprint.id} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create Sprint form ───────────────────────────────────────────────────────

function CreateSprintForm({ projectId, project, onCreated }: { projectId: string; project: any; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(project.startDate ? new Date(project.startDate).toISOString().slice(0, 10) : "");
  const [endDate, setEndDate] = useState("");
  const [capacity, setCapacity] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sprints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, startDate, endDate, plannedCapacityPoints: capacity ? parseFloat(capacity) : undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Sprint created" });
      setOpen(false);
      setGoal(""); setStartDate(""); setEndDate(""); setCapacity("");
      onCreated();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600,
          color: C.primary, background: C.primaryLight, border: `1px solid ${C.primaryBorder}`,
          borderRadius: 9, padding: "7px 14px", cursor: "pointer", marginBottom: 14,
        }}
      >
        <Plus size={14} />New Sprint
      </button>
    );
  }

  return (
    <div style={{
      border: `1px solid ${C.primaryBorder}`, borderRadius: 12, background: C.surface,
      padding: 16, marginBottom: 14, boxShadow: `0 0 0 2px ${C.primaryLight}`,
    }}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Sprint Goal</Label>
            <Input value={goal} onChange={e => setGoal(e.target.value)} placeholder="What will be delivered this sprint?" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Start Date *</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">End Date *</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Planned Capacity (points)</Label>
            <Input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="40" className="mt-1" />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Create Sprint
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Backlog item row ─────────────────────────────────────────────────────────

function BacklogItemRow({ item, sprints, projectId, onRefresh }: {
  item: BacklogItem; sprints: Sprint[]; projectId: string; onRefresh: () => void;
}) {
  const [assigning, setAssigning] = useState(false);

  async function assignToSprint(sprintId: string) {
    setAssigning(true);
    try {
      const val = sprintId === "__none__" ? null : sprintId;
      await fetch(`/api/projects/${projectId}/backlog/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId: val }),
      });
      onRefresh();
    } catch {
      toast({ title: "Failed to assign", variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  }

  const itemTypeColors: Record<string, string> = {
    story: "#4f5bd5", defect: "#cf3f3a", spike: "#c17d12",
    enabler: "#158a5a", chore: "#8a909c",
  };
  const itColor = itemTypeColors[item.itemType] ?? C.text3;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
      borderRadius: 8, background: C.surface2, border: `1px solid ${C.border}`,
    }}>
      <span style={{
        fontSize: 9.5, fontWeight: 700, color: itColor, textTransform: "uppercase",
        background: `${itColor}18`, borderRadius: 4, padding: "1px 5px", flexShrink: 0,
      }}>
        {item.itemType}
      </span>
      <span style={{ flex: 1, fontSize: 12.5, color: C.text }}>{item.title}</span>
      <StateChip state={item.state} />
      <PointsBadge points={item.points} />

      {/* Sprint assignment */}
      <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
        {assigning ? <Loader2 size={13} className="animate-spin" color={C.text3} /> : (
          <select
            value={item.sprintId ?? "__none__"}
            onChange={e => assignToSprint(e.target.value)}
            style={{
              fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6,
              padding: "2px 6px", color: item.sprintId ? C.primary : C.text3,
              background: item.sprintId ? C.primaryLight : C.surface,
              cursor: "pointer", maxWidth: 120,
            }}
          >
            <option value="__none__">Backlog</option>
            {sprints.filter(s => s.state !== "closed").map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// ── Create Backlog Item form ──────────────────────────────────────────────────

function CreateItemForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [itemType, setItemType] = useState("story");
  const [level, setLevel] = useState("story");
  const [points, setPoints] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/backlog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, itemType, level, points: points ? parseFloat(points) : undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Item added to backlog" });
      setOpen(false);
      setTitle(""); setPoints(""); setItemType("story"); setLevel("story");
      onCreated();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
          color: C.text2, background: C.surface, border: `1px dashed ${C.border}`,
          borderRadius: 8, padding: "7px 12px", cursor: "pointer", width: "100%",
          marginTop: 6,
        }}
      >
        <Plus size={13} />Add backlog item
      </button>
    );
  }

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, padding: 14, marginTop: 6,
    }}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label className="text-xs">Title *</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="As a user, I want to..." required className="mt-1" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Level</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="epic">Epic</SelectItem>
                <SelectItem value="feature">Feature</SelectItem>
                <SelectItem value="story">Story</SelectItem>
                <SelectItem value="task">Task</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={itemType} onValueChange={setItemType}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="story">Story</SelectItem>
                <SelectItem value="defect">Defect</SelectItem>
                <SelectItem value="spike">Spike</SelectItem>
                <SelectItem value="enabler">Enabler</SelectItem>
                <SelectItem value="chore">Chore</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Story Points</Label>
            <Input type="number" value={points} onChange={e => setPoints(e.target.value)} placeholder="5" className="mt-1 h-8 text-xs" />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Add Item
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Sprint velocity summary ──────────────────────────────────────────────────

function VelocitySummary({ sprints }: { sprints: Sprint[] }) {
  const closed = sprints.filter(s => s.state === "closed" && s.acceptedPoints != null);
  if (closed.length === 0) return null;

  const avgVelocity = Math.round(closed.reduce((sum, s) => sum + (s.acceptedPoints ?? 0), 0) / closed.length);

  return (
    <div style={{
      display: "flex", gap: 16, padding: "10px 14px", background: C.primaryLight,
      borderRadius: 10, border: `1px solid ${C.primaryBorder}`, marginBottom: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Flame size={14} color={C.primary} />
        <span style={{ fontSize: 12, fontWeight: 600, color: C.primary }}>Avg velocity</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: C.primary }}>{avgVelocity} pts/sprint</span>
      <span style={{ fontSize: 11, color: C.text3, alignSelf: "center" }}>based on {closed.length} completed sprint(s)</span>
    </div>
  );
}

// ── Cadence generator ────────────────────────────────────────────────────────

function CadenceGenerator({ project, onGenerated }: { project: any; onGenerated: () => void }) {
  const [open, setOpen] = useState(false);
  const [weeks, setWeeks] = useState("2");
  const [startDate, setStartDate] = useState(
    project.startDate ? new Date(project.startDate).toISOString().slice(0, 10) : ""
  );
  const [endDate, setEndDate] = useState(
    project.endDate ? new Date(project.endDate).toISOString().slice(0, 10) : ""
  );
  const [capacity, setCapacity] = useState("");
  const [generating, setGenerating] = useState(false);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/cadence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sprintLengthWeeks: parseInt(weeks),
          startDate, endDate,
          plannedCapacityPointsPerSprint: capacity ? parseFloat(capacity) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `${data.created} sprints generated from project dates` });
      setOpen(false);
      onGenerated();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      style={{
        display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
        color: "#158a5a", background: "#e3f3ea", border: "1px solid #9FE1CB",
        borderRadius: 8, padding: "6px 12px", cursor: "pointer", marginBottom: 10,
      }}
    >
      <Zap size={13} />Auto-Generate Sprints from Project Dates
    </button>
  );

  return (
    <div style={{
      border: "1px solid #9FE1CB", borderRadius: 12, background: "#e3f3ea",
      padding: 16, marginBottom: 14,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F6E56", marginBottom: 10 }}>
        Auto-Generate Sprint Cadence
      </div>
      <form onSubmit={generate} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Sprint Length (weeks)</Label>
            <Select value={weeks} onValueChange={setWeeks}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 week</SelectItem>
                <SelectItem value="2">2 weeks</SelectItem>
                <SelectItem value="3">3 weeks</SelectItem>
                <SelectItem value="4">4 weeks</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Default Capacity (pts/sprint)</Label>
            <Input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="40" className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Start Date *</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs">End Date *</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required className="mt-1 h-8 text-xs" />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={generating}>
            {generating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
            Generate Sprints
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Main Agile Workspace ─────────────────────────────────────────────────────

export function BacklogTab({ project }: { project: any }) {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [backlogRes, sprintsRes] = await Promise.all([
        fetch(`/api/projects/${project.id}/backlog?unassigned=true`),
        fetch(`/api/projects/${project.id}/sprints`),
      ]);
      const [backlogData, sprintsData] = await Promise.all([backlogRes.json(), sprintsRes.json()]);
      setItems(Array.isArray(backlogData) ? backlogData : []);
      setSprints(Array.isArray(sprintsData) ? sprintsData : []);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <Loader2 size={20} className="animate-spin" color={C.text3} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Product Backlog</h3>
        <p style={{ fontSize: 12, color: C.text3 }}>
          {items.length} item(s) in backlog — assign to a sprint using the dropdown on each row.
        </p>
      </div>

      <CreateItemForm projectId={project.id} onCreated={load} />

      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
          {items.map(item => (
            <BacklogItemRow key={item.id} item={item} sprints={sprints} projectId={project.id} onRefresh={load} />
          ))}
        </div>
      )}

      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: "30px 0", color: C.text3, fontSize: 13 }}>
          No unassigned items. Add items above or check the Sprints tab.
        </div>
      )}
    </div>
  );
}

export function SprintsTab({ project }: { project: any }) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<"sprints" | "impediments" | "releases">("sprints");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/sprints`);
      const data = await res.json();
      setSprints(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ display: "flex", gap: 20, borderBottom: `1.5px solid ${C.border}`, marginBottom: 18 }}>
        {([
          { id: "sprints" as const, label: "Sprints" },
          { id: "impediments" as const, label: "Impediments" },
          { id: "releases" as const, label: "Releases" },
        ]).map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{
              padding: "0 1px 11px", border: "none", background: "transparent", cursor: "pointer",
              fontSize: 13, fontWeight: subTab === t.id ? 700 : 500,
              color: subTab === t.id ? C.text : C.text3,
              borderBottom: subTab === t.id ? `2.5px solid ${C.primary}` : "2.5px solid transparent",
              marginBottom: "-1.5px",
            }}
          >{t.label}</button>
        ))}
      </div>

      {subTab === "sprints" && (
        <div>
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: 12, color: C.text3 }}>
              {sprints.length} sprint(s) · {sprints.filter(s => s.state === "active").length} active
            </p>
          </div>

          <VelocitySummary sprints={sprints} />
          <CadenceGenerator project={project} onGenerated={load} />
          <CreateSprintForm projectId={project.id} project={project} onCreated={load} />

          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <Loader2 size={20} className="animate-spin" color={C.text3} />
            </div>
          )}

          {!loading && sprints.length === 0 && (
            <div style={{ textAlign: "center", padding: "30px 0", color: C.text3, fontSize: 13 }}>
              No sprints yet. Use Auto-Generate or create manually above.
            </div>
          )}

          {sprints.map(sprint => (
            <SprintCard key={sprint.id} sprint={sprint} projectId={project.id} onRefresh={load} />
          ))}
        </div>
      )}

      {subTab === "impediments" && <ImpedimentsPanel projectId={project.id} />}
      {subTab === "releases" && <ReleasesPanel projectId={project.id} />}
    </div>
  );
}
