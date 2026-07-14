"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";

// Team collaborating around a table (Unsplash, stable CDN asset)
const TEAM_PHOTO =
  "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1400&q=80";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [photoOk, setPhotoOk] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", { email, password, redirect: false });

    if (result?.error) {
      setError("Invalid email or password. Please try again.");
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "#eef0f3" }}>
      {/* ── Left: team photo panel ── */}
      <div
        style={{
          position: "relative",
          flex: "1 1 55%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 56px",
          overflow: "hidden",
          background: "linear-gradient(150deg,#003C51 0%,#006E74 60%,#0097AC 100%)",
        }}
        className="login-photo-panel"
      >
        {photoOk && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={TEAM_PHOTO}
            alt="A project team collaborating around a table"
            onError={() => setPhotoOk(false)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}
        {/* readability overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(155deg, rgba(0,60,81,0.72) 0%, rgba(0,60,81,0.45) 40%, rgba(0,110,116,0.72) 100%)",
          }}
        />

        {/* top: brand */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: "linear-gradient(135deg,#0097AC,#006E74)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 14px rgba(0,110,116,.45)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="M12 12l7-4M12 12v9M12 12L5 8" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ color: "#fff", fontSize: 17, fontWeight: 700, letterSpacing: "-.01em" }}>PM Agent</span>
        </div>

        {/* bottom: headline + value points */}
        <div style={{ position: "relative", maxWidth: 460 }}>
          <h1
            style={{
              color: "#fff",
              fontSize: 34,
              lineHeight: 1.18,
              fontWeight: 700,
              letterSpacing: "-.02em",
              textWrap: "balance" as const,
              margin: 0,
            }}
          >
            Bring your project team around one table.
          </h1>
          <p style={{ color: "rgba(255,255,255,.82)", fontSize: 15, lineHeight: 1.6, marginTop: 16 }}>
            From kickoff to closure — charters, RAID logs, EVM status, and executive reporting,
            drafted and kept current by your AI PMO copilot.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px", marginTop: 26 }}>
            {["PMBOK-aligned artifacts", "Real-time portfolio health", "AI status reporting"].map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,.16)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12l5 5L19 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span style={{ color: "rgba(255,255,255,.9)", fontSize: "12.5px", fontWeight: 500 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: sign-in form ── */}
      <div
        style={{
          flex: "1 1 45%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 32px",
          background: "#fff",
        }}
      >
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1d24", letterSpacing: "-.01em", margin: 0 }}>
              Welcome back
            </h2>
            <p style={{ fontSize: "13.5px", color: "#5b616e", marginTop: 6 }}>
              Sign in to your PMO workspace
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {error && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  color: "#cf3f3a",
                  background: "#fbe4e2",
                  border: "1px solid #f3c9c6",
                  borderRadius: 9,
                  padding: "10px 12px",
                }}
              >
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                {error}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading} style={{ height: 42, marginTop: 4 }}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign In
            </Button>
            <p style={{ fontSize: 13, color: "#5b616e", textAlign: "center", marginTop: 2 }}>
              No account?{" "}
              <Link href="/register" style={{ color: "#006E74", fontWeight: 600, textDecoration: "none" }}>
                Register your organization
              </Link>
            </p>
          </form>

          <p style={{ textAlign: "center", fontSize: 11, color: "#8a909c", marginTop: 34 }}>
            Enterprise edition · Powered by Claude AI
          </p>
        </div>
      </div>

      {/* hide photo panel on small screens */}
      <style>{`
        @media (max-width: 860px) {
          .login-photo-panel { display: none !important; }
        }
      `}</style>
    </div>
  );
}
