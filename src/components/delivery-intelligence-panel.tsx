"use client";
import { useState, useEffect, useCallback } from "react";
import { toast } from "@/components/ui/toaster";
import { type IntelligenceRow, topDriverLabel, recommendationCategory } from "@/lib/delivery-intelligence";

const C = {
  primary: "#006E74", primaryLight: "rgba(0,110,116,.08)", primaryBorder: "rgba(0,110,116,.25)",
  petrol: "#003C51",
  border: "#e2e5ea", surface: "#fff", surface2: "#f7f8fa",
  text: "#231F20", text2: "#5b616e", text3: "#8a909c",
  green: "#01B27C", greenLight: "#e3f3ea",
  amber: "#c17d12", amberLight: "#fbf0da",
  red: "#FC6A59", redLight: "rgba(252,106,89,.10)",
};

function ragStyle(rag: string) {
  if (rag === "red") return { bg: C.redLight, color: "#A32D2D", border: "rgba(252,106,89,.3)" };
  if (rag === "amber") return { bg: C.amberLight, color: "#854F0B", border: "rgba(193,125,18,.3)" };
  return { bg: C.greenLight, color: "#1a5c38", border: "rgba(1,178,124,.3)" };
}

function ScoreBar({ score, rag }: { score: number; rag: string }) {
  const color = rag === "red" ? C.red : rag === "amber" ? C.amber : C.green;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 99, transition: "width .6s ease" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color, minWidth: 32, textAlign: "right" }}>{score}%</span>
    </div>
  );
}

function DriverPill({ label, variant }: { label: string; variant: "red" | "amber" | "blue" }) {
  const styles = {
    red: { background: C.redLight, color: "#A32D2D" },
    amber: { background: C.amberLight, color: "#854F0B" },
    blue: { background: "rgba(0,110,116,.08)", color: C.primary },
  }[variant];
  return <span style={{ ...styles, fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 99 }}>{label}</span>;
}

