"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format } from "date-fns";

interface Task {
  id: string;
  wbsCode: string;
  name: string;
  phase: string;
  estimatedHours: number | null;
  percentComplete: number;
  status: string;
  baselineStart: string;
  baselineFinish: string;
}

interface TokenInfo {
  tokenId: string;
  resource: { id: string; name: string; role: string };
  project: { id: string; name: string };
  cycle: { id: string; cycleNumber: number; label: string; startDate: string; endDate: string };
  tasks: Task[];
}

interface Submission {
  taskId: string;
  hoursWorked: number;
  percentComplete: number;
  etcHours: number | "";
  disposition: string;
  notes: string;
}

const DISPOSITIONS = [
  { value: "confirmed_as_planned", label: "Confirmed as planned" },
  { value: "actual", label: "Actual (revised estimate)" },
  { value: "forecast", label: "Forecast" },
  { value: "estimated", label: "Estimated" },
  { value: "unknown", label: "Not sure / Unknown" },
];

export default function SubmitActualsPage() {
  const params = useParams();
  const token = params.token as string;

  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [error, setError] = useState<{ message: string; alreadySubmitted?: boolean; expired?: boolean; cycleClosed?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<Record<string, Submission>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/submit/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError({ message: data.error, alreadySubmitted: data.alreadySubmitted, expired: data.expired, cycleClosed: data.cycleClosed });
        } else {
          setInfo(data);
          // Initialize submissions from task defaults
          const init: Record<string, Submission> = {};
          for (const t of data.tasks) {
            init[t.id] = {
              taskId: t.id,
              hoursWorked: 0,
              percentComplete: t.percentComplete,
              etcHours: "",
              disposition: "actual",
              notes: "",
            };
          }
          setSubmissions(init);
        }
      })
      .catch(() => setError({ message: "Failed to load. Please try again." }))
      .finally(() => setLoading(false));
  }, [token]);

  function updateField(taskId: string, field: keyof Submission, value: string | number) {
    setSubmissions((prev) => ({
      ...prev,
      [taskId]: { ...prev[taskId], [field]: value },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const payload = Object.values(submissions).map((s) => ({
      ...s,
      etcHours: s.etcHours === "" ? undefined : Number(s.etcHours),
    }));

    try {
      const res = await fetch(`/api/submit/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissions: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Submission failed. Please try again.");
      } else {
        setSubmitted(true);
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            {error.alreadySubmitted ? "Already submitted" : error.expired ? "Link expired" : error.cycleClosed ? "Cycle closed" : "Invalid link"}
          </h2>
          <p className="text-sm text-slate-500">
            {error.alreadySubmitted
              ? "Your actuals for this cycle have already been recorded. Contact your PM if you need to correct them."
              : error.expired
              ? "This submission link has expired. Please contact your project manager for a new link."
              : error.cycleClosed
              ? "The collection cycle has been closed by the project manager."
              : error.message}
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Actuals submitted</h2>
          <p className="text-sm text-slate-500">
            Thank you {info?.resource.name}. Your task actuals for{" "}
            <strong>{info?.project.name}</strong> have been recorded. You can close this window.
          </p>
        </div>
      </div>
    );
  }

  if (!info) return null;

  const cyclePeriod = `${format(new Date(info.cycle.startDate), "d MMM")} – ${format(new Date(info.cycle.endDate), "d MMM yyyy")}`;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-blue-800 text-white rounded-2xl p-6 mb-6">
          <p className="text-blue-300 text-xs font-semibold tracking-widest uppercase mb-1">PM Agent · Task Actuals</p>
          <h1 className="text-xl font-bold">{info.project.name}</h1>
          <p className="text-blue-200 text-sm mt-1">
            {info.cycle.label} · {cyclePeriod}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <p className="text-sm text-slate-700">
            Hi <strong>{info.resource.name}</strong> ({info.resource.role}). Please review your assigned tasks below and
            submit your actuals. Fields marked * are required.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {info.tasks.map((task) => {
            const sub = submissions[task.id];
            if (!sub) return null;
            return (
              <div key={task.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-4">
                {/* Task header */}
                <div className="flex items-start gap-3 mb-5">
                  <span className="text-xs font-mono bg-slate-100 text-slate-500 px-2 py-1 rounded mt-0.5 flex-shrink-0">
                    {task.wbsCode}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm leading-tight">{task.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {task.phase} · Baseline:{" "}
                      {format(new Date(task.baselineStart), "d MMM")} –{" "}
                      {format(new Date(task.baselineFinish), "d MMM")}
                      {task.estimatedHours != null ? ` · ${task.estimatedHours}h estimated` : ""}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Hours worked */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Hours worked this period *
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      required
                      value={sub.hoursWorked}
                      onChange={(e) => updateField(task.id, "hoursWorked", Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* % Complete */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      % Complete (current) *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        required
                        value={sub.percentComplete}
                        onChange={(e) => updateField(task.id, "percentComplete", Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="absolute right-3 top-2.5 text-slate-400 text-sm">%</span>
                    </div>
                    {/* Progress bar preview */}
                    <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, sub.percentComplete)}%` }}
                      />
                    </div>
                  </div>

                  {/* ETC */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Estimate to complete (hours remaining)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={sub.etcHours}
                      onChange={(e) => updateField(task.id, "etcHours", e.target.value)}
                      placeholder="Optional"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Disposition */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      How confident are you in these numbers? *
                    </label>
                    <select
                      required
                      value={sub.disposition}
                      onChange={(e) => updateField(task.id, "disposition", e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {DISPOSITIONS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Notes */}
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Notes / blockers</label>
                  <textarea
                    rows={2}
                    value={sub.notes}
                    onChange={(e) => updateField(task.id, "notes", e.target.value)}
                    placeholder="Any blockers, risks, or context for the PM…"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>
            );
          })}

          <div className="sticky bottom-4">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors shadow-lg"
            >
              {submitting ? "Submitting…" : `Submit actuals for ${info.tasks.length} task${info.tasks.length !== 1 ? "s" : ""}`}
            </button>
            <p className="text-center text-xs text-slate-400 mt-2">
              This link is single-use. Once submitted you cannot revise — contact your PM for corrections.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
