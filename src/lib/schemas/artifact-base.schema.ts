import { z } from "zod";

/**
 * Minimum schema applied to every JSON-producing artifact agent (AC-9.1 / AC-9.2).
 * Uses .catchall to allow all artifact-type-specific fields through.
 * The two required arrays must be present and non-undefined — an empty array is
 * a valid claim ("no assumptions found"); a missing field is a gap.
 */
export const ArtifactBaseSchema = z
  .object({
    assumptions: z.array(z.string()),
    conflicts:   z.array(z.string()),
  })
  .catchall(z.unknown());

export type ArtifactBase = z.infer<typeof ArtifactBaseSchema>;
