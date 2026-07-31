"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bot, CheckCircle2, XCircle, AlertTriangle, Sparkles } from "lucide-react";

type SummaryResult = {
  summary: string;
  keyRisks: string[];
  recommendedActions: string[];
  overallRisk: string;
  confidence: number;
};

type VerifyCheck = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
};

type VerifyResult = {
  pass: boolean;
  score: number;
  checks: VerifyCheck[];
};

const RISK_BADGE: Record<string, string> = {
  low:      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  medium:   "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  high:     "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function BaselineSummaryCard({
  projectId,
  runId,
}: {
  projectId: string;
  runId: string;
}) {
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/baseline-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setSummary(data);
    } finally {
      setLoading(false);
    }
  }

  if (!summary) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Bot className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Generate an AI briefing of this baseline comparison.</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button size="sm" onClick={generate} disabled={loading}>
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          {loading ? "Generating…" : "Generate Briefing"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Risk badge + confidence */}
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${RISK_BADGE[summary.overallRisk] ?? ""}`}>
          {summary.overallRisk} risk
        </span>
        <span className="text-xs text-muted-foreground">
          {Math.round(summary.confidence * 100)}% confidence
        </span>
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={generate} disabled={loading}>
          {loading ? "…" : "Refresh"}
        </Button>
      </div>

      {/* Summary */}
      <p className="text-sm leading-relaxed">{summary.summary}</p>

      {/* Key risks */}
      {summary.keyRisks.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Key Risks</p>
          <ul className="space-y-1">
            {summary.keyRisks.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended actions */}
      {summary.recommendedActions.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recommended Actions</p>
          <ul className="space-y-1">
            {summary.recommendedActions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-xs font-mono text-muted-foreground mt-0.5 shrink-0">{i + 1}.</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function BaselineVerifyPanel({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function verify() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/baseline/verify`);
      if (res.ok) setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return (
      <Button size="sm" variant="outline" onClick={verify} disabled={loading}>
        {loading ? "Verifying…" : "Run Baseline Verification"}
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={`text-sm font-semibold ${result.pass ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
          {result.pass ? "Baseline Verified" : "Baseline Incomplete"}
        </span>
        <span className="text-xs text-muted-foreground">{result.score}/100</span>
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={verify} disabled={loading}>
          Re-check
        </Button>
      </div>

      <div className="space-y-2">
        {result.checks.map((check) => (
          <div key={check.id} className="flex items-start gap-2.5 text-sm">
            {check.pass
              ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              : <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />}
            <div>
              <p className="font-medium">{check.label}</p>
              <p className="text-xs text-muted-foreground">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
