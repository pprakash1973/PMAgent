export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const DOC_CLASS_POINTS: Record<string, number> = {
  sow: 30, brd: 25, srs: 20, estimation: 15, proposal: 10, contract: 10, cr: 5, other: 5,
};

const MANDATORY_CLASSES = ["sow", "brd"];

const CLASS_LABELS: Record<string, string> = {
  sow: "Statement of Work", brd: "Business Requirements", srs: "Software Requirements",
  estimation: "Estimation Sheet", proposal: "Proposal", contract: "Contract",
  cr: "Change Request", other: "Other",
};

function band(score: number) {
  if (score >= 70) return "strong";
  if (score >= 40) return "adequate";
  if (score >= 20) return "marginal";
  return "insufficient";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const docs = await prisma.requirementsDocument.findMany({
    where: { projectId: id, deletedAt: null, ingestionState: "ready" },
    select: { docClass: true, fileName: true, chunkCount: true },
  });

  const seenClasses = new Set(docs.map(d => d.docClass));
  let score = 0;
  for (const cls of seenClasses) score += DOC_CLASS_POINTS[cls] ?? 5;
  score = Math.min(score, 100);

  const missingMandatory = MANDATORY_CLASSES.filter(c => !seenClasses.has(c))
    .map(c => CLASS_LABELS[c]);

  const breakdown = Array.from(seenClasses).map(cls => ({
    docClass: cls,
    label: CLASS_LABELS[cls] ?? cls,
    points: DOC_CLASS_POINTS[cls] ?? 5,
    docCount: docs.filter(d => d.docClass === cls).length,
    totalChunks: docs.filter(d => d.docClass === cls).reduce((s, d) => s + d.chunkCount, 0),
  }));

  return NextResponse.json({
    score,
    band: band(score),
    missingMandatory,
    breakdown,
    totalDocs: docs.length,
    totalChunks: docs.reduce((s, d) => s + d.chunkCount, 0),
  });
}
