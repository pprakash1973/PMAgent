export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildPptx } from "@/lib/export-pptx";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;

  const [project, report] = await Promise.all([
    prisma.project.findUnique({ where: { id }, select: { name: true } }),
    prisma.statusReport.findFirst({
      where: { projectId: id },
      orderBy: { submittedAt: "desc" },
      include: { healthScore: true },
    }),
  ]);

  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!report) return NextResponse.json({ error: "NO_STATUS_REPORT" }, { status: 404 });

  // Build content from the stored rawInput + AI summary fields
  const raw = (report.rawInput as Record<string, unknown>) ?? {};
  const content = {
    ...raw,
    ragStatus: report.ragStatus,
    aiSummary: report.aiSummary,
    reportDate: report.submittedAt,
    healthScore: report.healthScore?.compositeScore ?? null,
    spi: report.healthScore?.spi ?? null,
    cpi: report.healthScore?.cpi ?? null,
  };

  try {
    const buf = await buildPptx("weekly_status", content, project.name);
    const safeName = `${project.name.replace(/[^a-z0-9]/gi, "_").slice(0, 30)}_WSR`;
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${safeName}.pptx"`,
      },
    });
  } catch (err: any) {
    console.error("WSR export error:", err);
    return NextResponse.json({ error: err.message || "Export failed" }, { status: 500 });
  }
}
