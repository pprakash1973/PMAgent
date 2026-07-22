import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// Runs hourly (configured via Vercel Cron or external scheduler)
// Marks escalations that have passed their SLA deadline without acknowledgement
export async function GET() {
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
