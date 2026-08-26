export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/project-access";

const createSchema = z.object({
  name: z.string().min(1),
  targetDate: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { id: projectId } = await params;
  const db = prisma as any;

  const releases = await db.release.findMany({
    where: { projectId },
    orderBy: { targetDate: "asc" },
  });

  // Count backlog items per release (items in sprints assigned to this release)
  const sprints = await db.sprint.findMany({
    where: { projectId, releaseId: { not: null } },
    select: { releaseId: true, backlogItems: { select: { id: true, state: true, points: true } } },
  });

  const releaseStats: Record<string, { total: number; accepted: number; points: number }> = {};
  for (const s of sprints) {
    if (!s.releaseId) continue;
    if (!releaseStats[s.releaseId]) releaseStats[s.releaseId] = { total: 0, accepted: 0, points: 0 };
    releaseStats[s.releaseId].total += s.backlogItems.length;
    releaseStats[s.releaseId].accepted += s.backlogItems.filter((i: any) => i.state === "accepted").length;
    releaseStats[s.releaseId].points += s.backlogItems.reduce((sum: number, i: any) => sum + (i.points ?? 0), 0);
  }

  const enriched = releases.map((r: any) => ({ ...r, stats: releaseStats[r.id] ?? { total: 0, accepted: 0, points: 0 } }));
  return NextResponse.json(enriched);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { id: projectId } = await params;
  const db = prisma as any;
  const body = await req.json();

  if (body.action === "release") {
    const rel = await db.release.update({
      where: { id: body.releaseId },
      data: { status: "released", releasedAt: new Date() },
    });
    return NextResponse.json(rel);
  }

  const data = createSchema.parse(body);
  const release = await db.release.create({
    data: {
      projectId,
      name: data.name,
      targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
      notes: data.notes,
      status: "planned",
    },
  });

  return NextResponse.json(release, { status: 201 });
}
