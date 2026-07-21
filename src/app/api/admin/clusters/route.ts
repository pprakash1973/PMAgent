export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1),
  type: z.enum(["geography", "industry", "service_line"]).default("geography"),
  clusterLead: z.string().optional(),
  description: z.string().optional(),
});

export async function GET() {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const clusters = await prisma.cluster.findMany({
    where: { orgId: (user as any).orgId, deletedAt: null },
    include: { _count: { select: { clients: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(clusters);
}

export async function POST(req: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;
  const admin = user as any;

  const body = await req.json();
  const data = schema.parse(body);

  const code = "CLU-" + data.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) + "-" + Date.now().toString(36).toUpperCase().slice(-4);

  const cluster = await prisma.cluster.create({
    data: {
      orgId: admin.orgId,
      name: data.name,
      code,
      type: data.type,
      clusterLead: data.clusterLead,
      description: data.description,
      createdBy: admin.id,
    },
  });

  return NextResponse.json(cluster, { status: 201 });
}
