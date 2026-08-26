import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

function validCronSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  // Fail closed — an unset secret must not mean "open to the world".
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Runs hourly (Azure Scheduler / Logic App / Vercel Cron).
// Marks escalations that have passed their SLA deadline without acknowledgement.
// SEC: this is an unauthenticated-by-design endpoint, so it is gated on a shared
// secret sent as `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  if (!validCronSecret(req)) {
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
