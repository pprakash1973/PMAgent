"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

interface PgmProjectRow {
  id: string;
  name: string;
  code: string;
  programName: string;
  clientName: string;
  pmName: string;
  phase: string;
  status: string;
  rag: "red" | "amber" | "green";
  spi: number | null;
  cpi: number | null;
  schedPct: number;
  budPct: number;
  budget: number | null;
  riskCount: number;
  issueCount: number;
  lastReportDate: string | null;
}

const RC: Record<string, string> = { red: "#cf3f3a", amber: "#c17d12", green: "#158a5a" };
const RL: Record<string, string> = { red: "Critical", amber: "At Risk", green: "On Track" };

type SortKey = keyof PgmProjectRow;
type SortDir = "asc" | "desc";

const T = {
  bg: "#F2F7F8", border: "#D7E0E3", petrol: "#003C51", teal: "#006E74",
  text: "#231F20", muted: "#7A7480", card: "#fff",
};

function RagPill({ rag }: { rag: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: `${RC[rag] ?? "#8a909c"}18`,
      border: `1px solid ${RC[rag] ?? "#8a909c"}40`,
      borderRadius: 99, padding: "2px 9px",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: RC[rag] ?? "#8a909c" }} />
      <span style={{ fontSize: 11.5, fontWeight: 700, color: RC[rag] ?? "#8a909c" }}>{RL[rag] ?? rag}</span>
    </span>
  );
}

function spiColor(v: number | null) {
  if (v === null) return "#8a909c";
  if (v >= 1)    return "#158a5a";
  if (v >= 0.85) return "#c17d12";
  return "#cf3f3a";
}

