import { prisma } from "@/lib/db";

/**
 * Canonical resolver for a project's Delivery Manager and Delivery Head.
 *
 * "Who is the DM of this account / DH of this cluster?" is a single question that
 * was previously answered in several places with drifting logic (the project page
 * only checked isPrimary assignments + the denormalised FK, while the primary-dm API
 * had a full fallback chain). That drift is what produced empty DM/DH names on
 * projects whose owner was assigned without the isPrimary flag.
 *
 * This helper is the ONE place that logic lives. Read order is deterministic:
 *   1. Primary assignment (isPrimary = true), active user
 *   2. Denormalised primaryDmId / primaryDhId, active user
 *   3. ANY active account/cluster assignment (dm/pgm for DM), lead by assignedAt
 *   4. (DM only) any active dm/pgm assigned to a program under the account
 * so there is always a lead owner even when nobody set the primary flag.
 */

export type OwnerSource =
  | "primary_assignment"
  | "denormalized"
  | "assignment"
  | "program_assignment"
  | "none";

export interface ResolvedOwner {
  name: string | null;
  userId: string | null;
  source: OwnerSource;
}

function isUsable(u: { status?: string | null; deletedAt?: Date | null } | null | undefined): boolean {
  return !!u && u.status === "active" && !u.deletedAt;
}

export async function resolveDeliveryManager(accountId: string | null | undefined): Promise<ResolvedOwner> {
  if (!accountId) return { name: null, userId: null, source: "none" };

  const account = await prisma.orgAccount.findUnique({
    where: { id: accountId },
    select: {
      primaryDmId: true,
      dmAssignments: {
        select: {
          isPrimary: true,
          assignedAt: true,
          user: { select: { id: true, fullName: true, role: true, status: true, deletedAt: true } },
        },
        orderBy: [{ isPrimary: "desc" }, { assignedAt: "asc" }],
      },
    },
  });
  if (!account) return { name: null, userId: null, source: "none" };

  // 1. Primary assignment
  const primary = account.dmAssignments.find((a) => a.isPrimary && isUsable(a.user));
  if (primary) return { name: primary.user.fullName, userId: primary.user.id, source: "primary_assignment" };

  // 2. Denormalised FK
  if (account.primaryDmId) {
    const u = await prisma.user.findUnique({
      where: { id: account.primaryDmId },
      select: { id: true, fullName: true, status: true, deletedAt: true },
    });
    if (isUsable(u)) return { name: u!.fullName, userId: u!.id, source: "denormalized" };
  }

  // 3. Any active dm/pgm account assignment (already ordered isPrimary desc, assignedAt asc)
  const lead = account.dmAssignments.find(
    (a) => ["dm", "pgm"].includes(a.user.role) && isUsable(a.user)
  );
  if (lead) return { name: lead.user.fullName, userId: lead.user.id, source: "assignment" };

  // 4. Program-level fallback
  const progAssign = await prisma.programAssignment.findFirst({
    where: {
      program: { accountId },
      user: { role: { in: ["pgm", "dm"] }, status: "active", deletedAt: null },
    },
    orderBy: { assignedAt: "asc" },
    select: { user: { select: { id: true, fullName: true } } },
  });
  if (progAssign?.user) return { name: progAssign.user.fullName, userId: progAssign.user.id, source: "program_assignment" };

  return { name: null, userId: null, source: "none" };
}

/**
 * Re-materialise the denormalised delivery-owner cache on projects.
 *
 * The source of truth is AccountAssignment (DM) and ClusterAssignment (DH).
 * The Project.deliveryManager* / clusterHead* fields are a rebuildable cache so
 * aggregation reads are fast AND reassignment auto-flows: when an account's
 * primary DM changes, call this with { accountId } — every project on that
 * account is repointed to the new DM (the old DM loses access via scope queries),
 * without touching the projects individually.
 *
 * Pass accountId to resync all projects on that account's DM.
 * Pass clusterId to resync all projects in that cluster's DH.
 * Pass projectId to resync a single project (used at project creation).
 */
export async function syncProjectDeliveryOwners(opts: {
  accountId?: string | null;
  clusterId?: string | null;
  projectId?: string | null;
}): Promise<number> {
  const db = prisma as any;

  // Single project: resolve both owners from its own account/cluster.
  if (opts.projectId) {
    const project = await db.project.findUnique({
      where: { id: opts.projectId },
      select: { id: true, accountId: true, clusterId: true },
    });
    if (!project) return 0;
    const dm = await resolveDeliveryManager(project.accountId);
    const dh = await resolveDeliveryHead(project.clusterId);
    const dmUid = dm.userId ? await uidFor(dm.userId) : null;
    const dhUid = dh.userId ? await uidFor(dh.userId) : null;
    await db.project.update({
      where: { id: project.id },
      data: {
        deliveryManagerId: dm.userId, deliveryManagerUid: dmUid,
        clusterHeadId: dh.userId, clusterHeadUid: dhUid,
      },
    });
    return 1;
  }

  let count = 0;

  if (opts.accountId) {
    const dm = await resolveDeliveryManager(opts.accountId);
    const dmUid = dm.userId ? await uidFor(dm.userId) : null;
    const res = await db.project.updateMany({
      where: { accountId: opts.accountId, deletedAt: null },
      data: { deliveryManagerId: dm.userId, deliveryManagerUid: dmUid },
    });
    count += res.count ?? 0;
  }

  if (opts.clusterId) {
    const dh = await resolveDeliveryHead(opts.clusterId);
    const dhUid = dh.userId ? await uidFor(dh.userId) : null;
    const res = await db.project.updateMany({
      where: { clusterId: opts.clusterId, deletedAt: null },
      data: { clusterHeadId: dh.userId, clusterHeadUid: dhUid },
    });
    count += res.count ?? 0;
  }

  return count;
}

async function uidFor(_userId: string): Promise<string | null> {
  // uid field not present in this schema variant — callers tolerate null
  return null;
}

export async function resolveDeliveryHead(clusterId: string | null | undefined): Promise<ResolvedOwner> {
  if (!clusterId) return { name: null, userId: null, source: "none" };

  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
    select: {
      primaryDhId: true,
      clusterAssignments: {
        select: {
          isPrimary: true,
          assignedAt: true,
          user: { select: { id: true, fullName: true, role: true, status: true, deletedAt: true } },
        },
        orderBy: [{ isPrimary: "desc" }, { assignedAt: "asc" }],
      },
    },
  });
  if (!cluster) return { name: null, userId: null, source: "none" };

  // 1. Primary assignment
  const primary = cluster.clusterAssignments.find((a) => a.isPrimary && isUsable(a.user));
  if (primary) return { name: primary.user.fullName, userId: primary.user.id, source: "primary_assignment" };

  // 2. Denormalised FK
  if (cluster.primaryDhId) {
    const u = await prisma.user.findUnique({
      where: { id: cluster.primaryDhId },
      select: { id: true, fullName: true, status: true, deletedAt: true },
    });
    if (isUsable(u)) return { name: u!.fullName, userId: u!.id, source: "denormalized" };
  }

  // 3. Any active dh cluster assignment
  const lead = cluster.clusterAssignments.find((a) => a.user.role === "dh" && isUsable(a.user))
    ?? cluster.clusterAssignments.find((a) => isUsable(a.user));
  if (lead) return { name: lead.user.fullName, userId: lead.user.id, source: "assignment" };

  return { name: null, userId: null, source: "none" };
}
