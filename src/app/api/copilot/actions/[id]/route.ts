export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
    // Execute the Tier C action
    const result = await executeTierCAction(action, projectId, session.user as any);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await prisma.assistantAction.update({
      where: { id },
      data: { status: "confirmed", confirmedAt: new Date() },
    });
    return NextResponse.json({ action: { ...action, status: "confirmed" }, result: result.data });
  }

  if (operation === "undo" && action.tier === "b") {
    const result = await undoTierBAction(action, projectId, session.user as any);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

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

async function executeTierCAction(action: any, projectId: string, user: any) {
  const payload = action.payload as any;

  if (action.actionType === "REGEN_ARTIFACT") {
    try {
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const res = await fetch(`${baseUrl}/api/projects/${projectId}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-copilot-internal": "1" },
        body: JSON.stringify({ artifactType: payload.artifactType }),
      });
      if (!res.ok) {
        const err = await res.json();
        return { ok: false, error: err.error?.message || "Generation failed" };
      }
      const data = await res.json();
      return { ok: true, data };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  return { ok: false, error: "Unknown action type" };
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
