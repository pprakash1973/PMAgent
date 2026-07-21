export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ARTIFACT_FORMAT } from "@/lib/utils";
import { buildWbsXlsx } from "@/lib/export-wbs-xlsx";
import { buildRtmXlsx } from "@/lib/export-rtm-xlsx";
import { buildEvmXlsx } from "@/lib/export-evm-xlsx";
import { buildRiskRegisterXlsx, buildIssueRegisterXlsx } from "@/lib/export-risk-issue-xlsx";
import {
  buildRaidRegisterXlsx,
  buildScheduleXlsx,
  buildBudgetXlsx,
  buildRaciMatrixXlsx,
  buildChangeLogXlsx,
  buildLessonsLearnedXlsx,
  buildStakeholderRegisterXlsx,
  buildResourcePlanXlsx,
  buildGenericLogXlsx,
} from "@/lib/export-all-xlsx";
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

    if (type === "risk_register") {
      buf = await buildRiskRegisterXlsx(content);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "issue_register") {
      buf = await buildIssueRegisterXlsx(content);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "evm_analysis") {
      buf = await buildEvmXlsx(content);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "traceability_matrix") {
      buf = await buildRtmXlsx(content);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "wbs") {
      buf = await buildWbsXlsx(content);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "raid_register") {
      buf = await buildRaidRegisterXlsx(content);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "schedule" || type === "milestone_plan") {
      buf = await buildScheduleXlsx(content);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "budget" || type === "cost_plan") {
      buf = await buildBudgetXlsx(content);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "raci_matrix") {
      buf = await buildRaciMatrixXlsx(content);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "change_log") {
      buf = await buildChangeLogXlsx(content);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "lessons_learned" || type === "close_report") {
      buf = await buildLessonsLearnedXlsx(content);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "stakeholder_register") {
      buf = await buildStakeholderRegisterXlsx(content);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "resource_plan") {
      buf = await buildResourcePlanXlsx(content);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "action_log") {
      buf = await buildGenericLogXlsx(content, "Action Log",
        ["id","action","owner","dueDate","priority","status","outcome"],
        ["ID","Action","Owner","Due Date","Priority","Status","Outcome"]);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "decision_log") {
      buf = await buildGenericLogXlsx(content, "Decision Log",
        ["id","decision","rationale","decidedBy","decisionDate","impact","status"],
        ["ID","Decision","Rationale","Decided By","Decision Date","Impact","Status"]);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "assumption_log") {
      buf = await buildGenericLogXlsx(content, "Assumption Log",
        ["id","assumption","category","owner","validationDate","status","impactIfWrong"],
        ["ID","Assumption","Category","Owner","Validation Date","Status","Impact If Wrong"]);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (type === "benefits_register") {
      buf = await buildGenericLogXlsx(content, "Benefits Register",
        ["id","benefit","category","owner","plannedDate","actualDate","status","value"],
        ["ID","Benefit","Category","Owner","Planned Date","Actual Date","Status","Value"]);
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (format === "xlsx") {
      // Fallback: should not reach here for xlsx types — all are handled above
      buf = await buildGenericLogXlsx(content, type,
        Object.keys((Object.values(content)[0] as any[])?.[0] ?? {}),
        Object.keys((Object.values(content)[0] as any[])?.[0] ?? {}));
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
