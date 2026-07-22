import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency, ragBg } from "@/lib/utils";
import { FolderKanban, AlertTriangle, CheckCircle2, Plus, TrendingUp, Clock } from "lucide-react";
import { getProductivityStatsForUser } from "@/lib/productivity";
import { ProductivityMeter } from "@/components/productivity-meter";

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user as any;

  if (user.role === "dh") redirect("/dashboard/executive");
  if (user.role === "pgm") redirect("/dashboard/program");

  const projects = await prisma.project.findMany({
    where: {
      orgId: user.orgId,
      deletedAt: null,
      ...(user.role === "pm" ? { pmOwnerId: user.id } : {}),
    },
    include: {
      pmOwner: { select: { fullName: true } },
      milestones: { where: { status: "pending" }, orderBy: { dueDate: "asc" }, take: 3 },
      _count: { select: { risks: true, issues: true } },
      statusReports: { orderBy: { reportDate: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  const stats = {
    total: projects.length,
    red: projects.filter((p) => p.healthStatus === "red").length,
    amber: projects.filter((p) => p.healthStatus === "amber").length,
    green: projects.filter((p) => p.healthStatus === "green").length,
  };

  const upcomingMilestones = projects
    .flatMap((p) => p.milestones.map((m) => ({ ...m, projectName: p.name, projectId: p.id })))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  const productivityStats = await getProductivityStatsForUser(user);

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, {user.name?.split(" ")[0]}</h1>
          <p className="text-slate-500 text-sm mt-1">Here&apos;s your project portfolio at a glance</p>
        </div>
        {user.role === "pm" || user.role === "admin" ? (
          <Link href="/dashboard/projects/new">
            <Button>
              <Plus className="w-4 h-4" />
              New Project
            </Button>
          </Link>
        ) : null}
      </div>

      <ProductivityMeter stats={productivityStats} compact />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FolderKanban className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-slate-500">Active Projects</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-green-700">{stats.green}</p>
                <p className="text-sm text-slate-500">On Track</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold text-amber-700">{stats.amber}</p>
                <p className="text-sm text-slate-500">At Risk</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold text-red-700">{stats.red}</p>
                <p className="text-sm text-slate-500">Critical</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Projects list */}
        <div className="col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Projects</h2>
            <Link href="/dashboard/projects" className="text-sm text-blue-700 hover:underline">View all</Link>
          </div>
          {projects.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FolderKanban className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 mb-4">No projects yet</p>
                <Link href="/dashboard/projects/new">
                  <Button><Plus className="w-4 h-4" />Create your first project</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            projects.slice(0, 6).map((project) => (
              <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-900 truncate">{project.name}</h3>
                          <Badge variant={project.healthStatus as any} className="shrink-0">
                            {project.healthStatus.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500">
                          {project.customer} · {project.methodology} · {project.engagementMode === "high_level" ? "Governance" : "Detailed"}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                          <span>{project._count.risks} risks</span>
                          <span>{project._count.issues} issues</span>
                          {project.budget && <span>{formatCurrency(project.budget, project.currency)}</span>}
                          {project.endDate && <span>Due {formatDate(project.endDate)}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400 capitalize">{project.status}</p>
                        <p className="text-xs text-slate-400">{project.pmOwner.fullName}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>

        {/* Upcoming milestones */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Upcoming Milestones</h2>
          {upcomingMilestones.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Clock className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-400">No upcoming milestones</p>
              </CardContent>
            </Card>
          ) : (
            upcomingMilestones.map((m) => (
              <Card key={m.id}>
                <CardContent className="p-4">
                  <p className="font-medium text-sm text-slate-900">{m.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{m.projectName}</p>
                  <p className="text-xs text-blue-700 mt-1 font-medium">{formatDate(m.dueDate)}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
