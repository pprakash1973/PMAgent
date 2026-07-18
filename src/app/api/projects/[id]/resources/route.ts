export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const resources = await prisma.projectResource.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(resources);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
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
