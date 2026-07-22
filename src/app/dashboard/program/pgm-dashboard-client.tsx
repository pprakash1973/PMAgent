"use client";
import { useState, useMemo } from "react";
import Link from "next/link";

// ─── types ────────────────────────────────────────────────────────────────────

export interface PgmProject {
  id: string;
  name: string;
  code: string;
  programId: string;
  programName: string;
  clientName: string;
  pmName: string;
  pmId: string;
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
  weeksInRag: number;
}

export interface PgmProgram {
  id: string;
  name: string;
  clientName: string;
  clusterName: string;
  ragRollup: "red" | "amber" | "green";
  projectCount: number;
  budgetConsumedPct: number;
  prevRagRollup: "red" | "amber" | "green" | null;
}

export interface TrendPoint {
  label: string;
  avgSpi: number | null;
  avgCpi: number | null;
  greenPct: number | null;
}

// ─── color helpers ────────────────────────────────────────────────────────────

const RC = { red: "#cf3f3a", amber: "#c17d12", green: "#158a5a" };
const RBG = { red: "#fbe4e2", amber: "#fbf0da", green: "#e3f3ea" };
const RL = { red: "Critical", amber: "At Risk", green: "On Track" };

function rCol(r: string) { return RC[r as keyof typeof RC] ?? "#8a909c"; }
function rBg(r: string)  { return RBG[r as keyof typeof RBG] ?? "#f7f8fa"; }
function rLbl(r: string) { return RL[r as keyof typeof RL] ?? r; }

function spiCol(v: number | null) {
  if (v === null) return "#8a909c";
  if (v >= 1)    return "#158a5a";
  if (v >= 0.85) return "#c17d12";
  return "#cf3f3a";
}

function overdueDays(d: string | null): number {
  if (!d) return 999;
  const diff = Date.now() - new Date(d).getTime();
  return Math.floor(diff / 86400000);
}

// ─── sub-components ───────────────────────────────────────────────────────────

function RagDot({ rag }: { rag: string }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap: 5 }}>
      <span style={{ width:9, height:9, borderRadius:"50%", background: rCol(rag), flexShrink:0 }} />
      <span style={{ fontSize:11, fontWeight:600, color: rCol(rag) }}>{rLbl(rag)}</span>
    </span>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height:5, background:"#eef0f3", borderRadius:3, overflow:"hidden" }}>
      <div style={{ height:"100%", borderRadius:3, background:color, width:`${Math.min(pct,100)}%` }} />
    </div>
  );
}

