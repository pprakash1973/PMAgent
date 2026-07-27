import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency } from "@/lib/utils";
import { FolderKanban, Plus, Clock, CheckSquare, AlertCircle } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user as any;

  if (user.role === "dh") redirect("/dashboard/executive");
  if (user.role === "dm" || user.role === "pgm") redirect("/dashboard/dm");

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

  // Fetch action items assigned to this PM (table may not exist on older deployments)
  const now = new Date();
  let myActionItems: any[] = [];
  try {
    myActionItems = user.role === "pm" ? await prisma.actionItem.findMany({
      where: { assignedToId: user.id, status: { in: ["open", "acknowledged", "in_progress", "blocked"] } },
      orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
      include: {
        project: { select: { id: true, name: true } },
        raisedBy: { select: { fullName: true } },
      },
      take: 10,
    }) : [];
  } catch {
    // action_items table not yet migrated
  }
  const overdueCount = myActionItems.filter((i: any) => i.dueDate && i.dueDate < now).length;

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
                <div key={project.id} className="grid gap-3" style={{ gridTemplateColumns: "1fr minmax(200px, 240px)" }}>
                  {/* Left tile: project info */}
                  <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
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
                    </CardContent>
                  </Card>

                  {/* Right tile: next milestone */}
                  <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex flex-col justify-center h-full">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Next milestone</p>
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
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assigned Action Items (PM only) */}
      {user.role === "pm" && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CheckSquare className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900">My Action Items</h2>
            {overdueCount > 0 && (
              <span className="ml-1 flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                <AlertCircle className="w-3 h-3" /> {overdueCount} overdue
              </span>
            )}
          </div>

          {myActionItems.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <CheckSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400">No open action items from your Delivery Manager</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {myActionItems.map((item) => {
                const isOverdue = item.dueDate && item.dueDate < now;
                const priorityColors: Record<string, string> = { p1: "text-red-600 bg-red-50 border-red-200", p2: "text-amber-700 bg-amber-50 border-amber-200", p3: "text-slate-600 bg-slate-50 border-slate-200" };
                const statusColors: Record<string, string> = { open: "text-amber-700 bg-amber-50 border-amber-200", acknowledged: "text-teal-700 bg-teal-50 border-teal-200", in_progress: "text-indigo-700 bg-indigo-50 border-indigo-200", blocked: "text-red-600 bg-red-50 border-red-200" };
                return (
                  <Card key={item.id} className={`${isOverdue ? "border-red-300 bg-red-50/30" : ""}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {isOverdue && <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
                            <span className={`text-xs font-bold border rounded-full px-2 py-0.5 ${priorityColors[item.priority] ?? "text-slate-600 bg-slate-50 border-slate-200"}`}>
                              {item.priority.toUpperCase()}
                            </span>
                            <Badge variant="outline" className={`text-xs ${statusColors[item.status] ?? ""}`}>
                              {item.status.replace(/_/g, " ")}
                            </Badge>
                            <span className="text-xs font-mono text-slate-400">{item.reference}</span>
                          </div>
                          <p className="font-semibold text-slate-900 text-sm">{item.title}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {item.project.name} · from {item.raisedBy.fullName}
                            {item.dueDate && (
                              <span className={`ml-2 font-medium ${isOverdue ? "text-red-600" : "text-slate-600"}`}>
                                · Due {formatDate(item.dueDate)}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
