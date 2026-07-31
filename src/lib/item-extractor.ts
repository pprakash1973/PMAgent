/**
 * BL-P2: Canonical item extraction per artifact type.
 * Converts Artifact.content (JSON) into ArtifactVersionItem rows.
 * Called asynchronously after every version commit — never blocks the commit itself.
 */
import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";

function newId(): string {
  return randomUUID().replace(/-/g, "");
}

type ExtractedItem = {
  declaredId?: string;
  sequence: number;
  sourceRef: Record<string, unknown>;
  rawText: string;
  normalizedTitle: string;
  normalizedDesc?: string;
  entryTimestamp?: Date;
  attributes?: Record<string, unknown>;
};

// ── Per-type extractors ──────────────────────────────────────────────────────

function extractArrayField(content: Record<string, unknown>, ...keys: string[]): unknown[] {
  for (const k of keys) {
    if (Array.isArray(content[k])) return content[k] as unknown[];
  }
  return [];
}

function toText(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return JSON.stringify(val);
}

function parseDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? undefined : d;
}

function extractors(artifactType: string, content: Record<string, unknown>): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  let seq = 0;

  const push = (item: Omit<ExtractedItem, "sequence">) => {
    items.push({ sequence: ++seq, ...item });
  };

  switch (artifactType) {
    case "risk_register":
    case "raid_register": {
      const rows = extractArrayField(content, "risks", "items", "raid_items");
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        push({
          declaredId: toText(row.id ?? row.risk_id ?? row.riskId),
          sourceRef: { arrayKey: "risks", index: seq },
          rawText: [row.description, row.mitigation].filter(Boolean).join(" | "),
          normalizedTitle: toText(row.description ?? row.title ?? "Risk"),
          normalizedDesc: toText(row.mitigation ?? row.impact ?? ""),
          entryTimestamp: parseDate(row.raised_date ?? row.date ?? row.createdAt),
          attributes: { category: row.category, probability: row.probability, impact: row.impact, status: row.status, owner: row.owner },
        });
      }
      break;
    }

    case "issue_register": {
      const rows = extractArrayField(content, "issues", "items");
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        push({
          declaredId: toText(row.id ?? row.issue_id ?? row.issueId),
          sourceRef: { arrayKey: "issues", index: seq },
          rawText: [row.description, row.resolution].filter(Boolean).join(" | "),
          normalizedTitle: toText(row.description ?? row.title ?? "Issue"),
          normalizedDesc: toText(row.resolution ?? ""),
          entryTimestamp: parseDate(row.raised_date ?? row.date ?? row.due_date),
          attributes: { severity: row.severity, status: row.status, owner: row.owner },
        });
      }
      break;
    }

    case "change_log": {
      const rows = extractArrayField(content, "changes", "items", "change_items");
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        push({
          declaredId: toText(row.id ?? row.cr_id ?? row.change_id),
          sourceRef: { arrayKey: "changes", index: seq },
          rawText: [row.description, row.impact_analysis].filter(Boolean).join(" | "),
          normalizedTitle: toText(row.description ?? row.title ?? "Change"),
          normalizedDesc: toText(row.impact_analysis ?? row.justification ?? ""),
          entryTimestamp: parseDate(row.date ?? row.requested_date ?? row.raised_date),
          attributes: { status: row.status, requested_by: row.requested_by, approval_status: row.approval_status },
        });
      }
      break;
    }

    case "scope_statement": {
      const deliverables = extractArrayField(content, "deliverables", "inclusions", "in_scope");
      for (const d of deliverables) {
        const row = typeof d === "string" ? { description: d } : d as Record<string, unknown>;
        push({
          sourceRef: { arrayKey: "deliverables", index: seq },
          rawText: toText(row.description ?? row.name ?? d),
          normalizedTitle: toText(row.name ?? row.description ?? String(d)).slice(0, 120),
          normalizedDesc: toText(row.acceptance_criteria ?? row.notes ?? ""),
          attributes: { phase: row.phase, owner: row.owner },
        });
      }
      // Also capture exclusions as separate items
      const exclusions = extractArrayField(content, "exclusions", "out_of_scope");
      for (const e of exclusions) {
        const row = typeof e === "string" ? { description: e } : e as Record<string, unknown>;
        push({
          sourceRef: { arrayKey: "exclusions", index: seq },
          rawText: toText(row.description ?? e),
          normalizedTitle: toText(row.description ?? String(e)).slice(0, 120),
          normalizedDesc: "",
          attributes: { disposition: "excluded" },
        });
      }
      break;
    }

    case "wbs": {
      const rows = extractArrayField(content, "work_packages", "items", "wbs_items", "phases");
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        push({
          declaredId: toText(row.wbs_code ?? row.code ?? row.id),
          sourceRef: { arrayKey: "work_packages", index: seq },
          rawText: [row.name, row.description].filter(Boolean).join(" — "),
          normalizedTitle: toText(row.name ?? row.deliverable ?? "Work Package"),
          normalizedDesc: toText(row.description ?? ""),
          attributes: { wbs_code: row.wbs_code ?? row.code, phase: row.phase, owner: row.owner, estimated_effort: row.estimated_effort },
        });
      }
      break;
    }

    case "milestone_plan": {
      const rows = extractArrayField(content, "milestones", "items");
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        push({
          declaredId: toText(row.id ?? row.milestone_id),
          sourceRef: { arrayKey: "milestones", index: seq },
          rawText: toText(row.name ?? row.milestone ?? "Milestone"),
          normalizedTitle: toText(row.name ?? row.milestone ?? "Milestone"),
          normalizedDesc: toText(row.notes ?? row.description ?? ""),
          entryTimestamp: parseDate(row.due_date ?? row.target_date),
          attributes: { status: row.status, due_date: row.due_date },
        });
      }
      break;
    }

    case "stakeholder_register": {
      const rows = extractArrayField(content, "stakeholders", "items");
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        push({
          sourceRef: { arrayKey: "stakeholders", index: seq },
          rawText: [row.name, row.role, row.interest].filter(Boolean).join(" | "),
          normalizedTitle: toText(row.name ?? "Stakeholder"),
          normalizedDesc: toText(row.role ?? row.interest ?? ""),
          attributes: { influence: row.influence, interest: row.interest, engagement_strategy: row.engagement_strategy },
        });
      }
      break;
    }

    default: {
      // Generic: extract any top-level arrays as item lists
      for (const [key, val] of Object.entries(content)) {
        if (!Array.isArray(val) || val.length === 0) continue;
        for (const r of val) {
          const row: Record<string, unknown> = typeof r === "object" && r !== null ? r as Record<string, unknown> : { value: r };
          const title = toText(row["title"] ?? row["name"] ?? row["description"] ?? row["id"] ?? key);
          push({
            declaredId: toText(row["id"] ?? row["ref"] ?? ""),
            sourceRef: { arrayKey: key, index: seq },
            rawText: toText(r),
            normalizedTitle: title.slice(0, 200),
            normalizedDesc: toText(row["description"] ?? row["notes"] ?? ""),
            attributes: { source_key: key },
          });
        }
      }
    }
  }

  return items;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract canonical items from an artifact version's content and persist them.
 * Sets extractionStatus on the version after completion.
 * Safe to call multiple times — clears existing items first.
 */
