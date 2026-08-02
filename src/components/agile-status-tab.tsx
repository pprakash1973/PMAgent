"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { BurndownChart, VelocityChart, CommitmentChart, MetricCard } from "@/components/agile-charts";

const C = {
  primary: "#4f5bd5", green: "#158a5a", amber: "#c17d12", red: "#cf3f3a",
  border: "#e2e5ea", surface: "#fff", surface2: "#f7f8fa",
  text: "#1a1d24", text2: "#5b616e", text3: "#8a909c",
};

export function AgileStatusTab({ project }: { project: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/agile-metrics`);
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
      <Loader2 size={20} className="animate-spin" color={C.text3} />
    </div>
  );

  if (!data) return null;

  const { avgVelocity, avgReliability, totalScope, velocities, burndown, commitmentData, evm, sprints } = data;

  const reliabilityColor = avgReliability == null ? C.text3
    : avgReliability >= 80 ? C.green
    : avgReliability >= 60 ? C.amber
    : C.red;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Agile Status Reporting</h3>
        <p style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>
          {sprints.closed} of {sprints.total} sprints closed
          {sprints.active ? ` · ${sprints.active.label} active` : ""}
        </p>
      </div>

      {/* Key metrics strip */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <MetricCard
          label="Avg Velocity"
          value={avgVelocity != null ? Math.round(avgVelocity) : null}
          unit="pts/sprint"
          color={C.primary}
          sub={velocities.length > 0 ? `${velocities.length} sprint(s) complete` : "No closed sprints yet"}
        />
        <MetricCard
          label="Commitment Reliability"
          value={avgReliability != null ? Math.round(avgReliability) : null}
          unit="%"
          color={reliabilityColor}
          sub="Accepted vs committed"
        />
        <MetricCard
          label="Total Scope"
          value={totalScope}
          unit="pts"
          color={C.text}
          sub="All backlog items"
        />
        {sprints.active && (
          <MetricCard label="Active Sprint" value={sprints.active.label} color={C.primary} />
        )}
        {evm?.cpi != null && (
          <MetricCard
            label="CPI (EVM)"
            value={evm.cpi.toFixed(2)}
            color={evm.cpi >= 1 ? C.green : evm.cpi >= 0.9 ? C.amber : C.red}
            sub={evm.cpi >= 1 ? "Under budget" : "Over budget"}
          />
        )}
      </div>

      {/* Charts */}
      {burndown.length > 0 && <BurndownChart data={burndown} />}
      {velocities.length > 0 && <VelocityChart velocities={velocities} avg={avgVelocity} />}
      {commitmentData.length > 0 && <CommitmentChart data={commitmentData} />}

      {/* No data state */}
      {burndown.length === 0 && (
        <div style={{
          textAlign: "center", padding: "40px 0",
          color: C.text3, fontSize: 13,
          border: `1px dashed ${C.border}`, borderRadius: 12,
        }}>
          Charts appear once sprints have been closed and items accepted.
          <br />Start a sprint from the Sprints tab to begin tracking.
        </div>
      )}

      {/* Sprint history table */}
      {data.velocities.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 12 }}>Sprint History</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Sprint", "Committed", "Accepted", "Velocity", "Reliability"].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.commitmentData.map((row: any) => (
                  <tr key={row.sprintNumber} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "8px 10px", fontWeight: 600, color: C.text }}>{row.label}</td>
                    <td style={{ padding: "8px 10px", color: C.text2 }}>{row.committed || "—"}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 700, color: C.green }}>{row.accepted}</td>
                    <td style={{ padding: "8px 10px", color: C.primary }}>{row.accepted} pts</td>
                    <td style={{ padding: "8px 10px" }}>
                      {row.reliability != null ? (
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          color: row.reliability >= 80 ? C.green : row.reliability >= 60 ? C.amber : C.red,
                        }}>
                          {row.reliability}%
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
