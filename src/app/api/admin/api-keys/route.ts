export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSystemSettings, setSystemSetting } from "@/lib/system-settings";
import { invalidateApiKey, type Provider } from "@/lib/providers/get-api-key";
import { z } from "zod";

const PROVIDERS: Provider[] = ["anthropic", "openai", "deepseek"];
const ENV_VARS: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai:    "OPENAI_API_KEY",
  deepseek:  "DEEPSEEK_API_KEY",
};

function maskKey(key: string): string {
  if (key.length <= 12) return "***";
  return key.slice(0, 10) + "..." + key.slice(-4);
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  let dbMap = new Map<string, string>();
  try {
    dbMap = await getSystemSettings(PROVIDERS.map((p) => `api_key.${p}`));
  } catch { /* table may not exist yet */ }

  const keys: Record<string, { source: "db" | "env" | "none"; masked: string | null }> = {};
  for (const p of PROVIDERS) {
    const dbVal  = dbMap.get(`api_key.${p}`);
    const envVal = process.env[ENV_VARS[p]];
    if (dbVal)       keys[p] = { source: "db",   masked: maskKey(dbVal) };
    else if (envVal) keys[p] = { source: "env",  masked: maskKey(envVal) };
    else             keys[p] = { source: "none",  masked: null };
  }

  return NextResponse.json({ keys });
}

const putSchema = z.object({
  provider: z.enum(["anthropic", "openai", "deepseek"]),
  apiKey:   z.string().min(8, "API key too short"),
});

export async function PUT(req: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;
  const admin = user as any;

  try {
    const body = await req.json();
    const { provider, apiKey } = putSchema.parse(body);

    await setSystemSetting(`api_key.${provider}`, apiKey, admin?.email);
    invalidateApiKey(provider);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: err.issues[0]?.message } },
        { status: 400 }
      );
    }
    console.error("[api-keys PUT]", err);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: (err as Error).message } },
      { status: 500 }
    );
  }
}
