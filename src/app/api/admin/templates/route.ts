export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const createSchema = z.object({
  name:           z.string().min(1, "Name is required"),
  description:    z.string().optional(),
  artifactType:   z.string().min(1, "Artifact type is required"),
  scope:          z.enum(["global", "account"]).default("global"),
  accountId:      z.string().optional().nullable(),
  systemAddendum: z.string().optional().nullable(),
  userAddendum:   z.string().optional().nullable(),
  isActive:       z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const artifactType = searchParams.get("artifactType");
  const scope = searchParams.get("scope");
  const accountId = searchParams.get("accountId");

  const where: any = { orgId: (user as any).orgId };
  if (artifactType) where.artifactType = artifactType;
  if (scope) where.scope = scope;
  if (accountId) where.accountId = accountId;

  const db = prisma as any;
  const templates = await db.artifactTemplate.findMany({
    where,
    include: {
      account: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ scope: "asc" }, { artifactType: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const data = createSchema.parse(body);

  if (data.scope === "account" && !data.accountId) {
    return NextResponse.json({ error: "accountId is required when scope is account" }, { status: 400 });
  }

  const db = prisma as any;
  const template = await db.artifactTemplate.create({
    data: {
      orgId:          (user as any).orgId,
      name:           data.name,
      description:    data.description ?? null,
      artifactType:   data.artifactType,
      scope:          data.scope,
      accountId:      data.scope === "account" ? (data.accountId ?? null) : null,
      systemAddendum: data.systemAddendum ?? null,
      userAddendum:   data.userAddendum ?? null,
      isActive:       data.isActive,
      createdBy:      (user as any).id,
    },
    include: {
      account: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json(template, { status: 201 });
}
