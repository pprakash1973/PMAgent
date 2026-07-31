import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type Provider = "anthropic" | "openai" | "deepseek";

const ENV_VARS: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai:    "OPENAI_API_KEY",
  deepseek:  "DEEPSEEK_API_KEY",
};

// 60-second in-process TTL cache
const _cache = new Map<Provider, { value: string; expiresAt: number }>();

export async function getApiKey(provider: Provider): Promise<string | undefined> {
  const hit = _cache.get(provider);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  try {
    const rows = await prisma.$queryRaw<{ value: string }[]>(
      Prisma.sql`SELECT value FROM "SystemSetting" WHERE key = ${"api_key." + provider}`
    );
    const val = rows[0]?.value;
    if (val) {
      _cache.set(provider, { value: val, expiresAt: Date.now() + 60_000 });
      return val;
    }
  } catch {
    // Table may not exist yet — fall through to env var
  }

  return process.env[ENV_VARS[provider]];
}

export function invalidateApiKey(provider?: Provider) {
  if (provider) _cache.delete(provider);
  else _cache.clear();
}