export async function extractAndStoreItems(
  artifactVersionId: string,
  artifactType: string,
  content: unknown
): Promise<{ itemCount: number; coverage: number }> {
  const db = prisma as any;

  // Mark as in-progress
  await db.artifactVersion.update({
    where: { id: artifactVersionId },
    data: { extractionStatus: "pending" },
  });

  try {
    const c = (typeof content === "object" && content !== null ? content : {}) as Record<string, unknown>;
    const extracted = extractors(artifactType, c);

    // Delete any prior items for this version
    await db.artifactVersionItem.deleteMany({ where: { artifactVersionId } });

    if (extracted.length === 0) {
      await db.artifactVersion.update({
        where: { id: artifactVersionId },
        data: { extractionStatus: "complete", extractionCoverage: 0 },
      });
      return { itemCount: 0, coverage: 0 };
    }

    // Bulk insert
    await db.artifactVersionItem.createMany({
      data: extracted.map((item) => ({
        id: newId(),
        artifactVersionId,
        declaredId: item.declaredId || null,
        sequence: item.sequence,
        sourceRef: item.sourceRef,
        rawText: item.rawText || "",
        normalizedTitle: item.normalizedTitle || "",
        normalizedDesc: item.normalizedDesc || "",
        entryTimestamp: item.entryTimestamp ?? null,
        attributes: item.attributes ?? {},
        lineageItemId: null,
        createdAt: new Date(),
      })),
    });

    // Count items that have non-empty normalizedTitle as "covered"
    const covered = extracted.filter((i) => i.normalizedTitle.trim().length > 0).length;
    const coverage = Math.round((covered / extracted.length) * 100) / 100;

    await db.artifactVersion.update({
      where: { id: artifactVersionId },
      data: { extractionStatus: "complete", extractionCoverage: coverage },
    });

    return { itemCount: extracted.length, coverage };
  } catch (err) {
    console.error("[item-extractor] failed for", artifactVersionId, err);
    await db.artifactVersion.update({
      where: { id: artifactVersionId },
      data: { extractionStatus: "failed" },
    }).catch(() => {});
    return { itemCount: 0, coverage: 0 };
  }
}
