import { eq } from "drizzle-orm"
import { z } from "zod"
import { chats, getDatabase, projects } from "../../db"
import {
  detectWorktreeConfig,
  getAvailableConfigPaths,
  saveWorktreeConfig,
  type WorktreeConfig,
} from "../../git/worktree-config"
import { approveAndExecuteWorktreeSetup } from "../../git/worktree-setup-trust"
import { publicProcedure, router } from "../index"

const WorktreeConfigSchema = z.object({
  "setup-worktree-unix": z.union([z.array(z.string()), z.string()]).optional(),
  "setup-worktree-windows": z
    .union([z.array(z.string()), z.string()])
    .optional(),
  "setup-worktree": z.union([z.array(z.string()), z.string()]).optional(),
})

export const worktreeConfigRouter = router({
  /**
   * Get worktree config for a project
   * Detects from .locus/worktree.json, .cursor/worktrees.json, or legacy .1code/worktree.json
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
        target: z
          .enum(["locus", "cursor", "1code"])
          .or(z.string())
          .default("locus"),
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

  approveAndRunSetup: publicProcedure
    .input(z.object({ chatId: z.string(), commandHash: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(chats)
        .where(eq(chats.id, input.chatId))
        .get()

      if (!chat?.projectId || !chat.worktreePath) {
        throw new Error("Chat does not have a project worktree.")
      }

      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, chat.projectId))
        .get()

      if (!project) {
        throw new Error("Project not found")
      }

      return approveAndExecuteWorktreeSetup({
        projectId: project.id,
        projectPath: project.path,
        worktreePath: chat.worktreePath,
        expectedCommandHash: input.commandHash,
        db,
      })
    }),
})
