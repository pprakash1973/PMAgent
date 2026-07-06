import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^a-zA-Z0-9]/),
  orgName: z.string().min(2).optional(),
  orgId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = schema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json({ error: { code: "EMAIL_TAKEN", message: "Email already registered" } }, { status: 409 });
    }

    let orgId = data.orgId;
    if (!orgId) {
      const org = await prisma.organization.create({
        data: { name: data.orgName || `${data.fullName}'s Org` },
      });
      orgId = org.id;
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        orgId,
        email: data.email,
        fullName: data.fullName,
        passwordHash,
        role: "pm",
        approved: true,
      },
    });

    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION", message: err.issues[0]?.message || "Validation error" } }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: "Internal error" } }, { status: 500 });
  }
}
