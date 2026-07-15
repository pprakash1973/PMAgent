import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatCurrency, methodologyLabel } from "@/lib/utils";
import { HealthDonut, EVMScatter, SpiDistribution } from "@/components/executive-charts";
import { getProductivityStatsForUser } from "@/lib/productivity";
import { ProductivityMeter } from "@/components/productivity-meter";
import { SteeringDeckGenerator } from "@/components/steering-deck-generator";

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

// Effective health: live SPI always wins — never show green when schedule is at risk
function effectiveHealth(storedHealth: string, liveSpi: number | null): string {
  if (liveSpi !== null) {
    if (liveSpi < 0.8) return "red";
    if (liveSpi < 0.9 && storedHealth === "green") return "amber";
  }
  return storedHealth;
}

function spiColor(spi: number | null) {
  if (spi === null) return { text: "#8a909c", bg: "#f7f8fa" };
  if (spi >= 1) return { text: "#158a5a", bg: "#e3f3ea" };
  if (spi >= 0.85) return { text: "#c17d12", bg: "#fbf0da" };
  return { text: "#cf3f3a", bg: "#fbe4e2" };
}

function computeProjectEVM(tasks: { baselineStart: Date | null; baselineFinish: Date | null; baselineDays: number; percentComplete: number }[]) {
  if (tasks.length === 0) return null;
  const now = Date.now();
  let pv = 0, ev = 0;
  for (const t of tasks) {
    if (!t.baselineStart || !t.baselineFinish) continue;
    const s = new Date(t.baselineStart).getTime();
    const f = new Date(t.baselineFinish).getTime();
    const dur = f - s;
    const plannedPct = now <= s ? 0 : now >= f ? 1 : dur > 0 ? (now - s) / dur : 0;
    pv += t.baselineDays * plannedPct;
    ev += t.baselineDays * (t.percentComplete / 100);
  }
  if (pv === 0 && ev === 0) return null;
  const spi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : null;
  const sv = Math.round((ev - pv) * 10) / 10;
  const overallPct = Math.round(tasks.reduce((s, t) => s + t.percentComplete, 0) / tasks.length);
  return { pv: Math.round(pv * 10) / 10, ev: Math.round(ev * 10) / 10, sv, spi, overallPct };
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
      scheduleTasks: { select: { baselineStart: true, baselineFinish: true, baselineDays: true, percentComplete: true } },
      _count: { select: { risks: true } },
    },
  });

  // Compute live EVM per project
  const projectsWithEVM = projects.map(p => ({
    ...p,
    liveEVM: computeProjectEVM(p.scheduleTasks),
  }));

  // Portfolio KPIs — use effectiveHealth so SPI-derived degradation shows immediately
  const totalBudget = projects.reduce((s, p) => s + (p.budget || 0), 0);
  const health = { green: 0, amber: 0, red: 0 };
  for (const p of projectsWithEVM) {
    const h = effectiveHealth(p.healthStatus, p.liveEVM?.spi ?? null) as keyof typeof health;
    if (h in health) health[h]++;
  }
  const healthPct = projects.length ? Math.round((health.green / projects.length) * 100) : 0;

  // Live SPI average (from schedule tasks where available, else fall back to status report)
  const spiVals = projectsWithEVM
    .map(p => p.liveEVM?.spi ?? p.statusReports[0]?.healthScore?.spi)
    .filter((v): v is number => v != null);
  const avgSPI = spiVals.length ? (spiVals.reduce((a, b) => a + b, 0) / spiVals.length) : null;

  const criticalProjects = projectsWithEVM.filter(p =>
    effectiveHealth(p.healthStatus, p.liveEVM?.spi ?? null) === "red"
  );
  const atRiskProjects = projectsWithEVM.filter(p => {
    const eh = effectiveHealth(p.healthStatus, p.liveEVM?.spi ?? null);
    return eh === "amber" || eh === "red";
  });

  const totalTeam = projects.reduce((s, p) => s + (p.teamSize || 0), 0);

  // For SPI distribution chart
  const spiDistData = projectsWithEVM.map(p => ({
    name: p.name.length > 18 ? p.name.slice(0, 16) + "…" : p.name,
    spi: p.liveEVM?.spi ?? p.statusReports[0]?.healthScore?.spi ?? null,
    health: p.healthStatus,
  })).filter(p => p.spi !== null);

  const methodologyCounts: Record<string, number> = {};
  for (const p of projects) { const label = methodologyLabel(p.methodology); methodologyCounts[label] = (methodologyCounts[label] ?? 0) + 1; }
  const phaseCount: Record<string, number> = {};
  for (const p of projects) {
    const ph = (p as any).currentPhase || "initiation";
    phaseCount[ph] = (phaseCount[ph] ?? 0) + 1;
  }

  const productivityStats = await getProductivityStatsForUser(user);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div style={{ padding: "26px 28px 56px", maxWidth: 1280 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1d24" }}>Executive Dashboard</div>
          <div style={{ fontSize: 12.5, color: "#8a909c", marginTop: 3 }}>{today} · Organization-wide delivery view</div>
        </div>
        <SteeringDeckGenerator projects={projects.map((p) => ({ id: p.id, name: p.name, healthStatus: p.healthStatus }))} />
      </div>

      {/* ── Portfolio KPI strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 22 }}>
        {[
          { label: "Active Projects", value: `${projects.length}`, sub: `${health.green} on track`, color: "#4f5bd5", bg: "#eef0fc" },
          { label: "Delivery Health", value: `${healthPct}%`, sub: `${health.amber} at risk · ${health.red} critical`, color: health.red > 0 ? "#cf3f3a" : health.amber > 0 ? "#c17d12" : "#158a5a", bg: health.red > 0 ? "#fbe4e2" : health.amber > 0 ? "#fbf0da" : "#e3f3ea" },
          { label: "Portfolio Budget", value: totalBudget ? formatCurrency(totalBudget) : "—", sub: "Total committed value", color: "#4f5bd5", bg: "#eef0fc" },
          { label: "Live Avg SPI", value: avgSPI != null ? avgSPI.toFixed(2) : "—", sub: "From schedule actuals", color: avgSPI == null ? "#8a909c" : avgSPI >= 1 ? "#158a5a" : avgSPI >= 0.85 ? "#c17d12" : "#cf3f3a", bg: avgSPI == null ? "#f7f8fa" : avgSPI >= 1 ? "#e3f3ea" : avgSPI >= 0.85 ? "#fbf0da" : "#fbe4e2" },
          { label: "Total Resources", value: totalTeam > 0 ? `${totalTeam}` : "—", sub: "People across portfolio", color: "#8a2be2", bg: "#f4eeff" },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: k.color, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: k.color, marginTop: 5 }}>{k.label}</div>
            <div style={{ fontSize: 11, color: "#5b616e", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Critical alerts ── */}
      {criticalProjects.length > 0 && (
        <div style={{ background: "#fff8f8", border: "1px solid #f5c0bc", borderRadius: 14, padding: "14px 18px", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 14 }}>🚨</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#cf3f3a", textTransform: "uppercase" as const, letterSpacing: ".05em" }}>Requires Immediate Attention · {criticalProjects.length} project{criticalProjects.length > 1 ? "s" : ""}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {criticalProjects.map(p => {
              const spi = p.liveEVM?.spi ?? p.statusReports[0]?.healthScore?.spi;
              const spiC = spiColor(spi ?? null);
              return (
                <Link key={p.id} href={`/dashboard/projects/${p.id}`} style={{ textDecoration: "none" }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "11px 14px", background: "#fff",
                    border: "1px solid #f5c0bc", borderRadius: 10,
                    borderLeft: `4px solid #cf3f3a`,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1d24" }}>{p.name}</div>
                      <div style={{ fontSize: 11.5, color: "#8a909c", marginTop: 1 }}>{p.pmOwner.fullName} · {(p as any).currentPhase || "initiation"}</div>
                    </div>
                    {spi != null && (
                      <div style={{ textAlign: "center" as const }}>
                        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 18, fontWeight: 700, color: spiC.text }}>{spi.toFixed(2)}</div>
                        <div style={{ fontSize: 10, color: "#8a909c" }}>SPI</div>
                      </div>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 600, color: ragColor(effectiveHealth(p.healthStatus, p.liveEVM?.spi ?? null)), background: ragBg(effectiveHealth(p.healthStatus, p.liveEVM?.spi ?? null)), borderRadius: 6, padding: "4px 11px" }}>{ragLabel(effectiveHealth(p.healthStatus, p.liveEVM?.spi ?? null))}</span>
                    <span style={{ fontSize: 11.5, color: "#8a909c" }}>→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── EVM Portfolio Table ── */}
      <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, overflow: "hidden", marginBottom: 22 }}>
        <div style={{ padding: "13px 18px 11px", borderBottom: "1px solid #eceef2", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1d24" }}>Portfolio EVM Scorecard</span>
          <span style={{ fontSize: 11, color: "#8a909c" }}>Live schedule performance index from actual task progress</span>
        </div>
        <div style={{ overflowX: "auto" as const }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f7f8fa" }}>
                {["Project", "PM", "Phase", "Method", "Budget", "SPI", "SV", "% Done", "Health", "Risks"].map(h => (
                  <th key={h} style={{ textAlign: "left" as const, padding: "9px 14px", fontSize: 10, fontWeight: 600, color: "#8a909c", letterSpacing: ".05em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projectsWithEVM
                .sort((a, b) => {
                  // Sort: worst SPI first, then no SPI, then best
                  const sa = a.liveEVM?.spi ?? a.statusReports[0]?.healthScore?.spi ?? 999;
                  const sb = b.liveEVM?.spi ?? b.statusReports[0]?.healthScore?.spi ?? 999;
                  return sa - sb;
                })
                .map(p => {
                  const spi = p.liveEVM?.spi ?? p.statusReports[0]?.healthScore?.spi ?? null;
                  const sv = p.liveEVM?.sv;
                  const overallPct = p.liveEVM?.overallPct;
                  const spiC = spiColor(spi);
                  return (
                    <tr key={p.id} style={{ borderTop: "1px solid #eceef2" }}>
                      <td style={{ padding: "13px 14px" }}>
                        <Link href={`/dashboard/projects/${p.id}`} style={{ fontWeight: 600, color: "#1a1d24", textDecoration: "none" }}>{p.name}</Link>
                      </td>
                      <td style={{ padding: "13px 14px", color: "#5b616e", whiteSpace: "nowrap" as const }}>{p.pmOwner.fullName}</td>
                      <td style={{ padding: "13px 14px" }}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: "#003C51", background: "#D7E0E3", borderRadius: 6, padding: "3px 9px", textTransform: "capitalize" as const }}>
                          {(p as any).currentPhase || "initiation"}
                        </span>
                      </td>
                      <td style={{ padding: "13px 14px", color: "#5b616e" }}>{methodologyLabel(p.methodology)}</td>
                      <td style={{ padding: "13px 14px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "#5b616e", whiteSpace: "nowrap" as const }}>{p.budget ? formatCurrency(p.budget, p.currency) : "—"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        {spi != null ? (
                          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 52, padding: "5px 10px", background: spiC.bg, borderRadius: 8 }}>
                            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700, color: spiC.text }}>{spi.toFixed(2)}</span>
                          </div>
                        ) : <span style={{ color: "#c5cadb", fontSize: 13 }}>—</span>}
                      </td>
                      <td style={{ padding: "13px 14px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: sv != null ? (sv >= 0 ? "#158a5a" : "#cf3f3a") : "#8a909c", whiteSpace: "nowrap" as const }}>
                        {sv != null ? `${sv >= 0 ? "+" : ""}${sv.toFixed(1)}d` : "—"}
                      </td>
                      <td style={{ padding: "13px 14px" }}>
                        {overallPct != null ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 60, height: 6, background: "#eceef2", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${overallPct}%`, height: "100%", background: overallPct === 100 ? "#158a5a" : "#4f5bd5", borderRadius: 3 }} />
                            </div>
                            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#5b616e" }}>{overallPct}%</span>
                          </div>
                        ) : <span style={{ color: "#c5cadb" }}>—</span>}
                      </td>
                      <td style={{ padding: "13px 14px" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: ragColor(effectiveHealth(p.healthStatus, p.liveEVM?.spi ?? null)), background: ragBg(effectiveHealth(p.healthStatus, p.liveEVM?.spi ?? null)), borderRadius: 6, padding: "3px 9px" }}>{ragLabel(effectiveHealth(p.healthStatus, p.liveEVM?.spi ?? null))}</span>
                      </td>
                      <td style={{ padding: "13px 14px", color: p._count.risks > 3 ? "#cf3f3a" : "#5b616e", fontWeight: p._count.risks > 3 ? 600 : 400 }}>{p._count.risks}</td>
                    </tr>
                  );
                })}
              {projects.length === 0 && (
                <tr><td colSpan={10} style={{ padding: "28px 14px", textAlign: "center" as const, color: "#8a909c", fontSize: 13 }}>No projects yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Charts row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 22 }}>
        <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Portfolio Health</div>
          <div style={{ fontSize: 11.5, color: "#8a909c", marginBottom: 14 }}>{projects.length} active projects</div>
          <HealthDonut green={health.green} amber={health.amber} red={health.red} />
        </div>
        <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>SPI by Project</div>
          <div style={{ fontSize: 11.5, color: "#8a909c", marginBottom: 14 }}>Live schedule performance — below 0.8 = critical</div>
          <SpiDistribution data={spiDistData as any} />
        </div>
        <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Phase Distribution</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {Object.entries(phaseCount).map(([phase, count]) => (
              <div key={phase} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "#003C51", background: "#D7E0E3", borderRadius: 6, padding: "2px 9px", minWidth: 80, textTransform: "capitalize" as const }}>{phase}</span>
                <div style={{ flex: 1, height: 8, background: "#eceef2", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${(count / projects.length) * 100}%`, height: "100%", background: "#4f5bd5", borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: "#5b616e", minWidth: 20 }}>{count}</span>
              </div>
            ))}
            {Object.keys(phaseCount).length === 0 && <div style={{ fontSize: 13, color: "#8a909c" }}>No projects yet.</div>}
          </div>
        </div>
      </div>

      {/* ── Methodology & delivery model breakdown ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 22 }}>
        <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Delivery Methodology</div>
          {Object.entries(methodologyCounts).length === 0
            ? <div style={{ fontSize: 13, color: "#8a909c" }}>No projects yet.</div>
            : <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 10 }}>
              {Object.entries(methodologyCounts).map(([method, count]) => (
                <div key={method} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "#eef0fc", borderRadius: 9 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 20, fontWeight: 700, color: "#4f5bd5" }}>{count}</span>
                  <span style={{ fontSize: 12, color: "#4f5bd5", fontWeight: 600 }}>{method}</span>
                </div>
              ))}
            </div>
          }
        </div>
        <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Intervention Watchlist</div>
          {atRiskProjects.length === 0
            ? <div style={{ fontSize: 13, color: "#158a5a" }}>✓ All projects on track. No interventions required.</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {atRiskProjects.slice(0, 4).map(p => {
                const eh = effectiveHealth(p.healthStatus, p.liveEVM?.spi ?? null);
                return (
                <Link key={p.id} href={`/dashboard/projects/${p.id}`} style={{ textDecoration: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: `1px solid ${ragBg(eh)}`, borderLeft: `3px solid ${ragColor(eh)}`, borderRadius: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1a1d24" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#8a909c", marginTop: 1 }}>{p.pmOwner.fullName}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: ragColor(effectiveHealth(p.healthStatus, p.liveEVM?.spi ?? null)), background: ragBg(effectiveHealth(p.healthStatus, p.liveEVM?.spi ?? null)), borderRadius: 6, padding: "3px 9px" }}>{ragLabel(effectiveHealth(p.healthStatus, p.liveEVM?.spi ?? null))}</span>
                  </div>
                </Link>
                );
              })}
            </div>
          }
        </div>
      </div>

      {/* ── Productivity ── */}
      <ProductivityMeter stats={productivityStats} />
    </div>
  );
}
