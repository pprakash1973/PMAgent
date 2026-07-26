"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Database, Wrench } from "lucide-react";

export default function MaintenancePage() {
  const [migrating, setMigrating] = useState(false);
  const [fixingDh, setFixingDh] = useState(false);
  const [migrateLog, setMigrateLog] = useState<string[]>([]);
  const [dhLog, setDhLog] = useState<string[]>([]);

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

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Maintenance</h1>
      <p className="text-sm text-slate-500 mb-8">One-time database operations. All steps are idempotent — safe to run multiple times.</p>

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
