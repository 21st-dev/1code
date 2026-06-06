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
  blockers?: DesktopRunPreflightBlocker[]
}

export type DesktopRunPreflightResult = {
  chat: Chat
  subChat: SubChat
  project: Project
  cwd: string
}

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

function failPreflight(blocker: DesktopRunPreflightBlocker): never {
  throw new DesktopRunPreflightError(blocker)
}

export function verifyDesktopRunPreflight(
  db: AgentJobDatabase,
  input: DesktopRunPreflightInput,
): DesktopRunPreflightResult {
  const chat = db
    .select()
    .from(chats)
    .where(eq(chats.id, input.chatId))
    .get()
  if (!chat) throw new Error(`Unknown chat: ${input.chatId}`)

  const subChat = db
    .select()
    .from(subChats)
    .where(eq(subChats.id, input.subChatId))
    .get()
  if (!subChat) throw new Error(`Unknown sub-chat: ${input.subChatId}`)
  if (subChat.chatId !== chat.id) {
    throw new Error(
      `Sub-chat ${subChat.id} does not belong to chat ${chat.id}`,
    )
  }

  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, chat.projectId))
    .get()
  if (!project) throw new Error(`Unknown project: ${chat.projectId}`)

  const expectedCwd = normalizeDesktopRunPath(chat.worktreePath || project.path)
  const requestedCwd = normalizeDesktopRunPath(input.cwd)
  if (requestedCwd !== expectedCwd) {
    failPreflight({
      id: "cwd",
      status: "mismatch",
      message: `Desktop job cwd mismatch: expected ${expectedCwd}, received ${requestedCwd}`,
    })
  }

  const blocker = input.blockers?.[0]
  if (blocker) {
    failPreflight(blocker)
  }

  return { chat, subChat, project, cwd: expectedCwd }
}
