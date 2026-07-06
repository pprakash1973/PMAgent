import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatCurrency, methodologyLabel, ragBg, ARTIFACT_CATALOG } from "@/lib/utils";
import {
  ArrowLeft, FileText, AlertTriangle, Calendar, BarChart2,
  MessageSquare, Settings, CheckCircle2, AlertCircle, Clock
} from "lucide-react";
import { ArtifactPanel } from "@/components/artifact-panel";
import { ChatPanel } from "@/components/chat-panel";
import { StatusForm } from "@/components/status-form";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session!.user as any;
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      pmOwner: { select: { fullName: true, email: true } },
      milestones: { orderBy: { dueDate: "asc" } },
      risks: { where: { status: { not: "closed" } }, orderBy: { createdAt: "desc" }, take: 5 },
      issues: { where: { status: { not: "closed" } }, orderBy: { createdAt: "desc" }, take: 5 },
      artifacts: true,
      artifactSelections: true,
      statusReports: {
        orderBy: { reportDate: "desc" },
        take: 3,
        include: { healthScore: true },
      },
    },
  });

  if (!project) notFound();

  const latestStatus = project.statusReports[0];
  const activeArtifacts = project.artifactSelections.filter((s) => s.selectionStatus === "active");

  const ragVariant = { green: "green", amber: "amber", red: "red" }[project.healthStatus] as any ?? "secondary";

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link href="/dashboard/projects">
              <Button variant="ghost" size="icon" className="mt-0.5"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
                <Badge variant={ragVariant}>{project.healthStatus.toUpperCase()}</Badge>
                <Badge variant="outline" className="text-xs capitalize">{project.status}</Badge>
                <Badge variant="secondary" className="text-xs">
                  {project.engagementMode === "high_level" ? "Governance Mode" : "Detailed Mode"}
                </Badge>
              </div>
              <p className="text-slate-500 text-sm mt-0.5">
                {project.code} · {project.customer || "Internal"} · {methodologyLabel(project.methodology)}
                {project.externalExecutionTool && ` · ${project.externalExecutionTool}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/dashboard/projects/${id}/settings`}>
              <Button variant="outline" size="icon"><Settings className="w-4 h-4" /></Button>
            </Link>
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Budget", value: project.budget ? formatCurrency(project.budget, project.currency) : "—", icon: BarChart2 },
            { label: "End Date", value: formatDate(project.endDate), icon: Calendar },
            { label: "Team Size", value: project.teamSize ? `${project.teamSize} people` : "—", icon: CheckCircle2 },
            { label: "Health Score", value: latestStatus?.healthScore?.compositeScore ? `${latestStatus.healthScore.compositeScore.toFixed(0)}/100` : "—", icon: AlertTriangle },
          ].map((m) => (
            <Card key={m.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <m.icon className="w-6 h-6 text-slate-400 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">{m.label}</p>
                  <p className="font-semibold text-sm">{m.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Latest AI Summary */}
        {latestStatus?.aiSummary && (
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-blue-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Latest AI Executive Summary
                <span className="text-xs font-normal text-blue-600">{formatDate(latestStatus.reportDate)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-blue-900 leading-relaxed">{latestStatus.aiSummary}</p>
            </CardContent>
          </Card>
        )}

        {/* Artifacts */}
        <ArtifactPanel
          projectId={id}
          artifacts={project.artifacts}
          selections={project.artifactSelections}
          catalog={ARTIFACT_CATALOG}
        />

        {/* Risks & Issues grid */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Open Risks ({project.risks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {project.risks.length === 0 && <p className="text-xs text-slate-400">No open risks</p>}
              {project.risks.map((r) => (
                <div key={r.id} className="flex items-start gap-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded text-white text-[10px] ${r.impact === "high" ? "bg-red-500" : r.impact === "medium" ? "bg-amber-500" : "bg-green-500"}`}>
                    {r.impact?.toUpperCase()}
                  </span>
                  <span className="text-slate-700 line-clamp-2">{r.description}</span>
                </div>
              ))}
              <Link href={`/dashboard/projects/${id}/risks`} className="text-xs text-blue-700 hover:underline block mt-2">
                Manage RAID →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                Open Issues ({project.issues.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {project.issues.length === 0 && <p className="text-xs text-slate-400">No open issues</p>}
              {project.issues.map((i) => (
                <div key={i.id} className="flex items-start gap-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded text-white text-[10px] ${i.severity === "critical" ? "bg-red-600" : i.severity === "high" ? "bg-red-500" : "bg-amber-500"}`}>
                    {i.severity?.toUpperCase()}
                  </span>
                  <span className="text-slate-700 line-clamp-2">{i.description}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Milestones */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              Milestones
            </CardTitle>
          </CardHeader>
          <CardContent>
            {project.milestones.length === 0 ? (
              <p className="text-xs text-slate-400">No milestones defined</p>
            ) : (
              <div className="space-y-2">
                {project.milestones.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${m.status === "achieved" ? "bg-green-500" : m.status === "delayed" ? "bg-red-500" : "bg-slate-300"}`} />
                      <span className="text-slate-700">{m.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{formatDate(m.dueDate)}</span>
                      <Badge variant={m.status === "achieved" ? "green" : m.status === "delayed" ? "red" : "secondary"} className="text-xs">
                        {m.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status form */}
        <StatusForm projectId={id} mode={project.engagementMode} />
      </div>

      {/* Chat panel */}
      <ChatPanel projectId={id} projectName={project.name} />
    </div>
  );
}