function exportCsv(rows: PgmProjectRow[]) {
  const cols = ["Name","Code","Program","Client","PM","Phase","Status","Health","SPI","CPI","Sched%","Budget%","Risks","Issues","Last Report"];
  const lines = [
    cols.join(","),
    ...rows.map((r) => [
      `"${r.name}"`, r.code, `"${r.programName}"`, `"${r.clientName}"`, `"${r.pmName}"`,
      r.phase, r.status, r.rag, r.spi ?? "", r.cpi ?? "",
      r.schedPct, r.budPct, r.riskCount, r.issueCount,
      r.lastReportDate ? new Date(r.lastReportDate).toLocaleDateString() : "",
    ].join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "pgm-projects.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function PgmProjectsPage() {
  const { data: session } = useSession();
  const user = (session?.user as any) ?? {};

  const [projects, setProjects] = useState<PgmProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterRag, setFilterRag] = useState<string>("all");
  const [filterProgram, setFilterProgram] = useState<string>("all");
  const [filterPhase, setFilterPhase] = useState<string>("all");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    fetch("/api/pgm/projects")
      .then((r) => r.json())
      .then((data) => { setProjects(data.projects ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const programs = useMemo(() => Array.from(new Set(projects.map((p) => p.programName))).sort(), [projects]);
  const phases   = useMemo(() => Array.from(new Set(projects.map((p) => p.phase))).sort(), [projects]);

  const filtered = useMemo(() => {
    let rows = projects;
    if (search)          rows = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()) || r.pmName.toLowerCase().includes(search.toLowerCase()));
    if (filterRag !== "all")     rows = rows.filter((r) => r.rag === filterRag);
    if (filterProgram !== "all") rows = rows.filter((r) => r.programName === filterProgram);
    if (filterPhase !== "all")   rows = rows.filter((r) => r.phase === filterPhase);
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? "", bv = b[sortKey] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [projects, search, filterRag, filterProgram, filterPhase, sortKey, sortDir]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }, [sortKey]);

  const TH = ({ label, k, style }: { label: string; k?: SortKey; style?: React.CSSProperties }) => (
    <th
      onClick={() => k && toggleSort(k)}
      style={{
        textAlign: "left", padding: "10px 14px", fontSize: 11.5, fontWeight: 700,
        color: T.muted, whiteSpace: "nowrap", cursor: k ? "pointer" : "default",
        userSelect: "none", background: T.bg, ...style,
      }}
    >
      {label}{k && sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );

  if (!session) return null;

  return (
    <div style={{ height: "100%", overflowY: "auto", background: T.bg, fontFamily: "'Aptos','Calibri',sans-serif" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto", padding: "28px 32px 48px" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <Link href="/dashboard/program" style={{ fontSize: 12, color: T.teal, textDecoration: "none" }}>← Dashboard</Link>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.petrol, marginTop: 6 }}>All Projects</div>
              <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{filtered.length} of {projects.length} projects</div>
            </div>
            <button
              onClick={() => exportCsv(filtered)}
              style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.teal}`, background: T.card, color: T.teal, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              ↓ Export CSV
            </button>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search project or PM…"
              style={{ flex: "1 1 200px", padding: "7px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, outline: "none", background: T.card }}
            />
            {([
              { label: "Health", value: filterRag, setter: setFilterRag, options: [["all","All Health"],["red","Critical"],["amber","At Risk"],["green","On Track"]] },
              { label: "Program", value: filterProgram, setter: setFilterProgram, options: [["all","All Programs"],...programs.map((p) => [p,p])] },
              { label: "Phase", value: filterPhase, setter: setFilterPhase, options: [["all","All Phases"],...phases.map((p) => [p,p])] },
            ] as const).map(({ label, value, setter, options }) => (
              <select
                key={label}
                value={value}
                onChange={(e) => setter(e.target.value)}
                style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, background: T.card, cursor: "pointer" }}
              >
                {(options as unknown as [string, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            {(search || filterRag !== "all" || filterProgram !== "all" || filterPhase !== "all") && (
              <button onClick={() => { setSearch(""); setFilterRag("all"); setFilterProgram("all"); setFilterPhase("all"); }} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.muted, fontSize: 13, cursor: "pointer" }}>
                Clear filters
              </button>
            )}
          </div>

          {/* Table */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: 48, textAlign: "center", color: T.muted, fontSize: 13 }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", color: T.muted, fontSize: 13 }}>No projects match your filters.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <TH label="Project" k="name" />
                      <TH label="Program" k="programName" />
                      <TH label="PM" k="pmName" />
                      <TH label="Phase" k="phase" />
                      <TH label="Health" k="rag" />
                      <TH label="SPI" k="spi" style={{ textAlign: "center" }} />
                      <TH label="CPI" k="cpi" style={{ textAlign: "center" }} />
                      <TH label="Sched %" k="schedPct" style={{ textAlign: "center" }} />
                      <TH label="Budget %" k="budPct" style={{ textAlign: "center" }} />
                      <TH label="Risks" k="riskCount" style={{ textAlign: "center" }} />
                      <TH label="Last Report" k="lastReportDate" />
                      <th style={{ padding: "10px 14px", background: T.bg }} />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p, i) => (
                      <tr key={p.id} style={{ borderTop: `1px solid ${T.border}`, background: i % 2 === 1 ? "#fafcfd" : T.card }}>
                        <td style={{ padding: "11px 14px" }}>
                          <Link href={`/dashboard/program/projects/${p.id}`} style={{ fontWeight: 700, color: T.petrol, textDecoration: "none" }}>{p.name}</Link>
                          {p.code && <div style={{ fontSize: 10.5, color: T.muted, marginTop: 1 }}>{p.code}</div>}
                        </td>
                        <td style={{ padding: "11px 14px", color: T.muted }}>{p.programName}</td>
                        <td style={{ padding: "11px 14px", color: T.text }}>{p.pmName}</td>
                        <td style={{ padding: "11px 14px", color: T.muted, textTransform: "capitalize" }}>{p.phase}</td>
                        <td style={{ padding: "11px 14px" }}><RagPill rag={p.rag} /></td>
                        <td style={{ padding: "11px 14px", textAlign: "center", fontWeight: 700, color: spiColor(p.spi) }}>{p.spi?.toFixed(2) ?? "—"}</td>
                        <td style={{ padding: "11px 14px", textAlign: "center", fontWeight: 700, color: spiColor(p.cpi) }}>{p.cpi?.toFixed(2) ?? "—"}</td>
                        <td style={{ padding: "11px 14px", textAlign: "center", color: T.text }}>{p.schedPct}%</td>
                        <td style={{ padding: "11px 14px", textAlign: "center", color: p.budPct > 90 ? "#cf3f3a" : T.text }}>{p.budPct}%</td>
                        <td style={{ padding: "11px 14px", textAlign: "center", color: p.riskCount > 0 ? "#c17d12" : T.muted }}>{p.riskCount}</td>
                        <td style={{ padding: "11px 14px", color: T.muted, fontSize: 12 }}>
                          {p.lastReportDate ? new Date(p.lastReportDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <Link href={`/dashboard/program/projects/${p.id}`} style={{ fontSize: 11.5, color: T.teal, fontWeight: 600, textDecoration: "none", background: `${T.teal}12`, padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.teal}30` }}>
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
  );
}
