import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Runs hourly (configured via Vercel Cron or external scheduler)
// Marks escalations that have passed their SLA deadline without acknowledgement
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const now = new Date();

  const breached = await prisma.escalation.findMany({
    where: {
      status:         "open",
      slaDueAt:       { lte: now },
      slaBreachedAt:  null,
    },
    select: { id: true },
  });

  if (breached.length > 0) {
    await prisma.escalation.updateMany({
      where: { id: { in: breached.map(e => e.id) } },
      data:  { slaBreachedAt: now },
    });
  }

  return NextResponse.json({ breached: breached.length, checkedAt: now.toISOString() });
}
