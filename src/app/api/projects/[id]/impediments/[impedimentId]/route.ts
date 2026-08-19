export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  status:      z.enum(["open", "escalated", "resolved"]).optional(),
  severity:    z.enum(["low", "medium", "high", "critical"]).optional(),
  description: z.string().max(2000).optional(),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; impedimentId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;

  const { id, impedimentId } = await params;
  const db = prisma as any;

  // Verify impediment belongs to the project and the project belongs to the user's org
  const impediment = await db.impediment.findUnique({
    where: { id: impedimentId },
    select: { id: true, projectId: true },
  });
  if (!impediment || impediment.projectId !== id)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const project = await prisma.project.findUnique({ where: { id }, select: { orgId: true } });
  if (!project || project.orgId !== user.orgId)
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", detail: parsed.error.issues[0]?.message }, { status: 400 });

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "resolved") data.resolvedAt = new Date();

  const updated = await db.impediment.update({ where: { id: impedimentId }, data });
  return NextResponse.json(updated);
}
