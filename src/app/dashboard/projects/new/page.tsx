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
import { Loader2, Wand2, ArrowLeft, Upload, FileText, CheckCircle2, X, Lock, File, Sheet } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Mode = "upload" | "nl";

interface UploadedDoc {
  file: File;
  status: "parsing" | "done" | "error";
  summary: string[];
  parsed?: {
    requirementsText: string;
    requirementsFileName: string;
    requirementsFileFormat: string;
    requirementsExtracted: Record<string, unknown>;
  };
}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf"].includes(ext)) return <span className="text-red-500 font-bold text-xs bg-red-50 border border-red-200 rounded px-1.5 py-0.5">PDF</span>;
  if (["doc", "docx"].includes(ext)) return <span className="text-blue-600 font-bold text-xs bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">DOC</span>;
  if (["xls", "xlsx"].includes(ext)) return <span className="text-green-600 font-bold text-xs bg-green-50 border border-green-200 rounded px-1.5 py-0.5">XLS</span>;
  if (["ppt", "pptx"].includes(ext)) return <span className="text-orange-500 font-bold text-xs bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">PPT</span>;
  if (["txt", "md"].includes(ext)) return <span className="text-slate-500 font-bold text-xs bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">TXT</span>;
  return <span className="text-slate-500 font-bold text-xs bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">FILE</span>;
}

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
  methodology: "milestone_based",
  engagementMode: "detailed",
  industry: "",
  budget: "",
  currency: "AUD",
  startDate: "",
  endDate: "",
  description: "",
};

