export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  if (token !== "nuke-2026-pprakash") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // List projects first
  const projects = await prisma.project.findMany({ select: { id: true, name: true } });

  // Delete all project-related data in dependency order
  await prisma.artifactVersion.deleteMany({});
  await prisma.artifact.deleteMany({});
  await prisma.artifactSelection.deleteMany({});
  await prisma.requirementsDocument.deleteMany({});
  await prisma.project.deleteMany({});

  return NextResponse.json({ deleted: projects });
}
