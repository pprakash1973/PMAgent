export const dynamic = "force-dynamic";

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

  // Resolve DM and DH names — prefer assignment row, fall back to denormalized FK
  const cluster = project.cluster ?? (project.account as any)?.cluster ?? null;
  const dmAssignedName = (project.account as any)?.dmAssignments?.[0]?.user?.fullName ?? null;
  const dhAssignedName = cluster?.clusterAssignments?.[0]?.user?.fullName ?? null;

  const [resolvedDm, resolvedDh] = await Promise.all([
    dmAssignedName ? null : ((project.account as any)?.primaryDmId
      ? prisma.user.findUnique({ where: { id: (project.account as any).primaryDmId }, select: { fullName: true } })
      : null),
    dhAssignedName ? null : (cluster?.primaryDhId
      ? prisma.user.findUnique({ where: { id: cluster.primaryDhId }, select: { fullName: true } })
      : null),
  ]);

  const serialized = JSON.parse(JSON.stringify(project));
  serialized._resolvedDmName = dmAssignedName ?? resolvedDm?.fullName ?? null;
  serialized._resolvedDhName = dhAssignedName ?? resolvedDh?.fullName ?? null;

  return (
    <WorkspaceClient
      project={serialized}
      catalog={ARTIFACT_CATALOG}
    />
  );
}
