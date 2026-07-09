import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatCurrency, methodologyLabel } from "@/lib/utils";
import { HealthDonut, BudgetBar, MethodologyBar, RiskBar } from "@/components/executive-charts";

const CAN_EXECUTIVE = ["delivery_head", "admin"];

function ragColor(s: string) {
  if (s === "green") return "#158a5a";
  if (s === "amber") return "#c17d12";
  return "#cf3f3a";
}
function ragBg(s: string) {
  if (s === "green") return "#e3f3ea";
  if (s === "amber") return "#fbf0da";
  return "#fbe4e2";
}
function ragLabel(s: string) {
  if (s === "green") return "On Track";
  if (s === "amber") return "At Risk";
  return "Critical";
}

export default async function ExecutivePage() {
  const session = await auth();
  const user = session!.user as any;
  if (!CAN_EXECUTIVE.includes(user.role)) redirect("/dashboard/projects");

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

  const budgetData = projects.filter((p) => p.budget).sort((a, b) => (b.budget ?? 0) - (a.budget ?? 0))
    .map((p) => ({ name: p.name.length > 20 ? p.name.slice(0, 18) + "…" : p.name, value: p.budget! }));

  const methodologyCounts: Record<string, number> = {};
  for (const p of projects) { const label = methodologyLabel(p.methodology); methodologyCounts[label] = (methodologyCounts[label] ?? 0) + 1; }
  const methodologyData = Object.entries(methodologyCounts).map(([name, value]) => ({ name, value }));

  const riskData = projects.filter((p) => p._count.risks > 0).sort((a, b) => b._count.risks - a._count.risks)
    .map((p) => ({ name: p.name.length > 20 ? p.name.slice(0, 18) + "…" : p.name, value: p._count.risks }));

  const atRisk = projects.filter((p) => p.healthStatus === "amber" || p.healthStatus === "red");

  return (
    <div style={{ padding: "26px 28px 48px" }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1d24" }}>Executive Overview</div>
        <div style={{ fontSize: 13, color: "#8a909c", marginTop: 3 }}>Organization-wide delivery health and financial performance</div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "flex", gap: 14, marginBottom: 22 }}>
        {[
          { label: "Delivery Health", value: `${healthPct}%`, sub: `${health.green} on track`, color: "#158a5a", bg: "#e3f3ea" },
          { label: "Portfolio Budget", value: totalBudget ? formatCurrency(totalBudget) : "—", sub: `${projects.length} projects`, color: "#4f5bd5", bg: "#eef0fc" },
          { label: "Avg. SPI", value: avgSPI, sub: "Schedule performance index", color: Number(avgSPI) >= 1 ? "#158a5a" : "#c17d12", bg: Number(avgSPI) >= 1 ? "#e3f3ea" : "#fbf0da" },
          { label: "Total Resources", value: totalTeam > 0 ? `${totalTeam}` : "—", sub: "People across all projects", color: "#8a2be2", bg: "#f4eeff" },
        ].map(k => (
          <div key={k.label} style={{ flex: 1, background: k.bg, borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: k.color, fontFamily: "'IBM Plex Mono',monospace" }}>{k.value}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: k.color, marginTop: 3 }}>{k.label}</div>
            <div style={{ fontSize: 11.5, color: "#5b616e", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 22 }}>
        <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Portfolio Health Distribution</div>
          <HealthDonut green={health.green} amber={health.amber} red={health.red} />
        </div>
        <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Methodology Breakdown</div>
          <MethodologyBar data={methodologyData} />
        </div>
        <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Budget by Project</div>
          <BudgetBar data={budgetData} />
        </div>
        <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Open Risk Exposure</div>
          <RiskBar data={riskData} />
        </div>
      </div>

      {/* AI Insights */}
      <div style={{ background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: "1px solid #cfd4f5", borderRadius: 14, padding: "18px 20px", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ color: "#4f5bd5", fontSize: 16 }}>✦</span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: "#4f5bd5", textTransform: "uppercase" as const }}>AI Executive Insights</span>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" as const }}>
          {atRisk.length === 0 && <p style={{ fontSize: 13, color: "#3a3f52", lineHeight: 1.6, margin: 0 }}>Portfolio is in good health — {health.green} of {projects.length} projects on track. No critical interventions required at this time.</p>}
          {atRisk.length > 0 && <p style={{ fontSize: 13, color: "#3a3f52", lineHeight: 1.6, margin: 0 }}>{atRisk.length} project{atRisk.length > 1 ? "s" : ""} ({atRisk.map(p => p.name).join(", ")}) require{atRisk.length === 1 ? "s" : ""} attention. Review status reports and escalate schedule/budget risks before next steering committee.</p>}
        </div>
      </div>

      {/* At-risk table */}
      {atRisk.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, overflow: "hidden", marginBottom: 22 }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #eceef2", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Interventions Required</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#cf3f3a", background: "#fbe4e2", borderRadius: 999, padding: "2px 9px" }}>{atRisk.length}</span>
          </div>
          {atRisk.map((p, i) => (
            <Link key={p.id} href={`/dashboard/projects/${p.id}`} style={{ textDecoration: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderTop: i === 0 ? "none" : "1px solid #eceef2", borderLeft: `4px solid ${ragColor(p.healthStatus)}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: "#1a1d24" }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: "#8a909c", marginTop: 2 }}>{p.pmOwner.fullName}</div>
                  {p.statusReports[0]?.aiSummary && <div style={{ fontSize: 11.5, color: "#5b616e", marginTop: 3, maxWidth: 560, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.statusReports[0].aiSummary}</div>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: ragColor(p.healthStatus), background: ragBg(p.healthStatus), borderRadius: 999, padding: "4px 11px" }}>{ragLabel(p.healthStatus)}</span>
                {p.budget && <span style={{ fontSize: 12, fontWeight: 500, color: "#5b616e", whiteSpace: "nowrap" as const }}>{formatCurrency(p.budget, p.currency)}</span>}
                <span style={{ fontSize: 12, color: "#8a909c" }}>{p._count.risks} risks</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Full portfolio table */}
      <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px 10px", borderBottom: "1px solid #eceef2", fontSize: 14, fontWeight: 600 }}>Complete Portfolio</div>
        <div style={{ overflowX: "auto" as const }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f7f8fa" }}>
                {["Project", "Owner", "Method", "Budget", "Health", "SPI", "CPI", "Risks"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "9px 16px", fontSize: 10, fontWeight: 600, color: "#8a909c", letterSpacing: ".05em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id} style={{ borderTop: "1px solid #eceef2" }}>
                  <td style={{ padding: "13px 16px", fontWeight: 600, color: "#1a1d24" }}>{p.name}</td>
                  <td style={{ padding: "13px 16px", color: "#5b616e" }}>{p.pmOwner.fullName}</td>
                  <td style={{ padding: "13px 16px", color: "#5b616e" }}>{methodologyLabel(p.methodology)}</td>
                  <td style={{ padding: "13px 16px", color: "#5b616e", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>{p.budget ? formatCurrency(p.budget, p.currency) : "—"}</td>
                  <td style={{ padding: "13px 16px" }}><span style={{ fontSize: 11, fontWeight: 600, color: ragColor(p.healthStatus), background: ragBg(p.healthStatus), borderRadius: 6, padding: "3px 9px" }}>{ragLabel(p.healthStatus)}</span></td>
                  <td style={{ padding: "13px 16px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, color: "#5b616e" }}>{p.statusReports[0]?.healthScore?.spi?.toFixed(2) ?? "—"}</td>
                  <td style={{ padding: "13px 16px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, color: "#5b616e" }}>{p.statusReports[0]?.healthScore?.cpi?.toFixed(2) ?? "—"}</td>
                  <td style={{ padding: "13px 16px", color: p._count.risks > 3 ? "#cf3f3a" : "#5b616e" }}>{p._count.risks}</td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr><td colSpan={8} style={{ padding: "24px 16px", textAlign: "center" as const, color: "#8a909c", fontSize: 13 }}>No projects yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
