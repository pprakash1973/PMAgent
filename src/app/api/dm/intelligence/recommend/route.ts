import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { anthropic } from "@/lib/ai";

const RECOMMEND_PROMPT = `You are a senior delivery advisor supporting a Delivery Manager.
Given project health signals, write ONE specific instruction the DM should give their PM this week.
Be directive and specific — name the action, the deadline, and the consequence of not acting.
2–3 sentences maximum. No preamble, no sign-off, no generic advice.`;

const CAN_ACCESS = ["dm", "dh", "admin"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  if (!CAN_ACCESS.includes(user.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { projectName, industry, spi, cpi, riskExposure, milestoneSlipPct, deliveryScore, topRisk } = body;

  if (!projectName) return NextResponse.json({ error: "projectName required" }, { status: 400 });

  const signals = [
    `Project: ${projectName}`,
    industry ? `Industry: ${industry}` : null,
    spi !== null && spi !== undefined ? `SPI: ${Number(spi).toFixed(2)}` : null,
    cpi !== null && cpi !== undefined ? `CPI: ${Number(cpi).toFixed(2)}` : null,
    `Risk exposure: ${riskExposure ?? "unknown"}`,
    milestoneSlipPct !== undefined ? `Milestone slip: ${Math.round(milestoneSlipPct * 100)}%` : null,
    `Delivery score: ${deliveryScore}%`,
    topRisk ? `Top open risk: ${topRisk}` : null,
  ].filter(Boolean).join("\n");

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: RECOMMEND_PROMPT,
      messages: [{ role: "user", content: signals }],
    });
    const text = msg.content.find((b: any) => b.type === "text");
    const recommendation = (text as any)?.text ?? "Review project health signals and agree corrective actions with the PM.";
    return NextResponse.json({ recommendation });
  } catch (err: any) {
    console.error("[intelligence/recommend]", err);
    return NextResponse.json({ error: "AI generation failed" }, { status: 502 });
  }
}
