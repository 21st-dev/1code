/**
 * SpecKit Initialization Types
 *
 * Types for ii-spec initialization status.
 * Detected by checking .specify/ directory structure.
 *
 * @see specs/001-speckit-ui-integration/data-model.md
 */

import { z } from "zod"

/**
 * Initialization status - whether ii-spec is initialized
 */
export const InitializationStatusSchema = z.object({
  initialized: z.boolean(),
  missingComponents: z.array(z.string()),
  initCommand: z.string(),
})

export type InitializationStatus = z.infer<typeof InitializationStatusSchema>
