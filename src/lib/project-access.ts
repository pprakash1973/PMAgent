import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type AccessUser = {
  id: string;
  orgId: string;
  role: string;
  email?: string | null;
  name?: string | null;
};

type Ok = { user: AccessUser; orgId: string; error?: never };
type Err = { error: NextResponse; user?: never; orgId?: never };

/**
 * Resolves the caller and guarantees a tenant boundary.
 *
 * SEC: every route that reads or mutates tenant data must call this (or
 * `requireProjectAccess`) — `auth()` alone proves identity, never authorisation.
 */
export async function requireUser(): Promise<Ok | Err> {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  }
  const u = session.user as Partial<AccessUser> & { id?: string };
  // Fail closed: a session without an orgId cannot be scoped to a tenant.
  if (!u.orgId) {
    return { error: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
  }
  return {
    user: {
      id: u.id ?? "",
      orgId: u.orgId,
      role: u.role ?? "pm",
      email: u.email ?? null,
      name: u.name ?? null,
    },
    orgId: u.orgId,
  };
}

type ProjectOk = { user: AccessUser; orgId: string; projectId: string; error?: never };

/**
 * Authorises access to a single project.
 *
 * Enforces the tenant boundary (project.orgId === caller.orgId) and returns 404 —
 * not 403 — on a cross-tenant miss so project IDs cannot be enumerated.
 */
export async function requireProjectAccess(
  projectId: string,
  opts: { write?: boolean } = {}
): Promise<ProjectOk | Err> {
  const ctx = await requireUser();
  if (ctx.error) return { error: ctx.error };
  const { user, orgId } = ctx;

  const project = await prisma.project.findFirst({
    where: { id: projectId, orgId, deletedAt: null },
    select: { id: true, pmOwnerId: true },
  });

  if (!project) {
    return { error: NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 }) };
  }

  // PgM and DH are read-only on project data (pre-existing rule, now centralised)
  if (opts.write && (user.role === "pgm" || user.role === "dh")) {
    return {
      error: NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Program Managers and Delivery Heads cannot edit project data" } },
        { status: 403 }
      ),
    };
  }

  return { user, orgId, projectId: project.id };
}
