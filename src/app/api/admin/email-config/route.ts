export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptValue, decryptValue, testSmtpConnection } from "@/lib/email-smtp";

const CONFIG_KEYS = ["smtp.host", "smtp.port", "smtp.secure", "smtp.service",
                     "smtp.user", "smtp.password", "smtp.fromName", "smtp.fromAddress"];

// GET — return current config (password is masked)
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if ((session.user as any).role !== "admin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const settings = await prisma.systemSetting.findMany({ where: { key: { in: CONFIG_KEYS } } });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  // Mask password
  if (map["smtp.password"]) {
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
    if (key === "smtp.password" && value && process.env.ENCRYPTION_KEY) {
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

// POST /api/admin/email-config/test — test SMTP connection
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if ((session.user as any).role !== "admin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json();
  const { action } = body;

  if (action !== "test") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  // Build config from submitted values (for real-time test before saving)
  const { getSmtpConfig } = await import("@/lib/email-smtp");
  try {
    const cfg = await getSmtpConfig();
    const result = await testSmtpConnection(cfg);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Config error" });
  }
}
