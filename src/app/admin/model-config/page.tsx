"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { Loader2, Save, RotateCcw, Cpu, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Provider = "anthropic" | "openai" | "deepseek";

interface AgentRow {
  agent: string;
  label: string;
  description: string;
  model: string;
  provider: Provider;
  maxTokens: number;
  notes: string;
  updatedAt: string | null;
  updatedBy: string | null;
  isDefault: boolean;
}

interface ModelOption { id: string; label: string; provider: Provider; tier: string }

type ProviderKeyStatus = Record<Provider, boolean>;

const TIER_STYLE: Record<string, { color: string }> = {
  "Fast":     { color: "bg-green-100 text-green-700" },
  "Balanced": { color: "bg-blue-100 text-blue-700" },
  "Latest":   { color: "bg-violet-100 text-violet-700" },
  "Quality":  { color: "bg-amber-100 text-amber-800" },
  "Smart":    { color: "bg-purple-100 text-purple-800" },
};

const PROVIDER_STYLE: Record<Provider, { label: string; color: string }> = {
  anthropic: { label: "Anthropic", color: "bg-amber-100 text-amber-800" },
  openai:    { label: "OpenAI",    color: "bg-emerald-100 text-emerald-800" },
  deepseek:  { label: "DeepSeek", color: "bg-blue-100 text-blue-800" },
};

export default function ModelConfigPage() {
  const [agents, setAgents]       = useState<AgentRow[]>([]);
  const [models, setModels]       = useState<ModelOption[]>([]);
  const [keyStatus, setKeyStatus] = useState<ProviderKeyStatus>({ anthropic: true, openai: false, deepseek: false });
  const [loading, setLoading]     = useState(true);
  const [edits, setEdits]         = useState<Record<string, { model: string; provider: Provider; maxTokens: number; notes: string }>>({});
  const [saving, setSaving]       = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/admin/model-config");
    const data = await res.json();
    setAgents(data.agents ?? []);
    setModels(data.availableModels ?? []);
    setKeyStatus(data.providerKeyStatus ?? { anthropic: true, openai: false, deepseek: false });
    const initial: typeof edits = {};
    for (const a of (data.agents ?? [])) {
      initial[a.agent] = { model: a.model, provider: a.provider, maxTokens: a.maxTokens, notes: a.notes ?? "" };
    }
    setEdits(initial);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function patchModel(agent: string, modelId: string) {
    const meta = models.find((m) => m.id === modelId);
    setEdits((prev) => ({
      ...prev,
      [agent]: { ...prev[agent], model: modelId, provider: meta?.provider ?? prev[agent].provider },
    }));
  }

  function patch(agent: string, field: "maxTokens" | "notes", value: string | number) {
    setEdits((prev) => ({ ...prev, [agent]: { ...prev[agent], [field]: value } }));
  }

  async function save(agent: string) {
    setSaving((s) => ({ ...s, [agent]: true }));
    try {
      const e    = edits[agent];
      const body = { agent, model: e.model, provider: e.provider, maxTokens: Number(e.maxTokens), notes: e.notes };
      const res  = await fetch("/api/admin/model-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Save failed");
      toast({ title: "Saved", description: `${agent} → ${e.model} (${PROVIDER_STYLE[e.provider]?.label ?? e.provider})` });
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
    return e.model !== a.model || e.provider !== a.provider || e.maxTokens !== a.maxTokens || e.notes !== (a.notes ?? "");
  }

  function reset(a: AgentRow) {
    setEdits((prev) => ({ ...prev, [a.agent]: { model: a.model, provider: a.provider, maxTokens: a.maxTokens, notes: a.notes ?? "" } }));
  }

  // Group models by provider for the <select> optgroup display
  const modelsByProvider = models.reduce<Record<string, ModelOption[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});
  const providerOrder: Provider[] = ["anthropic", "openai", "deepseek"];

  const missingKeys = (Object.keys(keyStatus) as Provider[]).filter((p) => !keyStatus[p]);

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="w-5 h-5 text-[#006E74]" />
          <h1 className="text-xl font-bold text-slate-900">Model Router</h1>
        </div>
        <p className="text-slate-500 text-sm">
          Configure which AI model each agent uses. Supports Anthropic Claude, OpenAI GPT, and DeepSeek — changes take effect immediately.
        </p>
      </div>

      {/* Provider key warnings */}
      {missingKeys.length > 0 && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">API keys not configured</p>
            {missingKeys.map((p) => (
              <p key={p} className="text-xs">
                <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-semibold mr-1", PROVIDER_STYLE[p].color)}>
                  {PROVIDER_STYLE[p].label}
                </span>
                Set <code className="bg-amber-100 px-1 rounded text-xs">{p === "openai" ? "OPENAI_API_KEY" : p === "deepseek" ? "DEEPSEEK_API_KEY" : "ANTHROPIC_API_KEY"}</code> in your environment to enable this provider.
              </p>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((a) => {
            const e    = edits[a.agent] ?? { model: a.model, provider: a.provider, maxTokens: a.maxTokens, notes: a.notes ?? "" };
            const meta = models.find((m) => m.id === e.model);
            const tier = meta?.tier ?? "";
            const dirty = isDirty(a);
            const keyMissing = !keyStatus[e.provider];

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
                      {a.isDefault && !dirty && <span className="text-xs text-slate-400 italic">default</span>}
                      {dirty && <span className="text-xs text-[#006E74] font-medium">unsaved changes</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{a.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {e.provider && (
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", PROVIDER_STYLE[e.provider]?.color)}>
                        {PROVIDER_STYLE[e.provider]?.label}
                      </span>
                    )}
                    {tier && (
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", TIER_STYLE[tier]?.color ?? "bg-slate-100 text-slate-600")}>
                        {tier}
                      </span>
                    )}
                    {keyMissing && (
                      <span title="API key not set — calls will fail" className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> No key
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-3 items-end">
                  {/* Model selector — grouped by provider */}
                  <div className="col-span-5 space-y-1">
                    <label className="text-xs font-medium text-slate-600">Model</label>
                    <select
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#006E74] bg-white"
                      value={e.model}
                      onChange={(ev) => patchModel(a.agent, ev.target.value)}
                    >
                      {providerOrder.map((prov) => {
                        const provModels = modelsByProvider[prov];
                        if (!provModels?.length) return null;
                        return (
                          <optgroup key={prov} label={`── ${PROVIDER_STYLE[prov].label} ──`}>
                            {provModels.map((m) => (
                              <option key={m.id} value={m.id}>{m.label} [{m.tier}]</option>
                            ))}
                          </optgroup>
                        );
                      })}
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
                      placeholder="e.g. switched to GPT-4o for cost"
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
        <p>Selecting a model automatically sets its provider. The provider adapter handles routing (Anthropic uses prompt caching; OpenAI/DeepSeek use standard chat completions).</p>
      </div>
    </div>
  );
}
