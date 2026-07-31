"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, Info, TrendingUp, Zap } from "lucide-react";

type Finding = {
  dimension: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  affectedItems?: string[];
};

type ImpactResult = {
  reportId: string;
  scopeScore: number | null;
  scheduleScore: number | null;
  costScore: number | null;
  overallRisk: string;
  confidence: number;
  findings: Finding[];
};

const RISK_CONFIG: Record<string, { label: string; color: string }> = {
  low:      { label: "Low Risk",      color: "text-green-700 dark:text-green-300" },
  medium:   { label: "Medium Risk",   color: "text-amber-700 dark:text-amber-300" },
  high:     { label: "High Risk",     color: "text-orange-700 dark:text-orange-300" },
  critical: { label: "Critical Risk", color: "text-red-700 dark:text-red-300" },
};

const SEVERITY_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  info:     { icon: Info,          color: "text-blue-600 dark:text-blue-400" },
  warning:  { icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400" },
  critical: { icon: AlertCircle,   color: "text-red-600 dark:text-red-400" },
};

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  const color = score >= 0.5 ? "bg-red-500" : score >= 0.3 ? "bg-amber-500" : score >= 0.15 ? "bg-yellow-400" : "bg-green-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{pct}% changed</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const { icon: Icon, color } = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG.info;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{finding.title}</p>
          <p className="text-xs text-muted-foreground capitalize">{finding.dimension}</p>
        </div>
      </button>
      {open && (
        <div className="border-t px-4 pb-3 pt-2 space-y-2">
          <p className="text-sm text-muted-foreground">{finding.detail}</p>
          {finding.affectedItems && finding.affectedItems.length > 0 && (
            <ul className="text-xs space-y-0.5">
              {finding.affectedItems.map((item, i) => (
                <li key={i} className="text-muted-foreground pl-2 border-l-2 border-border">
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function ImpactReportPanel({
  projectId,
  runId,
}: {
  projectId: string;
  runId: string;
}) {
  const [report, setReport] = useState<ImpactResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/comparisons/${runId}/impact`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setReport(data); });
  }, [projectId, runId]);

  async function compute() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/comparisons/${runId}/impact`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setReport(data);
    } finally {
      setLoading(false);
    }
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <TrendingUp className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Compute impact to see scope, schedule, and cost deviation findings.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button size="sm" onClick={compute} disabled={loading}>
          <Zap className="h-3.5 w-3.5 mr-1" />
          {loading ? "Computing…" : "Compute Impact"}
        </Button>
      </div>
    );
  }

  const riskConf = RISK_CONFIG[report.overallRisk] ?? RISK_CONFIG.low;
  const criticalFindings = report.findings.filter((f) => f.severity === "critical");
  const warningFindings = report.findings.filter((f) => f.severity === "warning");
  const infoFindings = report.findings.filter((f) => f.severity === "info");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-lg font-semibold ${riskConf.color}`}>{riskConf.label}</p>
          <p className="text-xs text-muted-foreground">
            Confidence: {Math.round(report.confidence * 100)}% · {report.findings.length} finding{report.findings.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={compute} disabled={loading}>
          {loading ? "Recomputing…" : "Recompute"}
        </Button>
      </div>

      {/* Dimension scores */}
      {(report.scopeScore !== null || report.scheduleScore !== null || report.costScore !== null) && (
        <div className="space-y-3 rounded-lg border bg-card px-4 py-3">
          <ScoreBar label="Scope" score={report.scopeScore} />
          <ScoreBar label="Schedule" score={report.scheduleScore} />
          <ScoreBar label="Cost" score={report.costScore} />
        </div>
      )}

      {/* Findings */}
      {report.findings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No significant findings — baseline appears stable.</p>
      ) : (
        <div className="space-y-2">
          {[...criticalFindings, ...warningFindings, ...infoFindings].map((f, i) => (
            <FindingCard key={i} finding={f} />
          ))}
        </div>
      )}
    </div>
  );
}
