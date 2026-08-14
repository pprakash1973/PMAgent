import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionItemsClient } from "./action-items-client";

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function ragLabel(s: string) {
  return s === "red" ? "Critical" : s === "amber" ? "At Risk" : "On Track";
}

function ragStyle(s: string): { color: string; background: string } {
  if (s === "red")   return { color: "#7a1f1d", background: "#fbe4e2" };
  if (s === "amber") return { color: "#7a4e0a", background: "#fbf0da" };
  return                    { color: "#0a5c35", background: "#e3f3ea" };
}

function engLabel(s: string) {
  const map: Record<string, string> = {
    application_development: "App Dev",
    product_development:     "Product Dev",
    managed_services:        "Managed Services",
    consulting:              "Consulting",
    fixed_price:             "Fixed Price",
    time_and_materials:      "T&M",
    staff_augmentation:      "Staff Aug",
  };
  return map[s] ?? s.replace(/_/g, " ");
}

const healthOrder: Record<string, number> = { red: 0, amber: 1, green: 2 };

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user as any;

  if (user.role === "dh")                       redirect("/dashboard/executive");
  if (user.role === "dm" || user.role === "pgm") redirect("/dashboard/dm");

  const now  = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const today = now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const [projects, actionItems] = await Promise.all([
   prisma.project.findMany({
    where: {
      orgId:     user.orgId,
      deletedAt: null,
      status:    { not: "closed" },
      ...(user.role === "pm" ? { pmOwnerId: user.id } : {}),
    },
    include: {
      account: { select: { name: true } },
      cluster: { select: { name: true } },
      program: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  }),
  prisma.actionItem.findMany({
    where: {
      assignedToId: user.id,
      status: { notIn: ["closed", "cancelled"] },
    },
    include: {
      project: { select: { id: true, name: true } },
      raisedBy: { select: { fullName: true } },
    },
    orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
    take: 20,
  }),
 ]);

  // Sort: red → amber → green, then by name within each group
  const rows = [...projects].sort((a, b) => {
    const ha = healthOrder[a.healthStatus ?? "green"] ?? 2;
    const hb = healthOrder[b.healthStatus ?? "green"] ?? 2;
    return ha !== hb ? ha - hb : a.name.localeCompare(b.name);
  });

  const total = rows.length;

  return (
    <div style={{ padding: "24px 28px 48px", minHeight: "100%", fontFamily: "var(--font-inter),'Inter',system-ui,sans-serif", background: "#F4F6F8" }}>
      <style>{`
        .pm-row { transition: box-shadow .15s; }
        .pm-row:hover { box-shadow: 0 4px 16px rgba(0,110,116,.10); }
        .pm-open:hover { background: #0097AC !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0F2020", margin: 0, lineHeight: 1.2 }}>
            Good {greeting}, {(user.name ?? user.email)?.split(" ")[0]}
          </h1>
          <p style={{ fontSize: 12.5, color: "#6B7E8A", margin: "4px 0 0" }}>
            {today} · {total} active project{total !== 1 ? "s" : ""}
          </p>
        </div>
        {(user.role === "pm" || user.role === "admin") && (
          <Link href="/dashboard/projects/new" style={{ textDecoration: "none" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", height: 36, padding: "0 16px",
              background: "#006E74", color: "#fff", borderRadius: 9,
              fontSize: 13, fontWeight: 600, boxShadow: "0 1px 4px rgba(0,110,116,.25)",
            }}>
              + New Project
            </span>
          </Link>
        )}
      </div>

      {/* Section label */}
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", color: "#94a3b8", marginBottom: 12 }}>
        My projects
      </div>

      {/* Project list */}
      {total === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #DDE3E8", borderRadius: 12, padding: "52px 24px", textAlign: "center" as const }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#0F2020", margin: "0 0 6px" }}>No active projects</p>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Create your first project to get started</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
          {rows.map(p => {
            const tag = ragStyle(p.healthStatus ?? "green");
            return (
              <div key={p.id} className="pm-row" style={{
                background: "#fff", border: "1px solid #DDE3E8", borderRadius: 12,
                display: "grid", gridTemplateColumns: "1fr auto",
                alignItems: "center", padding: "14px 18px", gap: 16,
              }}>
                {/* Left: breadcrumb + name + meta */}
                <div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    {p.cluster?.name && <><span>{p.cluster.name}</span><span style={{ margin: "0 1px" }}>›</span></>}
                    <span>{p.account?.name ?? "—"}</span>
                    {p.program?.name && <><span style={{ margin: "0 1px" }}>›</span><span>{p.program.name}</span></>}
                  </div>

                  <div style={{ fontSize: 15, fontWeight: 600, color: "#0F2020", marginBottom: 7 }}>
                    {p.name}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" as const }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6B7E8A" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5M16 4v5"/>
                      </svg>
                      {fmtDate(p.startDate)}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6B7E8A" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                      {fmtDate(p.endDate)}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, ...tag }}>
                      {ragLabel(p.healthStatus ?? "green")}
                    </span>
                  </div>
                </div>

                {/* Right: engagement type + open button */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 4,
                    background: "#f4f6f8", border: "0.5px solid #DDE3E8", color: "#6B7E8A",
                    whiteSpace: "nowrap" as const,
                  }}>
                    {engLabel(p.engagementType)}
                  </span>
                  <Link href={`/dashboard/projects/${p.id}`} style={{ textDecoration: "none" }}>
                    <span className="pm-open" style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      height: 32, padding: "0 14px",
                      background: "#006E74", color: "#fff",
                      borderRadius: 8, fontSize: 13, fontWeight: 600,
                      whiteSpace: "nowrap" as const, cursor: "pointer",
                    }}>
                      Open →
                    </span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action Items — below projects */}
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", color: "#94a3b8", marginTop: 28, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        Action items
        {actionItems.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "#fbe4e2", color: "#7a1f1d" }}>
            {actionItems.length}
          </span>
        )}
      </div>
      <ActionItemsClient
        items={actionItems.map(a => ({
          id: a.id,
          reference: a.reference,
          title: a.title,
          priority: a.priority,
          status: a.status,
          dueDate: a.dueDate ? a.dueDate.toISOString() : null,
          project: a.project,
          raisedBy: { fullName: a.raisedBy.fullName },
        }))}
        overdueCount={actionItems.filter(a => a.dueDate && a.dueDate < new Date()).length}
      />
    </div>
  );
}
