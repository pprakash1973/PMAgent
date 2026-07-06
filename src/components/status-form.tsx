"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { ClipboardList, Loader2, ChevronDown, ChevronUp } from "lucide-react";

export function StatusForm({ projectId, mode }: { projectId: string; mode: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ summary?: string; recommendations?: string[] } | null>(null);

  const [form, setForm] = useState({
    ragStatus: "green",
    accomplishments: "",
    plannedActivities: "",
    risks: "",
    issues: "",
    budgetSpent: "",
    spi: "",
    cpi: "",
    resourceStatus: "",
    notes: "",
  });

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          budgetSpent: form.budgetSpent ? parseFloat(form.budgetSpent) : undefined,
          spi: form.spi ? parseFloat(form.spi) : undefined,
          cpi: form.cpi ? parseFloat(form.cpi) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message);
      setResult(data);
      toast({ title: "Status submitted!", description: "AI summary generated successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <button onClick={() => setOpen((v) => !v)} className="flex items-center justify-between w-full">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-500" />
            Weekly Status Report
          </CardTitle>
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
      </CardHeader>

      {open && (
        <CardContent>
          {result ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm font-medium text-green-800 mb-2">AI Executive Summary</p>
                <p className="text-sm text-green-900">{result.summary}</p>
              </div>
              {result.recommendations && result.recommendations.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">AI Recommendations</p>
                  <ul className="space-y-1">
                    {result.recommendations.map((r, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="text-blue-500 mt-0.5">•</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => setResult(null)}>Submit another report</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Overall Status *</Label>
                  <Select value={form.ragStatus} onValueChange={(v) => update("ragStatus", v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="green">Green — On Track</SelectItem>
                      <SelectItem value="amber">Amber — At Risk</SelectItem>
                      <SelectItem value="red">Red — Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">SPI (Schedule)</Label>
                  <Input className="h-8 text-xs" placeholder="1.00" value={form.spi} onChange={(e) => update("spi", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CPI (Cost)</Label>
                  <Input className="h-8 text-xs" placeholder="1.00" value={form.cpi} onChange={(e) => update("cpi", e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Accomplishments this week</Label>
                <Textarea className="text-xs" placeholder="Key deliverables completed, milestones achieved..." value={form.accomplishments} onChange={(e) => update("accomplishments", e.target.value)} rows={2} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Planned for next week</Label>
                <Textarea className="text-xs" placeholder="Upcoming deliverables, tasks, meetings..." value={form.plannedActivities} onChange={(e) => update("plannedActivities", e.target.value)} rows={2} />
              </div>

              {mode !== "high_level" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Top Risks</Label>
                    <Textarea className="text-xs" placeholder="Key risks and mitigations..." value={form.risks} onChange={(e) => update("risks", e.target.value)} rows={2} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Open Issues</Label>
                    <Textarea className="text-xs" placeholder="Active issues needing attention..." value={form.issues} onChange={(e) => update("issues", e.target.value)} rows={2} />
                  </div>
                </>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Additional Notes</Label>
                <Textarea className="text-xs" placeholder="Decisions made, escalations, other notes..." value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={2} />
              </div>

              <Button type="submit" size="sm" disabled={loading} className="w-full">
                {loading ? <><Loader2 className="w-3 h-3 animate-spin" />AI is generating summary...</> : "Submit & Generate AI Summary"}
              </Button>
            </form>
          )}
        </CardContent>
      )}
    </Card>
  );
}
