"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitCompare, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Plus, Minus, Edit2 } from "lucide-react";

type ComparisonPair = {
  id: string;
  temporalClass: string;
  dispositionClass: string | null;
  matchTier: number | null;
  similarity: number | null;
  leftItemId: string | null;
  rightItemId: string | null;
  leftItem?: { normalizedTitle: string; normalizedDesc: string; attributes: Record<string, unknown> } | null;
  rightItem?: { normalizedTitle: string; normalizedDesc: string; attributes: Record<string, unknown> } | null;
  overrideBy?: string | null;
};

type ComparisonRun = {
  id: string;
  artifactType: string;
  matchedCount: number;
  addedCount: number;
  deletedCount: number;
  modifiedCount: number;
  unchangedCount: number;
  pairs: ComparisonPair[];
};

const TEMPORAL_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  ADDED:     { label: "Added",     color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: Plus },
  DELETED:   { label: "Deleted",   color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: Minus },
  MODIFIED:  { label: "Modified",  color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", icon: Edit2 },
  UNCHANGED: { label: "Unchanged", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", icon: CheckCircle2 },
};

const TIER_LABEL: Record<number, string> = { 1: "ID", 2: "Title", 3: "Fuzzy", 4: "Position" };

function PairRow({ pair }: { pair: ComparisonPair }) {
  const [open, setOpen] = useState(false);
  const tc = TEMPORAL_CONFIG[pair.temporalClass] ?? TEMPORAL_CONFIG.UNCHANGED;
  const Icon = tc.icon;

  const leftTitle = pair.leftItem?.normalizedTitle ?? "(deleted)";
  const rightTitle = pair.rightItem?.normalizedTitle ?? "(removed)";
  const displayTitle = pair.rightItem?.normalizedTitle ?? pair.leftItem?.normalizedTitle ?? "—";

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
               : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}

        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${tc.color}`}>
          <Icon className="h-3 w-3" />
          {tc.label}
        </span>

        <span className="text-sm flex-1 truncate">{displayTitle}</span>

        {pair.dispositionClass && pair.dispositionClass !== "no_change" && (
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
            {pair.dispositionClass.replace(/_/g, " ")}
          </span>
        )}

        {pair.matchTier && (
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            T{pair.matchTier} {TIER_LABEL[pair.matchTier]}
            {pair.similarity != null && pair.similarity < 1 ? ` ${Math.round(pair.similarity * 100)}%` : ""}
          </span>
        )}

        {pair.overrideBy && (
          <span className="text-xs text-purple-600 dark:text-purple-400 shrink-0">overridden</span>
        )}
      </button>

      {open && (
        <div className="border-t px-4 pb-3 pt-3 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Baseline</p>
            {pair.leftItem ? (
              <>
                <p className="font-medium">{pair.leftItem.normalizedTitle}</p>
                {pair.leftItem.normalizedDesc && (
                  <p className="text-muted-foreground mt-1 text-xs">{pair.leftItem.normalizedDesc}</p>
                )}
              </>
            ) : <p className="text-muted-foreground italic">Not in baseline</p>}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Current</p>
            {pair.rightItem ? (
              <>
                <p className="font-medium">{pair.rightItem.normalizedTitle}</p>
                {pair.rightItem.normalizedDesc && (
                  <p className="text-muted-foreground mt-1 text-xs">{pair.rightItem.normalizedDesc}</p>
                )}
              </>
            ) : <p className="text-muted-foreground italic">Not in current</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function ComparisonView({
  projectId,
  leftVersionId,
  rightVersionId,
  artifactType,
  onRunComplete,
  autoRun,
}: {
  projectId: string;
  leftVersionId: string;
  rightVersionId: string;
  artifactType: string;
  onRunComplete?: (runId: string) => void;
  autoRun?: boolean;
}) {
  const [run, setRun] = useState<ComparisonRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  async function runComparison() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/comparisons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leftVersionId, rightVersionId, artifactType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Comparison failed");
        return;
      }
      // Fetch full run with pair details
      const runRes = await fetch(`/api/projects/${projectId}/comparisons/${data.runId}`);
      const runData = await runRes.json();
      setRun(runData);
      onRunComplete?.(data.runId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Auto-run when mounted with autoRun=true
  useEffect(() => {
    if (autoRun) runComparison();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, leftVersionId, rightVersionId]);

  const filteredPairs = run?.pairs.filter(
    (p) => filter === "all" || p.temporalClass === filter
  ) ?? [];

  if (!run) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <GitCompare className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Compare this version against a baseline to see what changed.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button size="sm" onClick={runComparison} disabled={loading}>
          {loading ? "Analyzing…" : "Run Comparison"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-2 text-sm">
        {[
          { key: "all",       label: "All",       count: run.pairs.length },
          { key: "MODIFIED",  label: "Modified",  count: run.modifiedCount },
          { key: "ADDED",     label: "Added",     count: run.addedCount },
          { key: "DELETED",   label: "Deleted",   count: run.deletedCount },
          { key: "UNCHANGED", label: "Unchanged", count: run.unchangedCount },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
              ${filter === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {label} {count}
          </button>
        ))}
      </div>

      {/* Pairs */}
      {filteredPairs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No items in this category.</p>
      ) : (
        <div className="space-y-2">
          {filteredPairs.map((pair) => (
            <PairRow key={pair.id} pair={pair} />
          ))}
        </div>
      )}
    </div>
  );
}
