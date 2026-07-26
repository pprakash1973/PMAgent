export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** GET /api/accounts/[id]/primary-dm — returns the primary DM for an account, or 422 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;

  const account = await prisma.orgAccount.findUnique({
    where: { id },
    select: { id: true, name: true, primaryDmId: true },
  });

  if (!account) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Try primaryDmId first
  let dm = account.primaryDmId
    ? await prisma.user.findUnique({
        where: { id: account.primaryDmId },
        select: { id: true, fullName: true, email: true, role: true, status: true },
      })
    : null;

  // Fallback: find any active DM assigned to a program under this account
  if (!dm || dm.status === "deactivated") {
    const programAssignment = await (prisma as any).programAssignment.findFirst({
      where: {
        program: { accountId: id },
        user: { role: { in: ["pgm", "dm"] }, status: "active", deletedAt: null },
      },
      include: { user: { select: { id: true, fullName: true, email: true, role: true, status: true } } },
    });
    if (programAssignment?.user) dm = programAssignment.user;
  }

  // Fallback: find any active DM with an accountAssignment to this account
  if (!dm || dm.status === "deactivated") {
    const accountAssignment = await (prisma as any).accountAssignment.findFirst({
      where: {
        accountId: id,
        user: { role: { in: ["pgm", "dm"] }, status: "active", deletedAt: null },
      },
      include: { user: { select: { id: true, fullName: true, email: true, role: true, status: true } } },
    });
    if (accountAssignment?.user) dm = accountAssignment.user;
  }

  if (!dm || dm.status === "deactivated") {
    return NextResponse.json({ error: { code: "NO_PRIMARY_DM", message: "This account has no Primary Delivery Manager assigned. Contact your administrator." } }, { status: 422 });
  }

  return NextResponse.json({ account: { id: account.id, name: account.name }, dm });
}
