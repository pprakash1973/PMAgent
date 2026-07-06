import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, methodologyLabel } from "@/lib/utils";
import { TrendingUp, DollarSign, Users, BarChart3, AlertTriangle } from "lucide-react";

export default async function ExecutivePage() {
  const session = await auth();
  const user = session!.user as any;

  const projects = await prisma.project.findMany({
    where: { orgId: user.orgId, deletedAt: null },
    include: {
      pmOwner: { select: { fullName: true } },
      statusReports: { orderBy: { reportDate: "desc" }, take: 1, include: { healthScore: true } },
      _count: { select: { risks: true } },
    },
  });

  const totalBudget = projects.reduce((s, p) => s + (p.budget || 0), 0);
  const health = { green: 0, amber: 0, red: 0 };
  for (const p of projects) { const h = p.healthStatus as keyof typeof health; if (h in health) health[h]++; }
  const healthPct = projects.length ? Math.round((health.green / projects.length) * 100) : 0;

  const avgSPI = (() => {
    const vals = projects.map((p) => p.statusReports[0]?.healthScore?.spi).filter((v): v is number => v != null);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : "—";
  })();

  const totalTeam = projects.reduce((s, p) => s + (p.teamSize || 0), 0);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Executive Overview</h1>
        <p className="text-slate-500 text-sm mt-1">Organization-wide delivery health and financial performance</p>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Delivery Health", value: `${healthPct}%`, sub: `${health.green} green · ${health.amber} amber · ${health.red} red`, icon: TrendingUp, color: "text-green-600" },
          { label: "Total Portfolio Budget", value: totalBudget ? formatCurrency(totalBudget) : "—", sub: `${projects.length} active projects`, icon: DollarSign, color: "text-blue-600" },
          { label: "Avg. Schedule Perf. (SPI)", value: avgSPI, sub: "Across reporting projects", icon: BarChart3, color: "text-purple-600" },
          { label: "Total Resources", value: totalTeam > 0 ? `${totalTeam}` : "—", sub: "People across all projects", icon: Users, color: "text-orange-600" },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <m.icon className={`w-8 h-8 ${m.color} shrink-0`} />
                <div>
                  <p className="text-2xl font-bold text-slate-900">{m.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{m.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{m.sub}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Health distribution visual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Portfolio Health Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-6 rounded-full overflow-hidden bg-slate-100 flex">
              {health.green > 0 && <div className="bg-green-500 h-full transition-all" style={{ width: `${(health.green / projects.length) * 100}%` }} />}
              {health.amber > 0 && <div className="bg-amber-500 h-full transition-all" style={{ width: `${(health.amber / projects.length) * 100}%` }} />}
              {health.red > 0 && <div className="bg-red-500 h-full transition-all" style={{ width: `${(health.red / projects.length) * 100}%` }} />}
            </div>
          </div>
          <div className="flex gap-6 text-sm">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" />{health.green} On Track</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />{health.amber} At Risk</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />{health.red} Critical</span>
          </div>
        </CardContent>
      </Card>

      {/* Projects by health */}
      {[
        { label: "Critical Projects", status: "red", color: "border-red-500" },
        { label: "At-Risk Projects", status: "amber", color: "border-amber-500" },
      ].map(({ label, status, color }) => {
        const list = projects.filter((p) => p.healthStatus === status);
        if (!list.length) return null;
        return (
          <div key={status}>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {label} ({list.length})
            </h2>
            <div className="grid gap-3">
              {list.map((p) => (
                <Card key={p.id} className={`border-l-4 ${color}`}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900">{p.name}</span>
                        <Badge variant={p.healthStatus as any}>{p.healthStatus.toUpperCase()}</Badge>
                      </div>
                      <p className="text-sm text-slate-500">{p.pmOwner.fullName} · {methodologyLabel(p.methodology)}</p>
                      {p.statusReports[0]?.aiSummary && (
                        <p className="text-xs text-slate-400 mt-1 max-w-xl line-clamp-2">{p.statusReports[0].aiSummary}</p>
                      )}
                    </div>
                    <div className="text-right text-sm space-y-1">
                      {p.budget && <p className="font-medium">{formatCurrency(p.budget, p.currency)}</p>}
                      <p className="text-slate-400 text-xs">{p._count.risks} open risks</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      {/* Full portfolio table */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Complete Portfolio</h2>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Project", "Owner", "Method", "Budget", "Health", "SPI", "CPI", "Risks"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.pmOwner.fullName}</td>
                    <td className="px-4 py-3 text-slate-600">{methodologyLabel(p.methodology)}</td>
                    <td className="px-4 py-3 text-slate-600">{p.budget ? formatCurrency(p.budget, p.currency) : "—"}</td>
                    <td className="px-4 py-3"><Badge variant={p.healthStatus as any}>{p.healthStatus.toUpperCase()}</Badge></td>
                    <td className="px-4 py-3">{p.statusReports[0]?.healthScore?.spi?.toFixed(2) ?? "—"}</td>
                    <td className="px-4 py-3">{p.statusReports[0]?.healthScore?.cpi?.toFixed(2) ?? "—"}</td>
                    <td className="px-4 py-3">{p._count.risks}</td>
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
