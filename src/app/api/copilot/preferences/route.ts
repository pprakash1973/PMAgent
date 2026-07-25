export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { assistantName: true, copilotEnabled: true },
  });

  return NextResponse.json({
    assistantName: user?.assistantName ?? "Advisor",
    copilotEnabled: user?.copilotEnabled ?? false,
    isNamed: user?.copilotEnabled === true,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json();
  const { assistantName } = body;

  if (!assistantName || typeof assistantName !== "string") {
    return NextResponse.json({ error: "assistantName required" }, { status: 400 });
  }

  const name = assistantName.trim().slice(0, 20);
  if (name.length < 2) {
    return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
  }

  const reserved = ["admin", "system", "copilot", "bot", "ai"];
  if (reserved.includes(name.toLowerCase())) {
    return NextResponse.json({ error: "That name is reserved — choose another" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: { assistantName: name, copilotEnabled: true },
    select: { assistantName: true, copilotEnabled: true },
  });

  return NextResponse.json({ assistantName: updated.assistantName, copilotEnabled: updated.copilotEnabled });
}
