import { and, eq, inArray, isNotNull, sql } from "drizzle-orm"
import { chats, type getDatabase, subChats } from "./db"

export type FileStatsInput = {
  openSubChatIds?: string[]
  chatIds?: string[]
}

type FileStatsDatabase = ReturnType<typeof getDatabase>

export function getProjectBackedFileStats(
  db: FileStatsDatabase,
  input: FileStatsInput,
) {
  if (
    (!input.openSubChatIds || input.openSubChatIds.length === 0) &&
    (!input.chatIds || input.chatIds.length === 0)
  ) {
    return []
  }

  let allChats: Array<{
    chatId: string | null
    subChatId: string
    messages: string | null
  }>

  if (input.chatIds && input.chatIds.length > 0) {
    allChats = db
      .select({
        chatId: subChats.chatId,
        subChatId: subChats.id,
        messages: subChats.messages,
      })
      .from(subChats)
      .innerJoin(chats, eq(subChats.chatId, chats.id))
      .where(
        and(
          inArray(subChats.chatId, input.chatIds),
          isNotNull(chats.projectId),
          sql`(${subChats.messages} LIKE '%tool-Edit%' OR ${subChats.messages} LIKE '%tool-Write%')`,
        ),
      )
      .all()
  } else {
    const openSubChatIds = input.openSubChatIds ?? []
    allChats = db
      .select({
        chatId: subChats.chatId,
        subChatId: subChats.id,
        messages: subChats.messages,
      })
      .from(subChats)
      .innerJoin(chats, eq(subChats.chatId, chats.id))
      .where(
        and(inArray(subChats.id, openSubChatIds), isNotNull(chats.projectId)),
      )
      .all()
  }

  const statsMap = new Map<
    string,
    { additions: number; deletions: number; fileCount: number }
  >()

  for (const row of allChats) {
    if (!row.messages || !row.chatId) continue
    const chatId = row.chatId

    try {
      const messages = JSON.parse(row.messages) as Array<{
        role: string
        parts?: Array<{
          type: string
          input?: {
            file_path?: string
            old_string?: string
            new_string?: string
            content?: string
          }
        }>
      }>

      const fileStates = new Map<
        string,
        { originalContent: string | null; currentContent: string }
      >()

      for (const msg of messages) {
        if (msg.role !== "assistant") continue
        for (const part of msg.parts || []) {
          if (part.type !== "tool-Edit" && part.type !== "tool-Write") {
            continue
          }

          const filePath = part.input?.file_path
          if (!filePath) continue
          if (
            filePath.includes("claude-sessions") ||
            filePath.includes("Application Support")
          ) {
            continue
          }

          const oldString = part.input?.old_string || ""
          const newString = part.input?.new_string || part.input?.content || ""
          const existing = fileStates.get(filePath)
          if (existing) {
            existing.currentContent = newString
          } else {
            fileStates.set(filePath, {
              originalContent: part.type === "tool-Write" ? null : oldString,
              currentContent: newString,
            })
          }
        }
      }

      let subChatAdditions = 0
      let subChatDeletions = 0
      let subChatFileCount = 0

      for (const [, state] of fileStates) {
        const original = state.originalContent || ""
        if (original === state.currentContent) continue

        const oldLines = original ? original.split("\n").length : 0
        const newLines = state.currentContent
          ? state.currentContent.split("\n").length
          : 0

        if (!original) {
          subChatAdditions += newLines
        } else {
          subChatAdditions += newLines
          subChatDeletions += oldLines
        }
        subChatFileCount += 1
      }

      const existing = statsMap.get(chatId) || {
        additions: 0,
        deletions: 0,
        fileCount: 0,
      }
      existing.additions += subChatAdditions
      existing.deletions += subChatDeletions
      existing.fileCount += subChatFileCount
      statsMap.set(chatId, existing)
    } catch {
      // Skip invalid JSON
    }
  }

  return Array.from(statsMap.entries()).map(([chatId, stats]) => ({
    chatId,
    ...stats,
  }))
}
