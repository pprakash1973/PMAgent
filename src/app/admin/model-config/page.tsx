"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { Loader2, Save, RotateCcw, Cpu, AlertTriangle, Key, Eye, EyeOff, CheckCircle2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { isModelUncertified, type AgentId } from "@/lib/model-tiers";

type Provider = "anthropic" | "openai" | "deepseek";

interface AgentRow {
  agent: string;
  label: string;
  description: string;
  model: string;
  provider: Provider;
  maxTokens: number;
  temperature: number;
  notes: string;
  updatedAt: string | null;
  updatedBy: string | null;
  isDefault: boolean;
}

interface ModelOption { id: string; label: string; provider: Provider; tier: string }
type ProviderKeyStatus = Record<Provider, boolean>;

interface ApiKeyInfo { source: "db" | "env" | "none"; masked: string | null }
type ApiKeyState = Record<Provider, ApiKeyInfo>;

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

const PROVIDER_LIST: Provider[] = ["anthropic", "openai", "deepseek"];

export default function ModelConfigPage() {
  // ── Agent model config state ────────────────────────────────────────────────
  const [agents, setAgents]       = useState<AgentRow[]>([]);
  const [models, setModels]       = useState<ModelOption[]>([]);
  const [keyStatus, setKeyStatus] = useState<ProviderKeyStatus>({ anthropic: true, openai: false, deepseek: false });
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [edits, setEdits]         = useState<Record<string, { model: string; provider: Provider; maxTokens: number; temperature: number; notes: string }>>({});
  const [saving, setSaving]       = useState<Record<string, boolean>>({});

  // ── API Keys state ───────────────────────────────────────────────────────────
  const [apiKeys, setApiKeys]       = useState<ApiKeyState | null>(null);
  const [keyInputs, setKeyInputs]   = useState<Record<Provider, string>>({ anthropic: "", openai: "", deepseek: "" });
  const [keyVisible, setKeyVisible] = useState<Record<Provider, boolean>>({ anthropic: false, openai: false, deepseek: false });
  const [keySaving, setKeySaving]   = useState<Record<Provider, boolean>>({ anthropic: false, openai: false, deepseek: false });
  const [keysLoading, setKeysLoading] = useState(true);

  // Safe JSON fetch — never throws on empty/non-JSON body, returns null instead
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function safeFetch(url: string, opts?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
    const res  = await fetch(url, opts);
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null;
    try { if (text) data = JSON.parse(text); } catch { /* swallow parse errors */ }
    return { ok: res.ok, status: res.status, data };
  }

  const loadApiKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      const { ok, data } = await safeFetch("/api/admin/api-keys");
      if (ok && data?.keys) setApiKeys(data.keys);
    } catch {
      // silent — display is best-effort
    } finally {
      setKeysLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { ok, data } = await safeFetch("/api/admin/model-config");
      if (!ok || !data) {
        setLoadError(data?.error?.message || "Failed to load model config. Check server logs.");
        return;
      }
      setAgents(data.agents ?? []);
      setModels(data.availableModels ?? []);
      setKeyStatus(data.providerKeyStatus ?? { anthropic: true, openai: false, deepseek: false });
      const initial: typeof edits = {};
      for (const a of (data.agents ?? [])) {
        initial[a.agent] = { model: a.model, provider: a.provider, maxTokens: a.maxTokens, temperature: a.temperature ?? 0, notes: a.notes ?? "" };
      }
      setEdits(initial);
    } catch (err: unknown) {
      setLoadError((err as Error).message || "Unexpected error loading model config.");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); loadApiKeys(); }, [load, loadApiKeys]);

  async function saveApiKey(provider: Provider) {
    const val = keyInputs[provider].trim();
    if (!val) return;
    setKeySaving((s) => ({ ...s, [provider]: true }));
    try {
      const { ok, data } = await safeFetch("/api/admin/api-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: val }),
      });
      if (!ok) throw new Error(data?.error?.message || "Save failed");

      // Update UI immediately — don't wait for refresh to clear the input and badges
      toast({ title: "API key saved", description: `${PROVIDER_STYLE[provider].label} key stored securely.` });
      setKeyInputs((prev) => ({ ...prev, [provider]: "" }));
      setKeyStatus((prev) => ({ ...prev, [provider]: true }));
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setKeySaving((s) => ({ ...s, [provider]: false }));
    }
    // Refresh silently after confirmed save — error here never reaches the user
    try { await loadApiKeys(); } catch { /* silent */ }
  }

  // ── Agent config helpers ────────────────────────────────────────────────────
  function patchModel(agent: string, modelId: string) {
    const meta = models.find((m) => m.id === modelId);
    setEdits((prev) => ({
      ...prev,
      [agent]: { ...prev[agent], model: modelId, provider: meta?.provider ?? prev[agent].provider },
    }));
  }

  function patch(agent: string, field: "maxTokens" | "temperature" | "notes", value: string | number) {
    setEdits((prev) => ({ ...prev, [agent]: { ...prev[agent], [field]: value } }));
  }

  async function save(agent: string) {
    setSaving((s) => ({ ...s, [agent]: true }));
    try {
      const e          = edits[agent];
      const body       = { agent, model: e.model, provider: e.provider, maxTokens: Number(e.maxTokens), temperature: Number(e.temperature), notes: e.notes };
      const { ok, data } = await safeFetch("/api/admin/model-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!ok) throw new Error(data?.error?.message || "Save failed");
      toast({ title: "Saved", description: `${agent} → ${e.model} (${PROVIDER_STYLE[e.provider]?.label ?? e.provider})` });
      try { await load(); } catch { /* silent refresh */ }
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving((s) => ({ ...s, [agent]: false }));
    }
  }

  function isDirty(a: AgentRow) {
    const e = edits[a.agent];
    if (!e) return false;
    return e.model !== a.model || e.provider !== a.provider || e.maxTokens !== a.maxTokens || e.temperature !== (a.temperature ?? 0) || e.notes !== (a.notes ?? "");
  }

  function reset(a: AgentRow) {
    setEdits((prev) => ({ ...prev, [a.agent]: { model: a.model, provider: a.provider, maxTokens: a.maxTokens, temperature: a.temperature ?? 0, notes: a.notes ?? "" } }));
  }

  const modelsByProvider = models.reduce<Record<string, ModelOption[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});
  const providerOrder: Provider[] = ["anthropic", "openai", "deepseek"];

  // Derive key presence from apiKeys (always accurate) — fall back to keyStatus from model-config GET
  const effectiveKeyStatus: ProviderKeyStatus = apiKeys
    ? {
        anthropic: apiKeys.anthropic?.source !== "none",
        openai:    apiKeys.openai?.source    !== "none",
        deepseek:  apiKeys.deepseek?.source  !== "none",
      }
    : keyStatus;

  const missingKeys = (Object.keys(effectiveKeyStatus) as Provider[]).filter((p) => !effectiveKeyStatus[p]);

  return (
    <div className="p-8 max-w-5xl">
      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="w-5 h-5 text-[#006E74]" />
          <h1 className="text-xl font-bold text-slate-900">Model Router</h1>
        </div>
        <p className="text-slate-500 text-sm">
          Configure which AI model each agent uses. Supports Anthropic Claude, OpenAI GPT, and DeepSeek — changes take effect immediately.
        </p>
      </div>

      {/* ── API Keys panel ── */}
      <div className="mb-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
          <Key className="w-4 h-4 text-[#006E74]" />
          <span className="font-semibold text-slate-900 text-sm">API Keys</span>
          <span className="text-xs text-slate-400 ml-1">— keys saved here take priority over environment variables</span>
        </div>

        {keysLoading ? (
          <div className="flex items-center gap-2 text-slate-400 px-5 py-4 text-sm">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {PROVIDER_LIST.map((provider) => {
              const info    = apiKeys?.[provider];
              const isSaving = keySaving[provider];
              const inputVal = keyInputs[provider];
              const visible  = keyVisible[provider];

              return (
                <div key={provider} className="px-5 py-4 flex items-center gap-4 flex-wrap">
                  {/* Provider badge */}
                  <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 w-24 text-center", PROVIDER_STYLE[provider].color)}>
                    {PROVIDER_STYLE[provider].label}
                  </span>

                  {/* Current key status */}
                  <div className="flex items-center gap-1.5 min-w-[200px]">
                    {info?.source === "db" && (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="text-xs font-mono text-slate-600">{info.masked}</span>
                        <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">DB</span>
                      </>
                    )}
                    {info?.source === "env" && (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="text-xs font-mono text-slate-600">{info.masked}</span>
                        <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded font-medium">ENV</span>
                      </>
                    )}
                    {info?.source === "none" && (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="text-xs text-slate-400 italic">Not configured</span>
                      </>
                    )}
                  </div>

                  {/* Key input */}
                  <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                    <div className="relative flex-1">
                      <Input
                        type={visible ? "text" : "password"}
                        placeholder={info?.source !== "none" ? "Paste new key to replace…" : "Paste API key…"}
                        value={inputVal}
                        onChange={(ev) => setKeyInputs((prev) => ({ ...prev, [provider]: ev.target.value }))}
                        className="text-sm pr-9 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setKeyVisible((prev) => ({ ...prev, [provider]: !prev[provider] }))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        tabIndex={-1}
                      >
                        {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      className="h-9 bg-[#006E74] hover:bg-[#004f54] shrink-0"
                      disabled={!inputVal.trim() || isSaving}
                      onClick={() => saveApiKey(provider)}
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                      Save
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Missing key warnings (only for providers with no key at all) ── */}
      {missingKeys.length > 0 && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">Providers without API keys — agents using these will fail</p>
            {missingKeys.map((p) => (
              <p key={p} className="text-xs">
                <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-semibold mr-1", PROVIDER_STYLE[p].color)}>
                  {PROVIDER_STYLE[p].label}
                </span>
                Paste the key in the API Keys panel above.
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── Agent list ── */}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : loadError ? (
        <div className="py-8 text-center space-y-3">
          <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
          <p className="text-sm text-slate-600">{loadError}</p>
          <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((a) => {
            const e    = edits[a.agent] ?? { model: a.model, provider: a.provider, maxTokens: a.maxTokens, temperature: a.temperature ?? 0, notes: a.notes ?? "" };
            const meta = models.find((m) => m.id === e.model);
            const tier = meta?.tier ?? "";
            const dirty = isDirty(a);
            const keyMissing    = !effectiveKeyStatus[e.provider];
            const uncertified   = isModelUncertified(a.agent as AgentId, e.model);

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
                    {uncertified && (
                      <span title="This model has no compliance evidence for this agent — guardrail accuracy unverified" className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" /> Uncertified
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-3 items-end">
                  {/* Model selector */}
                  <div className="col-span-4 space-y-1">
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
                  <div className="col-span-4 space-y-1">
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
        <p>API keys saved above are stored in the database and take priority over environment variables. Selecting a model automatically sets its provider.</p>
      </div>
    </div>
  );
}
