/**
 * Aggregate +/- line counts and file count for a sub-chat's messages array.
 *
 * Mirrors the logic that `getFileStats` used to run on every read; called from
 * every messages-write path so the cached columns on `sub_chats` stay in sync.
 *
 * Returns zeros for unparseable JSON or message arrays without Edit/Write tool calls.
 */
export interface SubChatFileStats {
  fileStatsAdditions: number
  fileStatsDeletions: number
  fileStatsFileCount: number
}

const ZERO: SubChatFileStats = {
  fileStatsAdditions: 0,
  fileStatsDeletions: 0,
  fileStatsFileCount: 0,
}

export function computeFileStatsFromMessages(messagesJson: string | null | undefined): SubChatFileStats {
  if (!messagesJson) return ZERO

  // Cheap pre-filter: skip the JSON parse if there are no Edit/Write tool calls.
  if (!messagesJson.includes("tool-Edit") && !messagesJson.includes("tool-Write")) {
    return ZERO
  }

  let messages: Array<{
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
  try {
    messages = JSON.parse(messagesJson)
  } catch {
    return ZERO
  }

  const fileStates = new Map<
    string,
    { originalContent: string | null; currentContent: string }
  >()

  for (const msg of messages) {
    if (msg.role !== "assistant") continue
    for (const part of msg.parts || []) {
      if (part.type !== "tool-Edit" && part.type !== "tool-Write") continue
      const filePath = part.input?.file_path
      if (!filePath) continue
      // Skip session/internal files
      if (filePath.includes("claude-sessions") || filePath.includes("Application Support")) continue

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

  let additions = 0
  let deletions = 0
  let fileCount = 0
  for (const [, state] of fileStates) {
    const original = state.originalContent || ""
    if (original === state.currentContent) continue
    const oldLines = original ? original.split("\n").length : 0
    const newLines = state.currentContent ? state.currentContent.split("\n").length : 0
    if (!original) {
      additions += newLines
    } else {
      additions += newLines
      deletions += oldLines
    }
    fileCount += 1
  }

  return { fileStatsAdditions: additions, fileStatsDeletions: deletions, fileStatsFileCount: fileCount }
}
