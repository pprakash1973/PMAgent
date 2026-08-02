import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const issues = await prisma.issue.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(issues);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const count = await prisma.issue.count({ where: { projectId: id } });
  const issue = await prisma.issue.create({
    data: {
      projectId: id,
      issueId: `I-${String(count + 1).padStart(3, "0")}`,
      description: body.description,
      severity: body.severity || "medium",
      status: body.status || "open",
      owner: body.owner,
      // Accept both "resolution" and "resolutionPlan" field names
      resolution: body.resolution ?? body.resolutionPlan,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    },
  });
  return NextResponse.json(issue, { status: 201 });
}
