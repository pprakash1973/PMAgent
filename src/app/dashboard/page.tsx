import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionItemsClient } from "./action-items-client";
import { FolderKanban, AlertTriangle, CheckSquare, Timer } from "lucide-react";

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
  bg: "#F4F6F8", surface: "#ffffff", border: "#DDE3E8",
  teal: "#006E74", lt: "#0097AC",
  text: "#0F2020", muted: "#6B7E8A", faint: "#94a3b8",
  red: "#c5392b", amber: "#c17d12", green: "#158a5a",
  FF: "var(--font-inter),'Inter',system-ui,sans-serif",
} as const;

function ragColor(s: string) { return s === "red" ? C.red : s === "amber" ? C.amber : C.green; }
function ragBg(s: string) { return s === "red" ? "rgba(197,57,43,.1)" : s === "amber" ? "rgba(193,125,18,.1)" : "rgba(21,138,90,.1)"; }
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

  const total = rows.length;
  const atRisk = rows.filter(p => p.healthStatus === "red" || p.healthStatus === "amber").length;
  const totalActions = Object.values(aiCountMap).reduce((a, b) => a + b, 0);
  const futureDays = rows.map(p => p.daysToMs).filter((d): d is number => d !== null && d >= 0);
  const minDays = futureDays.length ? Math.min(...futureDays) : null;
  const nextMsProj = minDays !== null ? rows.find(p => p.daysToMs === minDays) : null;
  const uniqueAccounts = new Set(rows.map(p => p.accountId).filter(Boolean)).size;

  const hour = now.getHours();
  const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const today = now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const kpiTiles = [
    {
      value: total, label: "Active Projects",
      sub: `Across ${uniqueAccounts} client account${uniqueAccounts !== 1 ? "s" : ""}`,
      accent: "#003C51",
      icon: <FolderKanban size={22} />,
    },
    {
      value: atRisk, label: "At Risk",
      sub: total ? `${Math.round(atRisk / total * 100)}% of portfolio flagged` : "No projects",
      accent: atRisk > 0 ? C.amber : C.green,
      icon: <AlertTriangle size={22} />,
    },
    {
      value: totalActions, label: "Open Action Items",
      sub: overdueCount > 0 ? `${overdueCount} overdue · others on track` : "All action items on track",
      accent: totalActions > 0 ? C.red : C.green,
      icon: <CheckSquare size={22} />,
    },
    {
      value: minDays !== null ? minDays : "—",
      label: "Days to Next Milestone",
      sub: nextMsProj?.nextMs?.name ?? "No upcoming milestones",
      accent: C.lt,
      icon: <Timer size={22} />,
    },
  ] as const;

  return (
    <div style={{ padding: "22px 24px 48px", background: C.bg, minHeight: "100%", fontFamily: C.FF }}>
      <style>{`
        @keyframes pmFadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .pm-page { animation: pmFadeIn .22s ease forwards; }
        .pm-card { transition: box-shadow .18s ease, transform .15s ease; }
        .pm-card:hover { box-shadow: 0 6px 22px rgba(0,110,116,.13); transform: translateY(-2px); }
        .pm-open-btn { transition: background .12s !important; }
        .pm-open-btn:hover { background: #0097AC !important; }
        .pm-link:hover { text-decoration: underline; }
      `}</style>

      <div className="pm-page">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.2 }}>
              Good {greeting}, {user.name?.split(" ")[0]}
            </h1>
            <p style={{ fontSize: 12.5, color: C.muted, margin: "4px 0 0" }}>
              {today} · {total} active project{total !== 1 ? "s" : ""}
              {overdueCount > 0 ? ` · ${overdueCount} overdue action item${overdueCount !== 1 ? "s" : ""}` : ""}
            </p>
          </div>
          {(user.role === "pm" || user.role === "admin") && (
            <Link href="/dashboard/projects/new" style={{ textDecoration: "none" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                height: 36, padding: "0 16px",
                background: C.teal, color: "#fff", borderRadius: 9,
                fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
                boxShadow: "0 1px 4px rgba(0,110,116,.25)",
              }}>
                + New Project
              </span>
            </Link>
          )}
        </div>

        {/* ── KPI Grid ─────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 30 }}>
          {kpiTiles.map(tile => (
            <div key={tile.label} style={{
              background: C.surface, borderRadius: 12, padding: "16px 18px",
              border: `1px solid ${C.border}`, borderLeft: `3.5px solid ${tile.accent}`,
              boxShadow: "0 1px 4px rgba(0,0,0,.04)",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em" }}>
                    {tile.label}
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 700, color: tile.accent, fontVariantNumeric: "tabular-nums", lineHeight: 1.2, marginTop: 4 }}>
                    {tile.value}
                  </div>
                </div>
                <div style={{ color: tile.accent, opacity: 0.45, marginTop: 2, flexShrink: 0 }}>
                  {tile.icon}
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {tile.sub}
              </div>
            </div>
          ))}
        </div>

        {/* ── My Projects ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>My Projects</span>
          <Link href="/dashboard/projects" style={{ textDecoration: "none", fontSize: 12.5, color: C.teal, fontWeight: 600 }} className="pm-link">
            View all →
          </Link>
        </div>

        {rows.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "52px 24px", textAlign: "center", marginBottom: 30, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: "0 0 6px" }}>No active projects yet</p>
            <p style={{ fontSize: 13, color: C.faint, margin: 0 }}>Create your first project to get started</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))", gap: 14, marginBottom: 32 }}>
            {rows.map(p => {
              const rc = ragColor(p.healthStatus);
              const sc = scoreColor(p.attentionScore);
              return (
                <div key={p.id} className="pm-card" style={{
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
                  overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.04)",
                  display: "flex", flexDirection: "column",
                }}>
                  {/* RAG top bar */}
                  <div style={{ height: 4, background: rc, width: "100%" }} />

                  <div style={{ padding: "14px 16px 0", flex: 1 }}>
                    {/* Name + RAG badge */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 3 }}>
                      <Link href={`/dashboard/projects/${p.id}`} style={{ flex: 1, minWidth: 0, textDecoration: "none" }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.name}
                        </span>
                      </Link>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, flexShrink: 0, background: ragBg(p.healthStatus), color: rc, letterSpacing: ".03em" }}>
                        {ragLabel(p.healthStatus)}
                      </span>
                    </div>

                    {/* Client · phase */}
                    <div style={{ fontSize: 11, color: C.faint, marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.account?.name ?? "Unassigned"} · <span style={{ textTransform: "capitalize" }}>{p.currentPhase.replace(/_/g, " ")}</span>
                    </div>

                    {/* SPI / CPI row (if available) */}
                    {(p.spi !== null || p.cpi !== null) && (
                      <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
                        {p.spi !== null && (
                          <span style={{ fontSize: 11, color: C.muted }}>
                            SPI <strong style={{ fontWeight: 700, color: spiColor(p.spi), fontVariantNumeric: "tabular-nums" }}>{fmt(p.spi)}</strong>
                          </span>
                        )}
                        {p.cpi !== null && (
                          <span style={{ fontSize: 11, color: C.muted }}>
                            CPI <strong style={{ fontWeight: 700, color: spiColor(p.cpi), fontVariantNumeric: "tabular-nums" }}>{fmt(p.cpi)}</strong>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Attention score */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".05em" }}>Attention score</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: sc, fontVariantNumeric: "tabular-nums" }}>{p.attentionScore}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 99, background: "#edf0f3", marginBottom: 12, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(p.attentionScore, 100)}%`, background: sc, borderRadius: 99, transition: "width .6s" }} />
                    </div>

                    {/* RAID pills */}
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 6, fontSize: 10.5, fontWeight: 600, background: p._count.risks > 0 ? "rgba(193,125,18,.12)" : "#f1f4f8", color: p._count.risks > 0 ? C.amber : "#c4c9d4" }}>
                        {p._count.risks} risk{p._count.risks !== 1 ? "s" : ""}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 6, fontSize: 10.5, fontWeight: 600, background: p._count.issues > 0 ? "rgba(197,57,43,.1)" : "#f1f4f8", color: p._count.issues > 0 ? C.red : "#c4c9d4" }}>
                        {p._count.issues} issue{p._count.issues !== 1 ? "s" : ""}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 6, fontSize: 10.5, fontWeight: 600, background: p.openAI > 0 ? "rgba(0,151,172,.1)" : "#f1f4f8", color: p.openAI > 0 ? C.lt : "#c4c9d4" }}>
                        {p.openAI} action{p.openAI !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Milestone strip */}
                  {p.nextMs ? (
                    <div style={{ margin: "0 16px 10px", background: C.bg, borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "center" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginRight: 7 }}>
                        <rect x="3" y="4" width="18" height="16" rx="2" stroke={C.lt} strokeWidth="1.8" />
                        <path d="M3 9h18M8 4v5M16 4v5" stroke={C.lt} strokeWidth="1.8" />
                      </svg>
                      <span style={{ fontSize: 11, color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.nextMs.name}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.lt, fontVariantNumeric: "tabular-nums", flexShrink: 0, marginLeft: 8 }}>
                        {fmtDate(p.nextMs.dueDate)}
                      </span>
                    </div>
                  ) : (
                    <div style={{ height: 8 }} />
                  )}

                  {/* Footer */}
                  <div style={{ borderTop: "1px solid #f0f2f5", padding: "9px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11.5, color: C.teal, fontWeight: 600 }}>{p.pmOwner.fullName}</span>
                    <Link href={`/dashboard/projects/${p.id}`} style={{ textDecoration: "none" }}>
                      <span className="pm-open-btn" style={{ display: "inline-flex", height: 28, padding: "0 13px", background: C.teal, color: "#fff", borderRadius: 8, fontSize: 11.5, fontWeight: 700, alignItems: "center" }}>
                        Open →
                      </span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── My Action Items ───────────────────────────────────────────────── */}
        {user.role === "pm" && (
          <>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 13 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>My Action Items</span>
              {overdueCount > 0 && (
                <span style={{ marginLeft: 9, fontSize: 11, fontWeight: 700, color: C.red, background: "rgba(197,57,43,.09)", padding: "2px 9px", borderRadius: 4 }}>
                  {overdueCount} overdue
                </span>
              )}
              <div style={{ flex: 1 }} />
              <Link href="/dashboard/action-items" style={{ textDecoration: "none", fontSize: 12.5, color: C.teal, fontWeight: 600 }} className="pm-link">
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
    </div>
  );
}
