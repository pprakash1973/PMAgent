export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const schema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  sponsor: z.string().optional(),
  dmIds: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");

  const where: any = { orgId: (user as any).orgId, deletedAt: null };
  if (accountId) where.accountId = accountId;

  const programs = await prisma.program.findMany({
    where,
    include: {
      account: { include: { cluster: { select: { id: true, name: true } } } },
      assignments: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      _count: { select: { projects: true } },
    },
    orderBy: [{ account: { cluster: { name: "asc" } } }, { account: { name: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json(programs);
}

export async function POST(req: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;
  const admin = user as any;

  const body = await req.json();
  const data = schema.parse(body);

  const code = "PRG-" + data.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) + "-" + Date.now().toString(36).toUpperCase().slice(-4);

  const program = await prisma.program.create({
    data: {
      orgId: admin.orgId,
      accountId: data.accountId,
      name: data.name,
      code,
      description: data.description,
      sponsor: data.sponsor,
      createdBy: admin.id,
      assignments: data.dmIds?.length
        ? {
            create: data.dmIds.map((uid) => ({ userId: uid, assignedBy: admin.id })),
          }
        : undefined,
    },
    include: {
      account: { include: { cluster: { select: { id: true, name: true } } } },
      assignments: { include: { user: { select: { id: true, fullName: true, email: true } } } },
    },
  });

  return NextResponse.json(program, { status: 201 });
}
