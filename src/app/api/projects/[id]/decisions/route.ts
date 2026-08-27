import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateDecisionCreate, DecisionValidationError, nextDecisionId } from "@/lib/decision-validation";
import { requireProjectAccess } from "@/lib/project-access";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

  const decisions = await prisma.decision.findMany({
    where: { projectId: id },
    orderBy: { madeAt: "desc" },
  });
  return NextResponse.json(decisions);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, { write: true });
  if (access.error) return access.error;

  let input;
  try {
    input = validateDecisionCreate(await req.json());
  } catch (err) {
    if (err instanceof DecisionValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not read the request body." }, { status: 400 });
  }

  try {
    const existing = await prisma.decision.findMany({
      where: { projectId: id },
      select: { decisionId: true },
    });

    const decision = await prisma.decision.create({
      data: { projectId: id, decisionId: nextDecisionId(existing.map((d) => d.decisionId)), ...input },
    });
    return NextResponse.json(decision, { status: 201 });
  } catch (err) {
    console.error("[decisions] create failed:", err);
    return NextResponse.json({ error: "Could not save the decision." }, { status: 500 });
  }
}
