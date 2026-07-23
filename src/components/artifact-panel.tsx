"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toaster";
import {
  FileText, Presentation, Users, Target, Network, Flag, Coins, AlertTriangle,
  ShieldAlert, MessageSquare, Grid3x3, BadgeCheck, ClipboardList, AlertCircle,
  Gavel, FileBarChart, RefreshCw, GraduationCap, FileCheck, TrendingUp, ScrollText,
  Wand2, Loader2, Eye, EyeOff, Download, Upload, Trash2, MoreHorizontal, Check, Lock,
  ArrowRight, Square, CheckSquare2,
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

const MANDATORY_COLS = [
  { id: "initiation", label: "Initiation",            phases: ["initiation"],             color: "#0F6E56", bg: "#E1F5EE", border: "#5DCAA5" },
  { id: "planning",   label: "Planning",               phases: ["planning"],               color: "#3C3489", bg: "#EEEDFE", border: "#AFA9EC" },
  { id: "exec_mon",   label: "Execution & Monitoring", phases: ["execution","monitoring"], color: "#185FA5", bg: "#E6F1FB", border: "#6AABDF" },
  { id: "closure",    label: "Closure",                phases: ["closure"],                color: "#3B6D11", bg: "#EAF3DE", border: "#7DC053" },
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

  const recommendedTypes = new Set(catalog.filter((c) => c.mandatory).map((c) => c.type));
  const effectiveRecommended = new Set([...recommendedTypes, ...promoted]);
  const optionalEntries = catalog.filter((c) => !effectiveRecommended.has(c.type));
  const generatedCount = localArtifacts.length;
  const isUploading = !!uploading;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", position: "relative" }}>
      <input ref={fileInputRef} type="file" style={{ display: "none" }}
        accept=".xlsx,.xls,.csv,.pdf,.docx,.pptx,.txt" onChange={handleFileChange} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Project Artifacts</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{generatedCount} of {catalog.length} generated</div>
        </div>
      </div>

      {/* Generating banner */}
      {generating.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.primary, background: C.primaryLight, border: `1px solid ${C.primaryBorder}`, borderRadius: 9, padding: "9px 12px", marginBottom: 14 }}>
          <Loader2 className="animate-spin" style={{ width: 14, height: 14, flexShrink: 0 }} />
          {generating.size === 1
            ? <>Generating <span style={{ fontWeight: 600 }}>{[...generating][0].replace(/_/g, " ")}</span> — this takes 20–40 seconds…</>
            : <><span style={{ fontWeight: 600 }}>{generating.size} sub-agents</span> generating in parallel…</>
          }
        </div>
      )}

      {/* ── RECOMMENDED SECTION ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 14px", background: "#0f766e", borderRadius: 10 }}>
          <Check style={{ width: 16, height: 16, color: "#fff" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "0.01em" }}>Recommended Artifacts</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginLeft: "auto" }}>Required for all projects</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {MANDATORY_COLS.map((col) => {
            const colEntries = catalog.filter((c) =>
              col.phases.includes(c.phase) && effectiveRecommended.has(c.type)
            );
            return (
              <div key={col.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: col.color, background: col.bg, border: `1px solid ${col.border}`, borderRadius: 6, padding: "3px 9px" }}>
                    {col.label}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {colEntries.map((entry) => (
                    <ArtifactCard
                      key={entry.type}
                      entry={entry}
                      artifact={localArtifacts.find((a) => a.artifactType === entry.type)}
                      isGen={generating.has(entry.type)}
                      isUp={uploading === entry.type}
                      isDel={deleting === entry.type}
                      isExpanded={expanded === entry.type}
                      isUploading={isUploading}
                      menuFor={menuFor}
                      guardrailError={guardrailErrors[entry.type]}
                      phaseMeta={{ color: col.color, bg: col.bg, border: col.border }}
                      engagementMode={engagementMode}
                      promoted={promoted.has(entry.type)}
                      onGenerate={generate}
                      onUpload={handleUploadClick}
                      onDelete={deleteArtifact}
                      onToggleExpand={() => setExpanded(expanded === entry.type ? null : entry.type)}
                      onToggleMenu={() => setMenuFor(menuFor === entry.type ? null : entry.type)}
                      onCloseMenu={() => setMenuFor(null)}
                      onDownload={() => triggerDownload(`/api/projects/${projectId}/artifacts/${entry.type}/export`)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Expanded artifact under recommended */}
        {expanded && effectiveRecommended.has(expanded) && (() => {
          const art = localArtifacts.find((a) => a.artifactType === expanded);
          const ent = catalog.find((c) => c.type === expanded);
          if (!art?.content || !ent) return null;
          const col = MANDATORY_COLS.find((c) => c.phases.includes(art.phase)) ?? MANDATORY_COLS[0];
          return (
            <div style={{ marginTop: 14, background: C.surface, border: `1.5px solid ${col.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${col.border}`, background: col.bg }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: col.color }}>{ent.label}</span>
                <button onClick={() => setExpanded(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.text3, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ padding: 16 }}>
                <ArtifactDocument artifactType={art.artifactType} content={art.content} projectId={projectId} />
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── OPTIONAL SECTION ── */}
      <div style={{ paddingBottom: selectedOptional.size > 0 ? 60 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 14px", background: "#475569", borderRadius: 10 }}>
          <Square style={{ width: 15, height: 15, color: "#fff" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "0.01em" }}>Optional Artifacts</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginLeft: "auto" }}>Select and move to phase as needed</span>
        </div>

        {optionalEntries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", fontSize: 13, color: C.textMuted }}>
            All optional artifacts have been moved to their phases.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(158px,1fr))", gap: 10 }}>
            {optionalEntries.map((entry) => (
              <ArtifactCard
                key={entry.type}
                entry={entry}
                artifact={localArtifacts.find((a) => a.artifactType === entry.type)}
                isGen={generating.has(entry.type)}
                isUp={uploading === entry.type}
                isDel={deleting === entry.type}
                isExpanded={expanded === entry.type}
                isUploading={isUploading}
                menuFor={menuFor}
                guardrailError={guardrailErrors[entry.type]}
                phaseMeta={{ color: C.slate, bg: C.slateLight, border: C.slateBorder }}
                engagementMode={engagementMode}
                selectable
                selected={selectedOptional.has(entry.type)}
                onSelect={() => {
                  setSelectedOptional((prev) => {
                    const next = new Set(prev);
                    if (next.has(entry.type)) next.delete(entry.type); else next.add(entry.type);
                    return next;
                  });
                }}
                onGenerate={generate}
                onUpload={handleUploadClick}
                onDelete={deleteArtifact}
                onToggleExpand={() => setExpanded(expanded === entry.type ? null : entry.type)}
                onToggleMenu={() => setMenuFor(menuFor === entry.type ? null : entry.type)}
                onCloseMenu={() => setMenuFor(null)}
                onDownload={() => triggerDownload(`/api/projects/${projectId}/artifacts/${entry.type}/export`)}
              />
            ))}
          </div>
        )}

        {/* Expanded artifact under optional */}
        {expanded && !effectiveRecommended.has(expanded) && (() => {
          const art = localArtifacts.find((a) => a.artifactType === expanded);
          const ent = catalog.find((c) => c.type === expanded);
          if (!art?.content || !ent) return null;
          return (
            <div style={{ marginTop: 14, background: C.surface, border: `1.5px solid ${C.slateBorder}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${C.slateBorder}`, background: C.slateLight }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.slate }}>{ent.label}</span>
                <button onClick={() => setExpanded(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.text3, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ padding: 16 }}>
                <ArtifactDocument artifactType={art.artifactType} content={art.content} projectId={projectId} />
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── STICKY ACTION BAR ── */}
      {selectedOptional.size > 0 && (
        <div style={{
          position: "sticky", bottom: 0,
          background: "#1e293b", borderRadius: "0 0 14px 14px",
          padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
          margin: "0 -20px -18px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckSquare2 style={{ width: 16, height: 16, color: "#94a3b8" }} />
            <span style={{ fontSize: 13, color: "#e2e8f0" }}>
              <span style={{ fontWeight: 700, color: "#fff" }}>{selectedOptional.size}</span>{" "}
              artifact{selectedOptional.size !== 1 ? "s" : ""} selected
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setSelectedOptional(new Set())}
              style={{ height: 34, padding: "0 14px", background: "transparent", color: "#94a3b8", border: "1px solid #475569", borderRadius: 8, cursor: "pointer", font: `500 12.5px 'IBM Plex Sans',sans-serif` }}
            >
              Cancel
            </button>
            <button
              onClick={handleMoveToPhase}
              style={{ height: 34, padding: "0 16px", background: "#0f766e", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", font: `600 12.5px 'IBM Plex Sans',sans-serif`, display: "flex", alignItems: "center", gap: 6 }}
            >
              <ArrowRight style={{ width: 14, height: 14 }} /> Move to Phase
            </button>
          </div>
        </div>
      )}
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
    return (
      <div style={{ ...baseCard, border: `1.5px dashed ${C.primaryBorder}`, background: C.primaryLight }}>
        {selectable && <SelectBox selected={!!selected} onSelect={onSelect!} />}
        <Loader2 className="animate-spin" style={{ width: 24, height: 24, color: C.primary, marginTop: 4 }} />
        <div style={{ fontSize: 14, fontWeight: 500, color: C.primary, marginTop: 7 }}>{entry.label}</div>
        <div style={{ fontSize: 11, color: C.primary, opacity: 0.7, marginTop: 2 }}>Generating…</div>
      </div>
    );
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

      <Icon style={{ width: 24, height: 24, color: isGen ? C.textMuted : C.primary, marginTop: selectable ? 10 : 4 }} />
      <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginTop: 7, lineHeight: 1.25 }}>{entry.label}</div>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, marginBottom: 8 }}>{isGen ? "Regenerating…" : "Generated"}</div>

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
