import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";
import { nextSequentialId } from "@/lib/sequential-id";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const issues = await prisma.issue.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(issues);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const body = await req.json();
  const existing = await prisma.issue.findMany({ where: { projectId: id }, select: { issueId: true } });
  const issue = await prisma.issue.create({
    data: {
      projectId: id,
      issueId: nextSequentialId(existing.map((i) => i.issueId), "I"),
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
