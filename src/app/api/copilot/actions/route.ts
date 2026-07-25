export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET — fetch action ledger for a conversation
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  if (!conversationId) return NextResponse.json({ error: "conversationId required" }, { status: 400 });

  const actions = await prisma.assistantAction.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ actions });
}

// POST — create a new action (called by chat route internally)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json();
  const { conversationId, actionType, tier, payload } = body;

  const action = await prisma.assistantAction.create({
    data: { conversationId, actionType, tier, payload, status: "proposed" },
  });

  return NextResponse.json({ action }, { status: 201 });
}
