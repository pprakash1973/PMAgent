import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

const CAN_REASSIGN = ["pgm", "admin"];

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as any;
  if (!user || !CAN_REASSIGN.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const projectId = new URL(req.url).searchParams.get("projectId");

  // All active PM users in the org
  const pms = await prisma.user.findMany({
    where: { orgId: user.orgId, role: "pm" },
    select: {
      id:       true,
      fullName: true,
      email:    true,
      ownedProjects: {
        where: { deletedAt: null, status: { not: "archived" } },
        select: { id: true },
      },
    },
  });

  // Current PM for the project (to mark ineligible for "same PM" reason)
  let currentPmId: string | null = null;
  if (projectId) {
    const proj = await prisma.project.findUnique({
      where: { id: projectId },
      select: { pmOwnerId: true },
    });
    currentPmId = proj?.pmOwnerId ?? null;
  }

  const result = pms.map((pm) => {
    const activeCount = pm.ownedProjects.length;
    const atLimit = activeCount >= 2;
    const isCurrent = pm.id === currentPmId;
    return {
      id:          pm.id,
      fullName:    pm.fullName,
      email:       pm.email,
      activeCount,
      eligible:    !atLimit && !isCurrent,
      reason:      isCurrent ? "Current PM" : atLimit ? `At limit (${activeCount}/2 active projects)` : null,
    };
  });

  return NextResponse.json({ pms: result });
}
