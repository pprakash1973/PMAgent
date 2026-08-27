"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toaster";
import {
  FileText, Presentation, Users, Target, Network, Flag, Coins, AlertTriangle,
  ShieldAlert, MessageSquare, Grid3x3, BadgeCheck, ClipboardList, AlertCircle,
  Gavel, FileBarChart, RefreshCw, GraduationCap, FileCheck, TrendingUp, ScrollText,
  Wand2, Loader2, Eye, EyeOff, Download, Upload, Trash2, MoreHorizontal, Check, Lock,
  History, Plus,
} from "lucide-react";
import { ArtifactDocument } from "@/components/artifact-document";
import { ArtifactVersionRail } from "@/components/artifact-version-rail";
import { ARTIFACT_FORMAT } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Artifact = { id: string; artifactType: string; phase: string; status: string; content: any; currentVersion?: number; versions?: Array<{ appliedTemplateId?: string | null }> };
type Selection = { artifactType: string; selectionStatus: string };
type CatalogEntry = { type: string; label: string; phase: string; mandatory?: boolean };

const C = {
  primary: "#006E74", primaryLight: "rgba(0,110,116,.08)", primaryBorder: "rgba(0,110,116,.25)",
  primaryAlt: "#0097AC",
  petrol: "#003C51",
  border: "#e2e5ea", borderLight: "#eceef2",
  surface: "#fff", surface2: "#f7f8fa",
  text: "#231F20", text2: "#5b616e", text3: "#8a909c", textMuted: "#a8adb8",
  green: "#01B27C", greenLight: "#e3f3ea",
  amber: "#c17d12", amberLight: "#fbf0da",
  red: "#cf3f3a", redLight: "#fbe4e2",
  teal: "#006E74", tealLight: "rgba(0,110,116,.06)", tealBorder: "rgba(0,110,116,.2)",
  slate: "#475569", slateLight: "#f8fafc", slateBorder: "#cbd5e1",
};

const PHASES = [
  { id: "initiation", label: "Initiation", dot: "#f59e0b", pill: { bg: "#fef3c7", color: "#92400e" } },
  { id: "planning",   label: "Planning",   dot: "#3b82f6", pill: { bg: "#dbeafe", color: "#1d4ed8" } },
  { id: "execution",  label: "Execution",  dot: "#22c55e", pill: { bg: "#dcfce7", color: "#15803d" } },
  { id: "monitoring", label: "Monitoring", dot: "#a855f7", pill: { bg: "#f3e8ff", color: "#7e22ce" } },
  { id: "closure",    label: "Closure",    dot: "#ef4444", pill: { bg: "#fee2e2", color: "#b91c1c" } },
];

const PHASE_GROUPS = [
  { id: "initiation",            label: "Initiation",             color: "#f59e0b", bg: "rgba(245,158,11,.05)",  phases: ["initiation"] },
  { id: "planning",              label: "Planning",               color: "#3b82f6", bg: "rgba(59,130,246,.05)",  phases: ["planning"] },
  { id: "execution_monitoring",  label: "Execution & Monitoring", color: "#22c55e", bg: "rgba(34,197,94,.05)",   phases: ["execution", "monitoring"] },
  { id: "closure",               label: "Closure",                color: "#ef4444", bg: "rgba(239,68,68,.05)",   phases: ["closure"] },
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
  dependencies_register: Network, quarterly_business_review: Presentation,
};

const GOVERNANCE_LOCKED = new Set(["wbs", "resource_plan", "cost_plan", "raci_matrix", "traceability_matrix"]);

const STAGE_LABELS = ["Draft", "Generated", "Reviewed", "Approved"];

function stageOf(artifact: Artifact | undefined, isGen: boolean): number {
  if (isGen) return 1;
  if (!artifact) return 0;
  const s = (artifact.status ?? "draft").toLowerCase();
  if (s === "approved") return 4;
  if (s === "reviewed" || s === "in_review") return 3;
  return 2;
}

