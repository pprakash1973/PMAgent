export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ARTIFACT_FORMAT } from "@/lib/utils";
import { buildXlsx } from "@/lib/export-xlsx";
import { buildPptx } from "@/lib/export-pptx";
import { buildDocx } from "@/lib/export-docx";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id, type } = await params;

  const [project, artifact] = await Promise.all([
    prisma.project.findUnique({ where: { id }, select: { name: true } }),
    prisma.artifact.findFirst({ where: { projectId: id, artifactType: type } }),
  ]);

  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!artifact?.content) return NextResponse.json({ error: "ARTIFACT_NOT_GENERATED" }, { status: 404 });

  const content = artifact.content as Record<string, unknown>;
  const format = ARTIFACT_FORMAT[type] ?? "docx";
  const safeName = `${project.name.replace(/[^a-z0-9]/gi, "_").slice(0, 30)}_${type}`;

  try {
    let buf: Buffer;
    let mimeType: string;
    let ext: string;

    if (format === "xlsx") {
      buf = buildXlsx(type, content);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (format === "pptx") {
      buf = await buildPptx(type, content, project.name);
      mimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      ext = "pptx";
    } else {
      buf = await buildDocx(type, content);
      mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      ext = "docx";
    }

    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${safeName}.${ext}"`,
      },
    });
  } catch (err: any) {
    console.error("export error:", err);
    return NextResponse.json({ error: err.message || "Export failed" }, { status: 500 });
  }
}
