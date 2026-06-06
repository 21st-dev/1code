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
}

export type DesktopRunPreflightResult = {
  chat: Chat
  subChat: SubChat
  project: Project
  cwd: string
}

function normalizeDesktopRunPath(value: string): string {
  return path.resolve(value)
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
    throw new Error(
      `Desktop job cwd mismatch: expected ${expectedCwd}, received ${requestedCwd}`,
    )
  }

  return { chat, subChat, project, cwd: expectedCwd }
}
