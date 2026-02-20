import { eq } from "drizzle-orm"
import { z } from "zod"
import { continuitySettings, getDatabase } from "../../db"
import {
  getDefaultContinuityArtifactPolicy,
  getDefaultContinuityMemoryBranch,
} from "../../config"
import { publicProcedure, router } from "../index"

const continuityPolicySchema = z.enum([
  "auto-write-manual-commit",
  "auto-write-memory-branch",
])

function ensureSettingsRow() {
  const db = getDatabase()
  const existing = db
    .select()
    .from(continuitySettings)
    .where(eq(continuitySettings.id, "singleton"))
    .get()

  if (existing) {
    return existing
  }

  const inserted = db
    .insert(continuitySettings)
    .values({
      id: "singleton",
      artifactPolicy: getDefaultContinuityArtifactPolicy(),
      autoCommitToMemoryBranch: false,
      memoryBranch: getDefaultContinuityMemoryBranch(),
      updatedAt: new Date(),
    })
    .returning()
    .get()

  return inserted
}

export const continuitySettingsRouter = router({
  get: publicProcedure.query(() => ensureSettingsRow()),

  update: publicProcedure
    .input(
      z.object({
        artifactPolicy: continuityPolicySchema.optional(),
        autoCommitToMemoryBranch: z.boolean().optional(),
        memoryBranch: z.string().min(1).optional(),
      }),
    )
    .mutation(({ input }) => {
      const db = getDatabase()
      const current = ensureSettingsRow()
      const next = {
        artifactPolicy: input.artifactPolicy ?? current.artifactPolicy,
        autoCommitToMemoryBranch:
          input.autoCommitToMemoryBranch ?? current.autoCommitToMemoryBranch,
        memoryBranch: (input.memoryBranch ?? current.memoryBranch).trim(),
      }

      return db
        .update(continuitySettings)
        .set({
          artifactPolicy: next.artifactPolicy,
          autoCommitToMemoryBranch: next.autoCommitToMemoryBranch,
          memoryBranch: next.memoryBranch || getDefaultContinuityMemoryBranch(),
          updatedAt: new Date(),
        })
        .where(eq(continuitySettings.id, "singleton"))
        .returning()
        .get()
    }),
})
