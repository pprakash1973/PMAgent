"use client";
import { useState, useMemo } from "react";

export interface DhProject {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  clusterId: string;
  clusterName: string;
  clusterType: string;
  programName: string;
  pmName: string;
  rag: "red" | "amber" | "green";
  spi: number | null;
  cpi: number | null;
  schedPct: number;
  budPct: number;
  budget: number | null;
  phase: string;
}

export interface TrendPoint {
  label: string;
  avgSpi: number | null;
  avgCpi: number | null;
  healthPct: number | null;
}

// ─── color helpers ────────────────────────────────────────────────────────────

function ragColor(r: string) {
  return r === "red" ? "#cf3f3a" : r === "amber" ? "#c17d12" : "#158a5a";
}
function ragBg(r: string) {
  return r === "red" ? "#fbe4e2" : r === "amber" ? "#fbf0da" : "#e3f3ea";
}
function ragLabel(r: string) {
  return r === "red" ? "Critical" : r === "amber" ? "At Risk" : "On Track";
}
function ragGlow(r: string) {
  return r === "red" ? "rgba(207,63,58,.18)" : r === "amber" ? "rgba(193,125,18,.18)" : "rgba(21,138,90,.18)";
}
function spiCol(v: number | null) {
  if (v === null) return "#8a909c";
  return v >= 0.95 ? "#158a5a" : v >= 0.85 ? "#c17d12" : "#cf3f3a";
}
function budCol(v: number) {
  return v > 90 ? "#cf3f3a" : v > 75 ? "#c17d12" : "#158a5a";
}
function schedCol(v: number) {
  return v > 95 ? "#158a5a" : "#4f5bd5";
}

// ─── alert text derived from metrics ─────────────────────────────────────────

function alertFor(p: DhProject): { title: string; body: string } {
  if (p.rag === "green") return { title: "", body: "" };
  if (p.spi !== null && p.spi < 0.75) {
    return { title: "Schedule critical", body: `SPI ${p.spi.toFixed(2)} — significant milestone risk.` };
  }
  if (p.cpi !== null && p.cpi < 0.8) {
    return { title: "Budget overrun risk", body: `Burn rate exceeding plan; CPI ${p.cpi.toFixed(2)}.` };
  }
  if (p.budPct > 85 && p.schedPct < 70) {
    return { title: "Budget vs. schedule gap", body: `${p.budPct}% budget used, only ${p.schedPct}% schedule complete.` };
  }
  if (p.spi !== null && p.spi < 0.9) {
    return { title: "Schedule pressure", body: `SPI ${p.spi.toFixed(2)} — monitor closely this sprint.` };
  }
  return { title: "At risk", body: "Review status with PM this week." };
}

// ─── RAG pill ─────────────────────────────────────────────────────────────────

function RagPill({ rag }: { rag: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, color: ragColor(rag), background: ragBg(rag),
      border: `1px solid ${ragColor(rag)}40`, borderRadius: 6, padding: "2px 8px",
    }}>{ragLabel(rag)}</span>
  );
}

// ─── mini progress bar ────────────────────────────────────────────────────────

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, background: "#eef0f3", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 3, background: color, width: `${Math.min(pct, 100)}%`, transition: "width .4s" }} />
    </div>
  );
}

// ─── trend SVG ───────────────────────────────────────────────────────────────

