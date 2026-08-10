export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { syncProjectDeliveryOwners } from "@/lib/delivery-owners";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const createSchema = z.object({
  uid: z.string().regex(/^[A-Za-z0-9]{1,10}$/, "UID must be alphanumeric, max 10 characters"),
  fullName: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["pm", "pgm", "dm", "dh", "admin"]),
  programIds: z.array(z.string()).optional(),  // legacy pgm support
  clientIds: z.array(z.string()).optional(),   // DH → cluster IDs
  accountIds: z.array(z.string()).optional(),  // DM → account IDs (multi-cluster/multi-account)
});

export async function GET(req: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");
  const status = searchParams.get("status");

  const showDeleted = searchParams.get("showDeleted") === "true";
  const where: any = showDeleted ? {} : { deletedAt: null };
  if (role) where.role = role;
  if (status) where.status = status;

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, uid: true, email: true, fullName: true, role: true, status: true, copilotEnabled: true,
      createdAt: true, updatedAt: true, deletedAt: true,
      programAssignments: {
        include: {
          program: {
            include: { account: { include: { cluster: { select: { id: true, name: true } } } } },
          },
        },
      },
      accountAssignments: {
        include: { account: { include: { cluster: { select: { id: true, name: true } } } } },
      },
      clusterAssignments: {
        include: { cluster: { select: { id: true, name: true } } },
      },
      invitations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;
  const admin = user as any;

  try {
    const body = await req.json();
    const data = createSchema.parse(body);

    // UID must be unique across the org
    const uidClash = await prisma.user.findFirst({
      where: { uid: data.uid },
      select: { id: true, fullName: true, email: true, status: true },
    });
    if (uidClash) {
      return NextResponse.json(
        {
          error: {
            code: "DUPLICATE_UID",
            message: `UID "${data.uid}" is already assigned to ${uidClash.fullName} (${uidClash.email}).`,
          },
        },
        { status: 409 }
      );
    }

    const existing = await prisma.user.findFirst({
      where: { email: data.email },
      include: {
        programAssignments: {
          include: { program: { include: { account: { include: { cluster: true } } } } },
        },
        clusterAssignments: {
          include: { cluster: true },
        },
      },
    });
    if (existing) {
      let mapping = "";
      if (existing.programAssignments.length) {
        mapping = existing.programAssignments
          .map((a) => `${a.program.account?.cluster?.name ?? "—"} › ${a.program.account?.name ?? "—"} › ${a.program.name}`)
          .join(", ");
      } else if (existing.clusterAssignments.length) {
        mapping = existing.clusterAssignments
          .map((a) => a.cluster?.name ?? "—")
          .join(", ");
      }
      return NextResponse.json(
        {
          error: {
            code: "DUPLICATE_EMAIL",
            message: `A user with this email already exists (${existing.status}).${mapping ? ` Current mapping: ${mapping}.` : ""} Deactivate the existing account before creating a new one.`,
            existingUser: {
              id: existing.id,
              fullName: existing.fullName,
              role: existing.role,
              status: existing.status,
              mapping,
            },
          },
        },
        { status: 409 }
      );
    }

    const newUser = await prisma.user.create({
      data: {
        orgId: admin.orgId,
        uid: data.uid,
        email: data.email,
        fullName: data.fullName,
        role: data.role,
        status: "invited",
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10),
      },
    });

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await prisma.invitation.create({
      data: {
        userId: newUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });

    // PM: no hierarchy mapping — PMs are attached to projects directly.

    // DM: account assignments across one or more clusters. First account is primary.
    if (data.role === "dm" && data.accountIds?.length) {
      await prisma.accountAssignment.createMany({
        data: data.accountIds.map((aid, i) => ({
          accountId: aid, userId: newUser.id, isPrimary: i === 0, assignedBy: admin.id,
        })),
        skipDuplicates: true,
      });
      // First account gets the denormalised primary-DM FK
      await prisma.orgAccount.updateMany({ where: { id: data.accountIds[0] }, data: { primaryDmId: newUser.id } });
      // Re-sync project owner cache for every touched account (new DM gains project access)
      for (const aid of data.accountIds) {
        await syncProjectDeliveryOwners({ accountId: aid });
      }
    }

    // Legacy pgm: multiple program assignments (role hidden from UI, kept for back-compat)
    if (data.role === "pgm" && data.programIds?.length) {
      await prisma.programAssignment.createMany({
        data: data.programIds.map((pid) => ({ programId: pid, userId: newUser.id, assignedBy: admin.id })),
        skipDuplicates: true,
      });
    }

    // DH: cluster assignments (clientIds contains cluster IDs)
    if (data.role === "dh" && data.clientIds?.length) {
      await prisma.clusterAssignment.createMany({
        data: data.clientIds.map((cid, i) => ({
          clusterId: cid, userId: newUser.id, isPrimary: i === 0, assignedBy: admin.id,
        })),
        skipDuplicates: true,
      });
      await prisma.cluster.updateMany({ where: { id: data.clientIds[0] }, data: { primaryDhId: newUser.id } });
      for (const cid of data.clientIds) {
        await syncProjectDeliveryOwners({ clusterId: cid });
      }
    }

    const inviteUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/accept-invite?token=${token}`;
    return NextResponse.json({ ...newUser, inviteUrl }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION", message: err.issues[0]?.message } }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: { code: "SERVER_ERROR" } }, { status: 500 });
  }
}
