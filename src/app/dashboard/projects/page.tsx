import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { formatDate, formatCurrency, methodologyLabel } from "@/lib/utils";
import { ProjectDeleteButton } from "@/components/project-delete-button";

function ragColor(s: string) {
  if (s === "green") return "#007a55";
  if (s === "amber") return "#B07C10";
  return "#c0392b";
}
function ragBg(s: string) {
  if (s === "green") return "#D6F5EC";
  if (s === "amber") return "#F9EDD1";
  return "#FEDDDA";
}
function ragLabel(s: string) {
  if (s === "green") return "On Track";
  if (s === "amber") return "At Risk";
  return "Critical";
}

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
    <div style={{ padding: "26px 28px 48px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1d24" }}>Projects</div>
          <div style={{ fontSize: 13, color: "#8a909c", marginTop: 3 }}>
            {projects.length} project{projects.length !== 1 ? "s" : ""} in your portfolio
          </div>
        </div>
        <Link href="/dashboard/projects/new" style={{ textDecoration: "none" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px",
            background: "#006E74", color: "#fff", borderRadius: 10, fontSize: 13, fontWeight: 600,
            boxShadow: "0 2px 6px rgba(0,110,116,.3)",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
            New Project
          </span>
        </Link>
      </div>

      {projects.length === 0 ? (
        <div style={{
          background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14,
          padding: "56px 24px", textAlign: "center" as const,
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16, margin: "0 auto 18px",
            background: "#E0F2F3", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="#006E74" strokeWidth="1.7" /><path d="M3 9h18M8 4v5" stroke="#006E74" strokeWidth="1.7" /></svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1d24", marginBottom: 6 }}>No projects yet</div>
          <div style={{ fontSize: 13, color: "#8a909c", marginBottom: 22 }}>Create your first project to get started</div>
          <Link href="/dashboard/projects/new" style={{ textDecoration: "none" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px",
              background: "#006E74", color: "#fff", borderRadius: 10, fontSize: 13, fontWeight: 600,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
              Create Project
            </span>
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {projects.map((project) => (
            <Link key={project.id} href={`/dashboard/projects/${project.id}`} style={{ textDecoration: "none" }}>
              <div style={{
                background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14,
                padding: "18px 20px", display: "flex", alignItems: "flex-start", gap: 20,
                borderLeft: `4px solid ${ragColor(project.healthStatus)}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#1a1d24" }}>{project.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: ragColor(project.healthStatus), background: ragBg(project.healthStatus), borderRadius: 999, padding: "3px 10px" }}>
                      {ragLabel(project.healthStatus)}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#5b616e", background: "#f2f4f7", borderRadius: 999, padding: "3px 10px" }}>
                      {project.engagementMode === "high_level" ? "Governance" : "Detailed"}
                    </span>
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: "#8a909c" }}>
                    {project.code} · {project.customer || "Internal"} · {methodologyLabel(project.methodology)}
                  </div>
                  {project.description && (
                    <div style={{ fontSize: 12.5, color: "#5b616e", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: 560 }}>
                      {project.description}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12 }}>
                    {[
                      { label: "artifacts", value: project._count.artifacts },
                      { label: "risks", value: project._count.risks },
                      { label: "issues", value: project._count.issues },
                    ].map(s => (
                      <span key={s.label} style={{ fontSize: 12, color: "#5b616e" }}>
                        <span className="mono" style={{ fontWeight: 600, color: "#1a1d24" }}>{s.value}</span> {s.label}
                      </span>
                    ))}
                    {project.budget && (
                      <span className="mono" style={{ fontSize: 12, color: "#01B27C", fontWeight: 600 }}>
                        {formatCurrency(project.budget, project.currency)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right" as const, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#5b616e", border: "1px solid #d3d7de", borderRadius: 999, padding: "3px 10px", textTransform: "capitalize" as const }}>
                      {project.status}
                    </span>
                    <ProjectDeleteButton projectId={project.id} projectName={project.name} />
                  </div>
                  <div style={{ fontSize: 11.5, color: "#8a909c" }}>{project.pmOwner.fullName}</div>
                  {project.endDate && (
                    <div className="mono" style={{ fontSize: 11, color: "#8a909c" }}>Due {formatDate(project.endDate)}</div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
