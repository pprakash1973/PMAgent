"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckSquare } from "lucide-react";
import { formatDate } from "@/lib/utils";

type ActionItem = {
  id: string;
  reference: string;
  title: string;
  priority: string;
  status: string;
  dueDate: string | null;
  project: { id: string; name: string };
  raisedBy: { fullName: string };
};

const PRIORITY_COLORS: Record<string, string> = {
  p1: "text-red-600 bg-red-50 border-red-200",
  p2: "text-amber-700 bg-amber-50 border-amber-200",
  p3: "text-slate-600 bg-slate-50 border-slate-200",
};

const STATUS_COLORS: Record<string, string> = {
  open: "text-amber-700 bg-amber-50 border-amber-200",
  acknowledged: "text-teal-700 bg-teal-50 border-teal-200",
  in_progress: "text-indigo-700 bg-indigo-50 border-indigo-200",
  blocked: "text-red-600 bg-red-50 border-red-200",
  submitted: "text-purple-700 bg-purple-50 border-purple-200",
  closed: "text-green-700 bg-green-50 border-green-200",
  cancelled: "text-slate-500 bg-slate-50 border-slate-200",
};

type StatusChoice = { label: string; value: string; dotColor: string; activeClass: string };

const STATUS_CHOICES: StatusChoice[] = [
  { label: "In progress", value: "in_progress", dotColor: "#4F5BD5", activeClass: "border-indigo-300 bg-indigo-50 text-indigo-700" },
  { label: "Closed", value: "closed", dotColor: "#159A5F", activeClass: "border-green-300 bg-green-50 text-green-700" },
  { label: "Not applicable", value: "cancelled", dotColor: "#9CA3AF", activeClass: "border-slate-300 bg-slate-100 text-slate-500" },
];

const TERMINAL = new Set(["closed", "cancelled"]);
const ACTION_ENDPOINT: Record<string, string> = {
  in_progress: "start",
  closed: "close",
  cancelled: "cancel",
};

function ActionItemRow({ item, now }: { item: ActionItem; now: Date }) {
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOverdue = item.dueDate && new Date(item.dueDate) < now && !TERMINAL.has(status);
  const isDone = TERMINAL.has(status);

  async function updateStatus(toStatus: string) {
    if (toStatus === status || loading) return;
    setLoading(toStatus);
    setError(null);
    try {
      const endpoint = ACTION_ENDPOINT[toStatus];
      const body: Record<string, string> = {};
      if (toStatus === "closed" && note.trim()) body.closureNote = note.trim();
      if (toStatus === "cancelled") body.reason = note.trim() || "Not applicable";

      const res = await fetch(`/api/action-items/${item.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Update failed");
      } else {
        setStatus(toStatus);
        setNote("");
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "1fr minmax(180px, 220px)" }}
    >
      {/* Left tile: item info */}
      <Card className={isOverdue ? "border-red-300 bg-red-50/30" : ""}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {isOverdue && <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
            <span className={`text-xs font-bold border rounded-full px-2 py-0.5 ${PRIORITY_COLORS[item.priority] ?? "text-slate-600 bg-slate-50 border-slate-200"}`}>
              {item.priority.toUpperCase()}
            </span>
            <Badge variant="outline" className={`text-xs ${STATUS_COLORS[status] ?? ""}`}>
              {status.replace(/_/g, " ")}
            </Badge>
            <span className="text-xs font-mono text-slate-400">{item.reference}</span>
          </div>

          <p className="font-semibold text-slate-900 text-sm mb-1">{item.title}</p>
          <p className="text-xs text-slate-500">
            {item.project.name} · from {item.raisedBy.fullName}
            {item.dueDate && (
              <span className={`ml-2 font-medium ${isOverdue ? "text-red-600" : "text-slate-600"}`}>
                · Due {formatDate(new Date(item.dueDate))}
              </span>
            )}
          </p>

          {!isDone && (
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Optional note for the DM…"
              rows={2}
              className="mt-3 w-full text-xs rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-slate-700 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          )}
        </CardContent>
      </Card>

      {/* Right tile: status controls */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Update status</p>

          {isDone ? (
            <p className="text-xs text-slate-400 italic">
              {status === "closed" ? "Marked as closed." : "Marked as not applicable."}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {STATUS_CHOICES.map(choice => {
                const isCurrent = status === choice.value;
                const isLoading = loading === choice.value;
                return (
                  <button
                    key={choice.value}
                    onClick={() => updateStatus(choice.value)}
                    disabled={!!loading}
                    className={`flex items-center gap-2.5 w-full text-left text-xs font-medium px-3 py-2.5 rounded-lg border transition-colors
                      ${isCurrent
                        ? `${choice.activeClass} cursor-default`
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                      } ${loading && !isLoading ? "opacity-50" : ""}`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: isCurrent ? choice.dotColor : "#CBD5E1" }}
                    />
                    {isLoading ? "Saving…" : choice.label}
                    {isCurrent && (
                      <span className="ml-auto text-xs opacity-50">current</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {error && (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ActionItemsClient({
  items,
  overdueCount,
}: {
  items: ActionItem[];
  overdueCount: number;
}) {
  const now = new Date();

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <CheckSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No open action items from your Delivery Manager</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map(item => (
        <ActionItemRow key={item.id} item={item} now={now} />
      ))}
    </div>
  );
}
