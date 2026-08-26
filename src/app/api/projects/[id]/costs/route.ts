import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";
import { requireProjectAccess } from "@/lib/project-access";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;
  const { id } = await params;
  const entries = await prisma.costEntry.findMany({
    where: { projectId: id },
    orderBy: { date: "asc" },
  });
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;
  const { id } = await params;
  const body = await req.json();
  const { date, amount, category = "labor", description } = body;
  if (!date || amount == null) return NextResponse.json({ error: "date and amount required" }, { status: 400 });
  const entry = await prisma.costEntry.create({
    data: {
      id: randomUUID(),
      projectId: id,
      date: new Date(date),
      amount: Number(amount),
      category,
      description: description ?? null,
    },
  });
  return NextResponse.json(entry, { status: 201 });
}
