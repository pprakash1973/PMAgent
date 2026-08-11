import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionItemsClient } from "./action-items-client";

// ── helpers ───────────────────────────────────────────────────────────────────

function computeAttentionScore(p: {
  healthStatus: string; spi: number | null; cpi: number | null;
  compositeScore: number | null; openActionItems: number; highRisks: number; criticalIssues: number;
}): number {
  const composite = p.compositeScore ?? (p.healthStatus === "red" ? 40 : p.healthStatus === "amber" ? 65 : 85);
  let tw = 0, ws = 0;
  ws += ((100 - composite) / 100) * 30; tw += 30;
  if (p.spi !== null) { ws += Math.min(1, Math.max(0, (1 - p.spi) / 0.4)) * 15; tw += 15; }
  if (p.cpi !== null) { ws += Math.min(1, Math.max(0, (1 - p.cpi) / 0.4)) * 15; tw += 15; }
  ws += Math.min(1, p.openActionItems / 4) * 10; tw += 10;
  ws += Math.min(1, (p.highRisks + p.criticalIssues) / 5) * 30; tw += 30;
  return Math.round((ws / tw) * 100);
}

const C = {
  bg: "#F2F7F8", surface: "#ffffff", border: "#D7E0E3",
  teal: "#006E74", lt: "#0097AC",
  text: "#1a1d24", muted: "#64748b", faint: "#94a3b8",
  red: "#c5392b", amber: "#c17d12", green: "#01B27C",
  FF: "'Aptos','Calibri',system-ui,sans-serif",
  FM: "'Consolas','Courier New',monospace",
} as const;

function ragColor(s: string) { return s === "red" ? C.red : s === "amber" ? C.amber : C.green; }
function ragBg(s: string) { return s === "red" ? "rgba(197,57,43,.12)" : s === "amber" ? "rgba(193,125,18,.12)" : "rgba(1,178,124,.12)"; }
function ragLabel(s: string) { return s === "red" ? "Critical" : s === "amber" ? "At Risk" : "On Track"; }
function spiColor(v: number | null) { return v === null ? C.faint : v < 0.85 ? C.red : v < 0.95 ? C.amber : C.green; }
function scoreColor(s: number) { return s >= 60 ? C.red : s >= 30 ? C.amber : C.green; }
function fmt(v: number | null) { return v === null ? "—" : v.toFixed(2); }
function fmtDate(d: Date) { return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }); }