function TrendSpark({ trends }: { trends: TrendPoint[] }) {
  const H = 120, TOP = 14, W = 480;
  const range = 0.5;
  const toY = (v: number) => TOP + ((1.1 - Math.min(Math.max(v,0.6),1.1)) / range) * (H - TOP);
  const xs = trends.map((_,i) => 50 + i * (W-50-30) / Math.max(trends.length-1,1));
  const pts = (vals:(number|null)[]) =>
    vals.map((v,i) => v!==null ? `${xs[i]},${toY(v)}` : null).filter(Boolean).join(" ");
  const spiPts = trends.map(t => t.avgSpi);
  const cpiPts = trends.map(t => t.avgCpi);
  return (
    <svg viewBox={`0 0 ${W} 140`} style={{ width:"100%", height:140, display:"block" }}>
      <line x1="40" y1={TOP} x2="40" y2={H} stroke="#eef0f3" strokeWidth="1" />
      <line x1="40" y1={H}   x2={W-10} y2={H} stroke="#eef0f3" strokeWidth="1" />
      {[1.0, 0.9, 0.8].map((v,i) => (
        <g key={i}>
          <line x1="40" y1={toY(v)} x2={W-10} y2={toY(v)} stroke="#f3f4f6" strokeWidth="1" strokeDasharray="3,2" />
          <text x="34" y={toY(v)+3} textAnchor="end" fontFamily="monospace" fontSize="9" fill="#b8bcc6">{v.toFixed(1)}</text>
        </g>
      ))}
      {cpiPts.some(v => v!==null) && (
        <polyline points={pts(cpiPts)} fill="none" stroke="#158a5a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {spiPts.some(v => v!==null) && (
        <polyline points={pts(spiPts)} fill="none" stroke="#4f5bd5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {trends.map((t,i) => (
        <text key={i} x={xs[i]} y="133" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="#b8bcc6">{t.label}</text>
      ))}
    </svg>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function PgmDashboardClient({
  projects,
  programs,
  trends,
  userName,
}: {
  projects: PgmProject[];
  programs: PgmProgram[];
  trends: TrendPoint[];
  userName: string;
}) {
  const [activeProgram, setActiveProgram] = useState<string>("all");

  const visibleProjects = useMemo(() =>
    activeProgram === "all" ? projects : projects.filter(p => p.programId === activeProgram),
    [projects, activeProgram]
  );

  const reds   = visibleProjects.filter(p => p.rag === "red");
  const ambers = visibleProjects.filter(p => p.rag === "amber");
  const greens = visibleProjects.filter(p => p.rag === "green");
  const watchlist = [...reds, ...ambers].sort((a,b) => b.weeksInRag - a.weeksInRag);
  const noReport  = visibleProjects.filter(p => overdueDays(p.lastReportDate) > 7);

  const T = {
    bg: "#F2F7F8", border: "#D7E0E3", petrol: "#003C51", teal: "#006E74",
    tealL: "#0097AC", text: "#231F20", muted: "#7A7480", card: "#fff",
  };

  const cell = (label: string, val: React.ReactNode, accent?: string) => (
    <div style={{ padding:"16px 20px", background: T.card, border:`1px solid ${T.border}`, borderRadius:10 }}>
      <div style={{ fontSize:11, color: T.muted, fontWeight:600, marginBottom:4, textTransform:"uppercase", letterSpacing:.5 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:700, color: accent ?? T.petrol }}>{val}</div>
    </div>
  );

  return (
    <div style={{ height:"100%", overflowY:"auto", background: T.bg, fontFamily:"'Aptos','Calibri',sans-serif" }}>
      <div style={{ maxWidth:1380, margin:"0 auto", padding:"28px 32px 48px" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:20, fontWeight:700, color: T.petrol }}>Program Dashboard</div>
          <div style={{ fontSize:13, color: T.muted, marginTop:3 }}>
            Welcome back, {userName.split(" ")[0]} · {programs.length} program{programs.length!==1?"s":""} · {projects.length} project{projects.length!==1?"s":""}
          </div>
        </div>

        {/* ── Program switcher ── */}
        <div style={{ display:"flex", gap:8, marginBottom:24, flexWrap:"wrap" }}>
          {[{ id:"all", name:"All Programs" }, ...programs.map(p=>({ id:p.id, name:p.name }))].map(p => (
            <button key={p.id} onClick={() => setActiveProgram(p.id)} style={{
              padding:"6px 14px", borderRadius:20, border:`1px solid ${activeProgram===p.id ? T.teal : T.border}`,
              background: activeProgram===p.id ? T.teal : T.card, color: activeProgram===p.id ? "#fff" : T.text,
              fontSize:12.5, fontWeight:600, cursor:"pointer", transition:"all .15s",
            }}>{p.name}</button>
          ))}
        </div>

        {/* ── W1: Attention Strip ── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0,1fr))", gap:12, marginBottom:24 }}>
          {cell("Red projects", reds.length, reds.length > 0 ? "#cf3f3a" : T.petrol)}
          {cell("Amber projects", ambers.length, ambers.length > 0 ? "#c17d12" : T.petrol)}
          {cell("No report this week", noReport.length, noReport.length > 0 ? "#c17d12" : T.petrol)}
          {cell("Open escalations", 0, T.muted)}
        </div>

        {/* ── W2: Program Health Banner ── */}
        {programs.length > 1 && activeProgram === "all" && (
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:12.5, fontWeight:700, color: T.muted, marginBottom:10, textTransform:"uppercase", letterSpacing:.5 }}>Program Health</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
              {programs.map(prog => (
                <button key={prog.id} onClick={() => setActiveProgram(prog.id)} style={{
                  textAlign:"left", background: T.card, border:`1.5px solid ${rCol(prog.ragRollup)}40`,
                  borderRadius:12, padding:"14px 16px", cursor:"pointer",
                  borderLeft:`4px solid ${rCol(prog.ragRollup)}`,
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color: T.petrol }}>{prog.name}</div>
                    <RagDot rag={prog.ragRollup} />
                  </div>
                  <div style={{ fontSize:11.5, color: T.muted, marginBottom:8 }}>{prog.clientName} · {prog.projectCount} project{prog.projectCount!==1?"s":""}</div>
                  <Bar pct={prog.budgetConsumedPct} color={prog.budgetConsumedPct>90?"#cf3f3a":prog.budgetConsumedPct>75?"#c17d12":"#158a5a"} />
                  <div style={{ fontSize:10.5, color: T.muted, marginTop:4 }}>{prog.budgetConsumedPct}% budget consumed</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"300px 1fr", gap:20, marginBottom:24 }}>
          {/* ── W3: Health Distribution Donut ── */}
          <div style={{ background: T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:"20px 24px" }}>
            <div style={{ fontSize:13, fontWeight:700, color: T.petrol, marginBottom:16 }}>Health Distribution</div>
            {visibleProjects.length === 0 ? (
              <div style={{ fontSize:13, color: T.muted, textAlign:"center", padding:"20px 0" }}>No projects</div>
            ) : (
              <>
                <svg viewBox="0 0 120 120" style={{ width:120, height:120, display:"block", margin:"0 auto 16px" }}>
                  {(() => {
                    const total = visibleProjects.length;
                    const segments = [
                      { count: greens.length, color: "#158a5a" },
                      { count: ambers.length, color: "#c17d12" },
                      { count: reds.length,   color: "#cf3f3a" },
                    ].filter(s => s.count > 0);
                    let startAngle = -90;
                    return segments.map((seg, i) => {
                      const pct = seg.count / total;
                      const angle = pct * 360;
                      const r = 48, cx = 60, cy = 60;
                      const rad = (a: number) => a * Math.PI / 180;
                      const x1 = cx + r * Math.cos(rad(startAngle));
                      const y1 = cy + r * Math.sin(rad(startAngle));
                      const endAngle = startAngle + angle;
                      const x2 = cx + r * Math.cos(rad(endAngle));
                      const y2 = cy + r * Math.sin(rad(endAngle));
                      const large = angle > 180 ? 1 : 0;
                      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
                      startAngle = endAngle;
                      return <path key={i} d={d} fill={seg.color} opacity=".9" />;
                    });
                  })()}
                  <circle cx="60" cy="60" r="30" fill={T.card} />
                  <text x="60" y="57" textAnchor="middle" fontSize="18" fontWeight="700" fill={T.petrol}>{visibleProjects.length}</text>
                  <text x="60" y="70" textAnchor="middle" fontSize="9" fill={T.muted}>projects</text>
                </svg>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {[{ label:"On Track", count:greens.length, color:"#158a5a" }, { label:"At Risk", count:ambers.length, color:"#c17d12" }, { label:"Critical", count:reds.length, color:"#cf3f3a" }].map(s => (
                    <div key={s.label} style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ width:10, height:10, borderRadius:2, background:s.color, flexShrink:0 }} />
                      <span style={{ fontSize:12.5, color: T.text, flex:1 }}>{s.label}</span>
                      <span style={{ fontSize:12.5, fontWeight:700, color: s.color }}>{s.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── W9: Trend Chart ── */}
          <div style={{ background: T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:"20px 24px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:700, color: T.petrol }}>SPI / CPI Trend (6 months)</div>
              <div style={{ display:"flex", gap:14, fontSize:11 }}>
                {[{ c:"#4f5bd5", l:"SPI" }, { c:"#158a5a", l:"CPI" }].map(s => (
                  <span key={s.l} style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <span style={{ width:16, height:2, background:s.c, display:"inline-block", borderRadius:1 }} />
                    <span style={{ color: T.muted }}>{s.l}</span>
                  </span>
                ))}
              </div>
            </div>
            {trends.every(t => t.avgSpi===null && t.avgCpi===null) ? (
              <div style={{ fontSize:13, color: T.muted, textAlign:"center", padding:"30px 0" }}>No historical data yet — submit weekly status reports to build trends.</div>
            ) : (
              <TrendSpark trends={trends} />
            )}
          </div>
        </div>

        {/* ── W4: Red & Amber Watchlist ── */}
        {watchlist.length > 0 && (
          <div style={{ background: T.card, border:`1.5px solid #cf3f3a40`, borderRadius:12, padding:"20px 24px", marginBottom:24 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color: T.petrol }}>
                ⚠ Watchlist — {watchlist.length} project{watchlist.length!==1?"s":""} need attention
              </div>
              <Link href="/dashboard/program/projects?health=red,amber" style={{ fontSize:12, color: T.teal, textDecoration:"none", fontWeight:600 }}>View all →</Link>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background: T.bg }}>
                    {["Project","Program","PM","Health","SPI","CPI","Weeks in status","Risks"].map(h => (
                      <th key={h} style={{ textAlign:"left", padding:"8px 12px", fontSize:11.5, fontWeight:700, color: T.muted, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                    <th style={{ padding:"8px 12px" }} />
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map(p => (
                    <tr key={p.id} style={{ borderTop:`1px solid ${T.border}` }}>
                      <td style={{ padding:"10px 12px" }}>
                        <Link href={`/dashboard/program/projects/${p.id}`} style={{ fontWeight:700, color: T.petrol, textDecoration:"none", fontSize:13 }}>{p.name}</Link>
                        <div style={{ fontSize:11, color: T.muted }}>{p.clientName}</div>
                      </td>
                      <td style={{ padding:"10px 12px", color: T.muted, fontSize:12.5 }}>{p.programName}</td>
                      <td style={{ padding:"10px 12px", color: T.text, fontSize:12.5 }}>{p.pmName}</td>
                      <td style={{ padding:"10px 12px" }}><RagDot rag={p.rag} /></td>
                      <td style={{ padding:"10px 12px", color: spiCol(p.spi), fontWeight:600, fontSize:12.5 }}>{p.spi?.toFixed(2) ?? "—"}</td>
                      <td style={{ padding:"10px 12px", color: spiCol(p.cpi), fontWeight:600, fontSize:12.5 }}>{p.cpi?.toFixed(2) ?? "—"}</td>
                      <td style={{ padding:"10px 12px", color: p.weeksInRag>2 ? "#cf3f3a" : T.muted, fontSize:12.5, fontWeight: p.weeksInRag>2 ? 700 : 400 }}>{p.weeksInRag}w</td>
                      <td style={{ padding:"10px 12px", color: p.riskCount>0 ? "#c17d12" : T.muted, fontSize:12.5 }}>{p.riskCount}</td>
                      <td style={{ padding:"10px 12px" }}>
                        <Link href={`/dashboard/program/projects/${p.id}`} style={{
                          fontSize:11.5, color: T.teal, fontWeight:600, textDecoration:"none",
                          background:`${T.teal}12`, padding:"4px 10px", borderRadius:6, border:`1px solid ${T.teal}30`,
                        }}>View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── W5: Project Health Cards ── */}
        <div style={{ marginBottom:24 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:700, color: T.petrol }}>All Projects ({visibleProjects.length})</div>
            <Link href="/dashboard/program/projects" style={{ fontSize:12, color: T.teal, textDecoration:"none", fontWeight:600 }}>Full list + filters →</Link>
          </div>
          {visibleProjects.length === 0 ? (
            <div style={{ background: T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:"40px", textAlign:"center", color: T.muted, fontSize:13 }}>
              No projects in scope. Ask your admin to assign programs.
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
              {visibleProjects.map(p => (
                <Link key={p.id} href={`/dashboard/program/projects/${p.id}`} style={{ textDecoration:"none" }}>
                  <div style={{
                    background: T.card, border:`1px solid ${T.border}`,
                    borderLeft:`4px solid ${rCol(p.rag)}`,
                    borderRadius:12, padding:"16px 18px", cursor:"pointer",
                    transition:"box-shadow .15s",
                  }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                      <div>
                        <div style={{ fontSize:13.5, fontWeight:700, color: T.petrol }}>{p.name}</div>
                        <div style={{ fontSize:11.5, color: T.muted, marginTop:2 }}>{p.programName} · {p.pmName}</div>
                      </div>
                      <RagDot rag={p.rag} />
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
                      {[
                        { label:"SPI", value: p.spi?.toFixed(2) ?? "—", color: spiCol(p.spi) },
                        { label:"CPI", value: p.cpi?.toFixed(2) ?? "—", color: spiCol(p.cpi) },
                        { label:"Done", value: `${p.schedPct}%`, color: T.petrol },
                      ].map(m => (
                        <div key={m.label} style={{ textAlign:"center" }}>
                          <div style={{ fontSize:14, fontWeight:700, color: m.color }}>{m.value}</div>
                          <div style={{ fontSize:10, color: T.muted, marginTop:1 }}>{m.label}</div>
                        </div>
                      ))}
                    </div>
                    <Bar pct={p.schedPct} color={rCol(p.rag)} />
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontSize:10.5, color: T.muted }}>
                      <span>{p.phase}</span>
                      <span>{p.lastReportDate ? `Last report: ${new Date(p.lastReportDate).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}` : "No report"}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── W6: Questionnaire Compliance ── */}
        {noReport.length > 0 && (
          <div style={{ background: T.card, border:`1px solid #c17d1240`, borderRadius:12, padding:"18px 24px", marginBottom:24 }}>
            <div style={{ fontSize:13, fontWeight:700, color: T.petrol, marginBottom:12 }}>⏰ Overdue Status Reports</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {noReport.map(p => (
                <div key={p.id} style={{ background:"#fbf0da", borderRadius:8, padding:"6px 12px", fontSize:12.5 }}>
                  <span style={{ fontWeight:700, color:"#c17d12" }}>{p.pmName}</span>
                  <span style={{ color: T.muted }}> — {p.name} ({overdueDays(p.lastReportDate)}d overdue)</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
