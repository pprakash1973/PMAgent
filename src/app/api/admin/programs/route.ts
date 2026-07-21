export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const schema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  sponsor: z.string().optional(),
  dmIds: z.array(z.string()).optional(),
});

export async function GET() {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const programs = await prisma.program.findMany({
    where: { orgId: (user as any).orgId, deletedAt: null },
    include: {
      client: { include: { cluster: { select: { id: true, name: true } } } },
      assignments: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      _count: { select: { projects: true } },
    },
    orderBy: [{ client: { cluster: { name: "asc" } } }, { client: { name: "asc" } }, { name: "asc" }],
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
      clientId: data.clientId,
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
      client: { include: { cluster: { select: { id: true, name: true } } } },
      assignments: { include: { user: { select: { id: true, fullName: true, email: true } } } },
    },
  });

  return NextResponse.json(program, { status: 201 });
}
