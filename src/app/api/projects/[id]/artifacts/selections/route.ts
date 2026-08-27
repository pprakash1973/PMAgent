import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const user = access.user;

  const body = await req.json();
  const add: string[] = Array.isArray(body.add) ? body.add : [];
  const remove: string[] = Array.isArray(body.remove) ? body.remove : [];

  await Promise.all([
    ...add.map((artifactType) =>
      prisma.artifactSelection.upsert({
        where: { projectId_artifactType: { projectId: id, artifactType } },
        create: { projectId: id, artifactType, selectionStatus: "selected", selectedById: user.id, selectedAt: new Date() },
        update: { selectionStatus: "selected" },
      })
    ),
    remove.length > 0
      ? prisma.artifactSelection.deleteMany({ where: { projectId: id, artifactType: { in: remove } } })
      : Promise.resolve(),
  ]);

  return NextResponse.json({ ok: true });
}
