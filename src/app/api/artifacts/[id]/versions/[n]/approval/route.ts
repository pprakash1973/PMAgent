export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const VALID_STATUSES = ["unreviewed", "pm_confirmed", "gate_approved", "superseded_by_cr"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id, n } = await params;
  const versionNumber = parseInt(n, 10);
  if (isNaN(versionNumber)) return NextResponse.json({ error: "INVALID_VERSION" }, { status: 400 });

  const { status } = await req.json();
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "INVALID_STATUS", validStatuses: VALID_STATUSES }, { status: 400 });
  }

  const version = await (prisma.artifactVersion as any).findFirst({
    where: { artifactId: id, versionNumber },
  });
  if (!version) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const updated = await (prisma.artifactVersion as any).update({
    where: { id: version.id },
    data: { approvalStatus: status },
  });

  // Write to audit log
  const artifact = await prisma.artifact.findUnique({
    where: { id },
    select: { projectId: true, artifactType: true },
  });
  if (artifact) {
    const user = session.user as any;
    await prisma.auditLog.create({
      data: {
        orgId: user.orgId ?? "unknown",
        userId: user.id,
        action: "ARTIFACT_APPROVAL_STATUS_CHANGED",
        entity: "ArtifactVersion",
        entityId: version.id,
        before: { approvalStatus: version.approvalStatus },
        after: { approvalStatus: status },
      },
    });
  }

  return NextResponse.json(updated);
}
