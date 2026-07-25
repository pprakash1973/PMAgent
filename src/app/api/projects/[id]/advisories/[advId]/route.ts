import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; advId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, advId } = await params;
  const body = await req.json();
  const { action, dismissalReason, deferUntil } = body as {
    action: "accept" | "dismiss" | "defer";
    dismissalReason?: string;
    deferUntil?: string;
  };

  const advisory = await (prisma as any).advisory.findFirst({
    where: { id: advId, projectId: id },
  });
  if (!advisory) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  let newState: string;
  let deferredUntil: Date | null = null;

  if (action === "accept") {
    newState = "accepted";
  } else if (action === "dismiss") {
    newState = "dismissed";
  } else if (action === "defer") {
    newState = "deferred";
    deferredUntil = deferUntil ? new Date(deferUntil) : new Date(Date.now() + 28 * 86_400_000);
  } else {
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  }

  // Update advisory state
  const updated = await (prisma as any).advisory.update({
    where: { id: advId },
    data: {
      state: newState,
      stateChangedAt: new Date(),
      ...(deferredUntil ? { deferredUntil } : {}),
    },
  });

  // Log the action
  await (prisma as any).advisoryAction.create({
    data: {
      id: randomUUID(),
      advisoryId: advId,
      action,
      dismissalReason: dismissalReason ?? null,
    },
  });

  // If accepting a risk gap draft, create a stub risk
  if (action === "accept" && advisory.tab === "risk" && advisory.draftPayload) {
    let draft: any = null;
    try { draft = JSON.parse(advisory.draftPayload); } catch { /* noop */ }
    if (draft && (draft.category || draft.description)) {
      try {
        const existing = await prisma.risk.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } });
        const nextNum = String(existing.length + 1).padStart(3, "0");
        await prisma.risk.create({
          data: {
            id: randomUUID(),
            projectId: id,
            riskId: `R-${nextNum}`,
            description: draft.description ?? "[Advisory-generated stub — complete this entry]",
            category: draft.category ?? null,
            probability: "medium",
            impact: "medium",
            status: "open",
            mitigation: draft.mitigation ?? null,
            owner: draft.owner ?? null,
          },
        });
      } catch { /* noop */ }
    }
  }

  // If accepting an issue draft patch (owner or resolution)
  if (action === "accept" && (advisory.tab === "issues") && advisory.objectId && advisory.draftPayload) {
    let draft: any = null;
    try { draft = JSON.parse(advisory.draftPayload); } catch { /* noop */ }
    if (draft) {
      const patch: any = {};
      if (draft.owner) patch.owner = draft.owner;
      if (draft.resolution) patch.resolution = draft.resolution;
      if (Object.keys(patch).length > 0) {
        try {
          await prisma.issue.update({ where: { id: advisory.objectId }, data: patch });
        } catch { /* noop */ }
      }
    }
  }

  return NextResponse.json({ advisory: updated });
}
