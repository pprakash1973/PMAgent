"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toaster";
import {
  FileText, Presentation, Users, Target, Network, Flag, Coins, AlertTriangle,
  ShieldAlert, MessageSquare, Grid3x3, BadgeCheck, ClipboardList, AlertCircle,
  Gavel, FileBarChart, RefreshCw, GraduationCap, FileCheck, TrendingUp, ScrollText,
  Wand2, Loader2, Eye, EyeOff, Download, Upload, Trash2, MoreHorizontal, Check, Lock,
} from "lucide-react";
import { ArtifactDocument } from "@/components/artifact-document";
import { ARTIFACT_FORMAT } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Artifact = { id: string; artifactType: string; phase: string; status: string; content: any };
type Selection = { artifactType: string; selectionStatus: string };
type CatalogEntry = { type: string; label: string; phase: string; mandatory?: boolean };

const C = {
  primary: "#4f5bd5", primaryLight: "#eef0fc", primaryBorder: "#cfd4f5",
  border: "#e2e5ea", borderLight: "#eceef2",
  surface: "#fff", surface2: "#f7f8fa",
  text: "#1a1d24", text2: "#5b616e", text3: "#8a909c", textMuted: "#a8adb8",
  green: "#158a5a", greenLight: "#e3f3ea",
  amber: "#c17d12", amberLight: "#fbf0da",
  red: "#cf3f3a", redLight: "#fbe4e2",
  teal: "#0f766e", tealLight: "#f0fdf4", tealBorder: "#99f6e4",
  slate: "#475569", slateLight: "#f8fafc", slateBorder: "#cbd5e1",
};

