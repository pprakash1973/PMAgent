export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const updateSchema = z.object({
  name:           z.string().min(1).optional(),
  description:    z.string().optional().nullable(),
  artifactType:   z.string().min(1).optional(),
  scope:          z.enum(["global", "account"]).optional(),
  accountId:      z.string().optional().nullable(),
  systemAddendum: z.string().optional().nullable(),
  userAddendum:   z.string().optional().nullable(),
  isActive:       z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { error, user } = await requireAdmin();
  if (error) return error;
  const { templateId } = await params;
  const db = prisma as any;
  const template = await db.artifactTemplate.findFirst({
    where: { id: templateId, orgId: (user as any).orgId },
    include: { account: { select: { id: true, name: true, code: true } } },
  });
  if (!template) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { error, user } = await requireAdmin();
  if (error) return error;
  const { templateId } = await params;
  const body = await req.json();
  const data = updateSchema.parse(body);
  const db = prisma as any;

  const existing = await db.artifactTemplate.findFirst({
    where: { id: templateId, orgId: (user as any).orgId },
  });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const updated = await db.artifactTemplate.update({
    where: { id: templateId },
    data: {
      ...(data.name !== undefined          && { name: data.name }),
      ...(data.description !== undefined   && { description: data.description }),
      ...(data.artifactType !== undefined  && { artifactType: data.artifactType }),
      ...(data.scope !== undefined         && { scope: data.scope }),
      ...(data.accountId !== undefined     && { accountId: data.accountId }),
      ...(data.systemAddendum !== undefined && { systemAddendum: data.systemAddendum }),
      ...(data.userAddendum !== undefined  && { userAddendum: data.userAddendum }),
      ...(data.isActive !== undefined      && { isActive: data.isActive }),
    },
    include: { account: { select: { id: true, name: true, code: true } } },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { error, user } = await requireAdmin();
  if (error) return error;
  const { templateId } = await params;
  const db = prisma as any;

  const existing = await db.artifactTemplate.findFirst({
    where: { id: templateId, orgId: (user as any).orgId },
  });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.artifactTemplate.delete({ where: { id: templateId } });
  return NextResponse.json({ deleted: true });
}
