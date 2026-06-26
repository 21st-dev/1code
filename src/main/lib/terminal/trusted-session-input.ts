import { stat } from "node:fs/promises"
import { resolve } from "node:path"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { chats, getDatabase } from "../db"
import {
  TERMINAL_INITIAL_COMMAND_INTENTS,
  resolveInitialCommandIntents,
  type TerminalInitialCommandIntent,
} from "./initial-command-intents"
import type { CreateSessionParams } from "./types"

export const terminalInitialCommandIntentSchema = z.enum(
  TERMINAL_INITIAL_COMMAND_INTENTS,
)

export const terminalCreateOrAttachInputSchema = z
  .object({
    paneId: z.string().min(1),
    tabId: z.string().optional(),
    workspaceId: z.string().min(1),
    scopeKey: z.string().min(1).optional(),
    cols: z.number().int().positive().optional(),
    rows: z.number().int().positive().optional(),
    initialCommandIntents: z
      .array(terminalInitialCommandIntentSchema)
      .optional(),
  })
  .strict()

export type TerminalCreateOrAttachInput = z.infer<
  typeof terminalCreateOrAttachInputSchema
>

function getCanonicalScopeKey(chat: {
  id: string
  branch: string | null
  worktreePath: string | null
}): string {
  if (chat.branch) {
    return `ws:${chat.id}`
  }
  if (chat.worktreePath) {
    return `path:${resolve(chat.worktreePath)}`
  }
  return `ws:${chat.id}`
}

async function assertDirectory(pathValue: string): Promise<string> {
  const resolvedPath = resolve(pathValue)
  const pathStat = await stat(resolvedPath)

  if (!pathStat.isDirectory()) {
    throw new Error("Registered terminal cwd is not a directory")
  }

  return resolvedPath
}

export async function resolveTrustedCreateSessionParams(
  input: TerminalCreateOrAttachInput,
): Promise<CreateSessionParams> {
  const db = getDatabase()
  const chat = db
    .select()
    .from(chats)
    .where(eq(chats.id, input.workspaceId))
    .get()

  if (!chat?.worktreePath) {
    throw new Error("Terminal workspace is not registered")
  }

  const cwd = await assertDirectory(chat.worktreePath)
  const canonicalScopeKey = getCanonicalScopeKey({
    id: chat.id,
    branch: chat.branch,
    worktreePath: cwd,
  })
  const requestedScopeKey = input.scopeKey ?? canonicalScopeKey

  if (requestedScopeKey !== canonicalScopeKey) {
    throw new Error("Terminal scope does not match registered workspace")
  }

  if (!input.paneId.startsWith(`${canonicalScopeKey}:term:`)) {
    throw new Error("Terminal pane does not match registered workspace")
  }

  const terminalId = input.paneId.slice(`${canonicalScopeKey}:term:`.length)
  if (!/^[A-Za-z0-9_-]+$/.test(terminalId)) {
    throw new Error("Invalid terminal pane id")
  }

  return {
    paneId: input.paneId,
    tabId: input.tabId,
    workspaceId: input.workspaceId,
    scopeKey: canonicalScopeKey,
    cols: input.cols,
    rows: input.rows,
    cwd,
    initialCommands: resolveInitialCommandIntents(
      input.initialCommandIntents as TerminalInitialCommandIntent[] | undefined,
    ),
  }
}

