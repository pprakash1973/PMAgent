export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Returns PM users for a given program — accessible to DM, DH, admin
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const user = session.user as any;
  if (!["pgm", "dh", "admin"].includes(user.role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");

  const where: any = { orgId: user.orgId, role: "pm", deletedAt: null, status: "active" };

  if (programId) {
    where.programAssignments = { some: { programId } };
  }

  const pms = await prisma.user.findMany({
    where,
    select: { id: true, fullName: true, email: true },
    orderBy: { fullName: "asc" },
  });

  return NextResponse.json(pms);
}
