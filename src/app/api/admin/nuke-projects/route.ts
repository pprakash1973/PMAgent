export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  const expected = process.env.ADMIN_NUKE_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  // List projects first (outside transaction — read-only)
  const projects = await prisma.project.findMany({ select: { id: true, name: true } });

  // Delete all project-related data in dependency order — atomic so a mid-flight crash
  // never leaves the DB in a partially-deleted state.
  await prisma.$transaction([
    prisma.healthScore.deleteMany({}),
    prisma.projectResource.deleteMany({}),
    prisma.statusReport.deleteMany({}),
    prisma.costEntry.deleteMany({}),
    prisma.scheduleTask.deleteMany({}),
    prisma.backlogItem.deleteMany({}),
    prisma.sprint.deleteMany({}),
    prisma.milestone.deleteMany({}),
    prisma.changeRequest.deleteMany({}),
    prisma.issue.deleteMany({}),
    prisma.risk.deleteMany({}),
    prisma.integrationLink.deleteMany({}),
    prisma.artifactVersion.deleteMany({}),
    prisma.artifact.deleteMany({}),
    prisma.artifactSelection.deleteMany({}),
    prisma.requirementsDocument.deleteMany({}),
    prisma.project.deleteMany({}),
  ]);

  return NextResponse.json({ deleted: projects });
}
