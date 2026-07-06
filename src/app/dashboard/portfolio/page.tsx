import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency, methodologyLabel } from "@/lib/utils";
import { BarChart3, AlertTriangle, CheckCircle2, TrendingDown } from "lucide-react";

export default async function PortfolioPage() {
  const session = await auth();
  const user = session!.user as any;

  const projects = await prisma.project.findMany({
    where: { orgId: user.orgId, deletedAt: null },
    include: {
      pmOwner: { select: { fullName: true } },
      milestones: { where: { status: "pending" }, orderBy: { dueDate: "asc" }, take: 2 },
      statusReports: { orderBy: { reportDate: "desc" }, take: 1, include: { healthScore: true } },
      _count: { select: { risks: true, issues: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const health = { green: 0, amber: 0, red: 0 };
  for (const p of projects) {
    const h = p.healthStatus as keyof typeof health;
    if (h in health) health[h]++;
  }

  const atRisk = projects.filter((p) => p.healthStatus === "amber" || p.healthStatus === "red");

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Portfolio Overview</h1>
        <p className="text-slate-500 text-sm mt-1">{projects.length} active projects across your delivery portfolio</p>
      </div>

      {/* Health distribution */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-blue-500" />
            <div><p className="text-2xl font-bold">{projects.length}</p><p className="text-sm text-slate-500">Total Projects</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
            <div><p className="text-2xl font-bold text-green-700">{health.green}</p><p className="text-sm text-slate-500">On Track</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <div><p className="text-2xl font-bold text-amber-700">{health.amber}</p><p className="text-sm text-slate-500">At Risk</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <TrendingDown className="w-8 h-8 text-red-500" />
            <div><p className="text-2xl font-bold text-red-700">{health.red}</p><p className="text-sm text-slate-500">Critical</p></div>
          </CardContent>
        </Card>
      </div>

      {/* At-risk projects */}
      {atRisk.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Projects Requiring Attention
          </h2>
          <div className="grid gap-3">
            {atRisk.map((p) => (
              <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4" style={{ borderLeftColor: p.healthStatus === "red" ? "#dc2626" : "#f59e0b" }}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-slate-900">{p.name}</span>
                          <Badge variant={p.healthStatus as any}>{p.healthStatus.toUpperCase()}</Badge>
                        </div>
                        <p className="text-sm text-slate-500">{p.pmOwner.fullName} · {methodologyLabel(p.methodology)}</p>
                        {p.statusReports[0]?.aiSummary && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-1">{p.statusReports[0].aiSummary}</p>
                        )}
                      </div>
                      <div className="text-right text-sm space-y-1">
                        <p className="text-slate-500">{p._count.risks} risks · {p._count.issues} issues</p>
                        {p.statusReports[0]?.healthScore && (
                          <div className="text-xs text-slate-400">
                            {p.statusReports[0].healthScore.spi && `SPI: ${p.statusReports[0].healthScore.spi}`}
                            {p.statusReports[0].healthScore.cpi && ` · CPI: ${p.statusReports[0].healthScore.cpi}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* All projects table */}
      <div>
        <h2 className="text-lg font-semibold mb-3">All Projects</h2>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Project", "PM Owner", "Methodology", "Mode", "Health", "SPI", "CPI", "Risks", "End Date"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 cursor-pointer">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/projects/${p.id}`} className="font-medium text-slate-900 hover:text-blue-700">{p.name}</Link>
                      <p className="text-xs text-slate-400">{p.code}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.pmOwner.fullName}</td>
                    <td className="px-4 py-3 text-slate-600">{methodologyLabel(p.methodology)}</td>
                    <td className="px-4 py-3"><Badge variant="secondary" className="text-xs">{p.engagementMode === "high_level" ? "Governance" : "Detailed"}</Badge></td>
                    <td className="px-4 py-3"><Badge variant={p.healthStatus as any}>{p.healthStatus.toUpperCase()}</Badge></td>
                    <td className="px-4 py-3 text-slate-600">{p.statusReports[0]?.healthScore?.spi?.toFixed(2) ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{p.statusReports[0]?.healthScore?.cpi?.toFixed(2) ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{p._count.risks}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(p.endDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
