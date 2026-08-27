"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { Loader2, Save, Mail, CheckCircle2, XCircle, Eye, EyeOff, Info } from "lucide-react";

type SmtpProvider = "gmail" | "outlook365" | "custom";

interface SmtpForm {
  "smtp.service": string;
  "smtp.host": string;
  "smtp.port": string;
  "smtp.secure": string;
  "smtp.user": string;
  "smtp.password": string;
  "smtp.fromName": string;
  "smtp.fromAddress": string;
}

const PROVIDER_PRESETS: Record<SmtpProvider, Partial<SmtpForm>> = {
  gmail:     { "smtp.service": "gmail",  "smtp.host": "",                    "smtp.port": "587", "smtp.secure": "false" },
  outlook365:{ "smtp.service": "",       "smtp.host": "smtp.office365.com",  "smtp.port": "587", "smtp.secure": "false" },
  custom:    { "smtp.service": "",       "smtp.host": "",                    "smtp.port": "587", "smtp.secure": "false" },
};

export default function EmailConfigPage() {
  const [form, setForm] = useState<SmtpForm>({
    "smtp.service": "gmail",
    "smtp.host": "",
    "smtp.port": "587",
    "smtp.secure": "false",
    "smtp.user": "",
    "smtp.password": "",
    "smtp.fromName": "PM Agent",
    "smtp.fromAddress": "",
  });

  const [provider, setProvider] = useState<SmtpProvider>("gmail");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/email-config");
      if (res.ok) {
        const data = await res.json();
        setForm((prev) => ({ ...prev, ...data }));
        if (data["smtp.service"] === "gmail") setProvider("gmail");
        else if (data["smtp.host"]?.includes("office365")) setProvider("outlook365");
        else if (data["smtp.host"] || data["smtp.service"]) setProvider("custom");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function applyPreset(p: SmtpProvider) {
    setProvider(p);
    setTestResult(null);
    setForm((prev) => ({ ...prev, ...PROVIDER_PRESETS[p] }));
  }

  function setField(key: keyof SmtpForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTestResult(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/email-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast({ title: "Email configuration saved" });
      } else {
        toast({ title: "Failed to save", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      // Send current form values so the test uses what the admin typed, not what's in DB.
      const res = await fetch("/api/admin/email-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", ...form }),
      });
      const data = await res.json();
      setTestResult(data);
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <Mail size={20} />
          Email Configuration
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure the account used to send task actuals collection emails to project resources.
          Credentials are stored encrypted at rest.
        </p>
      </div>

      {/* Provider tabs */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Email Provider</label>
        <div className="grid grid-cols-3 gap-2">
          {(["gmail", "outlook365", "custom"] as SmtpProvider[]).map((p) => (
            <button key={p} onClick={() => applyPreset(p)}
              className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-all ${
                provider === p
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}>
              {p === "gmail" ? "Gmail / Google Workspace" : p === "outlook365" ? "Microsoft 365 / Outlook" : "Custom SMTP"}
            </button>
          ))}
        </div>
      </div>

      {/* Gmail — no host/port needed */}
      {provider === "gmail" && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <Info size={15} className="mt-0.5 flex-shrink-0" />
          <div>
            <strong>Gmail / Google Workspace</strong> — no SMTP host or port needed.
            Just enter your Gmail address and an <strong>App Password</strong> (not your regular password).{" "}
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer"
              className="underline font-medium">Generate one here</a> — 2-step verification must be on.
            The app sends from this Gmail account to any recipient.
          </div>
        </div>
      )}

      {/* Microsoft 365 */}
      {provider === "outlook365" && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <Info size={15} className="mt-0.5 flex-shrink-0" />
          <div>
            Uses <strong>smtp.office365.com:587</strong> (STARTTLS). Enter your M365 email and password.
            If MFA is enforced, create an App Password in your Microsoft account security settings.
          </div>
        </div>
      )}

      {/* Custom SMTP host fields */}
      {provider !== "gmail" && (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">SMTP Host</label>
            <Input value={form["smtp.host"]} onChange={(e) => setField("smtp.host", e.target.value)}
              placeholder="smtp.office365.com" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Port</label>
            <Input value={form["smtp.port"]} onChange={(e) => setField("smtp.port", e.target.value)}
              placeholder="587" />
          </div>
        </div>
      )}

      {/* Credentials */}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            {provider === "gmail" ? "Gmail address" : "Email / Username"}
          </label>
          <Input type="email" value={form["smtp.user"]} onChange={(e) => setField("smtp.user", e.target.value)}
            placeholder="you@company.com" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            {provider === "gmail" ? "App Password (16 characters, no spaces)" : "Password"}
          </label>
          <div className="relative">
            <Input type={showPass ? "text" : "password"} value={form["smtp.password"]}
              onChange={(e) => setField("smtp.password", e.target.value)}
              placeholder="••••••••••••••••" className="pr-10" />
            <button type="button" onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
              {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">Stored encrypted with AES-256-GCM. Never returned in plain text.</p>
        </div>
      </div>

      {/* Sender display */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Sender Name</label>
          <Input value={form["smtp.fromName"]} onChange={(e) => setField("smtp.fromName", e.target.value)}
            placeholder="PM Agent" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">From Address (leave blank to use username)</label>
          <Input type="email" value={form["smtp.fromAddress"]}
            onChange={(e) => setField("smtp.fromAddress", e.target.value)}
            placeholder="Same as username" />
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
          testResult.ok
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {testResult.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {testResult.ok ? "Connection successful — SMTP is working." : testResult.error ?? "Connection failed."}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Configuration
        </Button>
        <Button variant="outline" onClick={handleTest} disabled={testing} className="gap-1.5">
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
          Test Connection
        </Button>
      </div>
    </div>
  );
}
