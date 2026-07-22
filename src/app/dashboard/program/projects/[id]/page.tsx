import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import Link from "next/link";

const CAN_PROGRAM = ["pgm", "admin"];

const RC: Record<string, string> = { red: "#cf3f3a", amber: "#c17d12", green: "#158a5a" };
const RBG: Record<string, string> = { red: "#fbe4e2", amber: "#fbf0da", green: "#e3f3ea" };
const RL: Record<string, string> = { red: "Critical", amber: "At Risk", green: "On Track" };

const T = {
  bg: "#F2F7F8", border: "#D7E0E3", petrol: "#003C51", teal: "#006E74",
  text: "#231F20", muted: "#7A7480", card: "#fff",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: .5, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "16px 20px" }}>
      <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? T.petrol }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default async function PgmProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session!.user as any;
  if (!CAN_PROGRAM.includes(user.role)) redirect("/dashboard");

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      pmOwner:  { select: { id: true, fullName: true, email: true } },
      program:  { include: { client: { include: { cluster: true } } } },
      milestones: { orderBy: { dueDate: "asc" } },
      risks:      { where: { status: { not: "closed" } }, orderBy: { createdAt: "desc" }, take: 10 },
      issues:     { where: { status: { not: "closed" } }, orderBy: { createdAt: "desc" }, take: 10 },
      artifacts:  true,
      scheduleTasks: {
        select: { baselineStart: true, baselineFinish: true, baselineDays: true, percentComplete: true, name: true },
        orderBy: { baselineStart: "asc" },
        take: 20,
      },
      costEntries: { select: { amount: true, date: true, category: true }, orderBy: { date: "desc" }, take: 20 },
      statusReports: {
        orderBy: { reportDate: "desc" },
        take: 6,
        include: { healthScore: true },
      },
    },
  });

  if (!project) notFound();

  // Scope check: pgm must have program assigned
  if (user.role === "pgm" && project.program?.id) {
    const assignment = await prisma.programAssignment.findFirst({
      where: { userId: user.id, programId: project.program.id },
    });
    if (!assignment) notFound();
  }

  // Live EVM
  const now = Date.now();
  let pv = 0, ev = 0;
  for (const t of project.scheduleTasks) {
    if (!t.baselineStart || !t.baselineFinish) continue;
    const s = new Date(t.baselineStart).getTime();
    const f = new Date(t.baselineFinish).getTime();
    const dur = f - s;
    const plannedPct = now <= s ? 0 : now >= f ? 1 : dur > 0 ? (now - s) / dur : 0;
    pv += t.baselineDays * plannedPct;
    ev += t.baselineDays * (t.percentComplete / 100);
  }
  const liveSpi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : null;
  const storedSpi = project.statusReports[0]?.healthScore?.spi ?? null;
  const storedCpi = project.statusReports[0]?.healthScore?.cpi ?? null;
  const spi = liveSpi ?? storedSpi;

  const schedPct = project.scheduleTasks.length
    ? Math.round(project.scheduleTasks.reduce((s, t) => s + t.percentComplete, 0) / project.scheduleTasks.length)
    : 0;
  const totalSpent = project.costEntries.reduce((s, e) => s + e.amount, 0);
  const budPct = project.budget && project.budget > 0 ? Math.round((totalSpent / project.budget) * 100) : 0;

  let rag: "red" | "amber" | "green" = (project.healthStatus as any) ?? "green";
  if (spi !== null) {
    if (spi < 0.8) rag = "red";
    else if (spi < 0.9 && rag === "green") rag = "amber";
  }

  const spiColor = (v: number | null) => v === null ? T.muted : v >= 1 ? "#158a5a" : v >= 0.85 ? "#c17d12" : "#cf3f3a";
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  return (
    <AppShell role={user.role} userName={user.name ?? ""}>
      <div style={{ height: "100%", overflowY: "auto", background: T.bg, fontFamily: "'Aptos','Calibri',sans-serif" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "28px 32px 60px" }}>

          {/* Nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, fontSize: 12 }}>
            <Link href="/dashboard/program" style={{ color: T.teal, textDecoration: "none" }}>Dashboard</Link>
            <span style={{ color: T.muted }}>›</span>
            <Link href="/dashboard/program/projects" style={{ color: T.teal, textDecoration: "none" }}>All Projects</Link>
            <span style={{ color: T.muted }}>›</span>
            <span style={{ color: T.muted }}>{project.name}</span>
          </div>

          {/* Read-only badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 8, padding: "5px 12px", marginBottom: 20, fontSize: 12, color: T.muted }}>
            <span>🔍</span> Read-only · Program oversight view
          </div>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.petrol }}>{project.name}</h1>
                <span style={{
                  background: `${RC[rag]}18`, border: `1px solid ${RC[rag]}40`,
                  borderRadius: 99, padding: "3px 10px", fontSize: 12, fontWeight: 700, color: RC[rag],
                }}>{RL[rag]}</span>
              </div>
              <div style={{ fontSize: 13, color: T.muted }}>
                {(project.program as any)?.client?.name ?? ""}
                {(project.program as any) && " · "}
                {(project.program as any)?.name ?? ""}
                {" · PM: "}<strong style={{ color: T.text }}>{project.pmOwner.fullName}</strong>
              </div>
            </div>
          </div>

          {/* KPI strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12, marginBottom: 28 }}>
            <KpiCard label="SPI" value={spi?.toFixed(2) ?? "—"} sub="Schedule Performance" color={spiColor(spi)} />
            <KpiCard label="CPI" value={storedCpi?.toFixed(2) ?? "—"} sub="Cost Performance" color={spiColor(storedCpi)} />
            <KpiCard label="% Complete" value={`${schedPct}%`} sub="Overall progress" />
            <KpiCard label="Budget Used" value={`${budPct}%`} sub={project.budget ? fmt(totalSpent) + " / " + fmt(project.budget) : "—"} color={budPct > 90 ? "#cf3f3a" : T.petrol} />
            <KpiCard label="Open Risks" value={project.risks.length} sub="Active risks" color={project.risks.length > 3 ? "#c17d12" : T.petrol} />
            <KpiCard label="Open Issues" value={project.issues.length} sub="Active issues" color={project.issues.length > 3 ? "#c17d12" : T.petrol} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
            <div>
              {/* Milestones */}
              <Section title="Milestones">
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                  {project.milestones.length === 0 ? (
                    <div style={{ padding: 20, color: T.muted, fontSize: 13, textAlign: "center" }}>No milestones defined.</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: T.bg }}>
                          {["Milestone", "Due", "Status"].map((h) => (
                            <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: 11.5, fontWeight: 700, color: T.muted }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {project.milestones.map((m) => {
                          const overdue = new Date(m.dueDate) < new Date() && m.status !== "completed";
                          return (
                            <tr key={m.id} style={{ borderTop: `1px solid ${T.border}` }}>
                              <td style={{ padding: "10px 14px", fontWeight: 600, color: T.petrol }}>{m.name}</td>
                              <td style={{ padding: "10px 14px", color: overdue ? "#cf3f3a" : T.muted, fontWeight: overdue ? 700 : 400 }}>
                                {new Date(m.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                              </td>
                              <td style={{ padding: "10px 14px" }}>
                                <span style={{
                                  fontSize: 11.5, fontWeight: 700,
                                  color: m.status === "completed" ? "#158a5a" : overdue ? "#cf3f3a" : "#c17d12",
                                }}>
                                  {m.status === "completed" ? "✓ Complete" : overdue ? "⚠ Overdue" : "In Progress"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </Section>

              {/* Risks */}
              <Section title="Open Risks">
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                  {project.risks.length === 0 ? (
                    <div style={{ padding: 20, color: T.muted, fontSize: 13, textAlign: "center" }}>No open risks.</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: T.bg }}>
                          {["Risk", "Severity", "Owner", "Status"].map((h) => (
                            <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: 11.5, fontWeight: 700, color: T.muted }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {project.risks.map((r) => {
                          const sev = (r as any).severity ?? "medium";
                          const sevColor = sev === "critical" ? "#cf3f3a" : sev === "high" ? "#c17d12" : T.muted;
                          return (
                            <tr key={r.id} style={{ borderTop: `1px solid ${T.border}` }}>
                              <td style={{ padding: "10px 14px", fontWeight: 600, color: T.petrol }}>{(r as any).title ?? r.description.slice(0, 60)}</td>
                              <td style={{ padding: "10px 14px", color: sevColor, fontWeight: 600, textTransform: "capitalize" }}>{sev}</td>
                              <td style={{ padding: "10px 14px", color: T.muted }}>{(r as any).owner ?? "—"}</td>
                              <td style={{ padding: "10px 14px", color: T.muted, textTransform: "capitalize" }}>{r.status}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </Section>

              {/* Schedule tasks */}
              {project.scheduleTasks.length > 0 && (
                <Section title="Schedule (Top 20 Tasks)">
                  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ background: T.bg }}>
                          {["Task", "Start", "Finish", "% Done"].map((h) => (
                            <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: 11.5, fontWeight: 700, color: T.muted }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {project.scheduleTasks.map((t, i) => (
                          <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                            <td style={{ padding: "9px 14px", color: T.text }}>{(t as any).name ?? `Task ${i+1}`}</td>
                            <td style={{ padding: "9px 14px", color: T.muted }}>{t.baselineStart ? new Date(t.baselineStart).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}</td>
                            <td style={{ padding: "9px 14px", color: T.muted }}>{t.baselineFinish ? new Date(t.baselineFinish).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}</td>
                            <td style={{ padding: "9px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ flex: 1, height: 4, background: "#eef0f3", borderRadius: 2, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${t.percentComplete}%`, background: t.percentComplete === 100 ? "#158a5a" : "#006E74", borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 11.5, color: T.muted, minWidth: 30 }}>{t.percentComplete}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}
            </div>

            {/* Right column */}
            <div>
              {/* Project overview */}
              <Section title="Project Info">
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                  {[
                    { label: "Status", value: project.status },
                    { label: "Phase", value: (project as any).currentPhase ?? "—" },
                    { label: "Methodology", value: (project as any).methodology ?? "—" },
                    { label: "PM Owner", value: project.pmOwner.fullName },
                    { label: "Start Date", value: project.startDate ? new Date(project.startDate).toLocaleDateString("en-GB") : "—" },
                    { label: "End Date", value: project.endDate ? new Date(project.endDate).toLocaleDateString("en-GB") : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 12.5, color: T.muted }}>{label}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text, textTransform: "capitalize" }}>{String(value)}</span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Recent Status Reports */}
              <Section title="Recent Status Reports">
                {project.statusReports.length === 0 ? (
                  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, color: T.muted, fontSize: 13, textAlign: "center" }}>No reports yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {project.statusReports.map((r) => {
                      const rr = r.healthScore?.ragStatus ?? "green";
                      return (
                        <div key={r.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderLeft: `4px solid ${RC[rr]}`, borderRadius: 10, padding: "12px 16px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.petrol }}>
                              {new Date(r.reportDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: RC[rr] }}>{RL[rr]}</span>
                          </div>
                          {r.healthScore && (
                            <div style={{ display: "flex", gap: 12, fontSize: 11.5, color: T.muted }}>
                              {r.healthScore.spi !== null && <span>SPI {r.healthScore.spi.toFixed(2)}</span>}
                              {r.healthScore.cpi !== null && <span>CPI {r.healthScore.cpi.toFixed(2)}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* Artifacts */}
              {project.artifacts.length > 0 && (
                <Section title="Artifacts">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {project.artifacts.map((a) => (
                      <div key={a.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.petrol, textTransform: "capitalize" }}>{a.artifactType.replace(/_/g, " ")}</div>
                        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
                          {new Date(a.createdAt).toLocaleDateString("en-GB")}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
