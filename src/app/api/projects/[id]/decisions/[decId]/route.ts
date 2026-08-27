import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateDecisionPatch, DecisionValidationError } from "@/lib/decision-validation";
import { requireProjectAccess } from "@/lib/project-access";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; decId: string }> }
) {
  const { id, decId } = await params;
  const access = await requireProjectAccess(id, { write: true });
  if (access.error) return access.error;

  const decision = await prisma.decision.findUnique({ where: { id: decId, projectId: id } });
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
  const { id, decId } = await params;
  const access = await requireProjectAccess(id, { write: true });
  if (access.error) return access.error;

  const decision = await prisma.decision.findUnique({ where: { id: decId, projectId: id } });
  if (!decision) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.decision.delete({ where: { id: decId } });
  return NextResponse.json({ ok: true });
}
