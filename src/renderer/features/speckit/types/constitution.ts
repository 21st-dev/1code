/**
 * SpecKit Constitution Types
 *
 * Types for the project constitution document.
 * Read from .specify/memory/constitution.md
 *
 * @see specs/001-speckit-ui-integration/data-model.md
 */

import { z } from "zod"

/**
 * Constitution - the project constitution document
 */
export const ConstitutionSchema = z.object({
  content: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  lastAmended: z.date().optional(),
  exists: z.boolean(),
})

export type Constitution = z.infer<typeof ConstitutionSchema>
