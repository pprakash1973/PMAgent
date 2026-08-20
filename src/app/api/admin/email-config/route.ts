export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptValue, decryptValue, testSmtpConnection } from "@/lib/email-smtp";

const CONFIG_KEYS = ["smtp.host", "smtp.port", "smtp.secure", "smtp.service",
                     "smtp.user", "smtp.password", "smtp.fromName", "smtp.fromAddress"];

// GET — return current config (DB values take precedence over env vars; password is masked)
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if ((session.user as any).role !== "admin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const settings = await prisma.systemSetting.findMany({ where: { key: { in: CONFIG_KEYS } } });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  // Fall back to env vars for pre-population when nothing is saved yet
  if (!map["smtp.user"] && process.env.GMAIL_USER) {
    map["smtp.user"]    = process.env.GMAIL_USER;
    map["smtp.service"] = map["smtp.service"] || "gmail";
  }
  if (!map["smtp.fromName"]) map["smtp.fromName"] = "PM Agent";

  // Mask password — show indicator if one exists (DB or env)
  const hasDbPassword  = !!settings.find((s) => s.key === "smtp.password")?.value;
  const hasEnvPassword = !!process.env.GMAIL_APP_PASSWORD;
  if (hasDbPassword || hasEnvPassword) {
    map["smtp.password"] = "••••••••";
  }

  return NextResponse.json(map);
}

// PUT — save config (encrypts password)
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if ((session.user as any).role !== "admin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json();

  const upserts: Promise<any>[] = [];
  const allowedKeys = new Set(CONFIG_KEYS);

  for (const [key, rawValue] of Object.entries(body)) {
    if (!allowedKeys.has(key)) continue;
    let value = String(rawValue ?? "");

    // Skip masked placeholder — don't overwrite actual password
    if (key === "smtp.password" && value === "••••••••") continue;
    if (key === "smtp.password" && value) {
      // Never store the SMTP password in plaintext. Refuse to save if the
      // encryption key is missing rather than silently persisting a secret.
      if (!process.env.ENCRYPTION_KEY) {
        return NextResponse.json(
          { error: "Server is missing ENCRYPTION_KEY, so the SMTP password can't be stored securely. Set ENCRYPTION_KEY (64 hex chars) on the server and try again." },
          { status: 500 }
        );
      }
      value = encryptValue(value);
    }

    upserts.push(
      prisma.systemSetting.upsert({
        where: { key },
        create: { key, value, updatedBy: session.user.id },
        update: { value, updatedAt: new Date(), updatedBy: session.user.id },
      })
    );
  }

  await Promise.all(upserts);

  return NextResponse.json({ ok: true });
}

// POST /api/admin/email-config — test SMTP with form values (no save required)
// Accepts the form values directly so admin can test before saving.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if ((session.user as any).role !== "admin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json();
  const { action } = body;
  if (action !== "test") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  // Use form-submitted values directly — do NOT read from DB.
  // This lets the admin test credentials before saving.
  const service  = body["smtp.service"] as string | undefined;
  const host     = body["smtp.host"] as string | undefined;
  const port     = body["smtp.port"] ? parseInt(body["smtp.port"] as string) : 587;
  const secure   = body["smtp.secure"] === "true";
  const user     = (body["smtp.user"] as string | undefined) || "";
  const password = (body["smtp.password"] as string | undefined) || "";
  const fromName = (body["smtp.fromName"] as string | undefined) || "PM Agent";

  // If password is the masked placeholder, try env var or DB fallback
  let resolvedPassword = password;
  if (!resolvedPassword || resolvedPassword === "••••••••") {
    resolvedPassword = process.env.GMAIL_APP_PASSWORD || "";
    // Try DB if still empty
    if (!resolvedPassword) {
      const dbPass = await prisma.systemSetting.findUnique({ where: { key: "smtp.password" } });
      if (dbPass?.value) {
        // Stored value is either our cipher format (iv:tag:data) or legacy plaintext.
        const looksEncrypted = dbPass.value.split(":").length === 3;
        if (looksEncrypted) {
          try {
            resolvedPassword = decryptValue(dbPass.value);
          } catch {
            // Do NOT fall back to using the ciphertext as the password — surface
            // the real problem so the admin can re-enter and re-save the secret.
            return NextResponse.json({
              ok: false,
              error: "The stored SMTP password could not be decrypted (ENCRYPTION_KEY may have changed). Re-enter the App Password above and save it again.",
            });
          }
        } else {
          resolvedPassword = dbPass.value;
        }
      }
    }
  }

  if (!user || !resolvedPassword) {
    return NextResponse.json({
      ok: false,
      error: "Enter a Gmail address and App Password above, then click Test Connection.",
    });
  }
  const password2 = resolvedPassword;

  try {
    const result = await testSmtpConnection({ service, host, port, secure, user, password: password2, fromName, fromAddress: user });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Connection failed" });
  }
}
