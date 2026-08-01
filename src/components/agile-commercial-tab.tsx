"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetricCard } from "@/components/agile-charts";
import { formatCurrency } from "@/lib/utils";

const C = {
  primary: "#4f5bd5", primaryLight: "#eef0fc", primaryBorder: "#cfd4f5",
  green: "#158a5a", greenLight: "#e3f3ea",
  amber: "#c17d12", amberLight: "#fbf0da",
  red: "#cf3f3a", redLight: "#fbe4e2",
  border: "#e2e5ea", surface: "#fff", surface2: "#f7f8fa",
  text: "#1a1d24", text2: "#5b616e", text3: "#8a909c",
};

type CommercialData = {
  project: { budget: number | null; commercialModel: string; currency: string };
  contract: any;
  latest: any;
  totalActual: number;
  ledgerEntries: any[];
};

function ceilColor(remaining: number, ceiling: number) {
  const pct = remaining / ceiling;
  if (pct > 0.3) return C.green;
  if (pct > 0.1) return C.amber;
  return C.red;
}

// ── Add ledger entry form ─────────────────────────────────────────────────────

function AddLedgerForm({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/commercial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_ledger", amount: parseFloat(amount), description: desc, entryType: "actual" }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Cost entry added — PM confirmation recorded" });
      setOpen(false); setAmount(""); setDesc("");
      onAdded();
    } catch {
      toast({ title: "Failed to add entry", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      style={{
        display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
        color: C.primary, background: C.primaryLight, border: `1px solid ${C.primaryBorder}`,
        borderRadius: 8, padding: "6px 12px", cursor: "pointer",
      }}
    >
      <Plus size={13} />Add Actual Cost
    </button>
  );

  return (
    <form onSubmit={submit} style={{
      background: C.surface, border: `1px solid ${C.primaryBorder}`, borderRadius: 10,
      padding: 14, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>Record Actual Cost</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
        <div>
          <Label className="text-xs">Amount *</Label>
          <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" className="mt-1 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Sprint 3 resource cost" className="mt-1 h-8 text-xs" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
          Confirm & Record
        </Button>
      </div>
    </form>
  );
}

// ── Commercial tab ────────────────────────────────────────────────────────────

export function AgileCommercialTab({ project }: { project: any }) {
  const [data, setData] = useState<CommercialData | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [cRes, mRes] = await Promise.all([
        fetch(`/api/projects/${project.id}/commercial`),
        fetch(`/api/projects/${project.id}/agile-metrics`),
      ]);
      const [cData, mData] = await Promise.all([cRes.json(), mRes.json()]);
      setData(cData);
      setMetrics(mData);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
      <Loader2 size={20} className="animate-spin" color={C.text3} />
    </div>
  );

  const cm = project.commercialModel ?? data?.project?.commercialModel ?? "fixed_price";
  const bac = data?.project?.budget ?? 0;
  const actual = data?.totalActual ?? 0;
  const currency = data?.project?.currency ?? "USD";
  const evm = metrics?.evm;
  const contract = data?.contract;

  const ceilingValue = contract?.ceilingValue ?? bac;
  const ceilingRemaining = ceilingValue - actual;
  const burnPct = ceilingValue > 0 ? Math.round((actual / ceilingValue) * 100) : 0;

  const modelLabel: Record<string, string> = {
    fixed_price: "Fixed Price", time_and_materials: "Time & Materials", capped_tm: "Capped T&M",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Commercial Tracking</h3>
          <p style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>
            {modelLabel[cm]} · {currency}
            {bac > 0 && ` · BAC: ${formatCurrency(bac, currency)}`}
          </p>
        </div>
        <AddLedgerForm projectId={project.id} onAdded={load} />
      </div>

      {/* Contract alert */}
      {!contract && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
          background: C.amberLight, border: `1px solid #f0d9a0`, borderRadius: 10, fontSize: 12, color: C.amber,
        }}>
          <AlertTriangle size={14} />
          No active contract record. Use the Contracts section to add contract details.
        </div>
      )}

      {/* Key metrics */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <MetricCard
          label="Actual to Date"
          value={formatCurrency(actual, currency)}
          color={C.text}
        />
        {bac > 0 && (
          <MetricCard
            label="Budget (BAC)"
            value={formatCurrency(bac, currency)}
            color={C.text}
          />
        )}
        {cm !== "time_and_materials" && bac > 0 && (
          <MetricCard
            label="Budget Consumed"
            value={burnPct}
            unit="%"
            color={burnPct > 85 ? C.red : burnPct > 65 ? C.amber : C.green}
            sub={`${formatCurrency(ceilingRemaining, currency)} remaining`}
          />
        )}
        {evm?.cpi != null && (
          <MetricCard
            label="CPI (AgileEVM)"
            value={evm.cpi.toFixed(2)}
            color={evm.cpi >= 1 ? C.green : evm.cpi >= 0.9 ? C.amber : C.red}
            sub={evm.cpi >= 1 ? "Under budget" : "Over budget"}
          />
        )}
        {evm?.eacForecast != null && (
          <MetricCard
            label="EAC Forecast"
            value={formatCurrency(evm.eacForecast, currency)}
            color={evm.eacForecast <= bac ? C.green : C.red}
          />
        )}
        {evm?.marginAtCompletion != null && (
          <MetricCard
            label="Margin @ Completion"
            value={evm.marginAtCompletion.toFixed(1)}
            unit="%"
            color={evm.marginAtCompletion >= 15 ? C.green : evm.marginAtCompletion >= 5 ? C.amber : C.red}
          />
        )}
      </div>

      {/* Ceiling progress (Capped T&M / Fixed Price) */}
      {cm !== "time_and_materials" && bac > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>
              {cm === "capped_tm" ? "Ceiling Gate" : "Budget Burn"}
            </span>
            <span style={{ fontSize: 11, color: burnPct > 85 ? C.red : C.text3 }}>
              {burnPct}% consumed
            </span>
          </div>
          <div style={{ height: 10, borderRadius: 5, background: C.surface2, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 5,
              width: `${Math.min(100, burnPct)}%`,
              background: burnPct > 85 ? C.red : burnPct > 65 ? C.amber : C.green,
              transition: "width .5s ease",
            }} />
          </div>
          {cm === "capped_tm" && burnPct > 85 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6, marginTop: 10,
              padding: "8px 12px", background: C.redLight, borderRadius: 8, fontSize: 12, color: C.red,
            }}>
              <AlertTriangle size={13} />
              <strong>Ceiling gate:</strong> {formatCurrency(ceilingRemaining, currency)} remaining — review scope before next sprint.
            </div>
          )}
        </div>
      )}

      {/* AgileEVM detail (FP / Capped) */}
      {evm && cm !== "time_and_materials" && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 12 }}>AgileEVM Detail</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, fontSize: 12 }}>
            {[
              ["Baseline Points", evm.baselinePoints?.toFixed(0)],
              ["Cost / Point", evm.baselineCostPerPoint != null ? formatCurrency(evm.baselineCostPerPoint, currency) : null],
              ["Accepted Baseline Pts", evm.acceptedBaselinePoints?.toFixed(0)],
              ["Earned Value (EV)", evm.ev != null ? formatCurrency(evm.ev, currency) : null],
              ["Actual Cost (AC)", evm.ac != null ? formatCurrency(evm.ac, currency) : null],
              ["Cost Performance Index", evm.cpi?.toFixed(3)],
            ].map(([label, val]) => (
              <div key={label as string} style={{ background: C.surface2, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ color: C.text3, fontSize: 10, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{val ?? "—"}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: C.text3 }}>
            EV = accepted baseline points × baseline cost per point. AC from confirmed cost ledger. PM confirmation required for all entries.
          </div>
        </div>
      )}

      {/* Ledger entries */}
      {(data?.ledgerEntries ?? []).length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 10 }}>Cost Ledger (recent)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(data?.ledgerEntries ?? []).map((e: any) => (
              <div key={e.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
                background: C.surface2, borderRadius: 8, fontSize: 12,
              }}>
                <CheckCircle2 size={13} color={C.green} />
                <span style={{ flex: 1, color: C.text }}>{e.description || e.entryType}</span>
                <span style={{ fontWeight: 700, color: C.text }}>{formatCurrency(e.amount, currency)}</span>
                <span style={{ fontSize: 10, color: C.text3 }}>{new Date(e.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
