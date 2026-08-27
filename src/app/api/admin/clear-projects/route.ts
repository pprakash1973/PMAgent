/**
 * ONE-TIME cleanup endpoint — DELETE AFTER USE.
 * Truncates all Project rows (and every child table) from Neon DB.
 * Requires admin session. Guarded by a CLEAR_KEY env var.
 *
 * Usage: GET /api/admin/clear-projects?key=<CLEAR_KEY>
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = (session?.user as any);
  if (!session || user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = req.nextUrl.searchParams.get("key");
  const expectedKey = process.env.CLEAR_KEY ?? "pmclear2026";
  if (key !== expectedKey) {
    return NextResponse.json({ error: "Wrong key" }, { status: 403 });
  }

  try {
    const before = await prisma.project.count();
    await prisma.$executeRawUnsafe('TRUNCATE "Project" CASCADE');
    const after = await prisma.project.count();
    return NextResponse.json({
      ok: true,
      deleted: before,
      remaining: after,
      message: `Cleared ${before} projects and all child records.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
