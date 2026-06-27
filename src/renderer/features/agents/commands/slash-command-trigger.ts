export interface SlashCommandTextTrigger {
  query: string
  rangeStart: number
  rangeEnd: number
}

function clampCursor(text: string, cursorInput: number): number {
  if (!Number.isFinite(cursorInput)) {
    return text.length
  }
  return Math.max(0, Math.min(text.length, Math.floor(cursorInput)))
}

export function detectSlashCommandTextTrigger(
  text: string,
  cursorInput: number,
): SlashCommandTextTrigger | null {
  const cursor = clampCursor(text, cursorInput)
  const lineStart = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1
  const linePrefix = text.slice(lineStart, cursor)

  if (!linePrefix.startsWith("/")) {
    return null
  }

  const commandMatch = /^\/(\S*)$/.exec(linePrefix)
  if (!commandMatch) {
    return null
  }

  return {
    query: commandMatch[1] ?? "",
    rangeStart: lineStart,
    rangeEnd: cursor,
  }
}
