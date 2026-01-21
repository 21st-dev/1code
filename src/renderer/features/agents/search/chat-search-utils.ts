import type { Message, MessagePart } from "../stores/message-store"
import type { SearchMatch } from "./chat-search-atoms"

// ============================================================================
// TEXT EXTRACTION
// ============================================================================

interface ExtractedText {
  messageId: string
  partIndex: number
  partType: string
  text: string
}

/**
 * Extract all searchable text from a message part
 * NOTE: Currently only searches text parts for simplicity.
 * Tool content search was removed to avoid complexity with highlighting.
 */
function extractTextFromPart(
  messageId: string,
  partIndex: number,
  part: MessagePart
): ExtractedText[] {
  const results: ExtractedText[] = []

  // Only search text parts - tool content search is disabled for now
  if (part.type === "text" && part.text && typeof part.text === "string" && part.text.trim()) {
    results.push({ messageId, partIndex, partType: "text", text: part.text })
  }

  return results
}

// Keep old implementation commented for reference if we want to re-enable tool search later
/*
function extractTextFromPartFull(
  messageId: string,
  partIndex: number,
  part: MessagePart
): ExtractedText[] {
  const results: ExtractedText[] = []

  const addText = (partType: string, text: string | undefined | null) => {
    if (text && typeof text === "string" && text.trim()) {
      results.push({ messageId, partIndex, partType, text })
    }
  }

  switch (part.type) {
    case "text":
      addText("text", part.text)
      break

    case "tool-Bash":
      addText("tool-Bash:command", part.input?.command)
      addText("tool-Bash:stdout", part.output?.stdout)
      addText("tool-Bash:stderr", part.output?.stderr)
      break

    case "tool-Read":
      addText("tool-Read:path", part.input?.file_path)
      addText("tool-Read:content", part.output?.content)
      break

    case "tool-Write":
      addText("tool-Write:path", part.input?.file_path)
      addText("tool-Write:content", part.input?.content)
      break

    case "tool-Edit":
      addText("tool-Edit:path", part.input?.file_path)
      if (part.output?.structuredPatch && Array.isArray(part.output.structuredPatch)) {
        const lines: string[] = []
        for (const patch of part.output.structuredPatch) {
          if (patch.lines && Array.isArray(patch.lines)) {
            for (const line of patch.lines) {
              if (typeof line === 'string' && line.length > 0) {
                lines.push(line.slice(1))
              }
            }
          }
        }
        if (lines.length > 0) {
          addText("tool-Edit:content", lines.join("\n"))
        }
      } else if (part.input?.new_string) {
        addText("tool-Edit:content", part.input.new_string)
      }
      break

    case "tool-Glob":
      addText("tool-Glob:pattern", part.input?.pattern)
      addText("tool-Glob:path", part.input?.path)
      if (Array.isArray(part.output)) {
        addText("tool-Glob:results", part.output.join("\n"))
      }
      break

    case "tool-Grep":
      addText("tool-Grep:pattern", part.input?.pattern)
      addText("tool-Grep:path", part.input?.path)
      if (part.output?.content) {
        addText("tool-Grep:content", part.output.content)
      }
      break

    case "tool-WebSearch":
      addText("tool-WebSearch:query", part.input?.query)
      if (Array.isArray(part.output?.results)) {
        const resultsText = part.output.results
          .map((r: { title?: string; snippet?: string; url?: string }) =>
            `${r.title || ""} ${r.snippet || ""} ${r.url || ""}`
          )
          .join("\n")
        addText("tool-WebSearch:results", resultsText)
      }
      break

    case "tool-WebFetch":
      addText("tool-WebFetch:url", part.input?.url)
      addText("tool-WebFetch:prompt", part.input?.prompt)
      addText("tool-WebFetch:content", part.output?.markdown || part.output?.content)
      break

    case "tool-Task":
      addText("tool-Task:prompt", part.input?.prompt)
      addText("tool-Task:result", part.output?.result || part.result)
      break

    case "tool-TodoWrite":
      if (Array.isArray(part.input?.todos)) {
        const todosText = part.input.todos
          .map((t: { content?: string }) => t.content || "")
          .join("\n")
        addText("tool-TodoWrite:todos", todosText)
      }
      break

    case "tool-AskUserQuestion":
      if (Array.isArray(part.input?.questions)) {
        const questionsText = part.input.questions
          .map((q: { question?: string }) => q.question || "")
          .join("\n")
        addText("tool-AskUserQuestion:questions", questionsText)
      }
      break

    case "tool-Thinking":
      addText("tool-Thinking:content", part.thinking || part.text)
      break

    default:
      // For unknown tool types, try to extract any text-like content
      if (part.text) {
        addText(part.type, part.text)
      }
      if (part.input && typeof part.input === "object") {
        // Try to stringify input for search
        try {
          const inputStr = JSON.stringify(part.input)
          if (inputStr.length < 10000) {
            // Limit for performance
            addText(`${part.type}:input`, inputStr)
          }
        } catch {
          // Ignore stringify errors
        }
      }
      if (part.output && typeof part.output === "string") {
        addText(`${part.type}:output`, part.output)
      }
      break
  }

  return results
}
*/

