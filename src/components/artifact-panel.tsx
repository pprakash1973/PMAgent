"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/toaster";
import {
  FileText, Presentation, Users, Target, Network, Flag, Coins, AlertTriangle,
  ShieldAlert, MessageSquare, Grid3x3, BadgeCheck, ClipboardList, AlertCircle,
  Gavel, FileBarChart, RefreshCw, GraduationCap, FileCheck, TrendingUp, ScrollText,
  Wand2, Loader2, Eye, EyeOff, Download, Upload, Trash2, MoreHorizontal, Sparkles, Check, Lock,
} from "lucide-react";
import { ArtifactDocument } from "@/components/artifact-document";
import { ARTIFACT_FORMAT } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Artifact = { id: string; artifactType: string; phase: string; status: string; content: any };
type Selection = { artifactType: string; selectionStatus: string };
type CatalogEntry = { type: string; label: string; phase: string };

const C = {
  primary: "#4f5bd5", primaryLight: "#eef0fc", primaryBorder: "#cfd4f5",
  border: "#e2e5ea", borderLight: "#eceef2",
  surface: "#fff", surface2: "#f7f8fa",
  text: "#1a1d24", text2: "#5b616e", text3: "#8a909c", textMuted: "#a8adb8",
  green: "#158a5a", greenLight: "#e3f3ea",
  amber: "#c17d12", amberLight: "#fbf0da",
  red: "#cf3f3a", redLight: "#fbe4e2",
};

