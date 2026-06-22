import { mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import {
  chats,
  projects,
  subChats,
  type Chat,
  type Project,
  type SubChat,
} from "../db/schema"
import type { AgentJobDatabase } from "../headless/job-store"

export type DesktopRunPreflightInput = {
  chatId: string
  subChatId: string
  cwd: string
  folderlessScratchCwd?: string
  blockers?: DesktopRunPreflightBlocker[]
}

export type ProjectDesktopRunPreflightResult = {
  kind: "project"
  chat: Chat
  subChat: SubChat
  project: Project
  cwd: string
}

export type FolderlessDesktopRunPreflightResult = {
  kind: "folderless"
  chat: Chat
  subChat: SubChat
  project: null
  cwd: string
}

export type DesktopRunPreflightResult =
  | ProjectDesktopRunPreflightResult
  | FolderlessDesktopRunPreflightResult

export type DesktopRunPreflightBlocker = {
  id:
    | "cwd"
    | "project"
    | "chat"
    | "sub-chat"
    | "provider-profile"
    | "mcp"
    | "attachment"
    | "local-only"
    | "unsupported-capability"
  status: "blocked" | "needs-auth" | "unsupported" | "mismatch"
  message: string
  hint?: string | null
}

export class DesktopRunPreflightError extends Error {
  readonly code = "DESKTOP_RUN_PREFLIGHT_BLOCKED"
  readonly blocker: DesktopRunPreflightBlocker

  constructor(blocker: DesktopRunPreflightBlocker) {
    super(blocker.message)
    this.name = "DesktopRunPreflightError"
    this.blocker = blocker
  }
}

function normalizeDesktopRunPath(value: string): string {
  return path.resolve(value)
}

function resolveFolderlessScratchCwd(input: DesktopRunPreflightInput): string {
  const scratchCwd = normalizeDesktopRunPath(
    input.folderlessScratchCwd ||
      process.env.LOCUS_FOLDERLESS_SCRATCH_CWD ||
      path.join(os.tmpdir(), "locus-folderless-chat"),
  )
  mkdirSync(scratchCwd, { recursive: true })
  return scratchCwd
}

function failPreflight(blocker: DesktopRunPreflightBlocker): never {
  throw new DesktopRunPreflightError(blocker)
}

export function assertDesktopRunPreflightBlockers(
  blockers: DesktopRunPreflightBlocker[] | undefined,
): void {
  const blocker = blockers?.[0]
  if (blocker) {
    failPreflight(blocker)
  }
}

export function verifyDesktopRunPreflight(
  db: AgentJobDatabase,
  input: DesktopRunPreflightInput,
): DesktopRunPreflightResult {
  const chat = db.select().from(chats).where(eq(chats.id, input.chatId)).get()
  if (!chat) throw new Error(`Unknown chat: ${input.chatId}`)

  const subChat = db
    .select()
    .from(subChats)
    .where(eq(subChats.id, input.subChatId))
    .get()
  if (!subChat) throw new Error(`Unknown sub-chat: ${input.subChatId}`)
  if (subChat.chatId !== chat.id) {
    throw new Error(`Sub-chat ${subChat.id} does not belong to chat ${chat.id}`)
  }

  if (!chat.projectId) {
    if (
      chat.worktreePath ||
      chat.branch ||
      chat.baseBranch ||
      chat.prUrl ||
      chat.prNumber != null ||
      chat.archivedAt
    ) {
      failPreflight({
        id: "project",
        status: "mismatch",
        message:
          "Folderless desktop run cannot carry project, worktree, PR, or archived workspace state.",
      })
    }

    assertDesktopRunPreflightBlockers(input.blockers)

    return {
      kind: "folderless",
      chat,
      subChat,
      project: null,
      cwd: resolveFolderlessScratchCwd(input),
    }
  }

  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, chat.projectId))
    .get()
  if (!project) throw new Error(`Unknown project: ${chat.projectId}`)
  if (project.removedAt) {
    failPreflight({
      id: "project",
      status: "blocked",
      message:
        "Project has been removed from active Projects. Restore it before starting project workflows.",
    })
  }

  const expectedCwd = normalizeDesktopRunPath(chat.worktreePath || project.path)
  const requestedCwd = normalizeDesktopRunPath(input.cwd)
  if (requestedCwd !== expectedCwd) {
    failPreflight({
      id: "cwd",
      status: "mismatch",
      message: `Desktop job cwd mismatch: expected ${expectedCwd}, received ${requestedCwd}`,
    })
  }

  assertDesktopRunPreflightBlockers(input.blockers)

  return { kind: "project", chat, subChat, project, cwd: expectedCwd }
}
