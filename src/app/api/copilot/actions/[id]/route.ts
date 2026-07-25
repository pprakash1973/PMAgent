export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateArtifactForProject } from "@/lib/generate-artifact-for-project";

// PATCH — confirm (Tier C), undo (Tier B), or dismiss
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const { operation, projectId } = await req.json();

  const action = await prisma.assistantAction.findUnique({ where: { id } });
  if (!action) return NextResponse.json({ error: "Action not found" }, { status: 404 });

  if (operation === "confirm" && action.tier === "c") {
    const payload = action.payload as any;

    if (action.actionType === "REGEN_ARTIFACT") {
      const result = await generateArtifactForProject(
        payload.projectId || projectId,
        payload.artifactType,
        session.user.id!
      );
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

      await prisma.assistantAction.update({
        where: { id },
        data: { status: "confirmed", confirmedAt: new Date() },
      });
      return NextResponse.json({ action: { ...action, status: "confirmed" }, artifact: result.artifact });
    }

    return NextResponse.json({ error: "Unknown Tier C action type" }, { status: 400 });
  }

  if (operation === "undo" && action.tier === "b") {
    const payload = action.payload as any;
    try {
      if (action.actionType === "LOG_RISK" && payload.riskId)
        await prisma.risk.delete({ where: { id: payload.riskId } });
      else if (action.actionType === "LOG_ISSUE" && payload.issueId)
        await (prisma as any).issue.delete({ where: { id: payload.issueId } });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    await prisma.assistantAction.update({
      where: { id },
      data: { status: "undone", undoneAt: new Date() },
    });
    return NextResponse.json({ action: { ...action, status: "undone" } });
  }

  if (operation === "dismiss") {
    await prisma.assistantAction.update({ where: { id }, data: { status: "dismissed" } });
    return NextResponse.json({ action: { ...action, status: "dismissed" } });
  }

  return NextResponse.json({ error: "Invalid operation" }, { status: 400 });
}

async function undoTierBAction(action: any, projectId: string, user: any) {
  const payload = action.payload as any;

  if (action.actionType === "LOG_RISK" && payload.riskId) {
    await prisma.risk.delete({ where: { id: payload.riskId } });
    return { ok: true, data: null };
  }

  if (action.actionType === "LOG_ISSUE" && payload.issueId) {
    await prisma.issue.delete({ where: { id: payload.issueId } });
    return { ok: true, data: null };
  }

  return { ok: false, error: "Cannot undo this action type" };
}
