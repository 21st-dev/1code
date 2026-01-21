import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, projects } from "../../db"
import { eq } from "drizzle-orm"
import {
  detectWorktreeConfig,
  saveWorktreeConfig,
  getAvailableConfigPaths,
  type WorktreeConfig,
} from "../../git/worktree-config"

const WorktreeConfigSchema = z.object({
  "setup-worktree-unix": z.union([z.array(z.string()), z.string()]).optional(),
  "setup-worktree-windows": z.union([z.array(z.string()), z.string()]).optional(),
  "setup-worktree": z.union([z.array(z.string()), z.string()]).optional(),
})

export const worktreeConfigRouter = router({
  /**
   * Get worktree config for a project
   * Detects from .cursor/worktrees.json or .1code/worktree.json
   */
  get: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .get()

      if (!project) {
        throw new Error("Project not found")
      }

      const detected = await detectWorktreeConfig(project.path)
      const available = await getAvailableConfigPaths(project.path)

      return {
        config: detected.config,
        path: detected.path,
        source: detected.source,
        available,
        projectPath: project.path,
      }
    }),

  /**
   * Save worktree config for a project
   */
  save: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        config: WorktreeConfigSchema,
        target: z.enum(["cursor", "1code"]).or(z.string()).default("1code"),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .get()

      if (!project) {
        throw new Error("Project not found")
      }

      const result = await saveWorktreeConfig(
        project.path,
        input.config as WorktreeConfig,
        input.target,
      )

      return result
    }),

  /**
   * Get available config paths for a project
   */
  getAvailablePaths: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .get()

      if (!project) {
        throw new Error("Project not found")
      }

      return getAvailableConfigPaths(project.path)
    }),
})
