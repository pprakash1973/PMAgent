export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const user = session.user as any;

  if (user.role === "pm" || user.role === "pgm") {
    const assignments = await prisma.programAssignment.findMany({
      where: { userId: user.id },
      include: {
        program: {
          include: {
            client: {
              include: { cluster: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    return NextResponse.json({ role: user.role, programs: assignments.map((a) => a.program), clients: [] });
  }

  if (user.role === "dh") {
    const assignments = await prisma.clientAssignment.findMany({
      where: { userId: user.id },
      include: {
        client: {
          include: { cluster: { select: { id: true, name: true } } },
        },
      },
    });
    return NextResponse.json({ role: user.role, programs: [], clients: assignments.map((a) => a.client) });
  }

  // admin — return nothing (unrestricted)
  return NextResponse.json({ role: user.role, programs: [], clients: [] });
}
