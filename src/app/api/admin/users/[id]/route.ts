export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const patchSchema = z.object({
  role: z.enum(["pm", "dm", "dh", "admin"]).optional(),
  fullName: z.string().optional(),
  programIds: z.array(z.string()).optional(),
  clientIds: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const data = patchSchema.parse(body);

  const updated = await prisma.user.update({
    where: { id },
    data: { ...(data.role && { role: data.role }), ...(data.fullName && { fullName: data.fullName }) },
  });

  const role = data.role ?? updated.role;

  if (data.programIds !== undefined && (role === "pm" || role === "dm")) {
    await prisma.programAssignment.deleteMany({ where: { userId: id } });
    if (data.programIds.length) {
      await prisma.programAssignment.createMany({
        data: data.programIds.map((pid) => ({
          programId: pid,
          userId: id,
          assignedBy: (admin as any).id,
        })),
        skipDuplicates: true,
      });
    }
  }

  if (data.clientIds !== undefined && role === "dh") {
    await prisma.clientAssignment.deleteMany({ where: { userId: id } });
    if (data.clientIds.length) {
      await prisma.clientAssignment.createMany({
        data: data.clientIds.map((cid) => ({
          clientId: cid,
          userId: id,
          assignedBy: (admin as any).id,
        })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  await prisma.user.update({ where: { id }, data: { status: "deactivated", deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
