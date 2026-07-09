"use client";
import { useState } from "react";

export default function AdminPage() {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function deleteAll() {
    if (!confirm("Delete ALL projects and their data from Postgres? This cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/nuke-projects", {
        method: "POST",
        headers: { "x-admin-token": "nuke-2026-pprakash" },
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setResult("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: "monospace" }}>
      <h1>Admin — Delete All Projects</h1>
      <button
        onClick={deleteAll}
        disabled={loading}
        style={{ background: "red", color: "white", padding: "12px 24px", fontSize: 16, cursor: "pointer", borderRadius: 6, border: "none" }}
      >
        {loading ? "Deleting…" : "DELETE ALL PROJECTS"}
      </button>
      {result && <pre style={{ marginTop: 20, background: "#111", color: "#0f0", padding: 16, borderRadius: 6 }}>{result}</pre>}
    </div>
  );
}
