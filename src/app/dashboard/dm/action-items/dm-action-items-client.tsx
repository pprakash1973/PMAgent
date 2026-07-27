"use client";
import { useState } from "react";
import Link from "next/link";

const UST_PETROL = "#003C51";
const UST_BORDER = "#D7E0E3";
const UST_WASH = "#F2F7F8";

const PRIORITY_COLOR: Record<string, string> = { p1: "#cf3f3a", p2: "#c17d12", p3: "#6b7280" };
const PRIORITY_LABEL: Record<string, string> = { p1: "P1", p2: "P2", p3: "P3" };
const STATUS_COLOR: Record<string, string> = {
  open: "#c17d12", acknowledged: "#006E74", in_progress: "#4f5bd5",
  blocked: "#cf3f3a", submitted: "#6b7280", closed: "#158a5a", cancelled: "#94a3b8",
};

type Item = {
  id: string; reference: string; title: string; category: string;
  priority: string; status: string; dueDate: string | null; isOverdue: boolean;
  projectId: string; projectName: string; assignedToName: string; createdAt: string;
};

function badge(text: string, color: string) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
      background: `${color}18`, color, border: `1px solid ${color}40`,
      textTransform: "uppercase" as const, letterSpacing: "0.04em", whiteSpace: "nowrap" as const,
    }}>{text}</span>
  );
}

export function DmActionItemsClient({ items }: { items: Item[] }) {
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [search, setSearch] = useState("");

  const filtered = items.filter((i) => {
    const matchesStatus =
      statusFilter === "all" ? true :
      statusFilter === "active" ? ["open", "acknowledged", "in_progress", "blocked"].includes(i.status) :
      statusFilter === "awaiting" ? i.status === "submitted" :
      i.status === statusFilter;

    const matchesSearch = !search || i.title.toLowerCase().includes(search.toLowerCase()) ||
      i.projectName.toLowerCase().includes(search.toLowerCase()) ||
      i.assignedToName.toLowerCase().includes(search.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const overdueCount = items.filter((i) => i.isOverdue).length;
  const awaitingCount = items.filter((i) => i.status === "submitted").length;

  const tabs = [
    { key: "active", label: `Open (${items.filter(i => ["open","acknowledged","in_progress","blocked"].includes(i.status)).length})` },
    { key: "awaiting", label: `Awaiting Me${awaitingCount > 0 ? ` (${awaitingCount})` : ""}` },
    { key: "closed", label: "Closed" },
    { key: "all", label: "All" },
  ];

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: UST_PETROL, marginBottom: 4 }}>Action Items</h1>
        <p style={{ fontSize: 13, color: "#64748b" }}>
          All action items raised by you across your assigned accounts
          {overdueCount > 0 && <span style={{ color: "#cf3f3a", fontWeight: 600 }}> · {overdueCount} overdue</span>}
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 2, background: UST_WASH, borderRadius: 8, padding: 3, border: `1px solid ${UST_BORDER}` }}>
          {tabs.map(({ key, label }) => (
            <button key={key} onClick={() => setStatusFilter(key)} style={{
              fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer",
              background: statusFilter === key ? UST_PETROL : "transparent",
              color: statusFilter === key ? "#fff" : "#64748b",
            }}>{label}</button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title, project, or PM…"
          style={{
            flex: 1, minWidth: 200, padding: "8px 12px", border: `1.5px solid ${UST_BORDER}`,
            borderRadius: 8, fontSize: 13, color: "#1e293b", background: "#fff",
          }}
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}>
          {statusFilter === "awaiting" ? "No items awaiting your review." : "No action items found."}
        </div>
      ) : (
        <div style={{ border: `1px solid ${UST_BORDER}`, borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: UST_WASH, borderBottom: `1px solid ${UST_BORDER}` }}>
                {["Ref", "Title", "Project", "Assigned To", "Priority", "Status", "Due"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: idx < filtered.length - 1 ? `1px solid #f1f5f9` : "none", background: item.isOverdue ? "#fff8f8" : "#fff" }}>
                  <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 11, fontFamily: "monospace", whiteSpace: "nowrap" }}>{item.reference}</td>
                  <td style={{ padding: "10px 14px", color: "#1e293b", fontWeight: 500, maxWidth: 280 }}>
                    {item.isOverdue && <span style={{ color: "#cf3f3a", marginRight: 6 }}>⚠</span>}
                    {item.title}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <Link href={`/dashboard/projects/${item.projectId}`} style={{ color: UST_PETROL, textDecoration: "none", fontWeight: 500 }}>
                      {item.projectName}
                    </Link>
                  </td>
                  <td style={{ padding: "10px 14px", color: "#475569" }}>{item.assignedToName}</td>
                  <td style={{ padding: "10px 14px" }}>{badge(PRIORITY_LABEL[item.priority] ?? item.priority, PRIORITY_COLOR[item.priority] ?? "#6b7280")}</td>
                  <td style={{ padding: "10px 14px" }}>{badge(item.status.replace(/_/g, " "), STATUS_COLOR[item.status] ?? "#6b7280")}</td>
                  <td style={{ padding: "10px 14px", color: item.isOverdue ? "#cf3f3a" : "#64748b", fontWeight: item.isOverdue ? 600 : 400, whiteSpace: "nowrap" }}>
                    {item.dueDate ? new Date(item.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
