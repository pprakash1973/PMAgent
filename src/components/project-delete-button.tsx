"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProjectDeleteButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${projectName}"? This will archive the project and it will no longer appear in your portfolio.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error?.message ?? "Delete failed");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      title="Delete project"
      style={{
        background: "none", border: "1px solid #e2e5ea", borderRadius: 7,
        padding: "5px 8px", cursor: loading ? "not-allowed" : "pointer",
        color: "#cf3f3a", display: "flex", alignItems: "center", opacity: loading ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