const PHASES = [
  { id: "initiation", label: "Initiation", dot: "#f59e0b", pill: { bg: "#fef3c7", color: "#92400e" } },
  { id: "planning",   label: "Planning",   dot: "#3b82f6", pill: { bg: "#dbeafe", color: "#1d4ed8" } },
  { id: "execution",  label: "Execution",  dot: "#22c55e", pill: { bg: "#dcfce7", color: "#15803d" } },
  { id: "monitoring", label: "Monitoring", dot: "#a855f7", pill: { bg: "#f3e8ff", color: "#7e22ce" } },
  { id: "closure",    label: "Closure",    dot: "#ef4444", pill: { bg: "#fee2e2", color: "#b91c1c" } },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ARTIFACT_ICON: Record<string, any> = {
  initiation_deck: Presentation, project_charter: ScrollText, business_case: FileText,
  stakeholder_register: Users, assumption_log: ClipboardList, benefits_register: TrendingUp,
  scope_statement: Target, wbs: Network, milestone_plan: Flag, resource_plan: Users,
  cost_plan: Coins, raid_register: AlertTriangle, risk_register: ShieldAlert,
  communication_plan: MessageSquare, raci_matrix: Grid3x3, quality_plan: BadgeCheck,
  action_log: ClipboardList, issue_register: AlertCircle, decision_log: Gavel,
  weekly_status: FileBarChart, monthly_status: FileBarChart, change_log: RefreshCw,
  lessons_learned: GraduationCap, closure_report: FileCheck,
  traceability_matrix: FileText, evm_analysis: TrendingUp,
};

const GOVERNANCE_LOCKED = new Set(["wbs", "resource_plan", "cost_plan", "raci_matrix", "traceability_matrix"]);

function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url; a.rel = "noopener";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

export function ArtifactPanel({
  projectId, artifacts, selections, catalog,
  currentPhase = "initiation", engagementMode = "detailed",
}: {
  projectId: string; artifacts: Artifact[]; selections: Selection[];
  catalog: CatalogEntry[]; currentPhase?: string; engagementMode?: string;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [localArtifacts, setLocalArtifacts] = useState(artifacts);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [guardrailErrors, setGuardrailErrors] = useState<Record<string, string>>({});
  const [selectedOptional, setSelectedOptional] = useState<Set<string>>(new Set());
  const [promoted, setPromoted] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/artifacts`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (Array.isArray(data)) setLocalArtifacts(data); })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    setLocalArtifacts((prev) => {
      const serverMap = new Map(artifacts.map((a: Artifact) => [a.artifactType, a]));
      const merged = [...artifacts];
      for (const local of prev) {
        if (!serverMap.has(local.artifactType)) merged.push(local);
      }
      return merged;
    });
  }, [artifacts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for Copilot-triggered regeneration events
  useEffect(() => {
    function onGenerating(e: Event) {
      const { artifactType } = (e as CustomEvent).detail;
      setGenerating((prev) => new Set(prev).add(artifactType));
      setGuardrailErrors((prev) => { const n = { ...prev }; delete n[artifactType]; return n; });
    }
    function onGenerated(e: Event) {
      const { artifactType, artifact } = (e as CustomEvent).detail;
      setGenerating((prev) => { const n = new Set(prev); n.delete(artifactType); return n; });
      if (artifact) {
        setLocalArtifacts((prev) => {
          const idx = prev.findIndex((a) => a.artifactType === artifactType);
          if (idx >= 0) { const copy = [...prev]; copy[idx] = artifact; return copy; }
          return [...prev, artifact];
        });
        router.refresh();
      }
    }
    window.addEventListener("copilot:artifact:generating", onGenerating);
    window.addEventListener("copilot:artifact:generated", onGenerated);
    return () => {
      window.removeEventListener("copilot:artifact:generating", onGenerating);
      window.removeEventListener("copilot:artifact:generated", onGenerated);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate(artifactType: string) {
    setGenerating((prev) => new Set(prev).add(artifactType));
    setMenuFor(null);
    setGuardrailErrors((prev) => { const n = { ...prev }; delete n[artifactType]; return n; });
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.message ?? data?.error ?? `Generation failed (${res.status})`;
        setGuardrailErrors((prev) => ({ ...prev, [artifactType]: msg }));
        return;
      }
      setGuardrailErrors((prev) => { const n = { ...prev }; delete n[artifactType]; return n; });
      setLocalArtifacts((prev) => {
        const existing = prev.findIndex((a) => a.artifactType === artifactType);
        if (existing >= 0) { const copy = [...prev]; copy[existing] = data; return copy; }
        return [...prev, data];
      });
      toast({ title: "Artifact generated", description: `${artifactType.replace(/_/g, " ")} is ready` });
      router.refresh();
    } catch (err: any) {
      setGuardrailErrors((prev) => ({ ...prev, [artifactType]: err.message || "Generation failed" }));
    } finally {
      setGenerating((prev) => { const n = new Set(prev); n.delete(artifactType); return n; });
    }
  }

  async function uploadArtifact(artifactType: string, file: File) {
    setUploading(artifactType);
    const isNew = !localArtifacts.some((a) => a.artifactType === artifactType);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/artifacts/${artifactType}/upload`, { method: "POST", body: form });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || "Upload failed"); }
      const artifact = await res.json();
      setLocalArtifacts((prev) => {
        const idx = prev.findIndex((a) => a.artifactType === artifactType);
        if (idx >= 0) { const copy = [...prev]; copy[idx] = artifact; return copy; }
        return [...prev, artifact];
      });
      setExpanded(artifactType);
      router.refresh();
      toast({ title: isNew ? "Artifact created from upload" : "Artifact updated", description: `AI extracted and structured ${artifactType.replace(/_/g, " ")}` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message || "Please try again", variant: "destructive" });
    } finally {
      setUploading(null);
      uploadTargetRef.current = null;
    }
  }

  async function deleteArtifact(artifactType: string) {
    const label = artifactType.replace(/_/g, " ");
    setMenuFor(null);
    if (!window.confirm(`Delete the ${label}? This removes the generated document and its version history.`)) return;
    setDeleting(artifactType);
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/${artifactType}`, { method: "DELETE" });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || "Delete failed"); }
      setLocalArtifacts((prev) => prev.filter((a) => a.artifactType !== artifactType));
      if (expanded === artifactType) setExpanded(null);
      toast({ title: "Artifact deleted", description: `${label} was removed.` });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message || "Please try again", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  }

  function handleUploadClick(artifactType: string) {
    uploadTargetRef.current = artifactType;
    setMenuFor(null);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const target = uploadTargetRef.current;
    e.target.value = "";
    if (file && target) uploadArtifact(target, file);
  }

  function handleMoveToPhase() {
    setPromoted((prev) => {
      const next = new Set(prev);
      selectedOptional.forEach((t) => next.add(t));
      return next;
    });
    const count = selectedOptional.size;
    setSelectedOptional(new Set());
    toast({ title: `${count} artifact${count !== 1 ? "s" : ""} moved to phase`, description: "They now appear in the Recommended section" });
  }

  const generatedCount = localArtifacts.length;
  const isUploading = !!uploading;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", position: "relative" }}>
      <input ref={fileInputRef} type="file" style={{ display: "none" }}
        accept=".xlsx,.xls,.csv,.pdf,.docx,.pptx,.txt" onChange={handleFileChange} />

      {/* Header */}
      <div style={{ padding: "14px 18px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Project Artifacts</div>
        <div style={{ fontSize: 12, color: C.text3 }}>{generatedCount} of {catalog.length} generated</div>
      </div>

      {/* Phase rows */}
      {PHASES.map((phase, phaseIdx) => {
        const phaseEntries = catalog.filter((c) => c.phase === phase.id);
        const phaseGenerated = phaseEntries.filter((c) => localArtifacts.find((a) => a.artifactType === c.type)).length;
        const expandedInPhase = expanded && phaseEntries.some((e) => e.type === expanded);

        return (
          <div key={phase.id}>
            {/* Phase header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px 8px" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: phase.dot, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", padding: "3px 10px", borderRadius: 20, background: phase.pill.bg, color: phase.pill.color, whiteSpace: "nowrap" }}>
                {phase.label}
              </span>
              <span style={{ fontSize: 11, color: C.text3, marginLeft: "auto" }}>{phaseGenerated} of {phaseEntries.length} generated</span>
            </div>

            {/* Cards row */}
            <div style={{ display: "flex", gap: 8, padding: "0 18px 14px", overflowX: "auto", scrollbarWidth: "thin" }}>
              {phaseEntries.map((entry) => {
                const artifact = localArtifacts.find((a) => a.artifactType === entry.type);
                const isGen = generating.has(entry.type);
                const isMandatory = entry.mandatory;
                const format = (ARTIFACT_FORMAT[entry.type] ?? "docx").toUpperCase();
                const Icon = ARTIFACT_ICON[entry.type] ?? FileText;
                const isExpandedCard = expanded === entry.type;

                return (
                  <div
                    key={entry.type}
                    style={{
                      flexShrink: 0, width: 128,
                      borderRadius: 10, padding: "11px 10px",
                      display: "flex", flexDirection: "column", alignItems: "center",
                      textAlign: "center", gap: 5, position: "relative", cursor: "pointer",
                      background: isGen ? "#f5f4ff" : C.surface,
                      border: artifact && !isGen
                        ? `1.5px solid #1a1d24`
                        : isMandatory
                          ? `1.5px dashed #374151`
                          : `1.5px dashed #d1d5db`,
                      outline: isExpandedCard ? `2px solid ${C.primary}` : "none",
                      outlineOffset: 2,
                      transition: "box-shadow .15s",
                    }}
                    onClick={() => !isGen && artifact && setExpanded(isExpandedCard ? null : entry.type)}
                  >
                    {/* Format tag */}
                    <span style={{
                      position: "absolute", top: 6, right: 6,
                      fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
                      background: artifact ? "#1a1d24" : "#e5e7eb",
                      color: artifact ? "#fff" : "#9ca3af",
                    }}>{format}</span>

                    {/* Star button */}
                    {isMandatory ? (
                      <span title="Required artifact" style={{ position: "absolute", top: 5, left: 6, fontSize: 12, color: "#f59e0b", lineHeight: 1 }}>★</span>
                    ) : (
                      <button
                        title={promoted.has(entry.type) ? "Unpin from recommended" : "Pin to recommended"}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setPromoted((prev) => {
                            const next = new Set(prev);
                            if (next.has(entry.type)) next.delete(entry.type); else next.add(entry.type);
                            return next;
                          });
                        }}
                        style={{ position: "absolute", top: 3, left: 5, fontSize: 13, lineHeight: 1, background: "none", border: "none", cursor: "pointer", color: promoted.has(entry.type) ? "#f59e0b" : "#d1d5db", padding: 0 }}
                      >{promoted.has(entry.type) ? "★" : "☆"}</button>
                    )}

                    {isGen ? (
                      <GenerationProgress label={entry.label} isRegen={!!artifact} />
                    ) : (
                      <>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, marginTop: 4,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: artifact ? "#f0f0f8" : isMandatory ? "#f3f4f6" : "#f9fafb",
                        }}>
                          <Icon style={{ width: 16, height: 16, color: artifact ? C.primary : isMandatory ? "#6b7280" : "#9ca3af" }} />
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.3, color: artifact ? C.text : isMandatory ? "#4b5563" : "#9ca3af" }}>
                          {entry.label}
                        </div>
                        {artifact ? (
                          <>
                            <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "#1a1d24", color: "#fff" }}>Generated</span>
                            <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                              <button
                                onClick={(ev) => { ev.stopPropagation(); setExpanded(isExpandedCard ? null : entry.type); }}
                                style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.text2, cursor: "pointer" }}
                              >View</button>
                              <button
                                onClick={(ev) => { ev.stopPropagation(); generate(entry.type); }}
                                style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, border: "none", background: "#1a1d24", color: "#fff", cursor: "pointer" }}
                              >↺</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: isMandatory ? "#1f2937" : "#e5e7eb", color: isMandatory ? "#f9fafb" : "#9ca3af" }}>
                              {isMandatory ? "Required" : "Optional"}
                            </span>
                            {guardrailErrors[entry.type] && (
                              <div style={{ fontSize: 9, color: C.red, lineHeight: 1.3, marginTop: 2 }}>{guardrailErrors[entry.type]}</div>
                            )}
                            <button
                              onClick={(ev) => { ev.stopPropagation(); generate(entry.type); }}
                              style={{
                                marginTop: 2, fontSize: 10, padding: "3px 9px", borderRadius: 6,
                                border: isMandatory ? "none" : `1px solid #d1d5db`,
                                background: isMandatory ? "#1a1d24" : "transparent",
                                color: isMandatory ? "#fff" : "#6b7280",
                                cursor: "pointer", fontWeight: 500,
                              }}
                            >Generate</button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Expanded artifact viewer */}
            {expandedInPhase && (() => {
              const art = localArtifacts.find((a) => a.artifactType === expanded);
              const ent = catalog.find((c) => c.type === expanded);
              if (!art?.content || !ent) return null;
              return (
                <div style={{ margin: "0 18px 14px", border: `1.5px solid #1a1d24`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: `1px solid ${C.border}`, background: "#f8f8f6" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{ent.label}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={() => triggerDownload(`/api/projects/${projectId}/artifacts/${ent.type}/export`)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.text2, cursor: "pointer" }}>Download</button>
                      <button onClick={() => setExpanded(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.text3, lineHeight: 1 }}>×</button>
                    </div>
                  </div>
                  <div style={{ padding: 16 }}>
                    <ArtifactDocument artifactType={art.artifactType} content={art.content} projectId={projectId} />
                  </div>
                </div>
              );
            })()}

            {/* Divider between phases */}
            {phaseIdx < PHASES.length - 1 && (
              <div style={{ height: 1, background: C.border, margin: "0 18px" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const GEN_STAGES = [
  { key: "read",       label: "Reading project",     icon: "📂", delay: 400  },
  { key: "guardrails", label: "Checking guardrails",  icon: "🛡️", delay: 900  },
  { key: "ai",         label: "AI drafting",          icon: "✨", delay: null }, // stays until done
  { key: "saving",     label: "Saving",               icon: "💾", delay: 300  },
  { key: "done",       label: "Done",                 icon: "✓",  delay: null },
];

function GenerationProgress({ label, isRegen }: { label: string; isRegen: boolean }) {
  const [stage, setStage] = useState(0); // index into GEN_STAGES

  useEffect(() => {
    setStage(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 0;
    for (let i = 1; i < GEN_STAGES.length - 2; i++) { // advance through read → guardrails → ai
      acc += GEN_STAGES[i - 1].delay ?? 0;
      const t = setTimeout(() => setStage(i), acc);
      timers.push(t);
    }
    return () => timers.forEach(clearTimeout);
  }, [label]);

  const currentStage = GEN_STAGES[stage];
  const stepLabel = `Step ${stage + 1} of ${GEN_STAGES.length}`;

  return (
    <div style={{
      border: `1.5px dashed #a5b4fc`,
      borderRadius: 12, padding: "14px 12px",
      background: "#f5f4ff",
      display: "flex", flexDirection: "column", alignItems: "stretch",
      minHeight: 120,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1d24", marginBottom: 2, textAlign: "center" }}>
        {isRegen ? "Regenerating" : "Generating"} {label}
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 14, textAlign: "center" }}>
        {currentStage.label}…
      </div>

      {/* Stage dots */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 12 }}>
        {GEN_STAGES.map((s, i) => {
          const isDone = i < stage;
          const isActive = i === stage;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < GEN_STAGES.length - 1 ? 1 : undefined }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11,
                background: isDone ? "#1a1d24" : isActive ? "#4f5bd5" : "#e5e7eb",
                color: isDone || isActive ? "#fff" : "#9ca3af",
                boxShadow: isActive ? "0 0 0 4px rgba(79,91,213,0.18)" : "none",
                transition: "all 0.3s ease",
                animation: isActive ? "pulse-stage 1.5s ease-in-out infinite" : "none",
              }}>
                {isDone ? "✓" : s.icon}
              </div>
              {i < GEN_STAGES.length - 1 && (
                <div style={{
                  flex: 1, height: 2, background: isDone ? "#1a1d24" : "#e5e7eb",
                  transition: "background 0.3s ease",
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 99, background: "#e5e7eb", overflow: "hidden", marginBottom: 6 }}>
        <div style={{
          height: "100%", borderRadius: 99,
          background: "linear-gradient(90deg, #4f5bd5, #2dd4bf)",
          width: stage >= GEN_STAGES.length - 2 ? "100%" : "40%",
          marginLeft: stage >= GEN_STAGES.length - 2 ? 0 : undefined,
          animation: stage < GEN_STAGES.length - 2 ? "slide-bar 1.6s ease-in-out infinite" : "none",
          transition: "width 0.4s ease",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9ca3af" }}>
        <span>{currentStage.label}…</span>
        <span>{stepLabel}</span>
      </div>

      <style>{`
        @keyframes pulse-stage { 0%,100%{box-shadow:0 0 0 0 rgba(79,91,213,.3)} 50%{box-shadow:0 0 0 6px rgba(79,91,213,0)} }
        @keyframes slide-bar { 0%{margin-left:0;width:30%} 50%{margin-left:40%;width:40%} 100%{margin-left:100%;width:0} }
      `}</style>
    </div>
  );
}

function ArtifactCard({
  entry, artifact, isGen, isUp, isDel, isExpanded, isUploading,
  menuFor, guardrailError, phaseMeta, engagementMode,
  selectable, selected, promoted,
  onGenerate, onUpload, onDelete, onToggleExpand, onToggleMenu, onCloseMenu, onDownload, onSelect,
}: {
  entry: CatalogEntry; artifact: Artifact | undefined;
  isGen: boolean; isUp: boolean; isDel: boolean; isExpanded: boolean; isUploading: boolean;
  menuFor: string | null; guardrailError?: string;
  phaseMeta: { color: string; bg: string; border: string };
  engagementMode: string;
  selectable?: boolean; selected?: boolean; promoted?: boolean;
  onGenerate: (t: string) => void; onUpload: (t: string) => void; onDelete: (t: string) => void;
  onToggleExpand: () => void; onToggleMenu: () => void; onCloseMenu: () => void; onDownload: () => void;
  onSelect?: () => void;
}) {
  const Icon = ARTIFACT_ICON[entry.type] ?? FileText;
  const format = (ARTIFACT_FORMAT[entry.type] ?? "docx").toUpperCase();
  const cardBusy = isUp || isDel;
  const isMenuOpen = menuFor === entry.type;

  if (engagementMode === "high_level" && GOVERNANCE_LOCKED.has(entry.type)) {
    return (
      <div title="Not available in Governance mode" style={{
        border: "1.5px dashed #d4d7de", borderRadius: 12, padding: "14px 12px",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center",
        minHeight: 120, background: "#f2f3f5", opacity: 0.78,
      }}>
        <Icon style={{ width: 24, height: 24, color: "#b8bcc8" }} />
        <div style={{ fontSize: 14, fontWeight: 500, color: "#9ca3b0", marginTop: 7, lineHeight: 1.25 }}>{entry.label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#b8bcc8", marginTop: 8 }}>
          <Lock style={{ width: 11, height: 11 }} /> Governance locked
        </div>
      </div>
    );
  }

  const baseCard: React.CSSProperties = {
    position: "relative", background: C.surface,
    border: `1.5px solid ${artifact && !isGen ? phaseMeta.border : C.borderLight}`,
    borderRadius: 12, padding: "12px 10px", textAlign: "center",
    minHeight: 120, display: "flex", flexDirection: "column", alignItems: "center",
    boxShadow: isExpanded ? `0 0 0 3px ${phaseMeta.bg}` : "none",
    outline: selected ? `2px solid #0f766e` : "none",
    outlineOffset: 2,
  };

  if (!artifact && isGen) {
    return <GenerationProgress label={entry.label} isRegen={false} />;
  }

  if (!artifact) {
    return (
      <div style={{ ...baseCard, border: `1.5px dashed ${phaseMeta.border}` }}>
        {selectable && <SelectBox selected={!!selected} onSelect={onSelect!} />}
        <Icon style={{ width: 24, height: 24, color: C.textMuted, marginTop: selectable ? 10 : 4 }} />
        <div style={{ fontSize: 14, fontWeight: 500, color: C.text2, marginTop: 7, lineHeight: 1.25 }}>{entry.label}</div>
        <div style={{ fontSize: 11, color: C.textMuted, margin: "3px 0 8px" }}>Not generated</div>
        {promoted && <div style={{ fontSize: 10, color: "#0f766e", marginBottom: 4, fontWeight: 500 }}>★ Added to phase</div>}
        <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" as const }}>
          <button onClick={() => onGenerate(entry.type)} style={{
            height: 26, padding: "0 9px", background: C.primary, color: "#fff", border: "none", borderRadius: 6,
            cursor: "pointer", font: `600 11px 'IBM Plex Sans',sans-serif`, display: "flex", alignItems: "center", gap: 3,
          }}>
            <Wand2 style={{ width: 11, height: 11 }} /> Generate
          </button>
          <button onClick={() => onUpload(entry.type)} disabled={isUploading} style={{
            height: 26, padding: "0 9px", background: C.surface, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 6,
            cursor: isUploading ? "default" : "pointer", font: `500 11px 'IBM Plex Sans',sans-serif`,
            display: "flex", alignItems: "center", gap: 3, opacity: isUploading ? 0.6 : 1,
          }}>
            <Upload style={{ width: 11, height: 11 }} />{isUp ? "…" : "Upload"}
          </button>
        </div>
        {guardrailError && (
          <div style={{ color: "#cf3f3a", fontWeight: 700, fontSize: 10, marginTop: 5, lineHeight: 1.4, textAlign: "center" }}>{guardrailError}</div>
        )}
      </div>
    );
  }

  // Generated card
  return (
    <div style={baseCard}>
      {selectable && <SelectBox selected={!!selected} onSelect={onSelect!} />}
      <span style={{ position: "absolute", top: 7, right: 7, fontSize: 9, fontWeight: 600, color: phaseMeta.color, background: phaseMeta.bg, border: `1px solid ${phaseMeta.border}`, borderRadius: 4, padding: "1px 4px" }}>{format}</span>
      {promoted && <span style={{ position: "absolute", top: 7, left: 7, fontSize: 9, fontWeight: 600, color: "#0f766e", background: "#f0fdf4", borderRadius: 4, padding: "1px 4px" }}>★</span>}

      {isGen && <div style={{ position: "absolute", inset: 0, borderRadius: 10, zIndex: 2 }}><GenerationProgress label={entry.label} isRegen={true} /></div>}
      <Icon style={{ width: 24, height: 24, color: isGen ? C.textMuted : C.primary, marginTop: selectable ? 10 : 4, opacity: isGen ? 0 : 1 }} />
      <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginTop: 7, lineHeight: 1.25, opacity: isGen ? 0 : 1 }}>{entry.label}</div>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, marginBottom: 8, opacity: isGen ? 0 : 1 }}>Generated</div>

      <div style={{ marginTop: "auto", display: "flex", justifyContent: "center", gap: 3 }}>
        <IconBtn title={isExpanded ? "Hide" : "View"} onClick={onToggleExpand} active={isExpanded}>
          {isExpanded ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
        </IconBtn>
        <IconBtn title="Download" onClick={onDownload}>
          <Download style={{ width: 14, height: 14 }} />
        </IconBtn>
        <IconBtn title={isGen ? "Regenerating…" : "Regenerate"} onClick={() => onGenerate(entry.type)} disabled={isGen}>
          {isGen ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <RefreshCw style={{ width: 14, height: 14 }} />}
        </IconBtn>
        <IconBtn title="More" onClick={onToggleMenu} active={isMenuOpen}>
          {isDel ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <MoreHorizontal style={{ width: 14, height: 14 }} />}
        </IconBtn>
      </div>

      {isMenuOpen && (
        <>
          <div onClick={onCloseMenu} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", top: 44, right: 6, zIndex: 41,
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9,
            boxShadow: "0 6px 20px rgba(0,0,0,.12)", padding: 5, minWidth: 152, textAlign: "left",
          }}>
            <MenuItem icon={<Upload style={{ width: 13, height: 13 }} />} label={isUp ? "Merging…" : "Upload new version"} onClick={() => onUpload(entry.type)} disabled={cardBusy} />
            <MenuItem icon={isExpanded ? <EyeOff style={{ width: 13, height: 13 }} /> : <Eye style={{ width: 13, height: 13 }} />} label={isExpanded ? "Hide document" : "View document"} onClick={() => { onToggleExpand(); onCloseMenu(); }} />
            <MenuItem icon={<Trash2 style={{ width: 13, height: 13 }} />} label="Delete" onClick={() => onDelete(entry.type)} disabled={cardBusy} danger />
          </div>
        </>
      )}
    </div>
  );
}

function SelectBox({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{
        position: "absolute", top: 7, left: 7, width: 18, height: 18,
        background: selected ? "#0f766e" : C.surface,
        border: `1.5px solid ${selected ? "#0f766e" : C.border}`,
        borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 0, zIndex: 2,
      }}
    >
      {selected && <Check style={{ width: 11, height: 11, color: "#fff" }} />}
    </button>
  );
}

function IconBtn({ children, title, onClick, disabled, active }: {
  children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; active?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} style={{
      width: 26, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
      background: active ? C.primaryLight : C.surface, color: active ? C.primary : C.text2,
      border: `1px solid ${active ? C.primaryBorder : C.border}`, borderRadius: 6,
      cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, padding: 0,
    }}>
      {children}
    </button>
  );
}

function MenuItem({ icon, label, onClick, disabled, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "6px 8px",
      background: "none", border: "none", borderRadius: 6, cursor: disabled ? "default" : "pointer",
      font: `500 12px 'IBM Plex Sans',sans-serif`, color: danger ? C.red : C.text2,
      opacity: disabled ? 0.5 : 1, textAlign: "left",
    }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = danger ? C.redLight : C.surface2; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
    >
      {icon} {label}
    </button>
  );
}
