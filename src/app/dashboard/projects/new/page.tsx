"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { Loader2, Wand2, ClipboardList, ArrowLeft, Upload, FileText, CheckCircle2, X, Lock } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Mode = "form" | "nl" | "upload";

interface ProgramItem { id: string; name: string; clientId: string; client: { name: string; cluster: { name: string } } }
interface ClientItem { id: string; name: string; cluster: { name: string } }
interface PMUser { id: string; fullName: string; email: string }

interface MyAssignments {
  role: string;
  programs: ProgramItem[];
  clients: (ClientItem & { id: string })[];
}

const emptyForm = {
  name: "",
  customer: "",
  clientId: "",
  programId: "",
  pmOwnerId: "",
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
};

export default function NewProjectPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("form");
  const [loading, setLoading] = useState(false);
  const [nlText, setNlText] = useState("");
  const [form, setForm] = useState(emptyForm);

  // Hierarchy state
  const [myAssignments, setMyAssignments] = useState<MyAssignments | null>(null);
  const [availablePrograms, setAvailablePrograms] = useState<ProgramItem[]>([]);
  const [availablePMs, setAvailablePMs] = useState<PMUser[]>([]);

  // Upload state
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<{
    requirementsText: string;
    requirementsFileName: string;
    requirementsFileFormat: string;
    requirementsExtracted: Record<string, unknown>;
  } | null>(null);
  const [parseSummary, setParseSummary] = useState<string[]>([]);

  // Load user's hierarchy assignments
  useEffect(() => {
    fetch("/api/me/assignments")
      .then((r) => r.json())
      .then((data: MyAssignments) => {
        setMyAssignments(data);

        if (data.role === "pm" && data.programs.length === 1) {
          // Lock everything for a PM with a single program
          const prog = data.programs[0];
          setForm((f) => ({
            ...f,
            programId: prog.id,
            clientId: prog.clientId,
            customer: prog.client.name,
          }));
        }
      })
      .catch(() => {});
  }, []);

  // Load PMs when program selected (for DM/DH/admin)
  useEffect(() => {
    if (!form.programId || !myAssignments) return;
    if (myAssignments.role === "pm") return;
    fetch(`/api/users/pms?programId=${form.programId}`)
      .then((r) => r.json())
      .then((d) => setAvailablePMs(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [form.programId, myAssignments]);

  // For DH: load programs under selected client
  useEffect(() => {
    if (!form.clientId || !myAssignments || myAssignments.role !== "dh") return;
    fetch(`/api/admin/programs?clientId=${form.clientId}`)
      .then((r) => r.json())
      .then((d) => {
        setAvailablePrograms(Array.isArray(d) ? d : []);
        setForm((f) => ({ ...f, programId: "", pmOwnerId: "" }));
        setAvailablePMs([]);
      })
      .catch(() => {});
  }, [form.clientId, myAssignments]);

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleFilePick(file: File) {
    setUploadedFile(file);
    setParsed(null);
    setParseSummary([]);
    setParsing(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-requirements", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to parse file");

      const pf = data.projectFields as Record<string, unknown>;

      setForm((f) => ({
        ...f,
        name: (pf.name as string) || f.name,
        customer: myAssignments?.role === "pm" ? f.customer : (pf.customer as string) || f.customer,
        projectType: (pf.projectType as string) || f.projectType,
        methodology: (pf.methodology as string) || f.methodology,
        industry: (pf.industry as string) || f.industry,
        projectSize: (pf.projectSize as string) || f.projectSize,
        budget: pf.budget ? String(pf.budget) : f.budget,
        teamSize: pf.teamSize ? String(pf.teamSize) : f.teamSize,
        startDate: pf.startDate ? String(pf.startDate).slice(0, 10) : f.startDate,
        endDate: pf.endDate ? String(pf.endDate).slice(0, 10) : f.endDate,
        description: (pf.description as string) || f.description,
      }));

      const req = data.requirements as Record<string, unknown>;
      const bullets: string[] = [];
      if (Array.isArray(req.goals) && req.goals.length) bullets.push(`${req.goals.length} goal(s) identified`);
      if (Array.isArray(req.stakeholders) && req.stakeholders.length) bullets.push(`${req.stakeholders.length} stakeholder(s) found`);
      if (Array.isArray(req.constraints) && req.constraints.length) bullets.push(`${req.constraints.length} constraint(s) detected`);
      if (Array.isArray(req.scopeItems) && req.scopeItems.length) bullets.push(`${req.scopeItems.length} scope item(s) extracted`);
      if (req.timeline) bullets.push(`Timeline: ${req.timeline}`);
      if (bullets.length === 0) bullets.push("Requirements extracted — review and confirm fields below");
      setParseSummary(bullets);

      setParsed({
        requirementsText: data.extractedText,
        requirementsFileName: data.fileName,
        requirementsFileFormat: data.fileFormat,
        requirementsExtracted: req,
      });
    } catch (err: any) {
      toast({ title: "Parse failed", description: err.message, variant: "destructive" });
      setUploadedFile(null);
    } finally {
      setParsing(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFilePick(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    let payload: Record<string, unknown>;

    if (mode === "nl") {
      payload = {
        naturalLanguage: nlText,
        engagementMode: form.engagementMode,
        ...(form.clientId ? { clientId: form.clientId } : {}),
        ...(form.programId ? { programId: form.programId } : {}),
        ...(form.pmOwnerId ? { pmOwnerId: form.pmOwnerId } : {}),
      };
    } else {
      const { clientId, programId, pmOwnerId, ...rest } = form;
      payload = {
        ...rest,
        budget: form.budget ? parseFloat(form.budget) : undefined,
        teamSize: form.teamSize ? parseInt(form.teamSize) : undefined,
        ...(clientId ? { clientId } : {}),
        ...(programId ? { programId } : {}),
        ...(pmOwnerId ? { pmOwnerId } : {}),
      };
      if (mode === "upload" && parsed) {
        payload.requirementsText = parsed.requirementsText;
        payload.requirementsFileName = parsed.requirementsFileName;
        payload.requirementsFileFormat = parsed.requirementsFileFormat;
        payload.requirementsExtracted = parsed.requirementsExtracted;
      }
    }

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

  const role = myAssignments?.role;

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
      <div className="flex gap-2 flex-wrap">
        {([
          { id: "form", icon: ClipboardList, label: "Structured Form" },
          { id: "nl", icon: Wand2, label: "AI Natural Language" },
          { id: "upload", icon: Upload, label: "Upload Requirements Doc" },
        ] as const).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all",
              mode === id ? "bg-[#4f5bd5] text-white border-[#4f5bd5]" : "bg-white text-slate-600 border-slate-200 hover:border-[#cfd4f5]"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
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
                    form.engagementMode === opt.value ? "border-[#4f5bd5] bg-[#eef0fc]" : "border-slate-200 hover:border-[#cfd4f5]"
                  )}
                >
                  <p className="font-medium text-sm text-slate-900">{opt.label}</p>
                  <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Hierarchy context card — PM: locked; DM: program picker; DH: client→program→PM */}
          {role && role !== "admin" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hierarchy</CardTitle>
                <CardDescription>
                  {role === "pm" ? "Your project will be created under your assigned program." :
                   role === "dm" ? "Select the program and assign a PM." :
                   "Select the client, program, and PM for this project."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* PM: locked display */}
                {role === "pm" && myAssignments?.programs[0] && (
                  <div className="flex flex-col gap-2">
                    {[
                      { label: "Cluster", value: myAssignments.programs[0].client.cluster.name },
                      { label: "Client", value: myAssignments.programs[0].client.name },
                      { label: "Program", value: myAssignments.programs[0].name },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-sm text-slate-500">{label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{value}</span>
                          <Lock className="w-3 h-3 text-slate-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* DM: select from assigned programs */}
                {role === "dm" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Program</Label>
                      <select
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4f5bd5]"
                        value={form.programId}
                        onChange={(e) => {
                          const prog = myAssignments?.programs.find((p) => p.id === e.target.value);
                          update("programId", e.target.value);
                          if (prog) { update("clientId", prog.clientId); update("customer", prog.client.name); }
                        }}
                        required
                      >
                        <option value="">Select program…</option>
                        {myAssignments?.programs.map((p) => (
                          <option key={p.id} value={p.id}>{p.client.cluster.name} › {p.client.name} › {p.name}</option>
                        ))}
                      </select>
                    </div>
                    {form.programId && (
                      <div className="space-y-1.5">
                        <Label>Assign PM (optional)</Label>
                        <select
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4f5bd5]"
                          value={form.pmOwnerId}
                          onChange={(e) => update("pmOwnerId", e.target.value)}
                        >
                          <option value="">Assign to me (acting PM)</option>
                          {availablePMs.map((pm) => (
                            <option key={pm.id} value={pm.id}>{pm.fullName} ({pm.email})</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}

                {/* DH: client → program → PM */}
                {role === "dh" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Client</Label>
                      <select
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4f5bd5]"
                        value={form.clientId}
                        onChange={(e) => {
                          const c = myAssignments?.clients.find((x) => x.id === e.target.value);
                          update("clientId", e.target.value);
                          update("customer", c?.name || "");
                        }}
                        required
                      >
                        <option value="">Select client…</option>
                        {myAssignments?.clients.map((c) => (
                          <option key={c.id} value={c.id}>{c.cluster.name} › {c.name}</option>
                        ))}
                      </select>
                    </div>
                    {form.clientId && (
                      <div className="space-y-1.5">
                        <Label>Program</Label>
                        <select
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4f5bd5]"
                          value={form.programId}
                          onChange={(e) => update("programId", e.target.value)}
                        >
                          <option value="">Select program…</option>
                          {availablePrograms.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {form.programId && (
                      <div className="space-y-1.5">
                        <Label>Assign PM (optional)</Label>
                        <select
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4f5bd5]"
                          value={form.pmOwnerId}
                          onChange={(e) => update("pmOwnerId", e.target.value)}
                        >
                          <option value="">No PM assigned yet</option>
                          {availablePMs.map((pm) => (
                            <option key={pm.id} value={pm.id}>{pm.fullName} ({pm.email})</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

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
          ) : mode === "upload" ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Upload Requirements Document</CardTitle>
                  <CardDescription>
                    Drop a PDF, Word (.docx), or text file — AI will extract project fields and requirements automatically.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!uploadedFile ? (
                    <div
                      onDrop={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => fileRef.current?.click()}
                      className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center cursor-pointer hover:border-[#4f5bd5] hover:bg-[#eef0fc] transition-all"
                    >
                      <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                      <p className="text-sm font-medium text-slate-700">Drop your file here or click to browse</p>
                      <p className="text-xs text-slate-400 mt-1">Supports PDF, DOCX, DOC, TXT</p>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.txt,.md"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFilePick(f); }}
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                        <FileText className="w-5 h-5 text-[#4f5bd5] shrink-0" />
                        <span className="text-sm font-medium text-slate-800 flex-1 truncate">{uploadedFile.name}</span>
                        {parsing ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        ) : parsed ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : null}
                        <button
                          type="button"
                          onClick={() => { setUploadedFile(null); setParsed(null); setParseSummary([]); }}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {parsing && (
                        <div className="flex items-center gap-2 text-sm text-[#4f5bd5] animate-pulse">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Extracting text and analysing requirements with AI…
                        </div>
                      )}
                      {parseSummary.length > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                          <p className="text-xs font-semibold text-green-800 uppercase tracking-wide">Extracted from document</p>
                          {parseSummary.map((b, i) => (
                            <p key={i} className="text-sm text-green-700 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {b}
                            </p>
                          ))}
                          <p className="text-xs text-green-600 mt-1">Review and edit the pre-filled fields below before creating.</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
              <ProjectFormFields form={form} update={update} role={role} />
            </>
          ) : (
            <ProjectFormFields form={form} update={update} role={role} />
          )}

          {form.engagementMode === "high_level" && mode !== "nl" && (
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

          <Button
            type="submit"
            className="w-full"
            disabled={loading || (mode === "upload" && (!uploadedFile || parsing || !parsed))}
            size="lg"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />{mode === "nl" ? "AI is analysing your brief…" : mode === "upload" ? "Creating project & generating artifacts…" : "Creating project…"}</>
            ) : (
              <>{mode === "nl" ? <Wand2 className="w-4 h-4 mr-2" /> : mode === "upload" ? <Upload className="w-4 h-4 mr-2" /> : <ClipboardList className="w-4 h-4 mr-2" />}
              {mode === "nl" ? "Generate Project with AI" : mode === "upload" ? "Create Project from Requirements" : "Create Project"}</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ProjectFormFields({ form, update, role }: { form: typeof emptyForm; update: (f: string, v: string) => void; role?: string }) {
  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Project Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label>Project Name *</Label>
            <Input placeholder="ERP Implementation — Retail" value={form.name} onChange={(e) => update("name", e.target.value)} required />
          </div>

          {/* Customer only editable for admin/DM/DH — PM has it locked from hierarchy card */}
          {(!role || role === "admin" || role === "dm" || role === "dh") && (
            <div className="space-y-2">
              <Label>Customer / Client</Label>
              <Input
                placeholder="Acme Retail"
                value={form.customer}
                onChange={(e) => update("customer", e.target.value)}
                readOnly={role === "dm" || role === "dh"}
                className={role === "dm" || role === "dh" ? "bg-slate-50 text-slate-600" : ""}
              />
            </div>
          )}

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
    </>
  );
}
