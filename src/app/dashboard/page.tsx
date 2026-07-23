import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency } from "@/lib/utils";
import { FolderKanban, Plus, Clock, CheckSquare } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user as any;

  if (user.role === "dh") redirect("/dashboard/executive");
  if (user.role === "pgm") redirect("/dashboard/program");

  const projects = await prisma.project.findMany({
    where: {
      orgId: user.orgId,
      deletedAt: null,
      status: { not: "closed" },
      ...(user.role === "pm" ? { pmOwnerId: user.id } : {}),
    },
    include: {
      pmOwner: { select: { fullName: true } },
      // only the next 1 pending milestone per project
      milestones: { where: { status: "pending" }, orderBy: { dueDate: "asc" }, take: 1 },
      _count: { select: { risks: true, issues: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, {user.name?.split(" ")[0]}
          </h1>
          <p className="text-slate-500 text-sm mt-1">Your active projects and upcoming milestones</p>
        </div>
        {(user.role === "pm" || user.role === "admin") && (
          <Link href="/dashboard/projects/new">
            <Button>
              <Plus className="w-4 h-4" />
              New Project
            </Button>
          </Link>
        )}
      </div>

      {/* Projects + Next Milestone */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Active Projects</h2>
          <Link href="/dashboard/projects" className="text-sm text-blue-700 hover:underline">
            View all
          </Link>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center">
              <FolderKanban className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No active projects yet</p>
              <p className="text-sm text-slate-400 mt-1">Use the <strong>New Project</strong> button above to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => {
              const nextMilestone = project.milestones[0] ?? null;
              return (
                <Card key={project.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Left: project info */}
                      <div className="flex-1 min-w-0">
                        <Link href={`/dashboard/projects/${project.id}`} className="block">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-slate-900 truncate hover:text-blue-700">
                              {project.name}
                            </h3>
                            <Badge variant={project.healthStatus as any} className="shrink-0">
                              {project.healthStatus.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500">
                            {project.customer} · {project.methodology}
                            {project.endDate && ` · Due ${formatDate(project.endDate)}`}
                          </p>
                          <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-400">
                            <span>{project._count.risks} risks</span>
                            <span>{project._count.issues} issues</span>
                            {project.budget && (
                              <span>{formatCurrency(project.budget, project.currency)}</span>
                            )}
                          </div>
                        </Link>
                      </div>

                      {/* Divider */}
                      <div className="w-px self-stretch bg-slate-100 shrink-0" />

                      {/* Right: next milestone */}
                      <div className="w-56 shrink-0">
                        {nextMilestone ? (
                          <div className="flex items-start gap-2">
                            <Clock className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-slate-700 leading-tight">
                                {nextMilestone.name}
                              </p>
                              <p className="text-xs text-blue-700 font-medium mt-0.5">
                                {formatDate(nextMilestone.dueDate)}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No upcoming milestones</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Assigned Action Items */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CheckSquare className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">Assigned Action Items</h2>
        </div>
        <Card>
          <CardContent className="py-10 text-center">
            <CheckSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">Action items assigned to you will appear here</p>
            <p className="text-xs text-slate-300 mt-1">Coming soon — managed from the Program view</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
