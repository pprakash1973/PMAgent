import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { formatDate, formatCurrency, methodologyLabel, ARTIFACT_CATALOG } from "@/lib/utils";
import { WorkspaceClient } from "@/components/workspace-client";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await auth();
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      pmOwner: { select: { fullName: true, email: true } },
      milestones: { orderBy: { dueDate: "asc" } },
      risks: { where: { status: { not: "closed" } }, orderBy: { createdAt: "desc" }, take: 10 },
      issues: { where: { status: { not: "closed" } }, orderBy: { createdAt: "desc" }, take: 10 },
      artifacts: true,
      artifactSelections: true,
      statusReports: {
        orderBy: { reportDate: "desc" },
        take: 3,
        include: { healthScore: true },
      },
      requirementsDocs: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!project) notFound();

  return (
    <WorkspaceClient
      project={JSON.parse(JSON.stringify(project))}
      catalog={ARTIFACT_CATALOG}
    />
  );
}
