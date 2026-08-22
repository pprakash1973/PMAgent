export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSnapshot, checkBaselineReadiness } from "@/lib/pmb-snapshot";
import { requireProjectAccess } from "@/lib/project-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

  const db = prisma as any;

  const snapshots = await db.pmbSnapshot.findMany({
    where: { projectId: id },
    orderBy: { snapshotNumber: "desc" },
    include: {
      members: {
        select: {
          id: true,
          artifactVersionId: true,
          artifactType: true,
          dimension: true,
          isRequired: true,
        },
      },
    },
  });

  return NextResponse.json(snapshots);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const user = access.user;

  const { label, trigger = "ad_hoc", notes, skipReadinessCheck } = await req.json();

  if (!label?.trim()) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }

  // Check readiness unless caller explicitly skips (for gate_approved trigger)
  if (!skipReadinessCheck) {
    const readiness = await checkBaselineReadiness(id);
    if (!readiness.ready) {
      return NextResponse.json(
        { error: "BASELINE_NOT_READY", readiness },
        { status: 422 }
      );
    }
  }

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { snapshot, memberCount } = await createSnapshot(
    id,
    label.trim(),
    trigger,
    user.id,
    notes
  );

  return NextResponse.json({ snapshot, memberCount }, { status: 201 });
}
