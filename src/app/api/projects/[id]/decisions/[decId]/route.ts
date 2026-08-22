import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateDecisionPatch, DecisionValidationError } from "@/lib/decision-validation";

export const dynamic = "force-dynamic";

async function resolveAndAuthorize(id: string, decId: string, orgId: string) {
  const decision = await prisma.decision.findUnique({
    where: { id: decId },
    include: { project: { select: { orgId: true } } },
  });
  if (!decision || decision.projectId !== id || decision.project.orgId !== orgId) return null;
  return decision;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; decId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { id, decId } = await params;

  const decision = await resolveAndAuthorize(id, decId, user.orgId);
  if (!decision) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  let patch;
  try {
    patch = validateDecisionPatch(await req.json());
  } catch (err) {
    if (err instanceof DecisionValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not read the request body." }, { status: 400 });
  }

  try {
    const updated = await prisma.decision.update({ where: { id: decId }, data: patch });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[decisions] update failed:", err);
    return NextResponse.json({ error: "Could not update the decision." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; decId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { id, decId } = await params;

  const decision = await resolveAndAuthorize(id, decId, user.orgId);
  if (!decision) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.decision.delete({ where: { id: decId } });
  return NextResponse.json({ ok: true });
}
