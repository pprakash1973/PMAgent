import { createHash } from "crypto";

function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, v])
    );
  }
  return value;
}

/**
 * SHA-256 of the artifact content with all object keys sorted recursively.
 * Used for BL-5: if the hash matches the current version's hash, generation
 * produced no change and we return 304 instead of creating a new version.
 */
export function hashArtifactContent(content: unknown): string {
  const normalized = JSON.stringify(content, sortedReplacer);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
