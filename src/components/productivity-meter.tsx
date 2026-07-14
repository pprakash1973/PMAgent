import type { ProductivityStats } from "@/lib/productivity";

const TEAL = "#006E74";
const TEAL_L = "#0097AC";
const PETROL = "#003C51";
const GREEN = "#01B27C";
const WASH = "#F2F7F8";
const BORDER = "#D7E0E3";

export function ProductivityMeter({ stats, compact = false }: { stats: ProductivityStats; compact?: boolean }) {
  const topTypes = stats.byType.slice(0, 3);

  if (compact) {
    return (
      <div style={{
        background: `linear-gradient(135deg, ${PETROL}, ${TEAL})`, borderRadius: 14,
        padding: "16px 18px", color: "#fff", display: "flex", alignItems: "center", gap: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 15 }}>✦</span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" as const }}>PM Agent Productivity</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "right" as const }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace" }}>{stats.artifactsGenerated}</div>
          <div style={{ fontSize: 10, opacity: 0.8 }}>artifacts generated</div>
        </div>
        <div style={{ textAlign: "right" as const }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace" }}>{stats.hoursSaved}</div>
          <div style={{ fontSize: 10, opacity: 0.8 }}>PM hours saved</div>
        </div>
        <div style={{ textAlign: "right" as const }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", color: "#7FFFD4" }}>${stats.dollarsSaved.toLocaleString()}</div>
          <div style={{ fontSize: 10, opacity: 0.8 }}>cost equivalent</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{
        background: `linear-gradient(135deg, ${PETROL}, ${TEAL})`, padding: "16px 20px",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ color: "#fff", fontSize: 16 }}>✦</span>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", color: "#fff", textTransform: "uppercase" as const }}>PM Agent Productivity Meter</span>
      </div>
      <div style={{ display: "flex", padding: "20px" }}>
        {[
          { label: "Artifacts Auto-Generated", value: stats.artifactsGenerated.toLocaleString(), color: TEAL },
          { label: "PM Hours Saved", value: stats.hoursSaved.toLocaleString(), color: TEAL_L },
          { label: "Cost Equivalent Saved", value: `$${stats.dollarsSaved.toLocaleString()}`, color: GREEN },
        ].map((k, i) => (
          <div key={k.label} style={{ flex: 1, textAlign: "center" as const, borderLeft: i > 0 ? `1px solid ${BORDER}` : "none" }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: k.color, fontFamily: "'IBM Plex Mono',monospace" }}>{k.value}</div>
            <div style={{ fontSize: 11.5, color: "#5b616e", marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>
      {topTypes.length > 0 && (
        <div style={{ padding: "0 20px 18px", display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          {topTypes.map((t) => (
            <span key={t.type} style={{
              fontSize: 11, color: "#5b616e", background: WASH, border: `1px solid ${BORDER}`,
              borderRadius: 999, padding: "4px 10px",
            }}>
              {t.type.replace(/_/g, " ")} × {t.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
