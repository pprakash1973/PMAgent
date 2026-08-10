export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { syncProjectDeliveryOwners } from "@/lib/delivery-owners";
import { z } from "zod";
import bcrypt from "bcryptjs";

const patchSchema = z.object({
  uid: z.string().regex(/^[A-Za-z0-9]{1,10}$/, "UID must be alphanumeric, max 10 characters").optional(),
  role: z.enum(["pm", "pgm", "dm", "dh", "admin"]).optional(),
  fullName: z.string().optional(),
  password: z.string().min(8).optional(),
  programIds: z.array(z.string()).optional(),  // legacy pgm
  clientIds: z.array(z.string()).optional(),   // DH → cluster IDs
  accountIds: z.array(z.string()).optional(),  // DM → account IDs
  copilotEnabled: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const data = patchSchema.parse(body);

  const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : undefined;

  // UID uniqueness guard (a different user must not already hold it)
  if (data.uid) {
    const clash = await prisma.user.findFirst({
      where: { uid: data.uid, id: { not: id } },
      select: { id: true, fullName: true, email: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: { code: "DUPLICATE_UID", message: `UID "${data.uid}" is already assigned to ${clash.fullName} (${clash.email}).` } },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(data.uid && { uid: data.uid }),
      ...(data.role && { role: data.role }),
      ...(data.fullName && { fullName: data.fullName }),
      ...(passwordHash && { passwordHash }),
      ...(data.copilotEnabled !== undefined && { copilotEnabled: data.copilotEnabled }),
    },
  });

  const role = data.role ?? updated.role;

  // DM → account assignments. Diff old vs new so we can resync BOTH sets of accounts
  // (accounts the DM left AND accounts they joined) so project owner caches stay correct.
  if (data.accountIds !== undefined && role === "dm") {
    const prev = await prisma.accountAssignment.findMany({ where: { userId: id }, select: { accountId: true } });
    const prevIds = prev.map((a) => a.accountId);
    await prisma.accountAssignment.deleteMany({ where: { userId: id } });
    if (data.accountIds.length) {
      await prisma.accountAssignment.createMany({
        data: data.accountIds.map((aid, i) => ({
          accountId: aid, userId: id, isPrimary: i === 0, assignedBy: (admin as any).id,
        })),
        skipDuplicates: true,
      });
      // First selected account becomes this account's primary DM (denormalised FK)
      await prisma.orgAccount.updateMany({ where: { id: data.accountIds[0] }, data: { primaryDmId: id } });
    }
    // Resync every account this DM ever touched (left → owner falls back; joined → new owner)
    const touched = Array.from(new Set([...prevIds, ...data.accountIds]));
    for (const aid of touched) await syncProjectDeliveryOwners({ accountId: aid });
  }

  // Legacy pgm → program assignments
  if (data.programIds !== undefined && (role === "pm" || role === "pgm")) {
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

  // DH → cluster assignments (clientIds contains cluster IDs for DH)
  if (data.clientIds !== undefined && role === "dh") {
    const prev = await prisma.clusterAssignment.findMany({ where: { userId: id }, select: { clusterId: true } });
    const prevIds = prev.map((a) => a.clusterId);
    await prisma.clusterAssignment.deleteMany({ where: { userId: id } });
    if (data.clientIds.length) {
      await prisma.clusterAssignment.createMany({
        data: data.clientIds.map((cid, i) => ({
          clusterId: cid,
          userId: id,
          isPrimary: i === 0,
          assignedBy: (admin as any).id,
        })),
        skipDuplicates: true,
      });
      await prisma.cluster.updateMany({ where: { id: data.clientIds[0] }, data: { primaryDhId: id } });
    }
    const touched = Array.from(new Set([...prevIds, ...data.clientIds]));
    for (const cid of touched) await syncProjectDeliveryOwners({ clusterId: cid });
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
