/**
 * Artifact generation context — the two grounding inputs every generation path
 * should supply, assembled in one place.
 *
 *   evidence      retrieved chunks from the project's uploaded documents
 *   domainContext industry-specific guidance from the domain pre-flight agent
 *
 * There are three call sites for generateArtifact() (single, batch, and the
 * Copilot action helper). Before this module each supplied a different subset:
 * single had domain but no evidence, batch had evidence but no domain, and the
 * Copilot path had neither. Centralising it here is what keeps them in step.
 *
 * Neither input is required. Both degrade to "absent" on failure rather than
 * propagating — a retrieval or pre-flight problem must not fail a generation
 * that would otherwise succeed on project context alone.
 */

import { assembleEvidence, type EvidenceContext } from "@/lib/evidence-assembler";
import { generateDomainContext } from "@/lib/ai";

/** Artifact types whose output materially changes with industry context. */
const DOMAIN_AGENT_ARTIFACTS = ["wbs", "resource_plan", "risk_register"];

export interface GenerationContext {
  evidence: EvidenceContext | undefined;
  domainContext: string;
}

export interface DomainInputs {
  industry?: string | null;
  description?: string | null;
  customer?: string | null;
}

export async function assembleGenerationContext(
  projectId: string,
  artifactType: string,
  project: DomainInputs
): Promise<GenerationContext> {
  const wantsDomain =
    DOMAIN_AGENT_ARTIFACTS.includes(artifactType) &&
    !!project.industry &&
    !!project.description;

  // Independent — one round trip to Postgres, one optional call to the model.
  const [evidence, domainContext] = await Promise.all([
    assembleEvidence(projectId, artifactType).catch((err) => {
      console.error(`[artifact-context] evidence assembly failed for ${artifactType}:`, err);
      return undefined;
    }),
    wantsDomain
      ? generateDomainContext(project.industry!, project.description!, project.customer).catch((err) => {
          console.error(`[artifact-context] domain pre-flight failed for ${artifactType}:`, err);
          return "";
        })
      : Promise.resolve(""),
  ]);

  if (evidence) {
    console.info(
      `[artifact-context] ${artifactType}: ${evidence.chunks.length}/${evidence.totalChunksInProject} chunks via ${evidence.mode}`
    );
  }

  return { evidence, domainContext };
}