/**
 * Extract all searchable text from messages
 * Currently only extracts from text parts (tool content search disabled)
 */
export function extractSearchableText(messages: Message[]): ExtractedText[] {
  const results: ExtractedText[] = []

  for (const message of messages) {
    if (!message.parts) continue

    // For user messages, consolidate all text parts into one entry with partIndex 0
    // This matches how user messages are rendered (single bubble with all text joined)
    if (message.role === "user") {
      const textParts = message.parts.filter(
        (p): p is MessagePart & { type: "text"; text: string } =>
          p.type === "text" && typeof p.text === "string" && p.text.trim().length > 0
      )
      if (textParts.length > 0) {
        const combinedText = textParts.map((p) => p.text).join("\n")
        results.push({
          messageId: message.id,
          partIndex: 0, // Always 0 for user messages
          partType: "text",
          text: combinedText,
        })
      }
      continue
    }

    // For assistant messages, extract from all parts (text and tools)
    for (let partIndex = 0; partIndex < message.parts.length; partIndex++) {
      const part = message.parts[partIndex]
      const extracted = extractTextFromPart(message.id, partIndex, part)
      results.push(...extracted)
    }
  }

  return results
}

// ============================================================================
// SEARCH ALGORITHM
// ============================================================================

/**
 * Find all matches for a query in extracted texts
 */
export function findMatches(
  extractedTexts: ExtractedText[],
  query: string
): SearchMatch[] {
  if (!query.trim()) return []

  const matches: SearchMatch[] = []
  const lowerQuery = query.toLowerCase()

  for (const extracted of extractedTexts) {
    const lowerText = extracted.text.toLowerCase()
    let searchStart = 0

    while (true) {
      const index = lowerText.indexOf(lowerQuery, searchStart)
      if (index === -1) break

      const matchId = `${extracted.messageId}:${extracted.partIndex}:${extracted.partType}:${index}`

      matches.push({
        id: matchId,
        messageId: extracted.messageId,
        partIndex: extracted.partIndex,
        partType: extracted.partType,
        offset: index,
        length: query.length,
      })

      searchStart = index + 1
    }
  }

  return matches
}

// ============================================================================
// HIGHLIGHT UTILITIES
// ============================================================================

export interface TextSegment {
  text: string
  isHighlight: boolean
  isCurrent: boolean
}

/**
 * Split text into segments based on highlight ranges
 */
export function splitTextByHighlights(
  text: string,
  highlights: Array<{ offset: number; length: number; isCurrent: boolean }>
): TextSegment[] {
  if (highlights.length === 0) {
    return [{ text, isHighlight: false, isCurrent: false }]
  }

  // Sort highlights by offset
  const sorted = [...highlights].sort((a, b) => a.offset - b.offset)

  const result: TextSegment[] = []
  let cursor = 0

  for (const h of sorted) {
    // Skip invalid highlights
    if (h.offset < cursor || h.offset >= text.length) continue

    // Text before highlight
    if (h.offset > cursor) {
      result.push({
        text: text.slice(cursor, h.offset),
        isHighlight: false,
        isCurrent: false,
      })
    }

    // Highlighted text
    const endOffset = Math.min(h.offset + h.length, text.length)
    result.push({
      text: text.slice(h.offset, endOffset),
      isHighlight: true,
      isCurrent: h.isCurrent,
    })

    cursor = endOffset
  }

  // Remaining text after last highlight
  if (cursor < text.length) {
    result.push({
      text: text.slice(cursor),
      isHighlight: false,
      isCurrent: false,
    })
  }

  return result
}

// ============================================================================
// DEBOUNCE UTILITY
// ============================================================================

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const debounced = ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      fn(...args)
      timeoutId = null
    }, delay)
  }) as T & { cancel: () => void }

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  return debounced
}
