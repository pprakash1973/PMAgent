"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight, DatabaseBackup, CheckCircle2, AlertTriangle, Plus, Star } from "lucide-react";

type SnapshotMember = {
  id: string;
  artifactVersionId: string;
  artifactType: string;
  dimension: string;
  isRequired: boolean;
};

type Snapshot = {
  id: string;
  snapshotNumber: number;
  label: string;
  trigger: string;
  isCurrent: boolean;
  baselinedAt: string;
  notes?: string | null;
  members: SnapshotMember[];
};

type ReadinessCheck = {
  artifactType: string;
  dimension: string;
  isRequired: boolean;
  hasApproved: boolean;
  latestVersion: { approvalStatus: string } | null;
};

type ReadinessResult = {
  ready: boolean;
  requiredMet: number;
  requiredTotal: number;
  checks: ReadinessCheck[];
};

const TRIGGER_LABEL: Record<string, string> = {
  gate_approved: "Gate Approval",
  ad_hoc: "Ad-hoc",
  auto_eom: "Auto (EOM)",
};

const DIMENSION_COLORS: Record<string, string> = {
  scope: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  schedule: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cost: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  context: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

export function PmbSnapshotPanel({ projectId }: { projectId: string }) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [snaps, ready] = await Promise.all([
      fetch(`/api/projects/${projectId}/pmb-snapshots`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}/pmb-snapshots/readiness`).then((r) => r.json()),
    ]);
    setSnapshots(Array.isArray(snaps) ? snaps : []);
    setReadiness(ready);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!label.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/pmb-snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), trigger: "ad_hoc", notes: notes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "BASELINE_NOT_READY"
          ? `Baseline not ready: ${data.readiness.requiredMet}/${data.readiness.requiredTotal} required artifacts approved.`
          : (data.error ?? "Failed to create snapshot"));
        return;
      }
      setLabel("");
      setNotes("");
      setShowCreate(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function makeCurrent(snapId: string) {
    await fetch(`/api/projects/${projectId}/pmb-snapshots/${snapId}/make-current`, { method: "POST" });
    await load();
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  }

  const byDimension = (members: SnapshotMember[]) => {
    const map: Record<string, SnapshotMember[]> = {};
    for (const m of members) {
      (map[m.dimension] ??= []).push(m);
    }
    return map;
  };

  return (
    <div className="space-y-4">
      {/* Readiness Banner */}
      {readiness && (
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm
          ${readiness.ready
            ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
            : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>
          {readiness.ready
            ? <CheckCircle2 className="h-4 w-4 shrink-0" />
            : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span>
            {readiness.ready
              ? "Baseline ready — all required artifacts are approved."
              : `Baseline not ready — ${readiness.requiredMet}/${readiness.requiredTotal} required artifacts approved.`}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <DatabaseBackup className="h-4 w-4" />
          <span>PMB Snapshots ({snapshots.length})</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Snapshot
        </Button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Create Baseline Snapshot</p>
          <Input
            placeholder="Label (e.g. Planning Baseline v1)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Textarea
            placeholder="Notes (optional)"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={creating || !label.trim()}>
              {creating ? "Creating…" : "Create Snapshot"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setError(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Snapshot List */}
      {snapshots.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No snapshots yet. Create one to pin the current artifact versions as a baseline.
        </p>
      ) : (
        <div className="space-y-2">
          {snapshots.map((snap) => (
            <div key={snap.id} className="rounded-lg border bg-card overflow-hidden">
              {/* Row header */}
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                onClick={() => setExpanded((e) => (e === snap.id ? null : snap.id))}
              >
                <span className="text-muted-foreground">
                  {expanded === snap.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </span>
                <span className="text-xs text-muted-foreground font-mono w-6 shrink-0">
                  #{snap.snapshotNumber}
                </span>
                <span className="text-sm font-medium flex-1 truncate">{snap.label}</span>
                <span className="text-xs text-muted-foreground shrink-0">{fmt(snap.baselinedAt)}</span>
                <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                  {TRIGGER_LABEL[snap.trigger] ?? snap.trigger}
                </span>
                {snap.isCurrent && (
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    <Star className="h-2.5 w-2.5 mr-1" />Current
                  </Badge>
                )}
              </button>

              {/* Expanded details */}
              {expanded === snap.id && (
                <div className="border-t px-4 pb-4 pt-3 space-y-3">
                  {snap.notes && (
                    <p className="text-sm text-muted-foreground">{snap.notes}</p>
                  )}

                  {/* Members by dimension */}
                  {Object.entries(byDimension(snap.members)).map(([dim, members]) => (
                    <div key={dim}>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                        {dim}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {members.map((m) => (
                          <span
                            key={m.id}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium
                              ${DIMENSION_COLORS[m.dimension] ?? "bg-muted text-muted-foreground"}`}
                          >
                            {m.artifactType.replace(/_/g, " ")}
                            {m.isRequired && <span className="opacity-60">*</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}

                  {!snap.isCurrent && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => makeCurrent(snap.id)}
                    >
                      Set as Current Baseline
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        * = required artifact. Snapshots are immutable — they pin the artifact version at the time of creation.
      </p>
    </div>
  );
}
