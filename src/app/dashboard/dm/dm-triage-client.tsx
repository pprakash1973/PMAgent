"use client";
import { useState } from "react";
import { DrillDownPanel } from "./drill-down-panel";

type TriageRow = {
  id: string;
  name: string;
  accountId: string | null;
  accountName: string | null;
  programId: string | null;
  programName: string | null;
  pmId: string;
  pmName: string;
  healthStatus: string;
  band: "red" | "amber" | "no_data" | "green";
  attentionScore: number;
  spi: number | null;
  cpi: number | null;
  compositeScore: number | null;
  openActionItems: number;
  highRisks: number;
  criticalIssues: number;
  nextMilestone: { name: string; dueDate: string } | null;
  phase: string;
  lastReportDate: string | null;
};

type TriageData = {
  bands: { red: TriageRow[]; amber: TriageRow[]; no_data: TriageRow[]; green: TriageRow[] };
  counts: { red: number; amber: number; no_data: number; green: number; total: number };
  overdueActionItems: number;
};

const UST_PETROL = "#003C51";
const UST_BORDER = "#D7E0E3";
const UST_WASH = "#F2F7F8";

function bandConfig(band: string) {
  switch (band) {
    case "red": return { color: "#cf3f3a", bg: "#fbe4e2", label: "RED", dot: "🔴" };
    case "amber": return { color: "#c17d12", bg: "#fbf0da", label: "AMBER", dot: "🟡" };
    case "no_data": return { color: "#6b7280", bg: "#f3f4f6", label: "NO DATA", dot: "⚪" };
    default: return { color: "#158a5a", bg: "#e3f3ea", label: "GREEN", dot: "🟢" };
  }
}

function phaseLabel(phase: string) {
  return phase.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function MetricChip({ label, value, warn }: { label: string; value: string | null; warn?: boolean }) {
  if (!value) return null;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6,
      background: warn ? "#fbe4e2" : "#f1f5f9",
      color: warn ? "#cf3f3a" : "#475569",
      border: `1px solid ${warn ? "#fca5a5" : UST_BORDER}`,
    }}>
      {label} {value}
    </span>
  );
}

