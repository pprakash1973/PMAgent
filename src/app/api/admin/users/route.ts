export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const createSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["pm", "dm", "dh", "admin"]),
  // PM: single program; DM: multiple programs
  programIds: z.array(z.string()).optional(),
  // DH: multiple clients
  clientIds: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");
  const status = searchParams.get("status");

  const where: any = { orgId: (user as any).orgId, deletedAt: null };
  if (role) where.role = role;
  if (status) where.status = status;

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, email: true, fullName: true, role: true, status: true,
      createdAt: true, updatedAt: true,
      programAssignments: {
        include: {
          program: {
            include: { client: { include: { cluster: { select: { id: true, name: true } } } } },
          },
        },
      },
      clientAssignments: {
        include: { client: { include: { cluster: { select: { id: true, name: true } } } } },
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

    const existing = await prisma.user.findFirst({
      where: { email: data.email },
      include: {
        programAssignments: {
          include: { program: { include: { client: { include: { cluster: true } } } } },
        },
        clientAssignments: {
          include: { client: { include: { cluster: true } } },
        },
      },
    });
    if (existing) {
      // Build a human-readable mapping summary
      let mapping = "";
      if (existing.programAssignments.length) {
        mapping = existing.programAssignments
          .map((a) => `${a.program.client.cluster.name} › ${a.program.client.name} › ${a.program.name}`)
          .join(", ");
      } else if (existing.clientAssignments.length) {
        mapping = existing.clientAssignments
          .map((a) => `${a.client.cluster.name} › ${a.client.name}`)
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

    // PM: single program assignment
    if (data.role === "pm" && data.programIds?.length) {
      await prisma.programAssignment.create({
        data: { programId: data.programIds[0], userId: newUser.id, assignedBy: admin.id },
      });
    }

    // DM: multiple program assignments
    if (data.role === "dm" && data.programIds?.length) {
      await prisma.programAssignment.createMany({
        data: data.programIds.map((pid) => ({ programId: pid, userId: newUser.id, assignedBy: admin.id })),
        skipDuplicates: true,
      });
    }

    // DH: multiple client assignments
    if (data.role === "dh" && data.clientIds?.length) {
      await prisma.clientAssignment.createMany({
        data: data.clientIds.map((cid) => ({ clientId: cid, userId: newUser.id, assignedBy: admin.id })),
        skipDuplicates: true,
      });
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
