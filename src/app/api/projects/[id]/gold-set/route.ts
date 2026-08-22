export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";
import { requireProjectAccess } from "@/lib/project-access";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

  const url = new URL(req.url);
  const artifactType = url.searchParams.get("artifactType");

  const db = prisma as any;
  const entries = await db.comparisonGoldEntry.findMany({
    where: { projectId: id, ...(artifactType ? { artifactType } : {}) },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(entries);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const user = access.user;

  const {
    artifactType,
    leftItemTitle,
    rightItemTitle,
    expectedMatchDecision,
    expectedTemporalClass,
    notes,
  } = await req.json();

  if (!artifactType || !leftItemTitle || !expectedMatchDecision) {
    return NextResponse.json({ error: "artifactType, leftItemTitle, and expectedMatchDecision are required" }, { status: 400 });
  }

  if (!["match", "no_match"].includes(expectedMatchDecision)) {
    return NextResponse.json({ error: "expectedMatchDecision must be match or no_match" }, { status: 400 });
  }

  const db = prisma as any;
  const entry = await db.comparisonGoldEntry.create({
    data: {
      id: randomBytes(12).toString("hex"),
      projectId: id,
      artifactType,
      leftItemTitle,
      rightItemTitle: rightItemTitle ?? null,
      expectedMatchDecision,
      expectedTemporalClass: expectedTemporalClass ?? null,
      notes: notes ?? null,
      createdById: user.id,
      createdAt: new Date(),
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
