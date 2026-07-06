"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { Loader2, Wand2, ClipboardList, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Mode = "form" | "nl";

export default function NewProjectPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("form");
  const [loading, setLoading] = useState(false);
  const [nlText, setNlText] = useState("");
  const [form, setForm] = useState({
    name: "",
    customer: "",
    projectType: "fixed_price",
    methodology: "waterfall",
    engagementMode: "detailed",
    industry: "",
    projectSize: "medium",
    budget: "",
    currency: "USD",
    teamSize: "",
    startDate: "",
    endDate: "",
    description: "",
    externalExecutionTool: "",
  });

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const payload =
      mode === "nl"
        ? { naturalLanguage: nlText, engagementMode: form.engagementMode }
        : {
            ...form,
            budget: form.budget ? parseFloat(form.budget) : undefined,
            teamSize: form.teamSize ? parseInt(form.teamSize) : undefined,
          };

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message);

      toast({ title: "Project created!", description: data.name });
      router.push(`/dashboard/projects/${data.id}`);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Project</h1>
          <p className="text-slate-500 text-sm">Set up a project workspace in minutes</p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-3">
        <button
          onClick={() => setMode("form")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all",
            mode === "form" ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
          )}
        >
          <ClipboardList className="w-4 h-4" />
          Structured Form
        </button>
        <button
          onClick={() => setMode("nl")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all",
            mode === "nl" ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
          )}
        >
          <Wand2 className="w-4 h-4" />
          AI Natural Language
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          {/* Engagement Mode — always visible */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Engagement Mode</CardTitle>
              <CardDescription>How will this project be managed day-to-day?</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {[
                { value: "detailed", label: "Detailed Mode", desc: "PM Agent is the system of record — full artifact set, task tracking, reporting" },
                { value: "high_level", label: "Governance Mode", desc: "Project runs in a client tool — PM Agent acts as lightweight governance & reporting layer" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update("engagementMode", opt.value)}
                  className={cn(
                    "text-left p-4 rounded-lg border-2 transition-all",
                    form.engagementMode === opt.value ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-blue-300"
                  )}
                >
                  <p className="font-medium text-sm text-slate-900">{opt.label}</p>
                  <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          {mode === "nl" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Describe your project</CardTitle>
                <CardDescription>
                  Write naturally — AI will infer structured fields and generate your artifact workspace.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder='e.g. "Build an ERP implementation for a retail company lasting 12 months with a team of 20, budget $2M. Waterfall delivery, financial services industry."'
                  value={nlText}
                  onChange={(e) => setNlText(e.target.value)}
                  rows={5}
                  required
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader><CardTitle className="text-base">Project Details</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label>Project Name *</Label>
                    <Input placeholder="ERP Implementation — Retail" value={form.name} onChange={(e) => update("name", e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Customer / Client</Label>
                    <Input placeholder="Acme Retail" value={form.customer} onChange={(e) => update("customer", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Input placeholder="Retail, Financial Services, Healthcare..." value={form.industry} onChange={(e) => update("industry", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Methodology</Label>
                    <Select value={form.methodology} onValueChange={(v) => update("methodology", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[["waterfall","Waterfall"],["agile","Agile Scrum"],["kanban","Kanban"],["safe","SAFe"],["hybrid","Hybrid"]].map(([v,l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Project Type</Label>
                    <Select value={form.projectType} onValueChange={(v) => update("projectType", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed_price">Fixed Price</SelectItem>
                        <SelectItem value="time_and_material">Time & Material</SelectItem>
                        <SelectItem value="managed_services">Managed Services</SelectItem>
                        <SelectItem value="staff_aug">Staff Augmentation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Project Size</Label>
                    <Select value={form.projectSize} onValueChange={(v) => update("projectSize", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small (&lt; 10 people)</SelectItem>
                        <SelectItem value="medium">Medium (10–50)</SelectItem>
                        <SelectItem value="large">Large (50–200)</SelectItem>
                        <SelectItem value="enterprise">Enterprise (200+)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Team Size</Label>
                    <Input type="number" placeholder="20" value={form.teamSize} onChange={(e) => update("teamSize", e.target.value)} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Timeline & Budget</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input type="date" value={form.endDate} onChange={(e) => update("endDate", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Budget</Label>
                    <Input type="number" placeholder="1000000" value={form.budget} onChange={(e) => update("budget", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={form.currency} onValueChange={(v) => update("currency", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                        <SelectItem value="INR">INR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Description</Label>
                    <Textarea placeholder="Brief project description..." value={form.description} onChange={(e) => update("description", e.target.value)} rows={3} />
                  </div>
                </CardContent>
              </Card>

              {form.engagementMode === "high_level" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">External Execution Tool</CardTitle>
                    <CardDescription>What tool does the client use to manage day-to-day execution?</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Input placeholder="e.g. Client Jira, MS Project, ServiceNow..." value={form.externalExecutionTool} onChange={(e) => update("externalExecutionTool", e.target.value)} />
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <Button type="submit" className="w-full" disabled={loading} size="lg">
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />{mode === "nl" ? "AI is analyzing your brief..." : "Creating project..."}</>
            ) : (
              <>{mode === "nl" ? <Wand2 className="w-4 h-4" /> : <ClipboardList className="w-4 h-4" />}
              {mode === "nl" ? "Generate Project with AI" : "Create Project"}</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
