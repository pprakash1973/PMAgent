export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateProjectFromNL } from "@/lib/ai";
import { DEFAULT_DETAILED_ARTIFACTS, DEFAULT_HIGH_LEVEL_ARTIFACTS } from "@/lib/utils";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  naturalLanguage: z.string().optional(),
  customer: z.string().optional(),
  clientId: z.string().optional(),
  programId: z.string().optional(),
  pmOwnerId: z.string().optional(),
  projectType: z.string().default("fixed_price"),
  methodology: z.string().default("waterfall"),
  engagementMode: z.enum(["detailed", "high_level"]).default("detailed"),
  industry: z.string().optional(),
  projectSize: z.string().optional(),
  budget: z.number().optional(),
  currency: z.string().default("USD"),
  deliveryModel: z.string().optional(),
  teamSize: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
  externalExecutionTool: z.string().optional(),
  // Requirements doc fields (from file upload flow)
  requirementsText: z.string().optional(),
  requirementsFileName: z.string().optional(),
  requirementsFileFormat: z.string().optional(),
  requirementsExtracted: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const user = session.user as any;

  let where: Record<string, unknown> = { orgId: user.orgId, deletedAt: null };

  if (user.role === "pm") {
    where.pmOwnerId = user.id;
  } else if (user.role === "pgm") {
    const programAssignments = await prisma.programAssignment.findMany({
      where: { userId: user.id },
      select: { programId: true },
    });
    where.programId = { in: programAssignments.map((a) => a.programId) };
  } else if (user.role === "dh") {
    const clientAssignments = await prisma.clientAssignment.findMany({
      where: { userId: user.id },
      select: { clientId: true },
    });
    where.clientId = { in: clientAssignments.map((a) => a.clientId) };
  }

  const projects = await prisma.project.findMany({
    where,
    include: {
      pmOwner: { select: { fullName: true, email: true } },
      milestones: { where: { status: "pending" }, orderBy: { dueDate: "asc" }, take: 3 },
      _count: { select: { risks: true, issues: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const user = session.user as any;

  try {
    const body = await req.json();
    let data = createSchema.parse(body);

    // If natural language, enrich with AI
    if (data.naturalLanguage && !data.name) {
      const inferred = await generateProjectFromNL(data.naturalLanguage);
      data = {
        ...data,
        name: (inferred.name as string) || "New Project",
        customer: (inferred.customer as string) || data.customer,
        projectType: (inferred.projectType as string) || data.projectType,
        methodology: (inferred.methodology as string) || data.methodology,
        industry: (inferred.industry as string) || data.industry,
        projectSize: (inferred.projectSize as string) || data.projectSize,
        budget: (inferred.budget as number) || data.budget,
        teamSize: (inferred.teamSize as number) || data.teamSize,
        description: (inferred.description as string) || data.description,
        startDate: (inferred.startDate as string) || data.startDate,
        endDate: (inferred.endDate as string) || data.endDate,
      };
    }

    if (!data.name) {
      return NextResponse.json({ error: { code: "VALIDATION", message: "Project name is required" } }, { status: 400 });
    }

    // Generate unique code if not provided
    const code = data.code || data.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) + "-" + Date.now().toString(36).toUpperCase();

    // Resolve pmOwnerId: DM/DH can specify a PM; PM and admin default to self
    let pmOwnerId = user.id;
    if ((user.role === "pgm" || user.role === "dh" || user.role === "admin") && data.pmOwnerId) {
      pmOwnerId = data.pmOwnerId;
    }

    // PM: auto-resolve programId from their single assignment
    let resolvedProgramId = data.programId;
    let resolvedClientId = data.clientId;
    if (user.role === "pm" && !resolvedProgramId) {
      const assignment = await prisma.programAssignment.findFirst({
        where: { userId: user.id },
        include: { program: { include: { client: true } } },
      });
      if (assignment) {
        resolvedProgramId = assignment.programId;
        resolvedClientId = resolvedClientId || assignment.program.clientId;
      }
    }

    const project = await prisma.project.create({
      data: {
        orgId: user.orgId,
        pmOwnerId,
        name: data.name,
        code,
        clientId: resolvedClientId,
        programId: resolvedProgramId,
        customer: data.customer,
        projectType: data.projectType,
        methodology: data.methodology,
        engagementMode: data.engagementMode,
        externalExecutionTool: data.externalExecutionTool,
        industry: data.industry,
        projectSize: data.projectSize,
        budget: data.budget,
        currency: data.currency,
        deliveryModel: data.deliveryModel,
        teamSize: data.teamSize,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        description: data.description,
      },
    });

    // Create default artifact selections
    const defaults = data.engagementMode === "high_level"
      ? DEFAULT_HIGH_LEVEL_ARTIFACTS
      : DEFAULT_DETAILED_ARTIFACTS;

    const { ARTIFACT_CATALOG } = await import("@/lib/utils");
    await prisma.artifactSelection.createMany({
      data: ARTIFACT_CATALOG.map((a) => ({
        projectId: project.id,
        artifactType: a.type,
        selectionStatus: defaults.includes(a.type) ? "active" : "available",
      })),
    });

    // Save requirements document if file was uploaded
    if (data.requirementsText && data.requirementsFileName) {
      await prisma.requirementsDocument.create({
        data: {
          projectId: project.id,
          fileName: data.requirementsFileName,
          fileFormat: data.requirementsFileFormat || "txt",
          storageUri: `inline:${project.id}`,
          extractedContent: (data.requirementsExtracted ?? { rawText: data.requirementsText }) as object,
          pmConfirmed: true,
          uploadedById: user.id,
        },
      });
    }

    return NextResponse.json(
      { ...project, hasRequirements: !!data.requirementsText },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION", message: err.issues[0]?.message || "Validation error" } }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: "Internal error" } }, { status: 500 });
  }
}
