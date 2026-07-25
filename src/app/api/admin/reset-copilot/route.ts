export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Temporary one-shot route — DELETE THIS FILE after use
// Resets copilotEnabled + assistantName for specified emails
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-reset-secret");
  if (secret !== "pm-reset-2026") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { emails } = await req.json();
  if (!Array.isArray(emails)) return NextResponse.json({ error: "emails array required" }, { status: 400 });

  const result = await prisma.user.updateMany({
    where: { email: { in: emails } },
    data: { copilotEnabled: false, assistantName: "Advisor" },
  });

  return NextResponse.json({ reset: result.count, emails });
}
