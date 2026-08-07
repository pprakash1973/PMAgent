import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const user = session.user as any;
  const { id } = await params;
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
