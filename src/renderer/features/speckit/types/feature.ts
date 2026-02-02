/**
 * SpecKit Feature Types
 *
 * Types for feature specifications managed by ii-spec.
 * Features are read from the specs/ directory structure.
 *
 * @see specs/001-speckit-ui-integration/data-model.md
 */

import { z } from "zod"

/**
 * Artifact presence - which artifact files exist for a feature
 */
export const ArtifactPresenceSchema = z.object({
  spec: z.boolean(),
  plan: z.boolean(),
  research: z.boolean(),
  tasks: z.boolean(),
})

export type ArtifactPresence = z.infer<typeof ArtifactPresenceSchema>

/**
 * SpecKit Feature - represents a feature specification
 *
 * @example
 * {
 *   featureNumber: "001",
 *   shortName: "speckit-ui-integration",
 *   branchName: "001-speckit-ui-integration",
 *   description: "Integrate ii-spec workflow into the desktop app",
 *   artifacts: { spec: true, plan: true, research: false, tasks: true }
 * }
 */
export const SpecKitFeatureSchema = z.object({
  featureNumber: z.string().regex(/^\d{3}$/),
  shortName: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  branchName: z.string(),
  description: z.string().optional(),
  artifacts: ArtifactPresenceSchema,
})

export type SpecKitFeature = z.infer<typeof SpecKitFeatureSchema>

/**
 * Feature from the tRPC API response
 *
 * Slightly different structure from SpecKitFeature to match API format
 */
export const FeatureSchema = z.object({
  id: z.string(),
  name: z.string(),
  branch: z.string(),
  description: z.string().optional(),
  artifacts: z.object({
    spec: z.boolean(),
    plan: z.boolean(),
    research: z.boolean(),
    tasks: z.boolean(),
  }),
})

export type Feature = z.infer<typeof FeatureSchema>
