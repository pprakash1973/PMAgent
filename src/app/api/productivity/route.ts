export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getProductivityStatsForUser } from "@/lib/productivity";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const stats = await getProductivityStatsForUser(session.user as any);
  return NextResponse.json(stats);
}
