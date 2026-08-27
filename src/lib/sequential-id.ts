/**
 * Human-readable sequential ids (R-001, I-004, D-012, AI-PRJ014-007).
 *
 * These were generated from a row count: `${prefix}-${count + 1}`. Counting reuses a
 * live id after any delete — five risks, delete one, and the next create is R-005 again,
 * so two different risks share a reference in exports, status reports and audit trails.
 *
 * Deriving from the highest existing suffix instead means ids are only ever consumed,
 * never reissued.
 *
 * Concurrency: two creates racing in the same project can still compute the same number.
 * Closing that needs a unique index on (projectId, <idColumn>), which is a migration that
 * must first reconcile the duplicates the counting scheme already left in production data.
 */

/**
 * @param existingIds every current id for the scope (project), nulls tolerated
 * @param prefix      the literal text before the numeric suffix, e.g. "R" or "AI-PRJ014"
 * @param pad         digits to zero-pad the suffix to
 */
export function nextSequentialId(
  existingIds: (string | null | undefined)[],
  prefix: string,
  pad = 3
): string {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}-(\\d+)$`);

  let max = 0;
  for (const id of existingIds) {
    const match = re.exec(id ?? "");
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(pad, "0")}`;
}
