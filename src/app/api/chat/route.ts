export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { chatCommand } from "@/lib/ai";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { command, projectId } = await req.json();
  if (!command) return NextResponse.json({ error: { code: "MISSING_COMMAND" } }, { status: 400 });

  let context: Record<string, unknown> = { user: session.user };

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        risks: { where: { status: "open" }, take: 5 },
        milestones: { where: { status: "pending" }, take: 5 },
        statusReports: { orderBy: { reportDate: "desc" }, take: 1 },
      },
    });
    if (project) context = { ...context, project };
  }

  const response = await chatCommand(command, context);
  return NextResponse.json({ response });
}
