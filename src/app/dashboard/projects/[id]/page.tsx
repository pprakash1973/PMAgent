export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { formatDate, formatCurrency, methodologyLabel, ARTIFACT_CATALOG } from "@/lib/utils";
import { WorkspaceClient } from "@/components/workspace-client";
import { resolveDeliveryManager, resolveDeliveryHead } from "@/lib/delivery-owners";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await auth();
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      pmOwner: { select: { fullName: true, email: true } },
      cluster: {
        select: {
          name: true,
          code: true,
          primaryDhId: true,
          clusterAssignments: {
            where: { isPrimary: true },
            select: { user: { select: { fullName: true } } },
            take: 1,
          },
        },
      },
      account: {
        select: {
          id: true,
          name: true,
          code: true,
          primaryDmId: true,
          dmAssignments: {
            where: { isPrimary: true },
            select: { user: { select: { fullName: true } } },
            take: 1,
          },
          cluster: {
            select: {
              name: true,
              code: true,
              primaryDhId: true,
              clusterAssignments: {
                where: { isPrimary: true },
                select: { user: { select: { fullName: true } } },
                take: 1,
              },
            },
          },
        },
      },
      program: { select: { id: true, name: true, code: true } },
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

  // Resolve DM and DH via the single canonical resolver (full fallback chain).
  // Cluster is denormalised onto the project at creation; fall back to the account's.
  const clusterId = project.clusterId ?? (project.account as any)?.clusterId ?? null;
  const [resolvedDm, resolvedDh] = await Promise.all([
    resolveDeliveryManager(project.accountId),
    resolveDeliveryHead(clusterId),
  ]);

  const serialized = JSON.parse(JSON.stringify(project));
  serialized._resolvedDmName = resolvedDm.name;
  serialized._resolvedDhName = resolvedDh.name;

  return (
    <WorkspaceClient
      project={serialized}
      catalog={ARTIFACT_CATALOG}
    />
  );
}
