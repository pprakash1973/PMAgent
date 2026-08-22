/**
 * Tenant-isolation guard for every route under /api/projects/[id].
 *
 * Authenticating the caller is not enough: without an organisation check, any logged-in
 * user of any tenant could read and modify another tenant's project by supplying its id.
 * That gap existed across most project routes; this helper is the single place the rule
 * now lives, so it cannot drift per-route again.
 *
 * A project in another org returns 404, never 403 — 403 would confirm the id exists and
 * turn the endpoint into an existence oracle.
 *
 * Usage:
 *
 *   const access = await requireProjectAccess(id);
 *   if ("error" in access) return access.error;
 *   const { user, project } = access;
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export interface SessionUser {
  id: string;
  orgId: string;
  role: string;
  email?: string | null;
  name?: string | null;
}

export interface ProjectRef {
  id: string;
  orgId: string;
  name: string;
}

export type ProjectAccess =
  | { error: NextResponse; user?: undefined; project?: undefined }
  | { error?: undefined; user: SessionUser; project: ProjectRef };

const unauthorized = () =>
  NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

const notFound = () =>
  NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

/**
 * Verifies the caller is signed in AND the project belongs to their organisation.
 */
export async function requireProjectAccess(projectId: string): Promise<ProjectAccess> {
  const session = await auth();
  if (!session?.user) return { error: unauthorized() };

  const user = session.user as unknown as SessionUser;
  if (!user.orgId) return { error: unauthorized() };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, orgId: true, name: true },
  });

  if (!project || project.orgId !== user.orgId) return { error: notFound() };

  return { user, project };
}

/**
 * As above, plus a write gate. Program Managers and Delivery Heads are read-only on
 * project data — that rule was enforced ad hoc in a few handlers and missing from the
 * rest, so it lives here alongside the org check.
 */
export async function requireProjectWriteAccess(projectId: string): Promise<ProjectAccess> {
  const access = await requireProjectAccess(projectId);
  if (access.error) return access;

  if (access.user.role === "pgm" || access.user.role === "dh") {
    return {
      error: NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Program Managers and Delivery Heads cannot edit project data" } },
        { status: 403 }
      ),
    };
  }
  return access;
}
