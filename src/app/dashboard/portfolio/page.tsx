import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDate, formatCurrency, methodologyLabel } from "@/lib/utils";
import { SteeringDeckGenerator } from "@/components/steering-deck-generator";

const CAN_PORTFOLIO = ["delivery_manager", "delivery_head", "admin"];

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

export default async function PortfolioPage() {
  const session = await auth();
  const user = session!.user as any;
  if (!CAN_PORTFOLIO.includes(user.role)) redirect("/dashboard/projects");

  const projects = await prisma.project.findMany({
    where: { orgId: user.orgId, deletedAt: null },
    include: {
      pmOwner: { select: { fullName: true } },
      milestones: { where: { status: "pending" }, orderBy: { dueDate: "asc" }, take: 1 },
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
    <div style={{ padding: "26px 28px 48px" }}>
      {/* Header */}
      <div style={{ marginBottom: 22, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1d24" }}>Portfolio Overview</div>
          <div style={{ fontSize: 13, color: "#8a909c", marginTop: 3 }}>{projects.length} active projects · as of today</div>
        </div>
        <SteeringDeckGenerator projects={projects.map((p) => ({ id: p.id, name: p.name, healthStatus: p.healthStatus }))} />
      </div>

      {/* KPI strip */}
      <div style={{ display: "flex", gap: 14, marginBottom: 22 }}>
        {[
          { label: "Total Projects", value: projects.length, color: "#4f5bd5", bg: "#eef0fc" },
          { label: "On Track", value: health.green, color: "#158a5a", bg: "#e3f3ea" },
          { label: "At Risk", value: health.amber, color: "#c17d12", bg: "#fbf0da" },
          { label: "Critical", value: health.red, color: "#cf3f3a", bg: "#fbe4e2" },
        ].map(k => (
          <div key={k.label} style={{ flex: 1, background: k.bg, borderRadius: 14, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: k.color, fontFamily: "'IBM Plex Mono',monospace" }}>{k.value}</span>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: k.color }}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* At-risk highlight */}
      {atRisk.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, marginBottom: 22, overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #eceef2", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Needs Attention</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#cf3f3a", background: "#fbe4e2", borderRadius: 999, padding: "2px 9px" }}>{atRisk.length}</span>
          </div>
          {atRisk.map((p, i) => (
            <Link key={p.id} href={`/dashboard/projects/${p.id}`} style={{ textDecoration: "none" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                borderTop: i === 0 ? "none" : "1px solid #eceef2",
                borderLeft: `4px solid ${ragColor(p.healthStatus)}`,
                background: "#fff",
                transition: "background .1s",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: "#1a1d24" }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: "#8a909c", marginTop: 2 }}>{p.pmOwner.fullName} · {methodologyLabel(p.methodology)}</div>
                  {p.statusReports[0]?.aiSummary && (
                    <div style={{ fontSize: 11.5, color: "#5b616e", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 520 }}>{p.statusReports[0].aiSummary}</div>
                  )}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: ragColor(p.healthStatus), background: ragBg(p.healthStatus), borderRadius: 999, padding: "4px 11px" }}>
                  {ragLabel(p.healthStatus)}
                </span>
                <div style={{ textAlign: "right", minWidth: 80 }}>
                  <div style={{ fontSize: 12, color: "#5b616e" }}>{p._count.risks} risks</div>
                  <div style={{ fontSize: 11.5, color: "#8a909c" }}>{p._count.issues} issues</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* All projects table */}
      <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px 10px", borderBottom: "1px solid #eceef2", fontSize: 14, fontWeight: 600 }}>All Projects</div>
        <div style={{ overflowX: "auto" as const }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f7f8fa" }}>
                {["Project", "PM Owner", "Methodology", "Mode", "Health", "SPI", "CPI", "Risks", "End Date"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "9px 16px", fontSize: 10, fontWeight: 600, color: "#8a909c", letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && (
                <tr><td colSpan={9} style={{ padding: "24px 16px", textAlign: "center", color: "#8a909c", fontSize: 13 }}>No projects yet. <Link href="/dashboard/projects/new" style={{ color: "#4f5bd5" }}>Create your first project →</Link></td></tr>
              )}
              {projects.map((p) => (
                <tr key={p.id} style={{ borderTop: "1px solid #eceef2" }}>
                  <td style={{ padding: "13px 16px" }}>
                    <Link href={`/dashboard/projects/${p.id}`} style={{ fontWeight: 600, color: "#1a1d24", textDecoration: "none" }}>{p.name}</Link>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: "#8a909c" }}>{p.code}</div>
                  </td>
                  <td style={{ padding: "13px 16px", color: "#5b616e" }}>{p.pmOwner.fullName}</td>
                  <td style={{ padding: "13px 16px", color: "#5b616e" }}>{methodologyLabel(p.methodology)}</td>
                  <td style={{ padding: "13px 16px" }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#5b616e", background: "#f2f4f7", borderRadius: 6, padding: "3px 9px" }}>
                      {p.engagementMode === "high_level" ? "Governance" : "Detailed"}
                    </span>
                  </td>
                  <td style={{ padding: "13px 16px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: ragColor(p.healthStatus), background: ragBg(p.healthStatus), borderRadius: 6, padding: "3px 9px" }}>
                      {ragLabel(p.healthStatus)}
                    </span>
                  </td>
                  <td style={{ padding: "13px 16px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, color: "#5b616e" }}>{p.statusReports[0]?.healthScore?.spi?.toFixed(2) ?? "—"}</td>
                  <td style={{ padding: "13px 16px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, color: "#5b616e" }}>{p.statusReports[0]?.healthScore?.cpi?.toFixed(2) ?? "—"}</td>
                  <td style={{ padding: "13px 16px", color: p._count.risks > 3 ? "#cf3f3a" : "#5b616e" }}>{p._count.risks}</td>
                  <td style={{ padding: "13px 16px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "#5b616e" }}>{formatDate(p.endDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