function TrendChart({ trends }: { trends: TrendPoint[] }) {
  // Map values (0.6–1.1 range) to y coords (20–155)
  const H = 155, TOP = 20;
  const range = 0.5; // 0.6 to 1.1
  const toY = (v: number) => TOP + ((1.1 - Math.min(Math.max(v, 0.6), 1.1)) / range) * (H - TOP);

  const W = 560;
  const xs = trends.map((_, i) => 72 + i * (W - 72 - 68) / Math.max(trends.length - 1, 1));

  const pts = (vals: (number | null)[]) =>
    vals.map((v, i) => v !== null ? `${xs[i]},${toY(v)}` : null).filter(Boolean).join(" ");

  const spiPts = trends.map(t => t.avgSpi);
  const cpiPts = trends.map(t => t.avgCpi);
  const hPts   = trends.map(t => t.healthPct !== null ? 0.6 + t.healthPct / 100 * 0.5 : null);

  return (
    <svg viewBox={`0 0 ${W} 190`} style={{ width: "100%", height: 190, display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="gspi2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f5bd5" stopOpacity=".12" />
          <stop offset="100%" stopColor="#4f5bd5" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="40" y1="20" x2="40" y2="155" stroke="#eef0f3" strokeWidth="1" />
      <line x1="40" y1="155" x2="548" y2="155" stroke="#eef0f3" strokeWidth="1" />
      <line x1="40" y1="63"  x2="548" y2="63"  stroke="#f5f5f5" strokeWidth="1" strokeDasharray="4,3" />
      <line x1="40" y1="109" x2="548" y2="109" stroke="#f5f5f5" strokeWidth="1" strokeDasharray="4,3" />
      <text x="34" y="24"  textAnchor="end" fontFamily="monospace" fontSize="9" fill="#b8bcc6">1.1</text>
      <text x="34" y="67"  textAnchor="end" fontFamily="monospace" fontSize="9" fill="#b8bcc6">0.9</text>
      <text x="34" y="113" textAnchor="end" fontFamily="monospace" fontSize="9" fill="#b8bcc6">0.7</text>

      {/* Health line */}
      {hPts.some(v => v !== null) && (
        <polyline points={pts(hPts)} fill="none" stroke="#c17d12" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5,3" opacity=".65" />
      )}
      {/* CPI line */}
      {cpiPts.some(v => v !== null) && (
        <polyline points={pts(cpiPts)} fill="none" stroke="#158a5a"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {/* SPI area + line */}
      {spiPts.some(v => v !== null) && (() => {
        const validXs = spiPts.map((v, i) => v !== null ? xs[i] : null).filter(Boolean) as number[];
        const lastX = validXs[validXs.length - 1] ?? xs[xs.length - 1];
        return (
          <>
            <polygon
              points={`${pts(spiPts)} ${lastX},155 ${xs[0]},155`}
              fill="url(#gspi2)" opacity=".7"
            />
            <polyline points={pts(spiPts)} fill="none" stroke="#4f5bd5"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={lastX} cy={toY(spiPts.filter(v => v !== null).slice(-1)[0]!)} r="4" fill="#4f5bd5" />
          </>
        );
      })()}

      {/* x-axis labels */}
      {trends.map((t, i) => (
        <text key={i} x={xs[i]} y="170" textAnchor="middle"
          fontFamily="monospace" fontSize="9" fill="#b8bcc6">{t.label}</text>
      ))}
    </svg>
  );
}

// ─── Cluster card ─────────────────────────────────────────────────────────────

function ClusterCard({ name, type, projects }: { name: string; type: string; projects: DhProject[] }) {
  const green = projects.filter(p => p.rag === "green").length;
  const amber = projects.filter(p => p.rag === "amber").length;
  const red   = projects.filter(p => p.rag === "red").length;
  const total = projects.length;
  const health = total ? Math.round((green / total) * 100) : 0;

  const spiVals = projects.map(p => p.spi).filter((v): v is number => v !== null);
  const cpiVals = projects.map(p => p.cpi).filter((v): v is number => v !== null);
  const avgSpi = spiVals.length ? (spiVals.reduce((a,b) => a+b, 0) / spiVals.length) : null;
  const avgCpi = cpiVals.length ? (cpiVals.reduce((a,b) => a+b, 0) / cpiVals.length) : null;

  const avgSched = projects.length ? Math.round(projects.reduce((s,p) => s + p.schedPct, 0) / projects.length) : 0;
  const avgBud   = projects.length ? Math.round(projects.reduce((s,p) => s + p.budPct, 0) / projects.length) : 0;

  const clusterRag = red > 0 ? "red" : amber > 0 ? "amber" : "green";
  const atRisk = projects.filter(p => p.rag !== "green").map(p => p.name);

  const initials = name.split(/[\s()]+/).filter(Boolean).map(w => w[0]).join("").slice(0, 3).toUpperCase();

  const PALETTE: Record<string, string> = { ANZ: "#2b5cb8", HC: "#1b7a46", AU: "#7c3a9e", DEFAULT: "#4f5bd5" };
  const clusterColor = PALETTE[initials] ?? PALETTE.DEFAULT;

  return (
    <div style={{
      background: "#fff", border: `1px solid ${ragColor(clusterRag)}30`,
      borderLeft: `5px solid ${ragColor(clusterRag)}`, borderRadius: 16, overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderBottom: "1px solid #f0f1f4", background: "#fafafa" }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: clusterColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
        }}>{initials}</div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{name}</span>
            <RagPill rag={clusterRag} />
            <span style={{ fontSize: 11, color: "#8a909c", border: "1px solid #e2e5ea", borderRadius: 5, padding: "1px 8px" }}>{type}</span>
          </div>
          <div style={{ fontSize: 11.5, color: "#8a909c", marginTop: 2 }}>
            {[...new Set(projects.map(p => p.clientName))].join(", ")}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {[
          { label: "Projects", val: String(total), col: "#1a1d24" },
          { label: "Health", val: `${health}%`, col: ragColor(clusterRag) },
          { label: "Avg SPI", val: avgSpi?.toFixed(2) ?? "—", col: spiCol(avgSpi) },
          { label: "Avg CPI", val: avgCpi?.toFixed(2) ?? "—", col: spiCol(avgCpi) },
        ].map(({ label, val, col }, i, arr) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {i > 0 && <div style={{ width: 1, background: "#eef0f3", height: 32, marginRight: 20 }} />}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#8a909c", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "monospace", color: col }}>{val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* body */}
      <div style={{ display: "flex" }}>
        <div style={{ flex: 1, padding: "16px 20px", borderRight: "1px solid #f0f1f4" }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".05em", color: "#8a909c", textTransform: "uppercase", marginBottom: 10 }}>RAG breakdown</div>
          <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ width: `${total ? (green/total)*100 : 0}%`, background: "#158a5a", transition: "width .4s" }} />
            <div style={{ width: `${total ? (amber/total)*100 : 0}%`, background: "#c17d12", transition: "width .4s" }} />
            <div style={{ width: `${total ? (red/total)*100 : 0}%`, background: "#cf3f3a", transition: "width .4s" }} />
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 12, fontWeight: 500 }}>
            <span style={{ color: "#158a5a" }}>● {green} Green</span>
            <span style={{ color: "#c17d12" }}>● {amber} Amber</span>
            <span style={{ color: "#cf3f3a" }}>● {red} Red</span>
          </div>
        </div>
        <div style={{ flex: 1, padding: "16px 20px", borderRight: "1px solid #f0f1f4" }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".05em", color: "#8a909c", textTransform: "uppercase", marginBottom: 10 }}>Avg metrics</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#5b616e", marginBottom: 4 }}>
                <span>Avg schedule</span><span style={{ fontFamily: "monospace", fontWeight: 600 }}>{avgSched}%</span>
              </div>
              <Bar pct={avgSched} color={schedCol(avgSched)} />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#5b616e", marginBottom: 4 }}>
                <span>Avg budget consumed</span><span style={{ fontFamily: "monospace", fontWeight: 600 }}>{avgBud}%</span>
              </div>
              <Bar pct={avgBud} color={budCol(avgBud)} />
            </div>
          </div>
        </div>
        <div style={{ flex: 1.4, padding: "16px 20px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".05em", color: "#8a909c", textTransform: "uppercase", marginBottom: 10 }}>At-risk projects</div>
          {atRisk.length === 0
            ? <span style={{ fontSize: 12.5, color: "#158a5a" }}>All projects on track</span>
            : <span style={{ fontSize: 12.5, color: "#cf3f3a", lineHeight: 1.6 }}>{atRisk.join(", ")}</span>
          }
        </div>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function DhDashboardClient({
  projects,
  trends,
  userName,
}: {
  projects: DhProject[];
  trends: TrendPoint[];
  userName: string;
}) {
  const [tab,      setTab]      = useState<"projects" | "clusters">("projects");
  const [filterCluster, setFilterCluster] = useState("");
  const [filterClient,  setFilterClient]  = useState("");
  const [filterProgram, setFilterProgram] = useState("");
  const [filterRag, setFilterRag] = useState("");
  const [search,   setSearch]   = useState("");
  const [view,     setView]     = useState<"table" | "grid">("table");

  // unique filter options
  const clusterOptions = useMemo(() => [...new Set(projects.map(p => p.clusterName))].sort(), [projects]);
  const clientOptions  = useMemo(() => {
    const src = filterCluster ? projects.filter(p => p.clusterName === filterCluster) : projects;
    return [...new Set(src.map(p => p.clientName))].sort();
  }, [projects, filterCluster]);
  const programOptions = useMemo(() => {
    const src = filterClient ? projects.filter(p => p.clientName === filterClient) : projects;
    return [...new Set(src.map(p => p.programName))].sort();
  }, [projects, filterClient]);

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (filterCluster && p.clusterName !== filterCluster) return false;
      if (filterClient  && p.clientName  !== filterClient)  return false;
      if (filterProgram && p.programName !== filterProgram) return false;
      if (filterRag     && p.rag         !== filterRag)     return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [projects, filterCluster, filterClient, filterProgram, filterRag, search]);

  const clearFilters = () => {
    setFilterCluster(""); setFilterClient(""); setFilterProgram("");
    setFilterRag(""); setSearch("");
  };
  const hasFilter = !!(filterCluster || filterClient || filterProgram || filterRag || search);

  // KPIs from filtered set
  const kpi = useMemo(() => {
    const total = filtered.length;
    const green = filtered.filter(p => p.rag === "green").length;
    const amber = filtered.filter(p => p.rag === "amber").length;
    const red   = filtered.filter(p => p.rag === "red").length;
    const health = total ? Math.round((green / total) * 100) : 0;
    const spiVals = filtered.map(p => p.spi).filter((v): v is number => v !== null);
    const cpiVals = filtered.map(p => p.cpi).filter((v): v is number => v !== null);
    const avgSpi = spiVals.length ? (spiVals.reduce((a,b) => a+b, 0) / spiVals.length) : null;
    const avgCpi = cpiVals.length ? (cpiVals.reduce((a,b) => a+b, 0) / cpiVals.length) : null;
    const totalBudget = filtered.reduce((s, p) => s + (p.budget ?? 0), 0);
    const budPcts = filtered.filter(p => p.budget && p.budget > 0).map(p => p.budPct);
    const avgBudPct = budPcts.length ? Math.round(budPcts.reduce((a,b) => a+b, 0) / budPcts.length) : 0;
    return { total, green, amber, red, health, avgSpi, avgCpi, totalBudget, avgBudPct };
  }, [filtered]);

  const atRisk = filtered.filter(p => p.rag !== "green");

  // clusters from unfiltered (for cluster tab)
  const clusters = useMemo(() => {
    const map: Record<string, DhProject[]> = {};
    for (const p of projects) {
      if (!map[p.clusterName]) map[p.clusterName] = [];
      map[p.clusterName].push(p);
    }
    return map;
  }, [projects]);

  // Cluster tab SPI comparison data for the chart
  const clusterTrendData = useMemo(() => {
    const entries = Object.entries(clusters);
    return entries.map(([name, ps]) => ({
      name,
      spiVals: ps.map(p => p.spi).filter((v): v is number => v !== null),
    }));
  }, [clusters]);

  const selectStyle = {
    border: "none", background: "transparent",
    font: "500 12.5px 'Aptos','Calibri',sans-serif",
    color: "#1a1d24", outline: "none", paddingRight: 16, cursor: "pointer",
  } as const;

  const tabBtn = (active: boolean) => ({
    height: 44, padding: "0 4px", background: "transparent", border: "none",
    borderBottom: active ? "2.5px solid #006E74" : "2.5px solid transparent",
    fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? "#006E74" : "#8a909c", cursor: "pointer",
    fontFamily: "'Aptos','Calibri',sans-serif",
  } as const);

  const viewBtn = (active: boolean) => ({
    height: 30, padding: "0 12px", background: active ? "#fff" : "transparent",
    border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
    color: active ? "#1a1d24" : "#8a909c", cursor: "pointer",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,.08)" : "none",
  } as const);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "'Aptos','Calibri',sans-serif" }}>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e5ea", padding: "10px 24px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#8a909c", letterSpacing: ".05em", textTransform: "uppercase" }}>Filter</span>

        {/* search */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, background: "#f7f8fa", border: "1px solid #e2e5ea", borderRadius: 9, padding: "0 12px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#8a909c" strokeWidth="1.8"/><path d="M20 20l-3-3" stroke="#8a909c" strokeWidth="1.8" strokeLinecap="round"/></svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects…"
            style={{ border: "none", background: "transparent", fontSize: 12.5, color: "#1a1d24", outline: "none", width: 150 }}
          />
        </div>

        {/* cluster */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: 34, background: "#f7f8fa", border: "1px solid #e2e5ea", borderRadius: 9, padding: "0 11px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M6 12h12M10 18h4" stroke="#8a909c" strokeWidth="1.8" strokeLinecap="round"/></svg>
          <select value={filterCluster} onChange={e => { setFilterCluster(e.target.value); setFilterClient(""); setFilterProgram(""); }} style={selectStyle}>
            <option value="">All Clusters</option>
            {clusterOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* client */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: 34, background: "#f7f8fa", border: "1px solid #e2e5ea", borderRadius: 9, padding: "0 11px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#8a909c" strokeWidth="1.8"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#8a909c" strokeWidth="1.8"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#8a909c" strokeWidth="1.8"/><path d="M14 18h7M17.5 14.5v7" stroke="#8a909c" strokeWidth="1.8" strokeLinecap="round"/></svg>
          <select value={filterClient} onChange={e => { setFilterClient(e.target.value); setFilterProgram(""); }} style={selectStyle}>
            <option value="">All Clients</option>
            {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* program */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: 34, background: "#f7f8fa", border: "1px solid #e2e5ea", borderRadius: 9, padding: "0 11px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 13h5v8H3zM10 8h5v13h-5zM17 3h4v18h-4z" stroke="#8a909c" strokeWidth="1.8" strokeLinejoin="round"/></svg>
          <select value={filterProgram} onChange={e => setFilterProgram(e.target.value)} style={selectStyle}>
            <option value="">All Programs</option>
            {programOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* RAG pills */}
        <div style={{ display: "flex", gap: 6 }}>
          {(["", "red", "amber", "green"] as const).map(r => (
            <button key={r} onClick={() => setFilterRag(r)} style={{
              height: 30, padding: "0 11px", border: "1px solid",
              borderColor: filterRag === r ? (r === "" ? "#006E74" : ragColor(r)) : "#e2e5ea",
              borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              background: filterRag === r ? (r === "" ? "#e6f4f5" : ragBg(r)) : "#fff",
              color: filterRag === r ? (r === "" ? "#006E74" : ragColor(r)) : "#8a909c",
            }}>
              {r === "" ? "All" : `● ${r.charAt(0).toUpperCase() + r.slice(1)}`}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#8a909c", fontWeight: 500 }}>{filtered.length} projects</span>
        {hasFilter && (
          <button onClick={clearFilters} style={{ fontSize: 11.5, color: "#8a909c", background: "none", border: "1px solid #e2e5ea", borderRadius: 7, padding: "4px 10px", cursor: "pointer" }}>
            Clear filters
          </button>
        )}
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #e2e5ea", padding: "0 24px", display: "flex", alignItems: "center", gap: 24, flexShrink: 0 }}>
        <button style={tabBtn(tab === "projects")}  onClick={() => setTab("projects")}>Project Information</button>
        <button style={tabBtn(tab === "clusters")} onClick={() => setTab("clusters")}>Cluster Delivery Metrics</button>
      </div>

      {/* ── Scrollable content ─────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 48px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* ══════════════ PROJECT INFORMATION TAB ══════════════ */}
        {tab === "projects" && (
          <>
            {/* KPI strip */}
            <div style={{ display: "flex", gap: 12 }}>
              {/* Portfolio health */}
              <div style={{ flex: 1, minWidth: 160, background: "#1b1e27", borderRadius: 14, padding: "17px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", color: "rgba(255,255,255,.45)", textTransform: "uppercase" }}>Portfolio Health</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 32, fontWeight: 600, color: "#3ec98a", fontFamily: "monospace" }}>{kpi.health}%</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#3ec98a" }}>
                    {kpi.green} of {kpi.total} on track
                  </span>
                </div>
                <div style={{ height: 4, background: "rgba(255,255,255,.1)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 2, background: "#3ec98a", width: `${kpi.health}%`, transition: "width .4s" }} />
                </div>
              </div>

              {/* Health distribution */}
              <div style={{ flex: 1, background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "17px 20px" }}>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", color: "#8a909c", textTransform: "uppercase", display: "block", marginBottom: 7 }}>Health Distribution</span>
                <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 9 }}>
                  <div style={{ width: `${kpi.total ? (kpi.green/kpi.total)*100 : 0}%`, background: "#158a5a", transition: "width .4s" }} />
                  <div style={{ width: `${kpi.total ? (kpi.amber/kpi.total)*100 : 0}%`, background: "#c17d12", transition: "width .4s" }} />
                  <div style={{ width: `${kpi.total ? (kpi.red/kpi.total)*100 : 0}%`, background: "#cf3f3a", transition: "width .4s" }} />
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 12, fontWeight: 500 }}>
                  <span style={{ color: "#158a5a" }}>● {kpi.green} Green</span>
                  <span style={{ color: "#c17d12" }}>● {kpi.amber} Amber</span>
                  <span style={{ color: "#cf3f3a" }}>● {kpi.red} Red</span>
                </div>
              </div>

              {/* Budget consumed */}
              <div style={{ flex: 1, background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "17px 20px" }}>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", color: "#8a909c", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Avg Budget Consumed</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
                  <span style={{ fontSize: 26, fontWeight: 600, fontFamily: "monospace" }}>{kpi.avgBudPct}%</span>
                  {kpi.totalBudget > 0 && (
                    <span style={{ fontSize: 12, color: "#8a909c" }}>of ${(kpi.totalBudget/1000).toFixed(0)}K total</span>
                  )}
                </div>
                <Bar pct={kpi.avgBudPct} color={budCol(kpi.avgBudPct)} />
              </div>

              {/* Avg SPI / CPI / Active */}
              <div style={{ flex: 1, background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "17px 20px" }}>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", color: "#8a909c", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Avg SPI / CPI</span>
                <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#8a909c" }}>SPI</div>
                    <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "monospace", color: spiCol(kpi.avgSpi) }}>{kpi.avgSpi?.toFixed(2) ?? "—"}</div>
                  </div>
                  <div style={{ width: 1, background: "#eef0f3" }} />
                  <div>
                    <div style={{ fontSize: 10, color: "#8a909c" }}>CPI</div>
                    <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "monospace", color: spiCol(kpi.avgCpi) }}>{kpi.avgCpi?.toFixed(2) ?? "—"}</div>
                  </div>
                  <div style={{ width: 1, background: "#eef0f3" }} />
                  <div>
                    <div style={{ fontSize: 10, color: "#8a909c" }}>Active</div>
                    <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "monospace" }}>{kpi.total}</div>
                  </div>
                </div>
              </div>

              {/* AI alert */}
              <div style={{ flex: 1.2, background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: "1px solid #cfd4f5", borderRadius: 14, padding: "17px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ color: "#4f5bd5", fontSize: 14 }}>✦</span>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: "#4f5bd5", textTransform: "uppercase" }}>AI Alert</span>
                </div>
                <div style={{ fontSize: 12.5, color: "#3a3f52", lineHeight: 1.55 }}>
                  {atRisk.length === 0
                    ? `All ${kpi.total} projects healthy. No immediate action required.`
                    : `${kpi.red} project${kpi.red !== 1 ? "s" : ""} critical${kpi.amber > 0 ? `, ${kpi.amber} at risk` : ""}. Review escalations below.`
                  }
                </div>
              </div>
            </div>

            {/* At-risk section */}
            {atRisk.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#cf3f3a", boxShadow: "0 0 0 3px rgba(207,63,58,.18)" }} />
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Projects at risk</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#cf3f3a", background: "#fbe4e2", borderRadius: 6, padding: "2px 9px" }}>{atRisk.length} need attention</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {atRisk.map(p => {
                    const alert = alertFor(p);
                    return (
                      <div key={p.id} style={{
                        background: "#fff", border: `1px solid ${ragBg(p.rag)}`,
                        borderLeft: `4px solid ${ragColor(p.rag)}`, borderRadius: 12,
                        padding: "14px 16px", display: "flex", alignItems: "center", gap: 16,
                      }}>
                        <div style={{ flex: 1.8, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", background: ragColor(p.rag), flexShrink: 0, boxShadow: `0 0 0 3px ${ragGlow(p.rag)}` }} />
                            <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 19, flexWrap: "wrap", marginTop: 3 }}>
                            <span style={{ fontSize: 11, color: "#8a909c", fontFamily: "monospace" }}>{p.id}</span>
                            <span style={{ color: "#d3d7de" }}>·</span>
                            <span style={{ fontSize: 12, color: "#5b616e" }}>{p.clientName}</span>
                            <span style={{ color: "#d3d7de" }}>·</span>
                            <span style={{ fontSize: 12, color: "#5b616e" }}>{p.programName}</span>
                            <span style={{ color: "#d3d7de" }}>·</span>
                            <span style={{ fontSize: 12, color: "#5b616e" }}>PM: {p.pmName}</span>
                          </div>
                        </div>
                        {/* SPI */}
                        <div style={{ width: 60, textAlign: "center", flexShrink: 0 }}>
                          <div style={{ fontSize: 10, color: "#8a909c", marginBottom: 3 }}>SPI</div>
                          <div style={{ fontSize: 17, fontWeight: 600, fontFamily: "monospace", color: spiCol(p.spi) }}>{p.spi?.toFixed(2) ?? "—"}</div>
                        </div>
                        {/* CPI */}
                        <div style={{ width: 60, textAlign: "center", flexShrink: 0 }}>
                          <div style={{ fontSize: 10, color: "#8a909c", marginBottom: 3 }}>CPI</div>
                          <div style={{ fontSize: 17, fontWeight: 600, fontFamily: "monospace", color: spiCol(p.cpi) }}>{p.cpi?.toFixed(2) ?? "—"}</div>
                        </div>
                        {/* Schedule bar */}
                        <div style={{ width: 120, flexShrink: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8a909c", marginBottom: 4 }}>
                            <span>Schedule</span><span style={{ fontFamily: "monospace" }}>{p.schedPct}%</span>
                          </div>
                          <Bar pct={p.schedPct} color={schedCol(p.schedPct)} />
                        </div>
                        {/* Budget bar */}
                        <div style={{ width: 120, flexShrink: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8a909c", marginBottom: 4 }}>
                            <span>Budget</span><span style={{ fontFamily: "monospace" }}>{p.budPct}%</span>
                          </div>
                          <Bar pct={p.budPct} color={budCol(p.budPct)} />
                        </div>
                        {/* Alert */}
                        <div style={{ width: 180, flexShrink: 0 }}>
                          {alert.title && <div style={{ fontSize: 11.5, fontWeight: 600, color: ragColor(p.rag), marginBottom: 4 }}>{alert.title}</div>}
                          {alert.body  && <div style={{ fontSize: 11, color: "#5b616e", lineHeight: 1.4 }}>{alert.body}</div>}
                        </div>
                        {/* Actions */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 7, flexShrink: 0 }}>
                          <a href={`/dashboard/projects/${p.id}`} style={{
                            height: 30, padding: "0 12px", background: "#006E74", color: "#fff",
                            border: "none", borderRadius: 8, fontSize: 11.5, fontWeight: 600,
                            cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center",
                          }}>Drill in →</a>
                          <button style={{ height: 30, padding: "0 12px", background: "#fff", border: "1px solid #d3d7de", color: "#5b616e", borderRadius: 8, fontSize: 11.5, fontWeight: 500, cursor: "pointer" }}>
                            Escalate
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* All projects */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>All projects</span>
                <div style={{ flex: 1 }} />
                <div style={{ display: "flex", background: "#f0f1f4", borderRadius: 8, padding: 3, gap: 0 }}>
                  <button style={viewBtn(view === "table")} onClick={() => setView("table")}>Table</button>
                  <button style={viewBtn(view === "grid")}  onClick={() => setView("grid")}>Grid</button>
                </div>
              </div>

              {/* TABLE VIEW */}
              {view === "table" && (
                <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, overflow: "hidden", overflowX: "auto" }}>
                  <div style={{ display: "flex", alignItems: "center", padding: "10px 18px", background: "#f7f8fa", fontSize: 10, fontWeight: 700, letterSpacing: ".05em", color: "#8a909c", textTransform: "uppercase", borderBottom: "1px solid #eceef2" }}>
                    <span style={{ flex: 1, minWidth: 160 }}>Project</span>
                    <span style={{ width: 100 }}>Client</span>
                    <span style={{ width: 80 }}>PM</span>
                    <span style={{ width: 60 }}>RAG</span>
                    <span style={{ width: 54 }}>SPI</span>
                    <span style={{ width: 54 }}>CPI</span>
                    <span style={{ width: 100 }}>Schedule</span>
                    <span style={{ width: 100 }}>Budget</span>
                    <span style={{ width: 80 }}>Phase</span>
                    <span style={{ width: 54 }} />
                  </div>
                  {filtered.length === 0
                    ? <div style={{ padding: "28px 18px", textAlign: "center", color: "#8a909c", fontSize: 13 }}>No projects match the current filters.</div>
                    : filtered.map((p, i) => (
                      <div key={p.id} style={{
                        display: "flex", alignItems: "center", padding: "12px 18px",
                        borderTop: i === 0 ? "none" : "1px solid #eceef2",
                      }}>
                        <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 9 }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: ragColor(p.rag), flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                            <div style={{ fontSize: 10, color: "#8a909c", fontFamily: "monospace" }}>{p.id}</div>
                          </div>
                        </div>
                        <span style={{ width: 100, fontSize: 12, color: "#5b616e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.clientName}</span>
                        <span style={{ width: 80,  fontSize: 12, color: "#5b616e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.pmName}</span>
                        <span style={{ width: 60 }}><RagPill rag={p.rag} /></span>
                        <span style={{ width: 54, fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: spiCol(p.spi) }}>{p.spi?.toFixed(2) ?? "—"}</span>
                        <span style={{ width: 54, fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: spiCol(p.cpi) }}>{p.cpi?.toFixed(2) ?? "—"}</span>
                        <div style={{ width: 100 }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 9.5, color: "#8a909c", marginBottom: 3 }}>
                            <span style={{ fontFamily: "monospace" }}>{p.schedPct}%</span>
                          </div>
                          <Bar pct={p.schedPct} color={schedCol(p.schedPct)} />
                        </div>
                        <div style={{ width: 100 }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 9.5, color: "#8a909c", marginBottom: 3 }}>
                            <span style={{ fontFamily: "monospace" }}>{p.budPct}%</span>
                          </div>
                          <Bar pct={p.budPct} color={budCol(p.budPct)} />
                        </div>
                        <span style={{ width: 80, fontSize: 11.5, color: "#5b616e", textTransform: "capitalize" }}>{p.phase}</span>
                        <a href={`/dashboard/projects/${p.id}`} style={{ width: 54, fontSize: 12, fontWeight: 600, color: "#006E74", textDecoration: "none" }}>View →</a>
                      </div>
                    ))
                  }
                </div>
              )}

              {/* GRID VIEW */}
              {view === "grid" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
                  {filtered.map(p => (
                    <div key={p.id} style={{ background: "#fff", border: `1px solid ${p.rag === "green" ? "#e2e5ea" : ragBg(p.rag)}`, borderRadius: 14, padding: "16px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: ragColor(p.rag), flexShrink: 0, marginTop: 4 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                          <div style={{ fontSize: 10.5, color: "#8a909c", marginTop: 1, fontFamily: "monospace" }}>{p.id} · {p.clientName}</div>
                        </div>
                        <RagPill rag={p.rag} />
                      </div>
                      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                        {[
                          { label: "SPI", val: p.spi?.toFixed(2) ?? "—", col: spiCol(p.spi) },
                          { label: "CPI", val: p.cpi?.toFixed(2) ?? "—", col: spiCol(p.cpi) },
                          { label: "Phase", val: p.phase, col: "#1a1d24" },
                        ].map(({ label, val, col }) => (
                          <div key={label} style={{ flex: 1, background: "#f7f8fa", borderRadius: 8, padding: "8px 10px" }}>
                            <div style={{ fontSize: 9.5, color: "#8a909c" }}>{label}</div>
                            <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "monospace", color: col, marginTop: 2, textTransform: "capitalize" }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#8a909c" }}>
                          <span>Schedule</span><span style={{ fontFamily: "monospace" }}>{p.schedPct}%</span>
                        </div>
                        <Bar pct={p.schedPct} color={schedCol(p.schedPct)} />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#8a909c" }}>
                          <span>Budget</span><span style={{ fontFamily: "monospace" }}>{p.budPct}%</span>
                        </div>
                        <Bar pct={p.budPct} color={budCol(p.budPct)} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "#5b616e", borderTop: "1px solid #f0f1f4", paddingTop: 10 }}>
                        <span>PM: {p.pmName}</span>
                        <span style={{ color: "#d3d7de" }}>·</span>
                        <span>{p.programName}</span>
                        <div style={{ flex: 1 }} />
                        <a href={`/dashboard/projects/${p.id}`} style={{ fontSize: 12, fontWeight: 600, color: "#006E74", textDecoration: "none" }}>View →</a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom row: trends + AI insights */}
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
              {/* Trend chart */}
              <div style={{ flex: 1.6, background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Delivery Trends</span>
                  <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#8a909c" }}>
                      <span style={{ width: 16, height: 3, background: "#4f5bd5", borderRadius: 2, display: "inline-block" }} />Avg SPI
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#8a909c" }}>
                      <span style={{ width: 16, height: 3, background: "#158a5a", borderRadius: 2, display: "inline-block" }} />Avg CPI
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#8a909c" }}>
                      <span style={{ width: 16, height: 3, background: "#c17d12", borderRadius: 2, display: "inline-block", opacity: 0.6 }} />Health %
                    </span>
                  </div>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11.5, color: "#8a909c" }}>6-month rolling</span>
                </div>
                <TrendChart trends={trends} />
              </div>

              {/* AI insights */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: "1px solid #cfd4f5", borderRadius: 14, padding: "17px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
                    <span style={{ color: "#4f5bd5", fontSize: 15 }}>✦</span>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: "#4f5bd5", textTransform: "uppercase" }}>AI Portfolio Insights</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#3a3f52", lineHeight: 1.65 }}>
                    {kpi.red > 0
                      ? `${kpi.red} project${kpi.red > 1 ? "s are" : " is"} in critical status. Immediate intervention recommended. ${kpi.amber > 0 ? `A further ${kpi.amber} project${kpi.amber > 1 ? "s" : ""} show schedule pressure.` : ""}`
                      : kpi.amber > 0
                      ? `${kpi.amber} project${kpi.amber > 1 ? "s" : ""} show early warning signs. Portfolio health at ${kpi.health}%.`
                      : `Portfolio is healthy at ${kpi.health}%. All ${kpi.total} projects on track.`
                    }
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button style={{ height: 32, padding: "0 13px", background: "#4f5bd5", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      ✦ Draft exec summary
                    </button>
                    <button style={{ height: 32, padding: "0 13px", background: "#fff", border: "1px solid #cfd4f5", color: "#4f5bd5", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Ask PM Agent
                    </button>
                  </div>
                </div>

                {/* Predictive outlook */}
                <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "16px 18px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: "#8a909c", textTransform: "uppercase", marginBottom: 12 }}>Predictive · 6-week outlook</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {kpi.red > 0 && (
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#cf3f3a", marginTop: 4, flexShrink: 0 }} />
                        <div style={{ fontSize: 12.5, color: "#3a3f52", lineHeight: 1.45 }}>
                          <b>{kpi.red} project{kpi.red > 1 ? "s" : ""}</b> on current trajectory will miss next milestone.
                        </div>
                      </div>
                    )}
                    {kpi.amber > 0 && (
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#c17d12", marginTop: 4, flexShrink: 0 }} />
                        <div style={{ fontSize: 12.5, color: "#3a3f52", lineHeight: 1.45 }}>
                          <b>{kpi.amber} project{kpi.amber > 1 ? "s"  : ""}</b> at risk of schedule slippage without intervention.
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#158a5a", marginTop: 4, flexShrink: 0 }} />
                      <div style={{ fontSize: 12.5, color: "#3a3f52", lineHeight: 1.45 }}>
                        <b>{kpi.green} project{kpi.green !== 1 ? "s" : ""}</b> on track and within budget.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════ CLUSTER DELIVERY METRICS TAB ══════════════ */}
        {tab === "clusters" && (
          <>
            {/* Cluster KPI strip */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160, background: "#1b1e27", borderRadius: 14, padding: "17px 20px" }}>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", color: "rgba(255,255,255,.45)", textTransform: "uppercase", display: "block", marginBottom: 7 }}>Clusters</span>
                <span style={{ fontSize: 32, fontWeight: 600, color: "#fff", fontFamily: "monospace" }}>{Object.keys(clusters).length}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,.45)", display: "block", marginTop: 3 }}>{projects.length} projects total</span>
              </div>
              {(() => {
                const entries = Object.entries(clusters);
                const sorted = entries
                  .map(([name, ps]) => ({
                    name,
                    green: ps.filter(p => p.rag === "green").length,
                    total: ps.length,
                    spi: ps.map(p => p.spi).filter((v): v is number => v !== null),
                    atRisk: ps.filter(p => p.rag !== "green").length,
                  }))
                  .map(c => ({ ...c, health: c.total ? c.green / c.total : 0, avgSpi: c.spi.length ? c.spi.reduce((a,b) => a+b,0)/c.spi.length : null }));

                const best  = [...sorted].sort((a,b) => b.health - a.health)[0];
                const worst = [...sorted].sort((a,b) => a.health - b.health)[0];

                return (
                  <>
                    {best && (
                      <div style={{ flex: 1, minWidth: 160, background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "17px 20px" }}>
                        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", color: "#8a909c", textTransform: "uppercase", display: "block", marginBottom: 7 }}>Best Performing</span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#158a5a" }}>{best.name}</span>
                        <span style={{ fontSize: 11.5, color: "#8a909c", display: "block", marginTop: 2 }}>
                          {best.avgSpi ? `SPI ${best.avgSpi.toFixed(2)} · ` : ""}{best.green} green
                        </span>
                      </div>
                    )}
                    {worst && worst.name !== best?.name && (
                      <div style={{ flex: 1, minWidth: 160, background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "17px 20px" }}>
                        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", color: "#8a909c", textTransform: "uppercase", display: "block", marginBottom: 7 }}>Most At Risk</span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#cf3f3a" }}>{worst.name}</span>
                        <span style={{ fontSize: 11.5, color: "#8a909c", display: "block", marginTop: 2 }}>
                          {worst.atRisk} at risk · {worst.avgSpi ? `SPI ${worst.avgSpi.toFixed(2)}` : "no SPI data"}
                        </span>
                      </div>
                    )}
                  </>
                );
              })()}
              <div style={{ flex: 1.8, minWidth: 200, background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: "1px solid #cfd4f5", borderRadius: 14, padding: "17px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                  <span style={{ color: "#4f5bd5", fontSize: 14 }}>✦</span>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: "#4f5bd5", textTransform: "uppercase" }}>AI Cluster Insight</span>
                </div>
                <div style={{ fontSize: 12.5, color: "#3a3f52", lineHeight: 1.55 }}>
                  {Object.keys(clusters).length > 0
                    ? `Across ${Object.keys(clusters).length} cluster${Object.keys(clusters).length > 1 ? "s" : ""}, portfolio health is ${kpi.health}%. ${kpi.red > 0 ? `${kpi.red} critical project${kpi.red > 1 ? "s" : ""} require escalation.` : "No critical escalations."}`
                    : "No cluster data available."
                  }
                </div>
              </div>
            </div>

            {/* Cluster cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {Object.entries(clusters).map(([name, ps]) => (
                <ClusterCard key={name} name={name} type={ps[0]?.clusterType ?? "geography"} projects={ps} />
              ))}
            </div>

            {/* Cluster comparison chart (avg SPI per cluster as horizontal bars) */}
            {clusterTrendData.length > 0 && (
              <div style={{ background: "#fff", border: "1px solid #e2e5ea", borderRadius: 14, padding: "18px 20px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Cluster Avg SPI Comparison</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {clusterTrendData.map(({ name, spiVals }) => {
                    const avg = spiVals.length ? spiVals.reduce((a,b) => a+b,0)/spiVals.length : null;
                    const pct = avg ? Math.min(Math.max((avg - 0.6) / 0.5, 0), 1) * 100 : 0;
                    return (
                      <div key={name}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#5b616e", marginBottom: 5 }}>
                          <span style={{ fontWeight: 600 }}>{name}</span>
                          <span style={{ fontFamily: "monospace", color: spiCol(avg), fontWeight: 700 }}>
                            {avg ? avg.toFixed(2) : "—"}
                          </span>
                        </div>
                        <div style={{ height: 10, background: "#eef0f3", borderRadius: 5, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 5, background: spiCol(avg ?? 0), width: `${pct}%`, transition: "width .4s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#b8bcc6", fontFamily: "monospace", marginTop: 8, padding: "0 2px" }}>
                  <span>0.60</span><span>0.70</span><span>0.80</span><span>0.90</span><span>1.00</span><span>1.10</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
