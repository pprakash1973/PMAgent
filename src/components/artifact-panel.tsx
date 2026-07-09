"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { FileText, Wand2, Loader2, ChevronDown, ChevronUp, Eye, Sparkles, Plus, Trash2 } from "lucide-react";
import { ArtifactDocument } from "@/components/artifact-document";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Artifact = { id: string; artifactType: string; phase: string; status: string; content: any };
type Selection = { artifactType: string; selectionStatus: string };
type CatalogEntry = { type: string; label: string; phase: string };

export function ArtifactPanel({
  projectId,
  artifacts,
  selections,
  catalog,
}: {
  projectId: string;
  artifacts: Artifact[];
  selections: Selection[];
  catalog: CatalogEntry[];
}) {
  const [generating, setGenerating] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [localArtifacts, setLocalArtifacts] = useState(artifacts);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [autoGenQueue, setAutoGenQueue] = useState<string[]>([]);
  const [autoGenDone, setAutoGenDone] = useState(false);
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);

  const activeTypes = selections.filter((s) => s.selectionStatus === "active").map((s) => s.artifactType);

  // Auto-generate core artifacts when ?autoGenerate=1 is in URL
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

  // Process auto-gen queue one at a time
  useEffect(() => {
    if (autoGenQueue.length === 0 || generating) return;
    const next = autoGenQueue[0];
    setAutoGenQueue((q) => q.slice(1));
    generate(next).then(() => {
      if (autoGenQueue.length <= 1) setAutoGenDone(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenQueue, generating]);
  const visibleCatalog = showAll ? catalog : catalog.filter((c) => activeTypes.includes(c.type) || localArtifacts.some((a) => a.artifactType === c.type));
  const displayCatalog = showAll ? catalog : visibleCatalog.length > 0 ? visibleCatalog : catalog.slice(0, 5);

  async function generate(artifactType: string) {
    setGenerating(artifactType);
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactType }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const artifact = await res.json();
      setLocalArtifacts((prev) => {
        const existing = prev.findIndex((a) => a.artifactType === artifactType);
        if (existing >= 0) {
          const copy = [...prev];
          copy[existing] = artifact;
          return copy;
        }
        return [...prev, artifact];
      });
      toast({ title: "Artifact generated!", description: `${artifactType.replace(/_/g, " ")} is ready` });
    } catch {
      toast({ title: "Generation failed", description: "Please try again", variant: "destructive" });
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
      toast({ title: "Artifact updated!", description: `AI merged your uploaded file into ${artifactType.replace(/_/g, " ")}` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message || "Please try again", variant: "destructive" });
    } finally {
      setUploading(null);
      uploadTargetRef.current = null;
    }
  }

  async function deleteArtifact(artifactType: string) {
    const label = artifactType.replace(/_/g, " ");
    if (!window.confirm(`Delete the ${label}? This removes the generated document and its version history. You can generate or upload a new one afterwards.`)) {
      return;
    }
    setDeleting(artifactType);
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/${artifactType}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Delete failed");
      }
      setLocalArtifacts((prev) => prev.filter((a) => a.artifactType !== artifactType));
      if (expanded === artifactType) setExpanded(null);
      toast({ title: "Artifact deleted", description: `${label} was removed. You can generate or upload a new one.` });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message || "Please try again", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  }

  function handleUploadClick(artifactType: string) {
    uploadTargetRef.current = artifactType;
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const target = uploadTargetRef.current;
    e.target.value = "";
    if (file && target) uploadArtifact(target, file);
  }

  const isAutoGenerating = autoGenQueue.length > 0 || (searchParams.get("autoGenerate") === "1" && !autoGenDone && generating !== null);

  const phases = ["initiation", "planning", "execution", "monitoring", "closure"];

  return (
    <Card>
      {/* Hidden file input for artifact upload */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".xlsx,.xls,.csv,.pdf,.docx,.pptx,.txt"
        onChange={handleFileChange}
      />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-500" />
            Project Artifacts ({localArtifacts.length} generated)
          </CardTitle>
          <button onClick={() => setShowAll((v) => !v)} className="text-xs text-blue-700 hover:underline flex items-center gap-1">
            {showAll ? "Show active only" : "Browse all artifacts"}
            {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAutoGenerating && (
          <div className="flex items-center gap-2 text-xs text-purple-800 bg-purple-50 border border-purple-200 rounded-md px-3 py-2">
            <Sparkles className="w-3 h-3 shrink-0 text-purple-500" />
            Auto-generating core artifacts from your requirements document…&nbsp;
            <span className="font-medium">
              {generating ? generating.replace(/_/g, " ") : ""}&nbsp;
              {autoGenQueue.length > 0 ? `(${autoGenQueue.length} remaining)` : ""}
            </span>
            <Loader2 className="w-3 h-3 animate-spin ml-auto shrink-0" />
          </div>
        )}
        {!isAutoGenerating && generating && (
          <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            Generating <span className="font-medium">{generating.replace(/_/g, " ")}</span> — this takes 20–40 seconds…
          </div>
        )}
        {phases.map((phase) => {
          const phaseItems = (showAll ? catalog : catalog.filter((c) => activeTypes.includes(c.type) || localArtifacts.some((a) => a.artifactType === c.type))).filter((c) => c.phase === phase);
          if (phaseItems.length === 0) return null;
          return (
            <div key={phase}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{phase}</p>
              <div className="space-y-1">
                {phaseItems.map((entry) => {
                  const artifact = localArtifacts.find((a) => a.artifactType === entry.type);
                  const isGenerating = generating === entry.type;
                  const isExpanded = expanded === entry.type;
                  return (
                    <div key={entry.type} className="rounded-md border border-slate-200 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 hover:bg-slate-50">
                        <div className="flex items-center gap-2">
                          <FileText className={cn("w-3.5 h-3.5", artifact ? "text-blue-600" : "text-slate-300")} />
                          <span className="text-sm text-slate-700">{entry.label}</span>
                          {artifact && (
                            <Badge variant={artifact.status === "approved" ? "green" : "secondary"} className="text-xs">
                              {artifact.status}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {artifact && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setExpanded(isExpanded ? null : entry.type)}>
                              <Eye className="w-3 h-3" />
                              {isExpanded ? "Hide" : "View"}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                            onClick={() => handleUploadClick(entry.type)}
                            disabled={!!uploading || !!generating}
                            title="Upload edited file — AI will merge it into this artifact"
                          >
                            {uploading === entry.type ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                            {uploading === entry.type ? "Merging…" : "Upload"}
                          </Button>
                          <Button
                            variant={artifact ? "outline" : "default"}
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => generate(entry.type)}
                            disabled={!!generating}
                          >
                            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                            {isGenerating ? "Generating…" : artifact ? "Regenerate" : "Generate"}
                          </Button>
                          {artifact && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 px-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => deleteArtifact(entry.type)}
                              disabled={!!generating || !!uploading || deleting === entry.type}
                              title="Delete this artifact"
                              aria-label={`Delete ${entry.label}`}
                            >
                              {deleting === entry.type ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </Button>
                          )}
                        </div>
                      </div>
                      {isExpanded && artifact?.content && (
                        <div className="border-t border-slate-200 p-3">
                          <ArtifactDocument artifactType={artifact.artifactType} content={artifact.content} projectId={projectId} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
