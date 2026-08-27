export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ADMIN_KEY = "pmclear2026";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key !== ADMIN_KEY) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const count = await prisma.project.count();
  const result = await prisma.$executeRawUnsafe(`TRUNCATE "Project" CASCADE`);
  const remaining = await prisma.project.count();

  return NextResponse.json({
    ok: true,
    deleted: count,
    remaining,
    message: `Cleared ${count} projects and all child records.`,
  });
}
