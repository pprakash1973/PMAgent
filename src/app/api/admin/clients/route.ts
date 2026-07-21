export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const schema = z.object({
  clusterId: z.string().min(1),
  name: z.string().min(1),
  industry: z.string().optional(),
  region: z.string().default("other"),
  accountOwner: z.string().optional(),
});

export async function GET() {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const clients = await prisma.client.findMany({
    where: { orgId: (user as any).orgId, deletedAt: null },
    include: {
      cluster: { select: { id: true, name: true, type: true } },
      _count: { select: { programs: true, projects: true } },
    },
    orderBy: [{ cluster: { name: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;
  const admin = user as any;

  const body = await req.json();
  const data = schema.parse(body);

  const code = "CLI-" + data.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) + "-" + Date.now().toString(36).toUpperCase().slice(-4);

  const client = await prisma.client.create({
    data: {
      orgId: admin.orgId,
      clusterId: data.clusterId,
      name: data.name,
      code,
      industry: data.industry,
      region: data.region,
      accountOwner: data.accountOwner,
      createdBy: admin.id,
    },
    include: { cluster: { select: { id: true, name: true } } },
  });

  return NextResponse.json(client, { status: 201 });
}
