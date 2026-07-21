export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const patchSchema = z.object({
  role: z.enum(["pm", "dm", "dh", "admin"]).optional(),
  fullName: z.string().optional(),
  programIds: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const data = patchSchema.parse(body);

  const updated = await prisma.user.update({
    where: { id },
    data: { role: data.role, fullName: data.fullName },
  });

  if (data.programIds !== undefined && updated.role === "dm") {
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

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  await prisma.user.update({ where: { id }, data: { status: "deactivated", deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
