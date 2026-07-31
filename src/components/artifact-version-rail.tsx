"use client";
import { useEffect, useState } from "react";
import { X, RotateCcw, ShieldCheck, Clock, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toaster";

type VersionSummary = {
  id: string;
  versionNumber: number;
  contentHash: string | null;
  source: string;
  approvalStatus: string;
  parentVersionId: string | null;
  supersededReason: string | null;
  createdAt: string;
  editedBy: { fullName: string; email: string } | null;
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  unreviewed:       { bg: "#f1f5f9", color: "#475569", label: "Unreviewed" },
  pm_confirmed:     { bg: "#dbeafe", color: "#1e40af", label: "PM Confirmed" },
  gate_approved:    { bg: "#dcfce7", color: "#166534", label: "Gate Approved" },
  superseded_by_cr: { bg: "#fef3c7", color: "#92400e", label: "Superseded by CR" },
};

const SOURCE_LABEL: Record<string, string> = {
  ai_generated:   "AI Generated",
  ai_regenerated: "AI Regenerated",
  pm_upload:      "PM Upload",
  restore:        "Restored",
  in_app_edit:    "Edited",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ArtifactVersionRail({
  artifactId,
  artifactType,
  currentVersion,
  onClose,
  onRestored,
}: {
  artifactId: string;
  artifactType: string;
  currentVersion: number;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [settingStatus, setSettingStatus] = useState<number | null>(null);
  const [expandedReason, setExpandedReason] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/artifacts/${artifactId}/versions`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d) => { setVersions(d.versions ?? []); setError(null); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [artifactId]);

  async function setApproval(versionNumber: number, status: string) {
    setSettingStatus(versionNumber);
    try {
      const res = await fetch(`/api/artifacts/${artifactId}/versions/${versionNumber}/approval`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setVersions((prev) => prev.map((v) => v.versionNumber === versionNumber ? { ...v, approvalStatus: status } : v));
      toast({ title: "Status updated", description: `v${versionNumber} → ${STATUS_STYLE[status]?.label ?? status}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSettingStatus(null);
    }
  }

  async function restore(versionNumber: number) {
    if (!window.confirm(`Restore v${versionNumber} as the new current version? This creates a new version — no history is lost.`)) return;
    setRestoring(versionNumber);
    try {
      const res = await fetch(`/api/artifacts/${artifactId}/versions/${versionNumber}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: `v${versionNumber} restored`, description: `A new version was created from v${versionNumber}` });
      onRestored();
      onClose();
    } catch (e: any) {
      toast({ title: "Restore failed", description: e.message, variant: "destructive" });
    } finally {
      setRestoring(null);
    }
  }

  const label = artifactType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 200, backdropFilter: "blur(1px)" }}
      />

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "95vw",
        background: "#fff", borderLeft: "1px solid #e2e8f0",
        boxShadow: "-8px 0 32px rgba(0,0,0,.14)",
        zIndex: 201, display: "flex", flexDirection: "column", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <Clock style={{ width: 16, height: 16, color: "#006E74" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Version history · {versions.length} versions</div>
          </div>
          <button onClick={onClose} style={{ padding: 4, border: "none", background: "none", cursor: "pointer", color: "#94a3b8", borderRadius: 6, lineHeight: 0 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
              <Loader2 className="animate-spin" style={{ width: 20, height: 20, color: "#006E74" }} />
            </div>
          )}
          {error && <div style={{ fontSize: 13, color: "#cf3f3a", padding: "8px 12px", background: "#fbe4e2", borderRadius: 8 }}>{error}</div>}

          {!loading && versions.map((v) => {
            const isCurrent = v.versionNumber === currentVersion;
            const st = STATUS_STYLE[v.approvalStatus] ?? STATUS_STYLE.unreviewed;
            const expanded = expandedReason === v.versionNumber;

            return (
              <div
                key={v.id}
                style={{
                  border: isCurrent ? "1.5px solid #006E74" : "1px solid #e2e8f0",
                  borderRadius: 10,
                  background: isCurrent ? "rgba(0,110,116,.04)" : "#fff",
                  padding: "10px 12px",
                }}
              >
                {/* Version header row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", flexShrink: 0 }}>
                    v{v.versionNumber}
                    {isCurrent && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: "#006E74", color: "#fff" }}>current</span>}
                  </div>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: st.bg, color: st.color }}>{st.label}</span>
                </div>

                {/* Meta */}
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                  {SOURCE_LABEL[v.source] ?? v.source} · {fmtDate(v.createdAt)}
                </div>
                {v.editedBy && (
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                    {v.editedBy.fullName || v.editedBy.email}
                  </div>
                )}
                {v.supersededReason && (
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                    <button
                      onClick={() => setExpandedReason(expanded ? null : v.versionNumber)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 3, color: "#94a3b8", fontSize: 11 }}
                    >
                      Note {expanded ? <ChevronUp style={{ width: 11, height: 11 }} /> : <ChevronDown style={{ width: 11, height: 11 }} />}
                    </button>
                    {expanded && <div style={{ marginTop: 4, padding: "4px 8px", background: "#f8fafc", borderRadius: 5 }}>{v.supersededReason}</div>}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
                  {/* Approval status selector */}
                  <select
                    disabled={settingStatus === v.versionNumber}
                    value={v.approvalStatus}
                    onChange={(e) => setApproval(v.versionNumber, e.target.value)}
                    style={{ fontSize: 10.5, padding: "3px 6px", borderRadius: 5, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", cursor: "pointer" }}
                  >
                    <option value="unreviewed">Unreviewed</option>
                    <option value="pm_confirmed">PM Confirmed</option>
                    <option value="gate_approved">Gate Approved</option>
                    <option value="superseded_by_cr">Superseded by CR</option>
                  </select>

                  {/* Restore (only for non-current versions) */}
                  {!isCurrent && (
                    <button
                      disabled={restoring === v.versionNumber}
                      onClick={() => restore(v.versionNumber)}
                      style={{
                        fontSize: 10.5, padding: "3px 8px", borderRadius: 5,
                        border: "1px solid #e2e8f0", background: "transparent", color: "#475569",
                        cursor: restoring === v.versionNumber ? "wait" : "pointer",
                        display: "flex", alignItems: "center", gap: 4,
                      }}
                    >
                      {restoring === v.versionNumber
                        ? <Loader2 className="animate-spin" style={{ width: 10, height: 10 }} />
                        : <RotateCcw style={{ width: 10, height: 10 }} />}
                      Restore
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {!loading && versions.length === 0 && !error && (
            <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: 32 }}>No version history yet.</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck style={{ width: 13, height: 13, color: "#94a3b8" }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Every version is immutable. Restore creates a new version — no history is ever lost.</span>
        </div>
      </div>
    </>
  );
}
