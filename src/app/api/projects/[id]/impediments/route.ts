export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  sprintId: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: projectId } = await params;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const db = prisma as any;

  const where: Record<string, unknown> = { projectId };
  if (status) where.status = status;

  const impediments = await db.impediment.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(impediments);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: projectId } = await params;
  const db = prisma as any;
  const user = session.user as any;
  const body = await req.json();
  const data = createSchema.parse(body);

  const impediment = await db.impediment.create({
    data: {
      projectId,
      sprintId: data.sprintId,
      title: data.title,
      description: data.description,
      severity: data.severity,
      status: "open",
      raisedBy: user.id,
    },
  });

  return NextResponse.json(impediment, { status: 201 });
}