const PHASE_ORDER = ["initiation", "planning", "execution", "monitoring", "closure"];
const PHASE_META: Record<string, { label: string; color: string; bg: string; border: string; borderLight: string }> = {
  initiation: { label: "Initiation", color: "#0F6E56", bg: "#E1F5EE", border: "#5DCAA5", borderLight: "#A8E4CE" },
  planning:   { label: "Planning",   color: "#3C3489", bg: "#EEEDFE", border: "#AFA9EC", borderLight: "#D1CEF6" },
  execution:  { label: "Execution",  color: "#185FA5", bg: "#E6F1FB", border: "#6AABDF", borderLight: "#AACFEE" },
  monitoring: { label: "Monitoring", color: "#854F0B", bg: "#FAEEDA", border: "#E0A040", borderLight: "#EEC98A" },
  closure:    { label: "Closure",    color: "#3B6D11", bg: "#EAF3DE", border: "#7DC053", borderLight: "#B2D998" },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ARTIFACT_ICON: Record<string, any> = {
  initiation_deck: Presentation,
  project_charter: ScrollText,
  business_case: FileText,
  stakeholder_register: Users,
  assumption_log: ClipboardList,
  benefits_register: TrendingUp,
  scope_statement: Target,
  wbs: Network,
  milestone_plan: Flag,
  resource_plan: Users,
  cost_plan: Coins,
  raid_register: AlertTriangle,
  risk_register: ShieldAlert,
  communication_plan: MessageSquare,
  raci_matrix: Grid3x3,
  quality_plan: BadgeCheck,
  action_log: ClipboardList,
  issue_register: AlertCircle,
  decision_log: Gavel,
  weekly_status: FileBarChart,
  monthly_status: FileBarChart,
  change_log: RefreshCw,
  lessons_learned: GraduationCap,
  closure_report: FileCheck,
};

function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function ArtifactPanel({
  projectId,
  artifacts,
  selections,
  catalog,
  currentPhase = "initiation",
}: {
  projectId: string;
  artifacts: Artifact[];
  selections: Selection[];
  catalog: CatalogEntry[];
  currentPhase?: string;
}) {
  const [generating, setGenerating] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [localArtifacts, setLocalArtifacts] = useState(artifacts);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [guardrailErrors, setGuardrailErrors] = useState<Record<string, string>>({});
  const [autoGenQueue, setAutoGenQueue] = useState<string[]>([]);
  const [autoGenDone, setAutoGenDone] = useState(false);
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);

  const activeTypes = selections.filter((s) => s.selectionStatus === "active").map((s) => s.artifactType);

  useEffect(() => {
    if (searchParams.get("autoGenerate") !== "1" || autoGenDone) return;
    const coreTypes = ["project_charter", "stakeholder_register", "risk_register", "wbs"];
    const toGenerate = coreTypes.filter((t) => !localArtifacts.some((a) => a.artifactType === t));
    if (toGenerate.length > 0) {
      setAutoGenQueue(toGenerate);
      setShowAll(true);
    } else {
      setAutoGenDone(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (autoGenQueue.length === 0 || generating) return;
    const next = autoGenQueue[0];
    setAutoGenQueue((q) => q.slice(1));
    generate(next).then(() => {
      if (autoGenQueue.length <= 1) setAutoGenDone(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenQueue, generating]);

  async function generate(artifactType: string) {
    setGenerating(artifactType);
    setMenuFor(null);
    setGuardrailErrors((prev) => { const n = { ...prev }; delete n[artifactType]; return n; });
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactType }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error?.message ?? data?.error ?? "Generation failed";
        setGuardrailErrors((prev) => ({ ...prev, [artifactType]: msg }));
        return;
      }
      setGuardrailErrors((prev) => { const n = { ...prev }; delete n[artifactType]; return n; });
      setLocalArtifacts((prev) => {
        const existing = prev.findIndex((a) => a.artifactType === artifactType);
        if (existing >= 0) {
          const copy = [...prev];
          copy[existing] = data;
          return copy;
        }
        return [...prev, data];
      });
      toast({ title: "Artifact generated", description: `${artifactType.replace(/_/g, " ")} is ready` });
    } catch (err: any) {
      setGuardrailErrors((prev) => ({ ...prev, [artifactType]: err.message || "Generation failed" }));
    } finally {
      setGenerating(null);
    }
  }

  async function uploadArtifact(artifactType: string, file: File) {
    setUploading(artifactType);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/artifacts/${artifactType}/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
      const artifact = await res.json();
      setLocalArtifacts((prev) => {
        const idx = prev.findIndex((a) => a.artifactType === artifactType);
        if (idx >= 0) { const copy = [...prev]; copy[idx] = artifact; return copy; }
        return [...prev, artifact];
      });
      setExpanded(artifactType);
      toast({ title: "Artifact updated", description: `AI merged your file into ${artifactType.replace(/_/g, " ")}` });
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
    if (!window.confirm(`Delete the ${label}? This removes the generated document and its version history. You can generate or upload a new one afterwards.`)) {
      return;
    }
    setDeleting(artifactType);
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/${artifactType}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Delete failed");
      }
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

  const isAutoGenerating = autoGenQueue.length > 0 || (searchParams.get("autoGenerate") === "1" && !autoGenDone && generating !== null);
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);

  const generatedCount = localArtifacts.length;
  const busy = !!generating || !!uploading;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px" }}>
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        accept=".xlsx,.xls,.csv,.pdf,.docx,.pptx,.txt"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Project artifacts</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>
            Grouped by phase · {generatedCount} of {catalog.length} generated
          </div>
        </div>
        <button
          onClick={() => setShowAll((v) => !v)}
          style={{
            height: 30, padding: "0 12px", background: C.surface, color: C.text2,
            border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer",
            font: `500 12px 'IBM Plex Sans',sans-serif`,
          }}
        >
          {showAll ? "Show active only" : "Browse all artifacts"}
        </button>
      </div>

      {/* Auto-gen / generating banners */}
      {isAutoGenerating && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.primary, background: C.primaryLight, border: `1px solid ${C.primaryBorder}`, borderRadius: 9, padding: "9px 12px", marginBottom: 14 }}>
          <Sparkles style={{ width: 14, height: 14, flexShrink: 0 }} />
          Auto-generating core artifacts…
          <span style={{ fontWeight: 600 }}>
            {generating ? generating.replace(/_/g, " ") : ""} {autoGenQueue.length > 0 ? `(${autoGenQueue.length} remaining)` : ""}
          </span>
          <Loader2 className="animate-spin" style={{ width: 14, height: 14, marginLeft: "auto", flexShrink: 0 }} />
        </div>
      )}
      {!isAutoGenerating && generating && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.primary, background: C.primaryLight, border: `1px solid ${C.primaryBorder}`, borderRadius: 9, padding: "9px 12px", marginBottom: 14 }}>
          <Loader2 className="animate-spin" style={{ width: 14, height: 14, flexShrink: 0 }} />
          Generating <span style={{ fontWeight: 600 }}>{generating.replace(/_/g, " ")}</span> — this takes 20–40 seconds…
        </div>
      )}

      {/* Phase bands */}
      {PHASE_ORDER.map((phase) => {
        const phaseItems = (showAll
          ? catalog
          : catalog.filter((c) => activeTypes.includes(c.type) || localArtifacts.some((a) => a.artifactType === c.type))
        ).filter((c) => c.phase === phase);
        if (phaseItems.length === 0) return null;

        const meta = PHASE_META[phase] ?? { label: phase, color: C.text2, bg: C.surface2 };
        const phaseIdx = PHASE_ORDER.indexOf(phase);
        const doneCount = phaseItems.filter((e) => localArtifacts.some((a) => a.artifactType === e.type)).length;
        const isDone = currentIdx >= 0 && phaseIdx < currentIdx;
        const isCurrent = phaseIdx === currentIdx;

        const expandedInPhase = phaseItems.find((e) => e.type === expanded);
        const expandedArtifact = expandedInPhase ? localArtifacts.find((a) => a.artifactType === expanded) : null;

        return (
          <div key={phase} style={{ marginBottom: 22 }}>
            {/* Phase header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 16, color: isCurrent || isDone ? meta.color : C.textMuted }}>●</span>
              <span style={{ fontSize: 18, fontWeight: 500, color: isCurrent || isDone ? meta.color : C.textMuted }}>{meta.label}</span>
              <span style={{ fontSize: 12, color: C.textMuted, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1px 8px" }}>
                {doneCount}/{phaseItems.length}
              </span>
              {isCurrent ? <span style={{ fontSize: 11, color: meta.color }}>current phase</span> : null}
              <div style={{ flex: 1, height: 1, background: isCurrent || isDone ? meta.border : C.border, opacity: 0.4 }} />
              {isDone ? (
                <span style={{ fontSize: 11, color: C.green, display: "flex", alignItems: "center", gap: 3 }}><Check style={{ width: 13, height: 13 }} /> Gate passed</span>
              ) : isCurrent ? (
                <span style={{ fontSize: 11, color: C.amber, display: "flex", alignItems: "center", gap: 3 }}>In progress</span>
              ) : (
                <span style={{ fontSize: 11, color: C.textMuted, display: "flex", alignItems: "center", gap: 3 }}><Lock style={{ width: 12, height: 12 }} /> Upcoming</span>
              )}
            </div>

            {/* Cards grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))", gap: 10 }}>
              {phaseItems.map((entry) => {
                const artifact = localArtifacts.find((a) => a.artifactType === entry.type);
                const Icon = ARTIFACT_ICON[entry.type] ?? FileText;
                const isGen = generating === entry.type;
                const isUp = uploading === entry.type;
                const isDel = deleting === entry.type;
                const isExpanded = expanded === entry.type;
                const format = (ARTIFACT_FORMAT[entry.type] ?? "docx").toUpperCase();

                const phaseBorder = isCurrent || isDone ? meta.border : C.border;
                const phaseBorderLight = isCurrent || isDone ? meta.borderLight : C.border;

                if (!artifact && !isGen) {
                  // Not generated — dashed card
                  return (
                    <div key={entry.type} style={{
                      border: `1.5px dashed ${phaseBorderLight}`, borderRadius: 12, padding: "16px 12px",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center",
                      minHeight: 132,
                    }}>
                      <Icon style={{ width: 26, height: 26, color: C.textMuted }} />
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.text2, marginTop: 8 }}>{entry.label}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, margin: "1px 0 10px" }}>Not generated</div>
                      <button
                        onClick={() => generate(entry.type)}
                        disabled={busy}
                        style={{
                          height: 28, padding: "0 12px", background: C.primary, color: "#fff",
                          border: "none", borderRadius: 8, cursor: busy ? "default" : "pointer",
                          font: `600 12px 'IBM Plex Sans',sans-serif`, display: "flex", alignItems: "center", gap: 5,
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        <Wand2 style={{ width: 13, height: 13 }} /> Generate
                      </button>
                      {guardrailErrors[entry.type] && (
                        <div style={{ color: "#cf3f3a", fontWeight: 700, fontSize: 11, marginTop: 6, lineHeight: 1.4, textAlign: "center" }}>
                          {guardrailErrors[entry.type]}
                        </div>
                      )}
                    </div>
                  );
                }

                // Generated (or generating) — solid card
                return (
                  <div key={entry.type} style={{
                    position: "relative", background: C.surface,
                    border: `1.5px solid ${isExpanded ? phaseBorder : phaseBorder}`,
                    borderRadius: 12, padding: "14px 12px", textAlign: "center", minHeight: 132,
                    boxShadow: isExpanded ? `0 0 0 3px ${meta.bg}` : "none",
                    display: "flex", flexDirection: "column", alignItems: "center",
                  }}>
                    {/* Format chip */}
                    <span style={{ position: "absolute", top: 8, right: 8, fontSize: 9.5, fontWeight: 600, color: meta.color, background: meta.bg, border: `1px solid ${phaseBorderLight}`, borderRadius: 5, padding: "1px 5px" }}>{format}</span>

                    <Icon style={{ width: 26, height: 26, color: isGen ? C.textMuted : C.primary, marginTop: 4 }} />
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginTop: 8, lineHeight: 1.25 }}>{entry.label}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, marginBottom: 10 }}>
                      {isGen ? "Generating…" : "Generated"}
                    </div>

                    {/* Action row */}
                    <div style={{ marginTop: "auto", display: "flex", justifyContent: "center", gap: 4 }}>
                      {isGen ? (
                        <Loader2 className="animate-spin" style={{ width: 16, height: 16, color: C.primary }} />
                      ) : (
                        <>
                          <IconBtn title={isExpanded ? "Hide" : "View"} onClick={() => setExpanded(isExpanded ? null : entry.type)} active={isExpanded}>
                            {isExpanded ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                          </IconBtn>
                          <IconBtn title="Download" onClick={() => triggerDownload(`/api/projects/${projectId}/artifacts/${entry.type}/export`)}>
                            <Download style={{ width: 15, height: 15 }} />
                          </IconBtn>
                          <IconBtn title="Regenerate" onClick={() => generate(entry.type)} disabled={busy}>
                            {isUp ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <RefreshCw style={{ width: 15, height: 15 }} />}
                          </IconBtn>
                          <IconBtn title="More" onClick={() => setMenuFor(menuFor === entry.type ? null : entry.type)} active={menuFor === entry.type}>
                            {isDel ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <MoreHorizontal style={{ width: 15, height: 15 }} />}
                          </IconBtn>
                        </>
                      )}
                    </div>

                    {/* Overflow menu */}
                    {menuFor === entry.type && (
                      <>
                        <div onClick={() => setMenuFor(null)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                        <div style={{
                          position: "absolute", top: 46, right: 8, zIndex: 41,
                          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9,
                          boxShadow: "0 6px 20px rgba(0,0,0,.12)", padding: 5, minWidth: 158, textAlign: "left",
                        }}>
                          <MenuItem icon={<Upload style={{ width: 14, height: 14 }} />} label={isUp ? "Merging…" : "Upload new version"} onClick={() => handleUploadClick(entry.type)} disabled={busy} />
                          <MenuItem icon={isExpanded ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />} label={isExpanded ? "Hide document" : "View document"} onClick={() => { setExpanded(isExpanded ? null : entry.type); setMenuFor(null); }} />
                          <MenuItem icon={<Trash2 style={{ width: 14, height: 14 }} />} label="Delete" onClick={() => deleteArtifact(entry.type)} disabled={busy} danger />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Expanded document — full width below the phase grid */}
            {expandedArtifact?.content && (
              <div style={{ marginTop: 12, background: C.surface, border: `1.5px solid ${meta.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${meta.borderLight}`, background: meta.bg }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: meta.color }}>{expandedInPhase?.label}</span>
                  <button onClick={() => setExpanded(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.text3, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ padding: 16 }}>
                  <ArtifactDocument artifactType={expandedArtifact.artifactType} content={expandedArtifact.content} projectId={projectId} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function IconBtn({ children, title, onClick, disabled, active }: {
  children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        width: 28, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? C.primaryLight : C.surface, color: active ? C.primary : C.text2,
        border: `1px solid ${active ? C.primaryBorder : C.border}`, borderRadius: 7,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function MenuItem({ icon, label, onClick, disabled, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 9px",
        background: "none", border: "none", borderRadius: 6, cursor: disabled ? "default" : "pointer",
        font: `500 12.5px 'IBM Plex Sans',sans-serif`, color: danger ? C.red : C.text2,
        opacity: disabled ? 0.5 : 1, textAlign: "left",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = danger ? C.redLight : C.surface2; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
    >
      {icon} {label}
    </button>
  );
}