function ProjectRow({ row, onReview, onActionItem }: {
  row: TriageRow;
  onReview: (id: string) => void;
  onActionItem: (id: string) => void;
}) {
  const bc = bandConfig(row.band);
  const spiWarn = row.spi !== null && row.spi < 0.85;
  const cpiWarn = row.cpi !== null && row.cpi < 0.85;

  return (
    <div style={{
      background: "#fff", border: `1px solid ${UST_BORDER}`, borderRadius: 10,
      padding: "14px 16px", marginBottom: 8,
      borderLeft: `4px solid ${bc.color}`,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Band dot */}
        <span style={{ fontSize: 14 }}>{bc.dot}</span>

        {/* Project name */}
        <button
          onClick={() => onReview(row.id)}
          style={{
            fontWeight: 700, fontSize: 15, color: UST_PETROL, background: "none",
            border: "none", cursor: "pointer", padding: 0, textDecoration: "underline",
            textDecorationColor: "transparent", textUnderlineOffset: 2,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = UST_PETROL)}
          onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = "transparent")}
        >
          {row.name}
        </button>

        {/* Account · Program */}
        <span style={{ fontSize: 12, color: "#64748b" }}>
          {row.accountName ?? "—"}{row.programName ? ` · ${row.programName}` : ""}
        </span>

        <div style={{ flex: 1 }} />

        {/* Attention score badge */}
        <span style={{
          fontSize: 11, fontWeight: 700, color: bc.color,
          background: bc.bg, border: `1px solid ${bc.color}30`,
          borderRadius: 6, padding: "2px 8px",
        }}>
          Attn {row.attentionScore}
        </span>
      </div>

      {/* Second line: PM, metrics, phase */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          PM: <strong style={{ color: "#1e293b" }}>{row.pmName}</strong>
        </span>
        <span style={{ color: UST_BORDER }}>|</span>
        <span style={{ fontSize: 12, color: "#64748b" }}>{phaseLabel(row.phase)}</span>
        {row.spi !== null && <MetricChip label="SPI" value={row.spi.toFixed(2)} warn={spiWarn} />}
        {row.cpi !== null && <MetricChip label="CPI" value={row.cpi.toFixed(2)} warn={cpiWarn} />}
        {row.highRisks > 0 && <MetricChip label="⚠" value={`${row.highRisks} high risks`} warn />}
        {row.criticalIssues > 0 && <MetricChip label="🔥" value={`${row.criticalIssues} critical issues`} warn />}
        {row.openActionItems > 0 && (
          <MetricChip label="◷" value={`${row.openActionItems} open action${row.openActionItems > 1 ? "s" : ""}`} warn={row.openActionItems > 2} />
        )}
        {row.nextMilestone && (
          <span style={{ fontSize: 12, color: "#64748b" }}>
            Next: <strong style={{ color: "#1e293b" }}>{row.nextMilestone.name}</strong> {formatDate(row.nextMilestone.dueDate)}
          </span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { label: "Review", action: () => onReview(row.id), primary: true },
          { label: "Action Item", action: () => onActionItem(row.id), primary: false },
        ].map(({ label, action, primary }) => (
          <button
            key={label}
            onClick={action}
            style={{
              fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 7, cursor: "pointer",
              background: primary ? UST_PETROL : "#fff",
              color: primary ? "#fff" : UST_PETROL,
              border: `1.5px solid ${primary ? UST_PETROL : UST_BORDER}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BandSection({ band, rows, collapsed: initCollapsed, onReview, onActionItem }: {
  band: "red" | "amber" | "no_data" | "green";
  rows: TriageRow[];
  collapsed: boolean;
  onReview: (id: string) => void;
  onActionItem: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(initCollapsed);
  const bc = bandConfig(band);
  if (rows.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
          cursor: "pointer", userSelect: "none",
        }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: bc.color, letterSpacing: "0.06em" }}>
          ▾ {bc.dot} {bc.label} — {rows.length} project{rows.length !== 1 ? "s" : ""}
        </span>
        <div style={{ flex: 1, height: 1, background: `${bc.color}30` }} />
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{collapsed ? "expand" : "collapse"}</span>
      </div>
      {!collapsed && rows.map((r) => (
        <ProjectRow key={r.id} row={r} onReview={onReview} onActionItem={onActionItem} />
      ))}
    </div>
  );
}

export function DmTriageClient({ data, userName }: { data: TriageData; userName: string }) {
  const [reviewProjectId, setReviewProjectId] = useState<string | null>(null);
  const [actionItemProjectId, setActionItemProjectId] = useState<string | null>(null);

  const { bands, counts, overdueActionItems } = data;

  const greenCollapsed = bands.green.length > 5;
  const noDataCollapsed = bands.no_data.length > 5;

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: UST_PETROL, marginBottom: 4 }}>
          Triage
        </h1>
        <p style={{ fontSize: 13, color: "#64748b" }}>
          {counts.total} project{counts.total !== 1 ? "s" : ""} across your assigned accounts — sorted by attention priority
        </p>
      </div>

      {/* Band summary chips */}
      <div style={{
        display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap",
        padding: "14px 18px", background: UST_WASH, borderRadius: 10, border: `1px solid ${UST_BORDER}`,
      }}>
        {[
          { band: "red", label: "Red", count: counts.red },
          { band: "amber", label: "Amber", count: counts.amber },
          { band: "no_data", label: "No Data", count: counts.no_data },
          { band: "green", label: "Green", count: counts.green },
        ].map(({ band, label, count }) => {
          const bc = bandConfig(band);
          return (
            <span key={band} style={{ fontSize: 13, fontWeight: 600, color: bc.color }}>
              {bc.dot} {count} {label}
            </span>
          );
        })}
        {overdueActionItems > 0 && (
          <>
            <span style={{ color: UST_BORDER }}>·</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#cf3f3a" }}>
              ◷ {overdueActionItems} overdue action{overdueActionItems !== 1 ? "s" : ""}
            </span>
          </>
        )}
      </div>

      {counts.total === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
          <p style={{ fontSize: 16 }}>No projects in your assigned accounts.</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>Contact an administrator to assign accounts to your profile.</p>
        </div>
      )}

      {/* Band sections */}
      <BandSection band="red" rows={bands.red} collapsed={false} onReview={setReviewProjectId} onActionItem={setActionItemProjectId} />
      <BandSection band="amber" rows={bands.amber} collapsed={false} onReview={setReviewProjectId} onActionItem={setActionItemProjectId} />
      <BandSection band="no_data" rows={bands.no_data} collapsed={noDataCollapsed} onReview={setReviewProjectId} onActionItem={setActionItemProjectId} />
      <BandSection band="green" rows={bands.green} collapsed={greenCollapsed} onReview={setReviewProjectId} onActionItem={setActionItemProjectId} />

      {/* Drill-down panel */}
      {reviewProjectId && (
        <DrillDownPanel
          projectId={reviewProjectId}
          onClose={() => setReviewProjectId(null)}
          initialTab="review"
          openActionItem={() => { setActionItemProjectId(reviewProjectId); setReviewProjectId(null); }}
        />
      )}

      {/* Action item create panel */}
      {actionItemProjectId && (
        <DrillDownPanel
          projectId={actionItemProjectId}
          onClose={() => setActionItemProjectId(null)}
          initialTab="action-item"
          openActionItem={() => {}}
        />
      )}
    </div>
  );
}