function pillVariant(row: IntelligenceRow, field: "spi" | "cpi" | "risk" | "milestone"): "red" | "amber" | "blue" {
  if (field === "spi" && row.drivers.spi !== null) return row.drivers.spi < 0.85 ? "red" : row.drivers.spi < 0.95 ? "amber" : "blue";
  if (field === "cpi" && row.drivers.cpi !== null) return row.drivers.cpi < 0.85 ? "red" : row.drivers.cpi < 0.95 ? "amber" : "blue";
  if (field === "risk") return row.drivers.riskExposure === "critical" || row.drivers.riskExposure === "high" ? "red" : row.drivers.riskExposure === "medium" ? "amber" : "blue";
  if (field === "milestone") return row.drivers.milestoneSlipPct > 0.3 ? "red" : row.drivers.milestoneSlipPct > 0.1 ? "amber" : "blue";
  return "blue";
}

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color?: string }) {
  return (
    <div style={{ background: C.surface2, borderRadius: 10, padding: "12px 16px", flex: 1 }}>
      <div style={{ fontSize: 11, color: C.text3, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: color ?? C.text }}>{value}</div>
      <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

export function DeliveryIntelligencePanel({ userRole }: { userRole: string }) {
  const [rows, setRows] = useState<IntelligenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Record<string, string>>({});
  const [loadingRec, setLoadingRec] = useState<Record<string, boolean>>({});
  const [sendingAI, setSendingAI] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dm/intelligence")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data)) setRows(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getRecommendation = useCallback(async (row: IntelligenceRow) => {
    if (recommendations[row.projectId] || loadingRec[row.projectId]) return;
    setLoadingRec((prev) => ({ ...prev, [row.projectId]: true }));
    try {
      const res = await fetch("/api/dm/intelligence/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: row.projectName,
          industry: row.industry,
          spi: row.drivers.spi,
          cpi: row.drivers.cpi,
          riskExposure: row.drivers.riskExposure,
          milestoneSlipPct: row.drivers.milestoneSlipPct,
          deliveryScore: row.deliveryScore,
          topRisk: row.topRisk,
        }),
      });
      const data = await res.json();
      if (data.recommendation) {
        setRecommendations((prev) => ({ ...prev, [row.projectId]: data.recommendation }));
      }
    } catch {
      // silent
    } finally {
      setLoadingRec((prev) => ({ ...prev, [row.projectId]: false }));
    }
  }, [recommendations, loadingRec]);

  async function sendTopm(row: IntelligenceRow) {
    const rec = recommendations[row.projectId];
    if (!rec) return;
    setSendingAI((prev) => ({ ...prev, [row.projectId]: true }));
    try {
      const priority = row.deliveryScore < 45 ? "p1" : "p2";
      const category = recommendationCategory(row);
      const res = await fetch(`/api/projects/${row.projectId}/action-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Delivery intelligence alert — ${topDriverLabel(row)}`,
          description: rec,
          category,
          priority,
          source: "threshold_alert",
          expectedOutcome: "PM to acknowledge and provide corrective action plan within 24 hours.",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Action item sent to PM", description: `${row.pmName} will see this in their action items.` });
    } catch {
      toast({ title: "Failed to send", description: "Please try again.", variant: "destructive" });
    } finally {
      setSendingAI((prev) => ({ ...prev, [row.projectId]: false }));
    }
  }

  const critical = rows.filter((r) => r.rag === "red").length;
  const atRisk = rows.filter((r) => r.rag === "amber").length;
  const onTrack = rows.filter((r) => r.rag === "green").length;
  const avgScore = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.deliveryScore, 0) / rows.length) : 0;

  if (loading) {
    return (
      <div style={{ padding: "24px 20px", color: C.text3, fontSize: 13, textAlign: "center" }}>
        Loading delivery intelligence…
      </div>
    );
  }

  if (rows.length === 0) return null;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 20 }}>
      {/* Header */}
      <div style={{ padding: "14px 20px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,110,116,.04)" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Predictive Delivery Intelligence</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>AI-scored delivery risk · worst first · click a row for AI instruction</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, background: "rgba(0,110,116,.1)", color: C.primary }}>BETA</span>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
        <KpiCard label="Portfolio score" value={`${avgScore}%`} sub={avgScore >= 70 ? "Healthy" : avgScore >= 45 ? "At risk" : "Critical"} color={avgScore >= 70 ? C.green : avgScore >= 45 ? C.amber : C.red} />
        <KpiCard label="Critical (<45%)" value={critical} sub="Need action this week" color={critical > 0 ? C.red : C.text3} />
        <KpiCard label="At risk (45–69%)" value={atRisk} sub="Monitor closely" color={atRisk > 0 ? C.amber : C.text3} />
        <KpiCard label="On track (≥70%)" value={onTrack} sub="No action needed" color={C.green} />
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Project / PM", "Score", "RAG", "Key drivers", ""].map((h, i) => (
                <th key={i} style={{ fontSize: 11, fontWeight: 600, color: C.text3, textAlign: "left", padding: "8px 16px", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rs = ragStyle(row.rag);
              const isExpanded = expanded === row.projectId;
              const rec = recommendations[row.projectId];
              const recLoading = loadingRec[row.projectId];
              const sending = sendingAI[row.projectId];
              return (
                <>
                  <tr
                    key={row.projectId}
                    onClick={() => {
                      const next = isExpanded ? null : row.projectId;
                      setExpanded(next);
                      if (next && row.rag !== "green") getRecommendation(row);
                    }}
                    style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: isExpanded ? "rgba(0,110,116,.03)" : undefined }}
                  >
                    {/* Project / PM */}
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 600, color: C.text }}>{row.projectName}</div>
                      <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
                        {row.pmName}{row.industry ? ` · ${row.industry}` : ""}
                      </div>
                    </td>
                    {/* Score bar */}
                    <td style={{ padding: "12px 16px", minWidth: 160 }}>
                      <ScoreBar score={row.deliveryScore} rag={row.rag} />
                      <div style={{ fontSize: 10, color: C.text3, marginTop: 3 }}>Confidence: {row.confidence}</div>
                    </td>
                    {/* RAG */}
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: rs.bg, color: rs.color, border: `1px solid ${rs.border}` }}>
                        {row.rag.toUpperCase()}
                      </span>
                    </td>
                    {/* Drivers */}
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {row.drivers.spi !== null && <DriverPill label={`SPI ${row.drivers.spi.toFixed(2)}`} variant={pillVariant(row, "spi")} />}
                        {row.drivers.cpi !== null && <DriverPill label={`CPI ${row.drivers.cpi.toFixed(2)}`} variant={pillVariant(row, "cpi")} />}
                        {row.drivers.riskExposure !== "low" && <DriverPill label={`${row.drivers.riskExposure} risk`} variant={pillVariant(row, "risk")} />}
                        {row.drivers.milestoneSlipPct > 0 && <DriverPill label={`${Math.round(row.drivers.milestoneSlipPct * 100)}% ms late`} variant={pillVariant(row, "milestone")} />}
                      </div>
                    </td>
                    {/* Expand caret */}
                    <td style={{ padding: "12px 16px", textAlign: "right", color: C.text3 }}>
                      <span style={{ fontSize: 16, display: "inline-block", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
                    </td>
                  </tr>

                  {/* Expanded row — AI recommendation + Send to PM */}
                  {isExpanded && (
                    <tr key={`${row.projectId}-exp`} style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(0,110,116,.025)" }}>
                      <td colSpan={5} style={{ padding: "12px 20px 16px" }}>
                        {row.rag === "green" ? (
                          <div style={{ fontSize: 13, color: C.green, fontWeight: 500 }}>No action needed — this project is on track.</div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: C.text3, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".04em" }}>AI instruction for PM</div>
                              {recLoading ? (
                                <div style={{ fontSize: 13, color: C.text3, fontStyle: "italic" }}>Generating recommendation…</div>
                              ) : rec ? (
                                <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, background: "rgba(0,110,116,.06)", borderLeft: `3px solid ${C.primary}`, borderRadius: "0 8px 8px 0", padding: "10px 14px" }}>
                                  {rec}
                                </div>
                              ) : (
                                <div style={{ fontSize: 13, color: C.text3, fontStyle: "italic" }}>Click the row to generate recommendation.</div>
                              )}
                            </div>
                            {rec && (
                              <button
                                onClick={(e) => { e.stopPropagation(); sendTopm(row); }}
                                disabled={sending}
                                style={{
                                  flexShrink: 0, marginTop: 24, padding: "8px 16px", borderRadius: 8,
                                  background: C.primary, color: "#fff", border: "none",
                                  fontSize: 12, fontWeight: 600, cursor: sending ? "default" : "pointer",
                                  opacity: sending ? 0.7 : 1, whiteSpace: "nowrap",
                                }}
                              >
                                {sending ? "Sending…" : "Send to PM as action item"}
                              </button>
                            )}
                          </div>
                        )}
                        {row.topRisk && (
                          <div style={{ marginTop: 10, fontSize: 11, color: C.text3 }}>
                            <strong style={{ color: C.text2 }}>Top risk:</strong> {row.topRisk}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