export default function NewProjectPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("upload");
  const [loading, setLoading] = useState(false);
  const [nlText, setNlText] = useState("");
  const [form, setForm] = useState(emptyForm);

  const [myAssignments, setMyAssignments] = useState<MyAssignments | null>(null);
  const [availablePrograms, setAvailablePrograms] = useState<ProgramItem[]>([]);
  const [availablePMs, setAvailablePMs] = useState<PMUser[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);

  useEffect(() => {
    fetch("/api/me/assignments")
      .then((r) => r.json())
      .then((data: MyAssignments) => {
        setMyAssignments(data);
        if (data.role === "pm" && data.programs.length === 1) {
          const prog = data.programs[0];
          setForm((f) => ({ ...f, programId: prog.id, clientId: prog.clientId, customer: prog.client.name }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.programId || !myAssignments) return;
    if (myAssignments.role === "pm") return;
    fetch(`/api/users/pms?programId=${form.programId}`)
      .then((r) => r.json())
      .then((d) => setAvailablePMs(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [form.programId, myAssignments]);

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
    // Prevent duplicates
    if (docs.some((d) => d.file.name === file.name && d.file.size === file.size)) {
      toast({ title: "Already added", description: file.name });
      return;
    }

    const idx = docs.length;
    setDocs((prev) => [...prev, { file, status: "parsing", summary: [] }]);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-requirements", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to parse file");

      const pf = data.projectFields as Record<string, unknown>;
      // Merge extracted fields into form — first doc wins on name/customer; later docs fill blanks
      setForm((f) => ({
        ...f,
        name: f.name || (pf.name as string) || "",
        customer: myAssignments?.role === "pm" ? f.customer : f.customer || (pf.customer as string) || "",
        projectType: f.projectType || (pf.projectType as string) || "fixed_price",
        methodology: f.methodology || (pf.methodology as string) || "milestone_based",
        industry: f.industry || (pf.industry as string) || "",
        budget: f.budget || (pf.budget ? String(pf.budget) : ""),
        startDate: f.startDate || (pf.startDate ? String(pf.startDate).slice(0, 10) : ""),
        endDate: f.endDate || (pf.endDate ? String(pf.endDate).slice(0, 10) : ""),
        description: f.description || (pf.description as string) || "",
      }));

      const req = data.requirements as Record<string, unknown>;
      const bullets: string[] = [`From: ${file.name}`];
      if (Array.isArray(req.goals) && req.goals.length) bullets.push(`${req.goals.length} goal(s) identified`);
      if (Array.isArray(req.stakeholders) && req.stakeholders.length) bullets.push(`${req.stakeholders.length} stakeholder(s) found`);
      if (Array.isArray(req.constraints) && req.constraints.length) bullets.push(`${req.constraints.length} constraint(s) detected`);
      if (Array.isArray(req.scopeItems) && req.scopeItems.length) bullets.push(`${req.scopeItems.length} scope item(s) extracted`);
      if (req.timeline) bullets.push(`Timeline: ${req.timeline}`);
      if (bullets.length === 1) bullets.push("Requirements extracted successfully");

      setDocs((prev) =>
        prev.map((d, i) =>
          i === idx
            ? {
                ...d,
                status: "done",
                summary: bullets,
                parsed: {
                  requirementsText: data.extractedText,
                  requirementsFileName: data.fileName,
                  requirementsFileFormat: data.fileFormat,
                  requirementsExtracted: req,
                },
              }
            : d
        )
      );
    } catch (err: any) {
      toast({ title: "Parse failed", description: err.message, variant: "destructive" });
      setDocs((prev) => prev.map((d, i) => (i === idx ? { ...d, status: "error" } : d)));
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    Array.from(e.dataTransfer.files).forEach((f) => handleFilePick(f));
  }

  function removeDoc(idx: number) {
    setDocs((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    let payload: Record<string, unknown>;

    if (mode === "nl") {
      payload = {
        naturalLanguage: nlText,
        engagementMode: "detailed",
        ...(form.clientId ? { clientId: form.clientId } : {}),
        ...(form.programId ? { programId: form.programId } : {}),
        ...(form.pmOwnerId ? { pmOwnerId: form.pmOwnerId } : {}),
      };
    } else {
      const { clientId, programId, pmOwnerId, ...rest } = form;
      payload = {
        ...rest,
        engagementMode: "detailed",
        budget: form.budget ? parseFloat(form.budget) : undefined,
        ...(clientId ? { clientId } : {}),
        ...(programId ? { programId } : {}),
        ...(pmOwnerId ? { pmOwnerId } : {}),
      };
      const doneDocs = docs.filter((d) => d.status === "done" && d.parsed);
      if (doneDocs.length > 0) {
        // Concatenate all extracted texts; use first doc's metadata for format reference
        payload.requirementsText = doneDocs.map((d) => d.parsed!.requirementsText).join("\n\n---\n\n");
        payload.requirementsFileName = doneDocs.map((d) => d.parsed!.requirementsFileName).join(", ");
        payload.requirementsFileFormat = doneDocs[0].parsed!.requirementsFileFormat;
        payload.requirementsExtracted = doneDocs.reduce((acc, d) => ({ ...acc, ...d.parsed!.requirementsExtracted }), {});
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

      {/* Mode toggle — Upload first, then AI */}
      <div className="flex gap-2">
        {([
          { id: "upload" as const, icon: Upload, label: "Upload Documents" },
          { id: "nl" as const, icon: Wand2, label: "Use AI" },
        ]).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all",
              mode === id
                ? "bg-[#4f5bd5] text-white border-[#4f5bd5]"
                : "bg-white text-slate-600 border-slate-200 hover:border-[#cfd4f5]"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-4">

          {/* Hierarchy context card */}
          {role && role !== "admin" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hierarchy</CardTitle>
                <CardDescription>
                  {role === "pm"
                    ? "Your project will be created under your assigned program."
                    : role === "pgm"
                    ? "Select the program and assign a PM."
                    : "Select the client, program, and PM for this project."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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

                {role === "pgm" && (
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

          {/* Upload mode */}
          {mode === "upload" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upload Requirements Documents</CardTitle>
                <CardDescription>
                  Add one or more files — AI will extract project fields and requirements from each.
                  Supports PDF, Word, Excel, PowerPoint, and text files.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Drop zone — always visible */}
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-[#4f5bd5] hover:bg-[#eef0fc] transition-all"
                >
                  <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-700">Drop files here or click to browse</p>
                  <p className="text-xs text-slate-400 mt-1">PDF · DOCX · XLSX · PPTX · TXT</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md"
                    multiple
                    className="hidden"
                    onChange={(e) => { Array.from(e.target.files ?? []).forEach(handleFilePick); e.target.value = ""; }}
                  />
                </div>

                {/* Uploaded files list + extraction summaries */}
                {docs.length > 0 && (
                  <div className="space-y-2">
                    {docs.map((doc, i) => (
                      <div key={i} className="rounded-lg border border-slate-200 overflow-hidden">
                        {/* File row */}
                        <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50">
                          {fileIcon(doc.file.name)}
                          <span className="text-sm font-medium text-slate-800 flex-1 truncate">{doc.file.name}</span>
                          {doc.status === "parsing" && <Loader2 className="w-4 h-4 animate-spin text-[#4f5bd5] shrink-0" />}
                          {doc.status === "done" && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                          {doc.status === "error" && <span className="text-xs text-red-500 shrink-0">Failed</span>}
                          <button
                            type="button"
                            onClick={() => removeDoc(i)}
                            className="text-slate-400 hover:text-slate-700 shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Extraction summary */}
                        {doc.status === "parsing" && (
                          <div className="px-3 py-2 flex items-center gap-2 text-xs text-[#4f5bd5] animate-pulse bg-white">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Analysing with AI…
                          </div>
                        )}
                        {doc.status === "done" && doc.summary.length > 0 && (
                          <div className="px-3 py-2 bg-green-50 space-y-0.5">
                            {doc.summary.map((b, j) => (
                              <p key={j} className={cn(
                                "text-xs flex items-start gap-1.5",
                                j === 0 ? "font-semibold text-green-800" : "text-green-700"
                              )}>
                                {j > 0 && <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />}
                                {b}
                              </p>
                            ))}
                          </div>
                        )}
                        {doc.status === "error" && (
                          <div className="px-3 py-2 bg-red-50 text-xs text-red-600">
                            Could not extract content from this file.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {docs.some((d) => d.status === "done") && (
                  <p className="text-xs text-slate-400">
                    Review and edit the pre-filled fields below before creating the project.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* AI / natural language mode */}
          {mode === "nl" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Describe your project</CardTitle>
                <CardDescription>
                  Write naturally — AI will infer structured fields and generate your artifact workspace.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder='e.g. "Build an ERP implementation for a retail company lasting 12 months, budget $2M. Milestone-based delivery, financial services industry."'
                  value={nlText}
                  onChange={(e) => setNlText(e.target.value)}
                  rows={5}
                  required
                />
              </CardContent>
            </Card>
          )}

          {/* Project Details — shown in both modes */}
          <ProjectFormFields form={form} update={update} role={role} />

          <Button
            type="submit"
            className="w-full"
            disabled={loading || (mode === "upload" && (docs.length === 0 || docs.some((d) => d.status === "parsing") || docs.every((d) => d.status !== "done")))}
            size="lg"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />
              {mode === "nl" ? "AI is analysing your brief…" : "Creating project & generating artifacts…"}</>
            ) : (
              <>{mode === "nl" ? <Wand2 className="w-4 h-4 mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              {mode === "nl" ? "Generate Project with AI" : "Create Project from Requirements"}</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ProjectFormFields({
  form,
  update,
  role,
}: {
  form: typeof emptyForm;
  update: (f: string, v: string) => void;
  role?: string;
}) {
  return (
    <>
      {/* Project Details */}
      <Card>
        <CardHeader><CardTitle className="text-base">Project Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label>Project Name *</Label>
            <Input
              placeholder="ERP Implementation — Retail"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
            />
          </div>

          {(!role || role === "admin" || role === "pgm" || role === "dh") && (
            <div className="space-y-2">
              <Label>Customer / Client</Label>
              <Input
                placeholder="Acme Retail"
                value={form.customer}
                onChange={(e) => update("customer", e.target.value)}
                readOnly={role === "pgm" || role === "dh"}
                className={role === "pgm" || role === "dh" ? "bg-slate-50 text-slate-600" : ""}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Industry</Label>
            <Input
              placeholder="Retail, Financial Services, Healthcare..."
              value={form.industry}
              onChange={(e) => update("industry", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Methodology</Label>
            <Select value={form.methodology} onValueChange={(v) => update("methodology", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="milestone_based">Milestone Based</SelectItem>
                <SelectItem value="time_and_material">Time and Material</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Billing Type</Label>
            <Select value={form.projectType} onValueChange={(v) => update("projectType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed_price">Fixed Price</SelectItem>
                <SelectItem value="time_and_material">Time &amp; Material</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Timeline & Budget */}
      <Card>
        <CardHeader><CardTitle className="text-base">Timeline &amp; Budget</CardTitle></CardHeader>
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
                <SelectItem value="AUD">AUD</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="INR">INR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Brief project description..."
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
