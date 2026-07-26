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

  if (!account.primaryDmId) {
    return NextResponse.json({ error: { code: "NO_PRIMARY_DM", message: "This account has no Primary Delivery Manager assigned. Contact your administrator." } }, { status: 422 });
  }

  const dm = await prisma.user.findUnique({
    where: { id: account.primaryDmId },
    select: { id: true, fullName: true, email: true, role: true, status: true },
  });

  if (!dm || dm.status === "deactivated") {
    return NextResponse.json({ error: { code: "NO_PRIMARY_DM", message: "The Primary Delivery Manager for this account is inactive. Contact your administrator." } }, { status: 422 });
  }

  return NextResponse.json({ account: { id: account.id, name: account.name }, dm });
}
