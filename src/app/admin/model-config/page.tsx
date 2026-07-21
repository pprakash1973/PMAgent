"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { Loader2, Save, RotateCcw, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentRow {
  agent: string;
  label: string;
  description: string;
  model: string;
  maxTokens: number;
  notes: string;
  updatedAt: string | null;
  updatedBy: string | null;
  isDefault: boolean;
}

interface ModelOption { id: string; label: string }

const MODEL_TIER: Record<string, { color: string; badge: string }> = {
  "claude-haiku-4-5-20251001": { color: "bg-green-100 text-green-700",  badge: "Fast" },
  "claude-sonnet-4-6":         { color: "bg-blue-100 text-blue-700",    badge: "Balanced" },
  "claude-sonnet-5":           { color: "bg-violet-100 text-violet-700", badge: "Latest" },
  "claude-opus-4-8":           { color: "bg-amber-100 text-amber-800",   badge: "Quality" },
};

export default function ModelConfigPage() {
  const [agents, setAgents]   = useState<AgentRow[]>([]);
  const [models, setModels]   = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  // local edits before saving — keyed by agent id
  const [edits, setEdits]     = useState<Record<string, { model: string; maxTokens: number; notes: string }>>({});
  const [saving, setSaving]   = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/admin/model-config");
    const data = await res.json();
    setAgents(data.agents ?? []);
    setModels(data.availableModels ?? []);
    // seed edits from fetched state
    const initial: typeof edits = {};
    for (const a of (data.agents ?? [])) {
      initial[a.agent] = { model: a.model, maxTokens: a.maxTokens, notes: a.notes ?? "" };
    }
    setEdits(initial);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function patch(agent: string, field: keyof typeof edits[string], value: string | number) {
    setEdits((prev) => ({ ...prev, [agent]: { ...prev[agent], [field]: value } }));
  }

  async function save(agent: string) {
    setSaving((s) => ({ ...s, [agent]: true }));
    try {
      const body = { agent, ...edits[agent], maxTokens: Number(edits[agent].maxTokens) };
      const res  = await fetch("/api/admin/model-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Save failed");
      toast({ title: "Saved", description: `${agent} → ${edits[agent].model}` });
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving((s) => ({ ...s, [agent]: false }));
    }
  }

  function isDirty(a: AgentRow) {
    const e = edits[a.agent];
    if (!e) return false;
    return e.model !== a.model || e.maxTokens !== a.maxTokens || e.notes !== (a.notes ?? "");
  }

  function reset(a: AgentRow) {
    setEdits((prev) => ({ ...prev, [a.agent]: { model: a.model, maxTokens: a.maxTokens, notes: a.notes ?? "" } }));
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="w-5 h-5 text-[#006E74]" />
          <h1 className="text-xl font-bold text-slate-900">Model Router</h1>
        </div>
        <p className="text-slate-500 text-sm">
          Configure which Claude model each AI agent uses. Changes take effect immediately — no redeploy needed.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((a) => {
            const e    = edits[a.agent] ?? { model: a.model, maxTokens: a.maxTokens, notes: a.notes ?? "" };
            const tier = MODEL_TIER[e.model];
            const dirty = isDirty(a);

            return (
              <div
                key={a.agent}
                className={cn(
                  "bg-white border rounded-xl p-5 transition-all",
                  dirty ? "border-[#006E74] shadow-sm" : "border-slate-200"
                )}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 text-sm">{a.label}</span>
                      <code className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{a.agent}</code>
                      {a.isDefault && !dirty && (
                        <span className="text-xs text-slate-400 italic">default</span>
                      )}
                      {dirty && (
                        <span className="text-xs text-[#006E74] font-medium">unsaved changes</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{a.description}</p>
                  </div>
                  {tier && (
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full shrink-0", tier.color)}>
                      {tier.badge}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-12 gap-3 items-end">
                  {/* Model selector */}
                  <div className="col-span-5 space-y-1">
                    <label className="text-xs font-medium text-slate-600">Model</label>
                    <select
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#006E74] bg-white"
                      value={e.model}
                      onChange={(ev) => patch(a.agent, "model", ev.target.value)}
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Max tokens */}
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium text-slate-600">Max tokens</label>
                    <Input
                      type="number"
                      min={256}
                      max={32000}
                      step={256}
                      value={e.maxTokens}
                      onChange={(ev) => patch(a.agent, "maxTokens", parseInt(ev.target.value) || 8192)}
                      className="text-sm"
                    />
                  </div>

                  {/* Notes */}
                  <div className="col-span-3 space-y-1">
                    <label className="text-xs font-medium text-slate-600">Notes</label>
                    <Input
                      placeholder="e.g. switched to Haiku to cut cost"
                      value={e.notes}
                      onChange={(ev) => patch(a.agent, "notes", ev.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex gap-1.5 justify-end">
                    {dirty && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-slate-400 hover:text-slate-600"
                        onClick={() => reset(a)}
                        title="Discard changes"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="h-9 bg-[#006E74] hover:bg-[#004f54]"
                      disabled={!dirty || saving[a.agent]}
                      onClick={() => save(a.agent)}
                    >
                      {saving[a.agent]
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Save className="w-3.5 h-3.5 mr-1" />}
                      Save
                    </Button>
                  </div>
                </div>

                {/* Last saved */}
                {a.updatedAt && (
                  <p className="text-xs text-slate-400 mt-3">
                    Last saved {new Date(a.updatedAt).toLocaleString()}{a.updatedBy ? ` by ${a.updatedBy}` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-700">How it works</p>
        <p>Each save writes to the database and immediately invalidates the in-process cache. The next AI call for that agent picks up the new model — no restart or redeploy needed.</p>
        <p>The cache TTL is 60 s for reads; a save always bypasses it instantly.</p>
      </div>
    </div>
  );
}
