export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const resources = await prisma.projectResource.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(resources);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const body = await req.json();
  const resource = await prisma.projectResource.create({
    data: {
      projectId: id,
      name: body.name,
      role: body.role,
      email: body.email || null,
      allocationPct: body.allocationPct ?? 100,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      ratePerDay: body.ratePerDay ? Number(body.ratePerDay) : null,
      skills: body.skills || null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(resource, { status: 201 });
}
