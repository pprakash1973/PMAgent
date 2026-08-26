export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/project-access";

const confirmSchema = z.object({
  actualToDate: z.number(),
  eacForecast: z.number().optional(),
  ceilingRemaining: z.number().optional(),
  burnRate: z.number().optional(),
  runwayWeeks: z.number().optional(),
  marginAtCompletion: z.number().optional(),
  primaryMetric: z.string().optional(),
  primaryValue: z.number().optional(),
  sprintId: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { id: projectId } = await params;
  const db = prisma as any;

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { budget: true, commercialModel: true, deliveryMethod: true, currency: true },
  });

  const [contract, snapshots, ledger] = await Promise.all([
    db.contract.findFirst({
      where: { projectId, status: "active" },
      orderBy: { createdAt: "desc" },
    }),
    db.commercialSnapshot.findMany({
      where: { projectId },
      orderBy: { snapshotDate: "desc" },
      take: 12,
    }),
    db.costLedger.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const totalActual = ledger.reduce((sum: number, l: any) => sum + l.amount, 0);
  const latest = snapshots[0] ?? null;

  return NextResponse.json({
    project,
    contract,
    latest,
    snapshots,
    totalActual,
    ledgerEntries: ledger,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // SEC: enforce tenant boundary — see lib/project-access.ts
  const _acc = await requireProjectAccess((await params).id);
  if (_acc.error) return _acc.error;

  const { id: projectId } = await params;
  const db = prisma as any;
  const user = session.user as any;
  const body = await req.json();

  // POST can be a snapshot confirmation or a ledger entry
  if (body.action === "confirm_snapshot") {
    const data = confirmSchema.parse(body);
    const snapshot = await db.commercialSnapshot.create({
      data: {
        projectId,
        sprintId: data.sprintId,
        actualToDate: data.actualToDate,
        eacForecast: data.eacForecast,
        ceilingRemaining: data.ceilingRemaining,
        burnRate: data.burnRate,
        runwayWeeks: data.runwayWeeks,
        marginAtCompletion: data.marginAtCompletion,
        primaryMetric: data.primaryMetric,
        primaryValue: data.primaryValue,
        confirmedBy: user.id,
      },
    });
    return NextResponse.json(snapshot, { status: 201 });
  }

  if (body.action === "add_ledger") {
    const entry = await db.costLedger.create({
      data: {
        projectId,
        sprintId: body.sprintId,
        entryType: body.entryType ?? "actual",
        amount: body.amount,
        currency: body.currency ?? "USD",
        description: body.description,
        confirmedBy: user.id,
        pmConfirmed: true,
      },
    });
    return NextResponse.json(entry, { status: 201 });
  }

  return NextResponse.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
}
