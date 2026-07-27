import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { transition } from "@/lib/action-item-transition";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ actionId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { actionId } = await params;
  const result = await transition(actionId, user.id, user.role, "acknowledged");
  return result.response!;
}