// ── page ─────────────────────────────────────────────────────────────────────

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
      account: { select: { name: true } },
      milestones: { where: { status: "pending" }, orderBy: { dueDate: "asc" }, take: 1 },
      statusReports: {
        orderBy: { reportDate: "desc" }, take: 1,
        include: { healthScore: true },
      },
      _count: {
        select: {
          risks:  { where: { status: "open", probability: { in: ["high", "very_high"] } } },
          issues: { where: { status: "open", severity:    { in: ["critical", "high"]  } } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  const now = new Date();

  // Action items
  let myActionItems: any[] = [];
  const aiCountMap: Record<string, number> = {};
  let overdueCount = 0;
  try {
    if (user.role === "pm") {
      myActionItems = await prisma.actionItem.findMany({
        where: { assignedToId: user.id, status: { in: ["open", "acknowledged", "in_progress", "blocked"] } },
        orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
        include: {
          project: { select: { id: true, name: true } },
          raisedBy: { select: { fullName: true } },
        },
        take: 10,
      });
      overdueCount = myActionItems.filter((i: any) => i.dueDate && i.dueDate < now).length;
    }
    const aiCounts = await prisma.actionItem.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projects.map(p => p.id) }, status: { in: ["open", "acknowledged", "in_progress", "blocked"] } },
      _count: { id: true },
    });
    aiCounts.forEach(r => { aiCountMap[r.projectId] = r._count.id; });
  } catch { /* table not yet migrated */ }

  // Per-project derived data
  const rows = projects.map(p => {
    const hs = p.statusReports[0]?.healthScore ?? null;
    const spi = hs?.spi ?? null;
    const cpi = hs?.cpi ?? null;
    const compositeScore = hs?.compositeScore ?? null;
    const openAI = aiCountMap[p.id] ?? 0;
    const attentionScore = computeAttentionScore({
      healthStatus: p.healthStatus, spi, cpi, compositeScore,
      openActionItems: openAI, highRisks: p._count.risks, criticalIssues: p._count.issues,
    });
    const nextMs = p.milestones[0] ?? null;
    const daysToMs = nextMs ? Math.ceil((nextMs.dueDate.getTime() - now.getTime()) / 86400000) : null;
    return { ...p, spi, cpi, compositeScore, openAI, attentionScore, nextMs, daysToMs };
  });

  // Stat tile values
  const total = rows.length;
  const atRisk = rows.filter(p => p.healthStatus === "red" || p.healthStatus === "amber").length;
  const totalActions = Object.values(aiCountMap).reduce((a, b) => a + b, 0);
  const futureDays = rows.map(p => p.daysToMs).filter((d): d is number => d !== null && d >= 0);
  const minDays = futureDays.length ? Math.min(...futureDays) : null;
  const nextMsProj = minDays !== null ? rows.find(p => p.daysToMs === minDays) : null;
  const uniqueAccounts = new Set(rows.map(p => p.accountId).filter(Boolean)).size;

  const today = new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div style={{ padding: "22px 24px 48px", background: C.bg, minHeight: "100%", fontFamily: C.FF }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: 0 }}>
            Good morning, {user.name?.split(" ")[0]}
          </h1>
          <p style={{ fontSize: 12, color: C.muted, margin: "3px 0 0" }}>
            {today}
            {` · ${total} active project${total !== 1 ? "s" : ""}`}
            {overdueCount > 0 ? ` · ${overdueCount} overdue action item${overdueCount !== 1 ? "s" : ""}` : ""}
          </p>
        </div>
        {(user.role === "pm" || user.role === "admin") && (
          <Link href="/dashboard/projects/new" style={{ textDecoration: "none" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 34, padding: "0 15px",
              background: C.teal, color: "#fff", borderRadius: 9,
              fontSize: 12.5, fontWeight: 600,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              New Project
            </span>
          </Link>
        )}
      </div>

      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 22 }}>
        {([
          {
            value: total, label: "Active Projects",
            sub: `${uniqueAccounts} account${uniqueAccounts !== 1 ? "s" : ""}`,
            accent: "#003C51",
          },
          {
            value: atRisk, label: "At Risk",
            sub: total ? `${Math.round(atRisk / total * 100)}% of portfolio` : "No projects",
            accent: atRisk > 0 ? C.amber : C.green,
          },
          {
            value: totalActions, label: "Open Action Items",
            sub: overdueCount > 0 ? `${overdueCount} overdue` : "All on track",
            accent: totalActions > 0 ? C.red : C.green,
          },
          {
            value: minDays !== null ? minDays : "—",
            label: "Days to Next Milestone",
            sub: nextMsProj?.nextMs?.name ?? "No upcoming milestones",
            accent: C.lt,
          },
        ] as const).map((tile) => (
          <div key={tile.label} style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 11, borderLeft: `3.5px solid ${tile.accent}`, padding: "13px 15px",
          }}>
            <div style={{ fontFamily: C.FM, fontSize: 29, fontWeight: 700, color: tile.accent, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {tile.value}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginTop: 6 }}>{tile.label}</div>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tile.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>My Projects</span>
        <Link href="/dashboard/projects" style={{ textDecoration: "none", fontSize: 12, color: C.teal, fontWeight: 600 }}>
          View all →
        </Link>
      </div>

      {/* Project tiles */}
      {rows.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "48px 24px", textAlign: "center", marginBottom: 22 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: "0 0 6px" }}>No active projects yet</p>
          <p style={{ fontSize: 13, color: C.faint, margin: 0 }}>Create your first project to get started.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 13, marginBottom: 22 }}>
          {rows.map(p => {
            const rc = ragColor(p.healthStatus);
            const sc = scoreColor(p.attentionScore);
            return (
              <div key={p.id} style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 12, borderTop: `3px solid ${rc}`,
                display: "flex", flexDirection: "column", overflow: "hidden",
              }}>
                <div style={{ padding: "13px 15px 0" }}>
                  {/* Name + badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                    <Link href={`/dashboard/projects/${p.id}`} style={{ flex: 1, textDecoration: "none", overflow: "hidden" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                    </Link>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, flexShrink: 0, letterSpacing: ".04em", background: ragBg(p.healthStatus), color: rc }}>
                      {ragLabel(p.healthStatus)}
                    </span>
                  </div>

                  {/* Meta */}
                  <div style={{ fontSize: 10.5, color: C.faint, fontFamily: C.FM, marginBottom: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.account?.name ?? "Unassigned"} · {p.currentPhase.replace(/_/g, " ")}
                  </div>

                  {/* SPI / CPI */}
                  {(p.spi !== null || p.cpi !== null) && (
                    <div style={{ display: "flex", gap: 14, marginBottom: 9 }}>
                      {p.spi !== null && (
                        <span style={{ fontSize: 11, color: C.muted }}>
                          SPI <strong style={{ fontFamily: C.FM, fontWeight: 700, color: spiColor(p.spi) }}>{fmt(p.spi)}</strong>
                        </span>
                      )}
                      {p.cpi !== null && (
                        <span style={{ fontSize: 11, color: C.muted }}>
                          CPI <strong style={{ fontFamily: C.FM, fontWeight: 700, color: spiColor(p.cpi) }}>{fmt(p.cpi)}</strong>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Attention score bar */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>Attention score</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: sc, fontFamily: C.FM }}>{p.attentionScore}</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 99, background: "#eef0f3", marginBottom: 9 }}>
                    <div style={{ height: "100%", width: `${p.attentionScore}%`, background: sc, borderRadius: 99 }} />
                  </div>

                  {/* Pills */}
                  <div style={{ display: "flex", gap: 5, marginBottom: 9, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 6, fontSize: 10.5, fontWeight: 600, background: p._count.risks > 0 ? "#fdf3e0" : "#f1f4f8", color: p._count.risks > 0 ? C.amber : "#c4c9d4" }}>
                      {p._count.risks} risks
                    </span>
                    <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 6, fontSize: 10.5, fontWeight: 600, background: p._count.issues > 0 ? "#fff1f0" : "#f1f4f8", color: p._count.issues > 0 ? C.red : "#c4c9d4" }}>
                      {p._count.issues} issues
                    </span>
                    <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 6, fontSize: 10.5, fontWeight: 600, background: p.openAI > 0 ? "#e8f5f8" : "#f1f4f8", color: p.openAI > 0 ? C.lt : "#c4c9d4" }}>
                      {p.openAI} actions
                    </span>
                  </div>
                </div>

                {/* Milestone strip */}
                {p.nextMs ? (
                  <div style={{ margin: "0 15px 9px", background: C.bg, borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "center" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginRight: 7 }}>
                      <rect x="3" y="4" width="18" height="16" rx="2" stroke={C.lt} strokeWidth="1.8" />
                      <path d="M3 9h18M8 4v5M16 4v5" stroke={C.lt} strokeWidth="1.8" />
                    </svg>
                    <span style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {p.nextMs.name}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.lt, fontFamily: C.FM, flexShrink: 0, marginLeft: 8 }}>
                      {fmtDate(p.nextMs.dueDate)}
                    </span>
                  </div>
                ) : (
                  <div style={{ height: 8 }} />
                )}

                {/* Footer */}
                <div style={{ marginTop: "auto", borderTop: "1px solid #f0f2f5", padding: "8px 15px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: C.muted }}>{p.pmOwner.fullName}</span>
                  <Link href={`/dashboard/projects/${p.id}`} style={{ textDecoration: "none" }}>
                    <span style={{ display: "inline-flex", height: 26, padding: "0 12px", background: C.teal, color: "#fff", borderRadius: 7, fontSize: 11, fontWeight: 600, alignItems: "center" }}>
                      Open →
                    </span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action items (PM only) */}
      {user.role === "pm" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>My Action Items</span>
            {overdueCount > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: C.red, background: "rgba(197,57,43,.09)", padding: "2px 9px", borderRadius: 4 }}>
                {overdueCount} overdue
              </span>
            )}
            <div style={{ flex: 1 }} />
            <Link href="/dashboard/action-items" style={{ textDecoration: "none", fontSize: 12, color: C.teal, fontWeight: 600 }}>
              View all →
            </Link>
          </div>

          <ActionItemsClient
            items={myActionItems.map((ai: any) => ({
              id: ai.id,
              reference: ai.reference,
              title: ai.title,
              priority: ai.priority,
              status: ai.status,
              dueDate: ai.dueDate?.toISOString() ?? null,
              project: { id: ai.project.id, name: ai.project.name },
              raisedBy: { fullName: ai.raisedBy.fullName },
            }))}
            overdueCount={overdueCount}
          />
        </>
      )}
    </div>
  );
}
