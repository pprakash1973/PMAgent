export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const items = await prisma.$queryRaw<any[]>`
    SELECT * FROM dependencies WHERE "projectId" = ${id}
    ORDER BY "sortOrder" ASC, "createdAt" ASC
  `;
  return NextResponse.json(items);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { description, type = "external", owner, dueDate } = body as {
    description?: string; type?: string; owner?: string; dueDate?: string;
  };
  if (!description?.trim()) return NextResponse.json({ error: "description required" }, { status: 400 });

  const [countRow] = await prisma.$queryRaw<[{ c: bigint }]>`SELECT COUNT(*)::bigint AS c FROM dependencies WHERE "projectId" = ${id}`;
  const sortOrder = Number(countRow.c);
  const newId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const now = new Date();
  const dueDateVal = dueDate ? new Date(dueDate) : null;

  await prisma.$executeRaw`
    INSERT INTO dependencies (id, "projectId", description, type, owner, "dueDate", status, source, "sortOrder", "createdAt", "updatedAt")
    VALUES (${newId}, ${id}, ${description.trim()}, ${type}, ${owner ?? null}, ${dueDateVal}, 'open', 'manual', ${sortOrder}, ${now}, ${now})
  `;
  const [item] = await prisma.$queryRaw<any[]>`SELECT * FROM dependencies WHERE id = ${newId}`;
  return NextResponse.json(item, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const { dependencyId, description, type, owner, dueDate, status } = await req.json();
  if (!dependencyId) return NextResponse.json({ error: "dependencyId required" }, { status: 400 });

  const existing = await prisma.$queryRaw<any[]>`SELECT id FROM dependencies WHERE id = ${dependencyId} AND "projectId" = ${id}`;
  if (existing.length === 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const now = new Date();
  if (description !== undefined) await prisma.$executeRaw`UPDATE dependencies SET description = ${description}, "updatedAt" = ${now} WHERE id = ${dependencyId}`;
  if (type !== undefined) await prisma.$executeRaw`UPDATE dependencies SET type = ${type}, "updatedAt" = ${now} WHERE id = ${dependencyId}`;
  if (owner !== undefined) await prisma.$executeRaw`UPDATE dependencies SET owner = ${owner || null}, "updatedAt" = ${now} WHERE id = ${dependencyId}`;
  if (dueDate !== undefined) await prisma.$executeRaw`UPDATE dependencies SET "dueDate" = ${dueDate ? new Date(dueDate) : null}, "updatedAt" = ${now} WHERE id = ${dependencyId}`;
  if (status !== undefined) await prisma.$executeRaw`UPDATE dependencies SET status = ${status}, "updatedAt" = ${now} WHERE id = ${dependencyId}`;

  const [updated] = await prisma.$queryRaw<any[]>`SELECT * FROM dependencies WHERE id = ${dependencyId}`;
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const dependencyId = searchParams.get("dependencyId");
  if (!dependencyId) return NextResponse.json({ error: "dependencyId required" }, { status: 400 });

  await prisma.$executeRaw`DELETE FROM dependencies WHERE id = ${dependencyId} AND "projectId" = ${id}`;
  return NextResponse.json({ ok: true });
}
