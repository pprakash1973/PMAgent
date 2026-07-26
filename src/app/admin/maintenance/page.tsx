"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Database, Wrench, UserCheck } from "lucide-react";

interface DeletedUser { id: string; fullName: string; email: string; role: string }

export default function MaintenancePage() {
  const [migrating, setMigrating] = useState(false);
  const [fixingDh, setFixingDh] = useState(false);
  const [migrateLog, setMigrateLog] = useState<string[]>([]);
  const [dhLog, setDhLog] = useState<string[]>([]);
  const [deletedUsers, setDeletedUsers] = useState<DeletedUser[]>([]);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function runMigration() {
    setMigrating(true);
    setMigrateLog([]);
    try {
      const res = await fetch("/api/admin/maintenance/migrate-cr01", { method: "POST" });
      const data = await res.json();
      setMigrateLog(data.log ?? [data.error ?? "Unknown error"]);
    } catch (e: any) {
      setMigrateLog([`Error: ${e.message}`]);
    } finally {
      setMigrating(false);
    }
  }

  async function runDhFix() {
    setFixingDh(true);
    setDhLog([]);
    try {
      const res = await fetch("/api/admin/maintenance/fix-dh-assignments", { method: "POST" });
      const data = await res.json();
      setDhLog(data.log ?? [data.error ?? "Unknown error"]);
    } catch (e: any) {
      setDhLog([`Error: ${e.message}`]);
    } finally {
      setFixingDh(false);
    }
  }

  async function loadDeletedUsers() {
    setLoadingDeleted(true);
    try {
      const res = await fetch("/api/admin/users?showDeleted=true");
      const all = await res.json();
      setDeletedUsers((all as any[]).filter((u: any) => u.deletedAt !== null && u.deletedAt !== undefined));
    } finally {
      setLoadingDeleted(false);
    }
  }

  async function restoreUser(id: string) {
    setRestoringId(id);
    try {
      await fetch(`/api/admin/users/${id}/undelete`, { method: "POST" });
      setDeletedUsers((prev) => prev.filter((u) => u.id !== id));
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Maintenance</h1>
      <p className="text-sm text-slate-500 mb-8">One-time database operations. All steps are idempotent — safe to run multiple times.</p>

      {/* Restore soft-deleted users */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-sm shrink-0">↩</div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-800 mb-1">Restore Soft-Deleted Users</h2>
            <p className="text-sm text-slate-500 mb-4">
              Deactivating a user sets <code className="bg-slate-100 px-1 rounded text-xs">deletedAt</code> which hides them permanently.
              Use this to recover users who were deactivated and re-invited but still don't appear in the Users list.
            </p>
            <Button onClick={loadDeletedUsers} disabled={loadingDeleted} variant="outline" className="border-orange-400 text-orange-700 hover:bg-orange-50 mb-4">
              {loadingDeleted ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading…</> : <><UserCheck className="w-4 h-4 mr-2" />Find Hidden Users</>}
            </Button>
            {deletedUsers.length > 0 && (
              <div className="space-y-2">
                {deletedUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-sm font-medium text-slate-800">{u.fullName}</span>
                      <span className="text-xs text-slate-500 ml-2">{u.email} · {u.role}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-teal-500 text-teal-700 hover:bg-teal-50"
                      disabled={restoringId === u.id}
                      onClick={() => restoreUser(u.id)}
                    >
                      {restoringId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Restore"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {deletedUsers.length === 0 && !loadingDeleted && <p className="text-xs text-slate-400">Click "Find Hidden Users" to check.</p>}
          </div>
        </div>
      </div>

      {/* Step 1 */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm shrink-0">1</div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-800 mb-1">Apply CR-01 Migration</h2>
            <p className="text-sm text-slate-500 mb-4">
              Creates <code className="bg-slate-100 px-1 rounded text-xs">cluster_assignments</code> and <code className="bg-slate-100 px-1 rounded text-xs">account_assignments</code> tables,
              renames <code className="bg-slate-100 px-1 rounded text-xs">Client → org_accounts</code>, and migrates existing data.
              Run this first if the Users or Accounts admin pages won't load.
            </p>
            <Button onClick={runMigration} disabled={migrating} className="bg-[#006E74] hover:bg-[#005a5f]">
              {migrating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running…</> : <><Database className="w-4 h-4 mr-2" /> Run CR-01 Migration</>}
            </Button>
            {migrateLog.length > 0 && (
              <pre className="mt-4 bg-slate-900 text-slate-100 rounded-lg p-4 text-xs overflow-auto max-h-64 whitespace-pre-wrap">
                {migrateLog.join("\n")}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* Step 2 */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm shrink-0">2</div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-800 mb-1">Fix DH Assignments</h2>
            <p className="text-sm text-slate-500 mb-4">
              Moves Delivery Head users from <code className="bg-slate-100 px-1 rounded text-xs">account_assignments</code> into
              the correct <code className="bg-slate-100 px-1 rounded text-xs">cluster_assignments</code> table.
              Run this after Step 1 to fix existing DH users (Anwesha, Prakash, etc.).
            </p>
            <Button onClick={runDhFix} disabled={fixingDh} variant="outline" className="border-[#006E74] text-[#006E74] hover:bg-teal-50">
              {fixingDh ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running…</> : <><Wrench className="w-4 h-4 mr-2" /> Fix DH Assignments</>}
            </Button>
            {dhLog.length > 0 && (
              <pre className="mt-4 bg-slate-900 text-slate-100 rounded-lg p-4 text-xs overflow-auto max-h-64 whitespace-pre-wrap">
                {dhLog.join("\n")}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