function stageText(stage: number, isGen: boolean): { label: string; color: string } {
  if (isGen) return { label: "Generating…", color: C.primaryAlt };
  switch (stage) {
    case 4: return { label: "✓ Approved", color: C.green };
    case 3: return { label: "◐ In review", color: C.primaryAlt };
    case 2: return { label: "✓ Generated", color: C.green };
    default: return { label: "Not started", color: C.text3 };
  }
}

const PANEL_CSS = `
.art-panel{container-type:inline-size}
.art-card{transition:box-shadow .18s,transform .18s,border-color .18s}
.art-card:hover{box-shadow:0 2px 6px rgba(16,38,48,.09),0 10px 24px rgba(16,38,48,.09);transform:translateY(-2px)}
@keyframes art-pulse{0%,100%{opacity:1}50%{opacity:.28}}
.art-seg-now{animation:art-pulse 1.3s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.art-card:hover{transform:none}.art-seg-now{animation:none}}
`;

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
  const [versionRailFor, setVersionRailFor] = useState<{ id: string; type: string; currentVersion: number } | null>(null);

  // Phase-lane selection state — persisted to DB via /artifacts/selections.
  // Only count records with selectionStatus "selected" (explicitly chosen via the modal).
  // "active" records created by the generate/batch routes are shown via localArtifacts, not here.
  const [localSelections, setLocalSelections] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const sel of selections) {
      if (sel.selectionStatus === "selected") s.add(sel.artifactType);
    }
    for (const a of artifacts) s.add(a.artifactType);
    return s;
  });
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [modalPicks, setModalPicks] = useState<Set<string>>(new Set());
  const [savingSelections, setSavingSelections] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
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

  // Sync newly generated artifacts into localSelections so they always appear
  useEffect(() => {
    setLocalSelections((prev) => {
      const next = new Set(prev);
      for (const a of localArtifacts) next.add(a.artifactType);
      return next;
    });
  }, [localArtifacts]);

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
      // Non-SSE error response (auth, validation, guardrail)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error?.message ?? data?.error ?? `Generation failed (${res.status})`;
        setGuardrailErrors((prev) => ({ ...prev, [artifactType]: msg }));
        return;
      }
      // Parse SSE stream — tokens arrive as {chunk}, final result as {done, artifact}
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.error) {
              setGuardrailErrors((prev) => ({ ...prev, [artifactType]: json.error }));
              break outer;
            }
            if (json.done && json.artifact) {
              setGuardrailErrors((prev) => { const n = { ...prev }; delete n[artifactType]; return n; });
              setLocalArtifacts((prev) => {
                const idx = prev.findIndex((a) => a.artifactType === artifactType);
                if (idx >= 0) { const copy = [...prev]; copy[idx] = json.artifact; return copy; }
                return [...prev, json.artifact];
              });
              toast({ title: "Artifact generated", description: `${artifactType.replace(/_/g, " ")} is ready` });
              router.refresh();
              break outer;
            }
          } catch { /* skip malformed events */ }
        }
      }
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

  function openModal(groupId: string) {
    const group = PHASE_GROUPS.find((g) => g.id === groupId)!;
    const groupTypes = catalog.filter((c) => group.phases.includes(c.phase)).map((c) => c.type);
    const currentPicks = groupTypes.filter((t) => localSelections.has(t));
    // Edit mode (lane already has items): pre-populate current selections.
    // Add mode (empty lane): start with nothing checked so PM consciously picks.
    setModalPicks(new Set(currentPicks));
    setActiveModal(groupId);
  }

  async function applySelections(groupId: string) {
    const group = PHASE_GROUPS.find((g) => g.id === groupId)!;
    const allGroupTypes = catalog.filter((c) => group.phases.includes(c.phase)).map((c) => c.type);
    const toAdd = allGroupTypes.filter((t) => modalPicks.has(t));
    const toRemove = allGroupTypes.filter(
      (t) => !modalPicks.has(t) && !localArtifacts.some((a) => a.artifactType === t)
    );
    setSavingSelections(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/selections`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ add: toAdd, remove: toRemove }),
      });
      if (!res.ok) throw new Error("Failed");
      setLocalSelections((prev) => {
        const next = new Set(prev);
        toAdd.forEach((t) => next.add(t));
        toRemove.forEach((t) => next.delete(t));
        return next;
      });
      setActiveModal(null);
      if (toAdd.length > 0) {
        toast({ title: `${toAdd.length} artifact${toAdd.length !== 1 ? "s" : ""} added to plan` });
      }
    } catch {
      toast({ title: "Failed to save selections", variant: "destructive" });
    } finally {
      setSavingSelections(false);
    }
  }

  // ── Inline components ──────────────────────────────────────────────────────

  function ExpandedViewer({ entryType }: { entryType: string }) {
    const art = localArtifacts.find((a) => a.artifactType === entryType);
    const ent = catalog.find((c) => c.type === entryType);
    if (!art?.content || !ent) return null;
    return (
      <div style={{ margin: "0 16px 14px", border: `1.5px solid #1a1d24`, borderRadius: 10, overflow: "hidden" }}>
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
  }

  function ArtifactMiniCard({ entry }: { entry: CatalogEntry }) {
    const artifact = localArtifacts.find((a) => a.artifactType === entry.type);
    const isGen = generating.has(entry.type);
    const isDel = deleting === entry.type;
    const isUp = uploading === entry.type;
    const format = (ARTIFACT_FORMAT[entry.type] ?? "docx").toUpperCase();
    const Icon = ARTIFACT_ICON[entry.type] ?? FileText;
    const isExpandedCard = expanded === entry.type;
    const isLocked = engagementMode === "high_level" && GOVERNANCE_LOCKED.has(entry.type);
    const stage = stageOf(artifact, isGen);
    const status = stageText(stage, isGen);
    const rail = PHASES.find((p) => p.id === entry.phase)?.dot ?? C.primary;
    const idle = !artifact && !isGen;
    const guardrail = guardrailErrors[entry.type];
    const hasCustomTemplate = !!artifact?.versions?.[0]?.appliedTemplateId;

    const segStyle = (i: number): React.CSSProperties => {
      const base: React.CSSProperties = { flex: 1, height: 4, borderRadius: 99, background: "#e5e7eb", transition: "background .4s" };
      if (isGen && i === 1) return { ...base, background: C.primaryAlt };
      if (stage >= 2) return { ...base, background: stage === 4 ? C.green : C.primary };
      if (i < stage) return { ...base, background: C.primary };
      return base;
    };

    return (
      <div
        className="art-card"
        style={{
          display: "grid", gridTemplateColumns: "4px minmax(0,1fr)",
          borderRadius: 12, position: "relative",
          flex: "0 0 220px",
          background: idle ? "transparent" : C.surface,
          border: idle ? `1.5px dashed ${C.border}` : `1.5px solid ${C.border}`,
          boxShadow: idle ? "none" : "0 1px 2px rgba(16,38,48,.06), 0 3px 10px rgba(16,38,48,.05)",
          outline: isExpandedCard ? `2px solid ${C.primary}` : "none", outlineOffset: 2,
          opacity: isDel ? 0.5 : 1,
        }}
      >
        <div style={{ background: idle ? C.border : rail, borderRadius: "10px 0 0 10px" }} />

        <div style={{ padding: "11px 12px 10px", minWidth: 0 }}>
          {/* Row 1 — icon, title, format */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: idle ? C.surface2 : "rgba(0,110,116,.09)" }}>
              <Icon style={{ width: 15, height: 15, color: idle ? C.text3 : C.primary }} />
            </div>
            <span
              title={entry.label}
              style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25, flex: 1, minWidth: 0, color: idle ? C.text2 : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >{entry.label}</span>
            <span style={{ fontSize: 9, fontWeight: 700, flexShrink: 0, padding: "2px 4px", borderRadius: 3, background: artifact ? C.primary : "#e5e7eb", color: artifact ? "#fff" : C.text3 }}>{format}</span>
          </div>

          {/* Lifecycle stepper */}
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }} role="img" aria-label={isLocked ? "Governance locked" : `${STAGE_LABELS[Math.max(0, stage - 1)]} — stage ${stage} of 4`}>
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={isGen && i === 1 ? "art-seg-now" : undefined} style={segStyle(i)} />
            ))}
          </div>

          {/* Status line */}
          <div style={{ fontSize: 10.5, fontWeight: 600, marginBottom: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isLocked ? C.amber : status.color }}>
            {isLocked ? "🔒 Governance locked" : isUp ? "Merging upload…" : <>{isGen ? <GeneratingLine hasCustomTemplate={hasCustomTemplate} /> : status.label}</>}
          </div>

          {guardrail && (
            <div style={{ fontSize: 10, color: C.red, lineHeight: 1.35, marginBottom: 8 }}>{guardrail}</div>
          )}

          {hasCustomTemplate && (
            <div style={{ marginBottom: 7 }}>
              <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 10, background: "rgba(0,110,116,.1)", color: C.teal, border: `1px solid rgba(0,110,116,.2)`, letterSpacing: "0.02em" }}>⚡ Custom template</span>
            </div>
          )}

          {/* Footer — actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
            {isLocked ? (
              <button disabled style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.text3, cursor: "not-allowed" }}>Locked</button>
            ) : isGen ? (
              <Loader2 className="animate-spin" style={{ width: 14, height: 14, color: C.primaryAlt }} />
            ) : artifact ? (
              <>
                <button onClick={() => setExpanded(isExpandedCard ? null : entry.type)} style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.primary}`, background: "transparent", color: C.primary, cursor: "pointer" }}>{isExpandedCard ? "Hide" : "View"}</button>
                <button title="Download" aria-label="Download" onClick={() => triggerDownload(`/api/projects/${projectId}/artifacts/${entry.type}/export`)} style={{ display: "flex", padding: "4px 5px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.text2, cursor: "pointer" }}><Download style={{ width: 12, height: 12 }} /></button>
                <span style={{ position: "relative", display: "flex" }}>
                  <button
                    title="More" aria-label="More actions" aria-expanded={menuFor === entry.type}
                    onClick={() => setMenuFor(menuFor === entry.type ? null : entry.type)}
                    style={{ display: "flex", padding: "4px 5px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.text3, cursor: "pointer" }}
                  ><MoreHorizontal style={{ width: 12, height: 12 }} /></button>
                  {menuFor === entry.type && (
                    <>
                      <div onClick={() => setMenuFor(null)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                      <div style={{ position: "absolute", right: 0, bottom: "calc(100% + 6px)", zIndex: 41, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, boxShadow: "0 8px 26px rgba(0,0,0,.14)", padding: 5, minWidth: 178, textAlign: "left" }}>
                        <MenuItem icon={<Upload style={{ width: 13, height: 13 }} />} label={isUp ? "Merging…" : "Upload new version"} onClick={() => handleUploadClick(entry.type)} disabled={!!uploading} />
                        <MenuItem icon={<RefreshCw style={{ width: 13, height: 13 }} />} label="Regenerate" onClick={() => generate(entry.type)} />
                        <MenuItem icon={<History style={{ width: 13, height: 13 }} />} label="Version history" onClick={() => { setMenuFor(null); if (artifact) setVersionRailFor({ id: artifact.id, type: entry.type, currentVersion: artifact.currentVersion ?? 1 }); }} />
                        <MenuItem icon={<Trash2 style={{ width: 13, height: 13 }} />} label="Delete" onClick={() => deleteArtifact(entry.type)} disabled={!!deleting} danger />
                      </div>
                    </>
                  )}
                </span>
              </>
            ) : (
              <>
                <button onClick={() => generate(entry.type)} style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 8px", borderRadius: 5, border: "none", background: C.primary, color: "#fff", cursor: "pointer" }}>
                  Generate
                </button>
                <button title="Upload existing" aria-label="Upload existing" disabled={!!uploading} onClick={() => handleUploadClick(entry.type)} style={{ display: "flex", padding: "4px 5px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.text2, cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.5 : 1 }}><Upload style={{ width: 12, height: 12 }} /></button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const generatedCount = localArtifacts.length;

  return (
    <div ref={panelRef} className="art-panel" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, position: "relative" }}>
      <style>{PANEL_CSS}</style>
      <input ref={fileInputRef} type="file" style={{ display: "none" }} accept=".xlsx,.xls,.csv,.pdf,.docx,.pptx,.txt" onChange={handleFileChange} />

      {/* Header */}
      <div style={{ padding: "13px 16px 11px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Project Artifacts</div>
        <div style={{ fontSize: 12, color: C.text3 }}>{generatedCount} generated · {localSelections.size} planned</div>
      </div>

      {/* ── Phase Lanes ── */}
      {PHASE_GROUPS.map((group) => {
        const groupEntries = catalog.filter((c) => group.phases.includes(c.phase));
        const laneEntries = groupEntries.filter((e) => localSelections.has(e.type));
        const isEmpty = laneEntries.length === 0;

        return (
          <div key={group.id} style={{ borderBottom: `1px solid ${C.border}` }}>
            {/* Lane header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: group.bg }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: group.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{group.label}</span>
              {laneEntries.length > 0 && (
                <span style={{ fontSize: 11, color: C.text3 }}>
                  {laneEntries.length} artifact{laneEntries.length !== 1 ? "s" : ""}
                </span>
              )}
              <button
                onClick={() => openModal(group.id)}
                style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.primaryBorder}`, background: "transparent", color: C.primary, cursor: "pointer" }}
              >
                <Plus style={{ width: 12, height: 12 }} />
                {laneEntries.length > 0 ? "Edit" : "Add"}
              </button>
            </div>

            {/* Lane body */}
            {isEmpty ? (
              <button
                onClick={() => openModal(group.id)}
                style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "32px 0", cursor: "pointer", background: "transparent", border: "none" }}
              >
                <div style={{ width: 52, height: 52, borderRadius: "50%", border: `2px dashed ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Plus style={{ width: 22, height: 22, color: C.textMuted }} />
                </div>
                <span style={{ fontSize: 13, color: C.textMuted }}>
                  Select {group.label.toLowerCase()} artifacts
                </span>
              </button>
            ) : (
              <div style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 10 }}>
                {laneEntries.map((entry) => <ArtifactMiniCard key={entry.type} entry={entry} />)}
              </div>
            )}

            {/* Expanded viewer anchored to this lane */}
            {expanded && laneEntries.some((e) => e.type === expanded) && (
              <ExpandedViewer entryType={expanded} />
            )}
          </div>
        );
      })}

      {/* Version history rail */}
      {versionRailFor && (
        <ArtifactVersionRail
          artifactId={versionRailFor.id}
          artifactType={versionRailFor.type}
          currentVersion={versionRailFor.currentVersion}
          onClose={() => setVersionRailFor(null)}
          onRestored={() => { router.refresh(); setVersionRailFor(null); }}
        />
      )}

      {/* ── Selection modal ── */}
      {activeModal && (() => {
        const group = PHASE_GROUPS.find((g) => g.id === activeModal)!;
        const groupEntries = catalog.filter((c) => group.phases.includes(c.phase));
        return (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => { if (!savingSelections) setActiveModal(null); }}
          >
            <div
              style={{ background: C.surface, borderRadius: 14, width: 460, maxWidth: "92vw", maxHeight: "78vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,.22)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: group.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{group.label} Artifacts</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.text3, marginTop: 3, paddingLeft: 18 }}>Select artifacts to plan and track in this phase</div>
                </div>
                <button onClick={() => setActiveModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.text3, fontSize: 20, lineHeight: 1, padding: 0, marginTop: 2 }}>×</button>
              </div>

              {/* Artifact list */}
              <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
                {groupEntries.map((entry) => {
                  const isChecked = modalPicks.has(entry.type);
                  const isGenerated = localArtifacts.some((a) => a.artifactType === entry.type);
                  return (
                    <label
                      key={entry.type}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${(isChecked || isGenerated) ? C.primaryBorder : C.border}`, background: (isChecked || isGenerated) ? C.primaryLight : "transparent", cursor: isGenerated ? "default" : "pointer", transition: "border-color .15s, background .15s" }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked || isGenerated}
                        disabled={isGenerated}
                        onChange={() => {
                          if (isGenerated) return;
                          setModalPicks((prev) => {
                            const next = new Set(prev);
                            if (next.has(entry.type)) next.delete(entry.type);
                            else next.add(entry.type);
                            return next;
                          });
                        }}
                        style={{ width: 15, height: 15, accentColor: C.primary, flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.text }}>{entry.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, ...(entry.mandatory ? { background: "rgba(0,110,116,.1)", color: C.primary } : { background: "#f3f4f6", color: C.text3 }) }}>
                        {entry.mandatory ? "Recommended" : "Optional"}
                      </span>
                      {isGenerated && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: C.greenLight, color: C.green }}>Generated</span>
                      )}
                    </label>
                  );
                })}
              </div>

              {/* Modal footer */}
              <div style={{ padding: "14px 16px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: C.text3 }}>
                  {modalPicks.size} selected
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setActiveModal(null)} style={{ fontSize: 13, padding: "6px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.text2, cursor: "pointer" }}>Cancel</button>
                  <button
                    onClick={() => applySelections(activeModal)}
                    disabled={savingSelections}
                    style={{ fontSize: 13, fontWeight: 600, padding: "6px 20px", borderRadius: 8, border: "none", background: C.primary, color: "#fff", cursor: savingSelections ? "default" : "pointer", opacity: savingSelections ? 0.7 : 1 }}
                  >
                    {savingSelections ? "Saving…" : "Apply"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const GEN_STAGES = [
  { key: "read",            label: "Reading project",              icon: "📂", delay: 400  },
  { key: "guardrails",      label: "Checking guardrails",           icon: "🛡️", delay: 600  },
  { key: "templates",       label: "Checking for custom templates", icon: "📋", delay: 700  },
  { key: "template_result", label: "Template resolved",             icon: "📋", delay: 600  },
  { key: "ai",              label: "Sub agent working",             icon: "✨", delay: null },
  { key: "saving",          label: "Saving",                        icon: "💾", delay: 300  },
  { key: "done",            label: "Done",                          icon: "✓",  delay: null },
];

function GeneratingLine({ hasCustomTemplate }: { hasCustomTemplate?: boolean }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 0;
    for (let i = 1; i < GEN_STAGES.length - 2; i++) {
      acc += GEN_STAGES[i - 1].delay ?? 0;
      timers.push(setTimeout(() => setStage(i), acc));
    }
    return () => timers.forEach(clearTimeout);
  }, []);
  if (stage === 3) {
    return <>{hasCustomTemplate ? "Reading custom template…" : "Using default prompt…"}</>;
  }
  return <>{GEN_STAGES[stage].label}…</>;
}

function GenerationProgress({ label, isRegen }: { label: string; isRegen: boolean }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    setStage(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 0;
    for (let i = 1; i < GEN_STAGES.length - 2; i++) {
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
      border: `1.5px dashed rgba(0,151,172,.5)`,
      borderRadius: 12, padding: "14px 12px",
      background: "rgba(0,151,172,.04)",
      display: "flex", flexDirection: "column", alignItems: "stretch",
      minHeight: 120,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1d24", marginBottom: 2, textAlign: "center" }}>
        {isRegen ? "Regenerating" : "Generating"} {label}
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 14, textAlign: "center" }}>
        {currentStage.label}…
      </div>

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
                background: isDone ? "#006E74" : isActive ? "#0097AC" : "#e5e7eb",
                color: isDone || isActive ? "#fff" : "#9ca3af",
                boxShadow: isActive ? "0 0 0 4px rgba(0,151,172,0.2)" : "none",
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

      <div style={{ height: 4, borderRadius: 99, background: "#e5e7eb", overflow: "hidden", marginBottom: 6 }}>
        <div style={{
          height: "100%", borderRadius: 99,
          background: "linear-gradient(90deg, #006E74, #0097AC)",
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
        @keyframes pulse-stage { 0%,100%{box-shadow:0 0 0 0 rgba(0,151,172,.3)} 50%{box-shadow:0 0 0 6px rgba(0,151,172,0)} }
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
