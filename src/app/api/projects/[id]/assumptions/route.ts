export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const items = await prisma.$queryRaw<any[]>`
    SELECT * FROM assumptions WHERE "projectId" = ${id}
    ORDER BY "sortOrder" ASC, "createdAt" ASC
  `;
  return NextResponse.json(items);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const body = await req.json();
  const { statement, category = "general" } = body as { statement?: string; category?: string };
  if (!statement?.trim()) return NextResponse.json({ error: "statement required" }, { status: 400 });

  const [countRow] = await prisma.$queryRaw<[{ c: bigint }]>`SELECT COUNT(*)::bigint AS c FROM assumptions WHERE "projectId" = ${id}`;
  const sortOrder = Number(countRow.c);
  const newId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const now = new Date();

  await prisma.$executeRaw`
    INSERT INTO assumptions (id, "projectId", statement, category, source, status, "sortOrder", "createdAt", "updatedAt")
    VALUES (${newId}, ${id}, ${statement.trim()}, ${category}, 'manual', 'open', ${sortOrder}, ${now}, ${now})
  `;
  const [item] = await prisma.$queryRaw<any[]>`SELECT * FROM assumptions WHERE id = ${newId}`;
  return NextResponse.json(item, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const { assumptionId, statement, category, status } = await req.json();
  if (!assumptionId) return NextResponse.json({ error: "assumptionId required" }, { status: 400 });

  const existing = await prisma.$queryRaw<any[]>`SELECT id FROM assumptions WHERE id = ${assumptionId} AND "projectId" = ${id}`;
  if (existing.length === 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const now = new Date();
  if (statement !== undefined) await prisma.$executeRaw`UPDATE assumptions SET statement = ${statement}, "updatedAt" = ${now} WHERE id = ${assumptionId}`;
  if (category !== undefined) await prisma.$executeRaw`UPDATE assumptions SET category = ${category}, "updatedAt" = ${now} WHERE id = ${assumptionId}`;
  if (status !== undefined) await prisma.$executeRaw`UPDATE assumptions SET status = ${status}, "updatedAt" = ${now} WHERE id = ${assumptionId}`;

  const [updated] = await prisma.$queryRaw<any[]>`SELECT * FROM assumptions WHERE id = ${assumptionId}`;
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const { searchParams } = new URL(req.url);
  const assumptionId = searchParams.get("assumptionId");
  if (!assumptionId) return NextResponse.json({ error: "assumptionId required" }, { status: 400 });

  await prisma.$executeRaw`DELETE FROM assumptions WHERE id = ${assumptionId} AND "projectId" = ${id}`;
  return NextResponse.json({ ok: true });
}
