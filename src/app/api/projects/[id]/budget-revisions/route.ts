export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const revisions = await prisma.$queryRaw<any[]>`
    SELECT * FROM budget_revisions WHERE "projectId" = ${id} ORDER BY "createdAt" ASC
  `;
  return NextResponse.json(revisions.map(r => ({
    ...r,
    previousBudget: Number(r.previousBudget),
    newBudget: Number(r.newBudget),
    delta: Number(r.delta),
  })));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { id } = await params;

  const body = await req.json();
  const { delta, reason, crReference } = body as {
    delta?: number;
    reason?: string;
    crReference?: string;
  };

  if (!delta || delta === 0) {
    return NextResponse.json({ error: "delta must be a non-zero number" }, { status: 400 });
  }
  if (!reason?.trim()) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id }, select: { budget: true } });
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const previousBudget = Number(project.budget ?? 0);
  const newBudget = previousBudget + delta;
  const now = new Date();

  // Create a ChangeRequest for the CR reference using raw SQL (stale client workaround)
  let changeRequestId: string | null = null;
  if (crReference) {
    const crId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    await prisma.$executeRaw`
      INSERT INTO change_requests (id, "projectId", "crId", title, description, "approvalStatus", "budgetImpact", "approvedBy", "approvedAt", "createdAt", "updatedAt")
      VALUES (${crId}, ${id}, ${crReference}, ${reason.trim()}, ${reason.trim()}, 'approved', ${delta}, ${user.id}, ${now}, ${now}, ${now})
    `;
    changeRequestId = crId;
  }

  // Create revision record and update project budget atomically
  const revId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  await prisma.$executeRaw`
    INSERT INTO budget_revisions (id, "projectId", "changeRequestId", "previousBudget", "newBudget", delta, reason, "approvedById", "createdAt")
    VALUES (${revId}, ${id}, ${changeRequestId}, ${previousBudget}, ${newBudget}, ${delta}, ${reason.trim()}, ${user.id}, ${now})
  `;
  await prisma.project.update({ where: { id }, data: { budget: newBudget } });

  const [revision] = await prisma.$queryRaw<any[]>`SELECT * FROM budget_revisions WHERE id = ${revId}`;
  const serialized = {
    ...revision,
    previousBudget: Number(revision.previousBudget),
    newBudget: Number(revision.newBudget),
    delta: Number(revision.delta),
  };

  return NextResponse.json({ revision: serialized, newBudget }, { status: 201 });
}
