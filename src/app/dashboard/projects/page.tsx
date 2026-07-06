import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency, methodologyLabel } from "@/lib/utils";
import { Plus, FolderKanban } from "lucide-react";

export default async function ProjectsPage() {
  const session = await auth();
  const user = session!.user as any;

  const projects = await prisma.project.findMany({
    where: {
      orgId: user.orgId,
      deletedAt: null,
      ...(user.role === "pm" ? { pmOwnerId: user.id } : {}),
    },
    include: {
      pmOwner: { select: { fullName: true } },
      _count: { select: { risks: true, issues: true, artifacts: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
          <p className="text-slate-500 text-sm mt-1">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/dashboard/projects/new">
          <Button><Plus className="w-4 h-4" />New Project</Button>
        </Link>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FolderKanban className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">No projects yet</h3>
            <p className="text-slate-400 mb-6">Create your first project to get started</p>
            <Link href="/dashboard/projects/new">
              <Button><Plus className="w-4 h-4" />Create Project</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
              <Card className="hover:shadow-md transition-all cursor-pointer group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-6">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">{project.name}</h3>
                        <Badge variant={project.healthStatus as any}>{project.healthStatus.toUpperCase()}</Badge>
                        <Badge variant="secondary" className="text-xs">
                          {project.engagementMode === "high_level" ? "Governance" : "Detailed"}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500">
                        {project.code} · {project.customer || "Internal"} · {methodologyLabel(project.methodology)}
                      </p>
                      {project.description && (
                        <p className="text-sm text-slate-400 mt-1 line-clamp-1">{project.description}</p>
                      )}
                      <div className="flex items-center gap-5 mt-2 text-xs text-slate-400">
                        <span>{project._count.artifacts} artifacts</span>
                        <span>{project._count.risks} risks</span>
                        <span>{project._count.issues} issues</span>
                        {project.budget && <span>{formatCurrency(project.budget, project.currency)}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <Badge variant="outline" className="text-xs capitalize">{project.status}</Badge>
                      <p className="text-xs text-slate-400">{project.pmOwner.fullName}</p>
                      {project.endDate && (
                        <p className="text-xs text-slate-400">Due {formatDate(project.endDate)}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
