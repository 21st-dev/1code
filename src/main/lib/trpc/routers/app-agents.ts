import { asc, eq } from "drizzle-orm"
import { z } from "zod"
import { appAgents, getDatabase } from "../../db"
import {
  normalizeAppAgentName,
  serializeToolList,
  toAppAgentDTO,
} from "../../app-agents/shared"
import {
  getRegistryAppAgent,
  importRegistryAppAgent,
  listRegistryAppAgents,
} from "../../app-agents/registry"
import { publicProcedure, router } from "../index"

const toolListSchema = z.array(z.string().min(1)).max(64).optional()

const saveAppAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  prompt: z.string().min(1),
  tools: toolListSchema,
  disallowedTools: toolListSchema,
})

function requireValidName(name: string) {
  const normalized = normalizeAppAgentName(name)
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid App Agent name")
  }
  return normalized
}

function ensureNameAvailable(name: string, currentId?: string) {
  const db = getDatabase()
  const existing = db
    .select()
    .from(appAgents)
    .where(eq(appAgents.name, name))
    .get()

  if (existing && existing.id !== currentId) {
    throw new Error(`App Agent "${name}" already exists`)
  }
}

export const appAgentsRouter = router({
  list: publicProcedure.query(() => {
    const db = getDatabase()
    return db
      .select()
      .from(appAgents)
      .orderBy(asc(appAgents.name))
      .all()
      .map(toAppAgentDTO)
  }),

  get: publicProcedure
    .input(z.object({ id: z.string().optional(), name: z.string().optional() }))
    .query(({ input }) => {
      const db = getDatabase()
      const normalizedName = input.name
        ? requireValidName(input.name)
        : undefined
      const row = input.id
        ? db.select().from(appAgents).where(eq(appAgents.id, input.id)).get()
        : normalizedName
          ? db
              .select()
              .from(appAgents)
              .where(eq(appAgents.name, normalizedName))
              .get()
          : null

      return row ? toAppAgentDTO(row) : null
    }),

  create: publicProcedure.input(saveAppAgentSchema).mutation(({ input }) => {
    const db = getDatabase()
    const name = requireValidName(input.name)
    ensureNameAvailable(name)

    db.insert(appAgents)
      .values({
        name,
        description: input.description.trim(),
        prompt: input.prompt.trim(),
        tools: serializeToolList(input.tools),
        disallowedTools: serializeToolList(input.disallowedTools),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run()

    const row = db
      .select()
      .from(appAgents)
      .where(eq(appAgents.name, name))
      .get()

    if (!row) {
      throw new Error("Failed to create App Agent")
    }

    return toAppAgentDTO(row)
  }),

  update: publicProcedure
    .input(saveAppAgentSchema.extend({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const existing = db
        .select()
        .from(appAgents)
        .where(eq(appAgents.id, input.id))
        .get()

      if (!existing) {
        throw new Error("App Agent not found")
      }

      const name = requireValidName(input.name)
      ensureNameAvailable(name, input.id)

      db.update(appAgents)
        .set({
          name,
          description: input.description.trim(),
          prompt: input.prompt.trim(),
          tools: serializeToolList(input.tools),
          disallowedTools: serializeToolList(input.disallowedTools),
          updatedAt: new Date(),
        })
        .where(eq(appAgents.id, input.id))
        .run()

      const row = db
        .select()
        .from(appAgents)
        .where(eq(appAgents.id, input.id))
        .get()

      if (!row) {
        throw new Error("Failed to update App Agent")
      }

      return toAppAgentDTO(row)
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      db.delete(appAgents).where(eq(appAgents.id, input.id)).run()
      return { deleted: true }
    }),

  registryList: publicProcedure.query(async () => {
    return listRegistryAppAgents()
  }),

  registryGet: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      return getRegistryAppAgent(input.id)
    }),

  registryImport: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return importRegistryAppAgent(input.id)
    }),
})
