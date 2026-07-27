import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { transition } from "@/lib/action-item-transition";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ actionId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  const { actionId } = await params;
  const body = await req.json().catch(() => ({}));
  const result = await transition(actionId, user.id, user.role, "closed", { closureNote: body.closureNote });
  return result.response!;
}
