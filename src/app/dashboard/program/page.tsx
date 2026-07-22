import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/app-shell";

const CAN_PROGRAM = ["pgm", "admin"];

export default async function ProgramDashboardPage() {
  const session = await auth();
  const user = session!.user as any;
  if (!CAN_PROGRAM.includes(user.role)) redirect("/dashboard");

  const assignments = await prisma.programAssignment.findMany({
    where: { userId: user.id },
    include: {
      program: {
        include: {
          client: { include: { cluster: true } },
          projects: {
            where: { deletedAt: null },
            include: {
              pmOwner: { select: { fullName: true } },
              _count: { select: { risks: true, issues: true } },
            },
          },
        },
      },
    },
  });

  const programs = assignments.map((a) => a.program);
  const allProjects = programs.flatMap((p) => p.projects);

  const totalProjects = allProjects.length;
  const redCount   = allProjects.filter((p) => p.healthStatus === "red").length;
  const amberCount = allProjects.filter((p) => p.healthStatus === "amber").length;
  const greenCount = allProjects.filter((p) => p.healthStatus === "green").length;

  return (
    <AppShell role={user.role} userName={user.name ?? ""}>
      <div style={{ padding: "32px 40px", fontFamily: "'Aptos','Calibri',sans-serif" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#003C51", margin: 0 }}>Program Dashboard</h1>
          <p style={{ color: "#7A7480", fontSize: 13.5, marginTop: 4 }}>
            {programs.length} program{programs.length !== 1 ? "s" : ""} · {totalProjects} project{totalProjects !== 1 ? "s" : ""}
          </p>
        </div>

        {/* KPI strip */}
        <div style={{ display: "flex", gap: 16, marginBottom: 32 }}>
          {[
            { label: "Total Projects", value: totalProjects, color: "#003C51" },
            { label: "On Track",       value: greenCount,    color: "#01B27C" },
            { label: "At Risk",        value: amberCount,    color: "#F59E0B" },
            { label: "Off Track",      value: redCount,      color: "#FC6A59" },
          ].map((kpi) => (
            <div key={kpi.label} style={{
              flex: 1, background: "#fff", border: "1px solid #D7E0E3", borderRadius: 12,
              padding: "18px 22px",
            }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
              <div style={{ fontSize: 12.5, color: "#7A7480", marginTop: 3 }}>{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Programs list */}
        {programs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#7A7480", fontSize: 14 }}>
            No programs assigned yet. Ask your admin to assign programs to your account.
          </div>
        ) : (
          programs.map((program) => (
            <div key={program.id} style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "#003C51", margin: 0 }}>{program.name}</h2>
                <span style={{ fontSize: 12, color: "#7A7480" }}>
                  {program.client.cluster.name} › {program.client.name}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: "#006E74",
                  background: "#E1F5EE", borderRadius: 999, padding: "2px 9px",
                }}>
                  {program.projects.length} project{program.projects.length !== 1 ? "s" : ""}
                </span>
              </div>

              {program.projects.length === 0 ? (
                <p style={{ fontSize: 13, color: "#7A7480", margin: 0 }}>No projects in this program yet.</p>
              ) : (
                <div style={{ background: "#fff", border: "1px solid #D7E0E3", borderRadius: 12, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#F2F7F8", borderBottom: "1px solid #D7E0E3" }}>
                        {["Project", "PM Owner", "Status", "Health", "Risks", "Issues"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "#003C51", fontSize: 12 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {program.projects.map((proj) => {
                        const ragColor = proj.healthStatus === "green" ? "#01B27C"
                          : proj.healthStatus === "amber" ? "#F59E0B" : "#FC6A59";
                        return (
                          <tr key={proj.id} style={{ borderBottom: "1px solid #F2F7F8" }}>
                            <td style={{ padding: "11px 16px", fontWeight: 600, color: "#003C51" }}>{proj.name}</td>
                            <td style={{ padding: "11px 16px", color: "#7A7480" }}>{proj.pmOwner.fullName}</td>
                            <td style={{ padding: "11px 16px", color: "#7A7480", textTransform: "capitalize" }}>{proj.status}</td>
                            <td style={{ padding: "11px 16px" }}>
                              <span style={{
                                display: "inline-block", width: 10, height: 10, borderRadius: "50%",
                                background: ragColor, marginRight: 6,
                              }} />
                              <span style={{ color: ragColor, fontWeight: 600, textTransform: "capitalize" }}>{proj.healthStatus}</span>
                            </td>
                            <td style={{ padding: "11px 16px", color: "#7A7480" }}>{proj._count.risks}</td>
                            <td style={{ padding: "11px 16px", color: "#7A7480" }}>{proj._count.issues}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
