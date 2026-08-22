/**
 * Canonical section order per artifact type.
 *
 * The generation prompt asks the model to emit keys in a given order, but models
 * do not reliably honour key ordering. Both the on-screen viewer and the DOCX/XLSX
 * exporters iterate `Object.entries(content)`, so without this the section order is
 * whatever the model happened to produce — and it differs between regenerations.
 *
 * Run content through `orderArtifactContent` at every render boundary to guarantee
 * a stable, PM-specified order regardless of what the model returned.
 */
export const ARTIFACT_SECTION_ORDER: Record<string, string[]> = {
  project_mgmt_plan: [
    "projectOverview",
    "scopeManagement",
    "changeManagement",
    "riskManagement",
    "costManagement",
    "qualityManagement",
    "scheduleManagement",
    "resourceManagement",
    "communicationsManagement",
    "stakeholderManagement",
    "keyAssumptions",
    "keyDependencies",
    "keyConstraints",
    "approvalSignatures",
  ],
};

/**
 * Returns a new object whose keys follow the canonical order for `artifactType`.
 * Keys not in the canonical list are appended in their original order, so a model
 * that invents an extra section still has it rendered rather than silently dropped.
 * Returns `content` unchanged when the type has no canonical order defined.
 */
export function orderArtifactContent<T extends Record<string, unknown>>(
  artifactType: string,
  content: T
): T {
  const order = ARTIFACT_SECTION_ORDER[artifactType];
  if (!order || content == null || typeof content !== "object" || Array.isArray(content)) {
    return content;
  }

  const ordered: Record<string, unknown> = {};
  for (const key of order) {
    if (Object.prototype.hasOwnProperty.call(content, key)) ordered[key] = content[key];
  }
  for (const key of Object.keys(content)) {
    if (!Object.prototype.hasOwnProperty.call(ordered, key)) ordered[key] = content[key];
  }
  return ordered as T;
}
