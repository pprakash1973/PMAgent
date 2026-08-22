export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyBaseline } from "@/lib/baseline-copilot";
import { requireProjectAccess } from "@/lib/project-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

  const result = await verifyBaseline(id);

  return NextResponse.json(result);
}
