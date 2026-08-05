import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { formatDate, formatCurrency, methodologyLabel } from "@/lib/utils";
import { ProjectDeleteButton } from "@/components/project-delete-button";

// ── RAG helpers ──────────────────────────────────────────────────────────────
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
function statusChip(s: string): { color: string; bg: string } {
  if (s === "active")  return { color: "#007a55", bg: "#D6F5EC" };
  if (s === "on_hold") return { color: "#B07C10", bg: "#F9EDD1" };
  return { color: "#5b616e", bg: "#f2f4f7" };
}

// ── Approximate artifact completion out of 12 catalog types ──────────────────
function artifactPct(count: number) {
  return Math.min(100, Math.round((count / 12) * 100));
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
      milestones: {
        where: { dueDate: { gte: new Date() } },
        orderBy: { dueDate: "asc" },
        take: 1,
        select: { name: true, dueDate: true },
      },
      _count: { select: { risks: true, issues: true, artifacts: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div style={{ padding: "26px 28px 48px" }}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
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
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New Project
          </span>
        </Link>
      </div>

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {projects.length === 0 ? (
        <div style={{
          background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14,
          padding: "56px 24px", textAlign: "center" as const,
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16, margin: "0 auto 18px",
            background: "#E0F2F3", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2" stroke="#006E74" strokeWidth="1.7" />
              <path d="M3 9h18M8 4v5" stroke="#006E74" strokeWidth="1.7" />
            </svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1d24", marginBottom: 6 }}>No projects yet</div>
          <div style={{ fontSize: 13, color: "#8a909c", marginBottom: 22 }}>Create your first project to get started</div>
          <Link href="/dashboard/projects/new" style={{ textDecoration: "none" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px",
              background: "#006E74", color: "#fff", borderRadius: 10, fontSize: 13, fontWeight: 600,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Create Project
            </span>
          </Link>
        </div>
      ) : (

        /* ── Tile grid ────────────────────────────────────────────────────── */
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}>
          {projects.map((p) => {
            const rag  = p.healthStatus;
            const sc   = statusChip(p.status);
            const nextMs = p.milestones[0] ?? null;
            const pct  = artifactPct(p._count.artifacts);

            return (
              <div key={p.id} style={{
                background: "#fff",
                border: "1px solid #e2e5ea",
                borderRadius: 14,
                borderTop: `3px solid ${ragColor(rag)}`,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}>

                {/* ── Tile header (clickable → project detail) ──────────── */}
                <Link href={`/dashboard/projects/${p.id}`} style={{ textDecoration: "none", display: "block" }}>
                  <div style={{ padding: "16px 18px 14px" }}>

                    {/* Name row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{
                        flex: 1, fontSize: 15, fontWeight: 700, color: "#1a1d24",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                      }}>
                        {p.name}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" as const, flexShrink: 0,
                        color: ragColor(rag), background: ragBg(rag), borderRadius: 999, padding: "3px 9px",
                      }}>
                        {ragLabel(rag)}
                      </span>
                    </div>

                    {/* Meta row */}
                    <div style={{ fontSize: 12, color: "#8a909c", fontFamily: "monospace", marginBottom: 4 }}>
                      {p.code} · {(p as any).customer || "Internal"} · {methodologyLabel(p.methodology)}
                    </div>

                    {/* Description */}
                    {p.description && (
                      <div style={{
                        fontSize: 12.5, color: "#6b7280", marginTop: 2,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                      }}>
                        {p.description}
                      </div>
                    )}
                  </div>
                </Link>

                {/* ── Stat boxes ────────────────────────────────────────── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "0 18px 14px" }}>

                  {/* Artifacts */}
                  <div style={{ background: "#f0f6ff", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#2563EB", fontFamily: "monospace", lineHeight: 1 }}>
                      {p._count.artifacts}
                    </div>
                    <div style={{ fontSize: 11, color: "#6b80a8", marginTop: 3 }}>Artifacts</div>
                    <div style={{ marginTop: 7, height: 3, borderRadius: 99, background: "#dbeafe" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: "#2563EB", borderRadius: 99 }} />
                    </div>
                  </div>

                  {/* Risks */}
                  <div style={{
                    background: p._count.risks > 0 ? "#fffbeb" : "#f8f9fc",
                    borderRadius: 10, padding: "10px 12px",
                  }}>
                    <div style={{
                      fontSize: 22, fontWeight: 800, fontFamily: "monospace", lineHeight: 1,
                      color: p._count.risks > 0 ? "#B07C10" : "#c4c9d4",
                    }}>
                      {p._count.risks}
                    </div>
                    <div style={{ fontSize: 11, color: p._count.risks > 0 ? "#b07c10" : "#c4c9d4", marginTop: 3 }}>Risks</div>
                    <div style={{ marginTop: 7, fontSize: 10, color: p._count.risks > 0 ? "#B07C10" : "#e2e5ea" }}>
                      {p._count.risks > 0 ? "▲ review needed" : "● clear"}
                    </div>
                  </div>

                  {/* Issues */}
                  <div style={{
                    background: p._count.issues > 0 ? "#fff1f2" : "#f8f9fc",
                    borderRadius: 10, padding: "10px 12px",
                  }}>
                    <div style={{
                      fontSize: 22, fontWeight: 800, fontFamily: "monospace", lineHeight: 1,
                      color: p._count.issues > 0 ? "#c0392b" : "#c4c9d4",
                    }}>
                      {p._count.issues}
                    </div>
                    <div style={{ fontSize: 11, color: p._count.issues > 0 ? "#c0392b" : "#c4c9d4", marginTop: 3 }}>Issues</div>
                    <div style={{ marginTop: 7, fontSize: 10, color: p._count.issues > 0 ? "#c0392b" : "#e2e5ea" }}>
                      {p._count.issues > 0 ? "● action needed" : "● clear"}
                    </div>
                  </div>
                </div>

                {/* ── Next milestone strip ───────────────────────────────── */}
                {nextMs && (
                  <div style={{
                    margin: "0 18px 12px",
                    background: "#f5f9ff", border: "1px solid #dbeafe",
                    borderRadius: 8, padding: "7px 12px",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <rect x="3" y="4" width="18" height="16" rx="2" stroke="#2563EB" strokeWidth="1.8" />
                      <path d="M3 9h18M8 4v5M16 4v5" stroke="#2563EB" strokeWidth="1.8" />
                    </svg>
                    <span style={{ fontSize: 12, color: "#1e3a5f", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {nextMs.name}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#2563EB", whiteSpace: "nowrap" as const, fontFamily: "monospace" }}>
                      {nextMs.dueDate ? formatDate(nextMs.dueDate) : "–"}
                    </span>
                  </div>
                )}

                {/* ── Footer: budget · due date · PM · actions ──────────── */}
                <div style={{
                  marginTop: "auto", borderTop: "1px solid #f0f2f5",
                  padding: "10px 18px",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  {/* Left: meta */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {p.budget && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#007a55", fontFamily: "monospace" }}>
                          {formatCurrency(p.budget, p.currency)}
                        </span>
                      )}
                      <span style={{
                        fontSize: 11, fontWeight: 500,
                        color: sc.color, background: sc.bg,
                        borderRadius: 999, padding: "2px 8px", textTransform: "capitalize" as const,
                      }}>
                        {p.status.replace("_", " ")}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#8a909c" }}>
                      {p.endDate && (
                        <span style={{ fontFamily: "monospace" }}>Due {formatDate(p.endDate)}</span>
                      )}
                      <span style={{ color: "#c4c9d4" }}>·</span>
                      <span>{p.pmOwner.fullName}</span>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <Link href={`/dashboard/projects/${p.id}`} style={{ textDecoration: "none" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        height: 30, padding: "0 13px",
                        background: "#006E74", color: "#fff",
                        borderRadius: 8, fontSize: 12, fontWeight: 600,
                      }}>
                        Open
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                          <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </Link>
                    <ProjectDeleteButton projectId={p.id} projectName={p.name} />
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
