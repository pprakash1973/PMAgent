"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { FileText, Wand2, Loader2, ChevronDown, ChevronUp, Eye } from "lucide-react";
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
  const [localArtifacts, setLocalArtifacts] = useState(artifacts);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const activeTypes = selections.filter((s) => s.selectionStatus === "active").map((s) => s.artifactType);
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

  const phases = ["initiation", "planning", "execution", "monitoring", "closure"];

  return (
    <Card>
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
        {generating && (
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
                            variant={artifact ? "outline" : "default"}
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => generate(entry.type)}
                            disabled={!!generating}
                          >
                            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                            {isGenerating ? "Generating…" : artifact ? "Regenerate" : "Generate"}
                          </Button>
                        </div>
                      </div>
                      {isExpanded && artifact?.content && (
                        <div className="border-t border-slate-200 p-3">
                          <ArtifactDocument artifactType={artifact.artifactType} content={artifact.content} />
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
