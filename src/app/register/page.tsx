"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BriefcaseIcon, AlertCircle, Loader2, CheckCircle } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", orgName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error?.message || "Registration failed. Please try again.");
    } else {
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#003C51] via-[#006E74] to-[#0097AC] p-4">
        <Card className="w-full max-w-md text-center p-8">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Account created!</h2>
          <p className="text-slate-500">Redirecting to login...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#003C51] via-[#006E74] to-[#0097AC] p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-white">
          <div className="bg-white/10 rounded-2xl p-4 backdrop-blur">
            <BriefcaseIcon className="w-10 h-10 text-[#DBD3BD]" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold">PM Agent</h1>
            <p className="text-[#DBD3BD] text-sm mt-1">Create your organization</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Register</CardTitle>
            <CardDescription>Set up your PM Agent workspace</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input placeholder="Acme Corp" value={form.orgName} onChange={(e) => update("orgName", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Your Full Name</Label>
                <Input placeholder="Jane Smith" value={form.fullName} onChange={(e) => update("fullName", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Work Email</Label>
                <Input type="email" placeholder="jane@acme.com" value={form.email} onChange={(e) => update("email", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" placeholder="Min 8 chars, uppercase, number, symbol" value={form.password} onChange={(e) => update("password", e.target.value)} required />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Account
              </Button>
              <p className="text-sm text-slate-500 text-center">
                Already have an account?{" "}
                <Link href="/login" className="text-[#006E74] font-medium hover:underline">Sign in</Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
