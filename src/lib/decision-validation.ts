/**
 * Request-body validation for the Decision endpoints.
 *
 * Decision payloads reach the API from two places: the hand-typed form, and the
 * transcript extractor, which forwards whatever shape the model produced. The route
 * handlers previously called `body.title.trim()` directly — optional chaining guards
 * null but not a wrong *type*, so a model returning an object or a number for `title`
 * threw a TypeError and surfaced as an unhandled 500. Everything here coerces or
 * rejects explicitly so a bad payload is a 400 with a usable message.
 */

export const DECISION_STATUSES = ["open", "agreed", "superseded"] as const;
export const DECISION_CATEGORIES = ["Architecture", "Scope", "Process", "Tooling", "Team", "Other"] as const;
export const DECISION_LINKED_TYPES = ["milestone", "cr"] as const;

const MAX_TITLE = 500;
const MAX_TEXT = 2000;
const MAX_SHORT = 200;

export class DecisionValidationError extends Error {}

function fail(message: string): never {
  throw new DecisionValidationError(message);
}

/**
 * Trims a value that must be a string. Numbers and booleans are coerced — a model
 * emitting `madeBy: 2026` is a formatting slip, not a reason to reject the decision.
 * Objects, arrays and functions are rejected: there is no sane text for them, and
 * silently storing "[object Object]" is worse than a clear error.
 */
function asText(value: unknown, field: string, max: number): string {
  if (typeof value === "string") { /* fall through */ }
  else if (typeof value === "number" || typeof value === "boolean") value = String(value);
  else fail(`"${field}" must be text.`);

  const trimmed = (value as string).trim();
  if (trimmed.length > max) fail(`"${field}" is too long (max ${max} characters).`);
  return trimmed;
}

/** Optional free text — absent, null and empty all collapse to null. */
export function optionalText(value: unknown, field: string, max = MAX_TEXT): string | null {
  if (value === undefined || value === null || value === "") return null;
  return asText(value, field, max) || null;
}

/** Required non-empty text. */
export function requiredText(value: unknown, field: string, max = MAX_TITLE): string {
  if (value === undefined || value === null) fail(`"${field}" is required.`);
  const text = asText(value, field, max);
  if (!text) fail(`"${field}" cannot be empty.`);
  return text;
}

/**
 * Parses a date, rejecting unparseable input rather than handing Prisma an
 * `Invalid Date` (which fails deep in the driver as an opaque 500).
 */
export function optionalDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) fail(`"${field}" is not a valid date.`);
    return value;
  }
  if (typeof value !== "string" && typeof value !== "number") fail(`"${field}" is not a valid date.`);
  const parsed = new Date(value as string | number);
  if (isNaN(parsed.getTime())) fail(`"${field}" is not a valid date.`);
  return parsed;
}

/** Constrains a value to a known set, so `status` cannot become arbitrary text. */
export function oneOf<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  { nullable = true }: { nullable?: boolean } = {}
): T | null {
  if (value === undefined || value === null || value === "") {
    if (nullable) return null;
    fail(`"${field}" is required.`);
  }
  const text = asText(value, field, MAX_SHORT);
  const match = allowed.find((a) => a.toLowerCase() === text.toLowerCase());
  if (!match) fail(`"${field}" must be one of: ${allowed.join(", ")}.`);
  return match;
}

export interface DecisionCreateInput {
  title: string;
  rationale: string | null;
  madeBy: string | null;
  madeAt: Date;
  reviewAt: Date | null;
  status: string;
  linkedRef: string | null;
  linkedType: string | null;
  sprintId: string | null;
  sprintLabel: string | null;
  category: string | null;
}

/** Validates a create payload. Throws DecisionValidationError on bad input. */
export function validateDecisionCreate(body: unknown): DecisionCreateInput {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    fail("Request body must be an object.");
  }
  const b = body as Record<string, unknown>;

  return {
    title:       requiredText(b.title, "title"),
    rationale:   optionalText(b.rationale, "rationale"),
    madeBy:      optionalText(b.madeBy, "madeBy", MAX_SHORT),
    madeAt:      optionalDate(b.madeAt, "madeAt") ?? new Date(),
    reviewAt:    optionalDate(b.reviewAt, "reviewAt"),
    status:      oneOf(b.status, "status", DECISION_STATUSES) ?? "open",
    linkedRef:   optionalText(b.linkedRef, "linkedRef", MAX_SHORT),
    linkedType:  oneOf(b.linkedType, "linkedType", DECISION_LINKED_TYPES),
    sprintId:    optionalText(b.sprintId, "sprintId", MAX_SHORT),
    sprintLabel: optionalText(b.sprintLabel, "sprintLabel", MAX_SHORT),
    category:    oneOf(b.category, "category", DECISION_CATEGORIES),
  };
}

/**
 * Validates a patch payload. Only keys actually present are returned, so a PATCH
 * touching one field leaves the rest alone.
 */
export function validateDecisionPatch(body: unknown): Partial<DecisionCreateInput> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    fail("Request body must be an object.");
  }
  const b = body as Record<string, unknown>;
  const out: Partial<DecisionCreateInput> = {};

  if ("title" in b)       out.title       = requiredText(b.title, "title");
  if ("rationale" in b)   out.rationale   = optionalText(b.rationale, "rationale");
  if ("madeBy" in b)      out.madeBy      = optionalText(b.madeBy, "madeBy", MAX_SHORT);
  if ("madeAt" in b)      out.madeAt      = optionalDate(b.madeAt, "madeAt") ?? new Date();
  if ("reviewAt" in b)    out.reviewAt    = optionalDate(b.reviewAt, "reviewAt");
  if ("status" in b)      out.status      = oneOf(b.status, "status", DECISION_STATUSES) ?? "open";
  if ("linkedRef" in b)   out.linkedRef   = optionalText(b.linkedRef, "linkedRef", MAX_SHORT);
  if ("linkedType" in b)  out.linkedType  = oneOf(b.linkedType, "linkedType", DECISION_LINKED_TYPES);
  if ("sprintId" in b)    out.sprintId    = optionalText(b.sprintId, "sprintId", MAX_SHORT);
  if ("sprintLabel" in b) out.sprintLabel = optionalText(b.sprintLabel, "sprintLabel", MAX_SHORT);
  if ("category" in b)    out.category    = oneOf(b.category, "category", DECISION_CATEGORIES);

  return out;
}

/**
 * Next display id for a project, derived from the highest existing D-nnn rather than
 * from a row count. Counting reused a live id after any delete: 5 decisions, delete
 * one, and the next create is D-005 again.
 *
 * Concurrent creates in the same project can still land on the same number — closing
 * that needs a unique index on (projectId, decisionId), which is a migration that has
 * to reconcile whatever duplicates existing data already holds.
 */
export function nextDecisionId(existingIds: (string | null)[]): string {
  let max = 0;
  for (const id of existingIds) {
    const match = /^D-(\d+)$/.exec(id ?? "");
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `D-${String(max + 1).padStart(3, "0")}`;
}
