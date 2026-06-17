import { toast } from "sonner"
import type { CanonicalChatMessage } from "../../../../shared/chat-message"
import { en, type TranslationKey } from "../../../lib/i18n/dictionaries"
import { trpcClient } from "../../../lib/trpc"

const MAX_HISTORY_CHARS = 50_000
type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string

/**
 * Format chat messages as concise markdown for attaching as context to a new sub-chat.
 * Tool calls are summarized as one-liners. Truncates at ~50k chars, dropping oldest first.
 */
export function formatHistoryForContext(
  messages: Array<Pick<CanonicalChatMessage, "role" | "parts">>,
): string {
  const formatted: string[] = []

  for (const msg of messages) {
    const role = msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : msg.role
    const lines: string[] = []

    for (const part of msg.parts || []) {
      if (part.type === "text" && part.text) {
        lines.push(part.text)
      } else if (part.type === "tool-call" || part.type?.startsWith("tool-")) {
        const toolName = part.toolName || part.type.replace("tool-", "")
        if (part.type === "tool-call") {
          lines.push(`[Tool call: ${toolName}]`)
        }
      }
    }

    if (lines.length > 0) {
      formatted.push(`**${role}:** ${lines.join("\n")}`)
    }
  }

  let result = "# Previous Chat History\n\n" + formatted.join("\n\n")

  // Truncate from the beginning if too long, keeping most recent context
  if (result.length > MAX_HISTORY_CHARS) {
    const truncated = result.slice(result.length - MAX_HISTORY_CHARS)
    const firstNewline = truncated.indexOf("\n\n")
    result =
      "# Previous Chat History (truncated)\n\n[...earlier messages omitted...]\n\n" +
      (firstNewline >= 0 ? truncated.slice(firstNewline + 2) : truncated)
  }

  return result
}

export type ExportFormat = "markdown" | "json" | "text"

interface ExportOptions {
  chatId: string
  subChatId?: string
  format: ExportFormat
  t?: Translate
}

function translate(t: Translate | undefined, key: TranslationKey, values?: Record<string, string | number>) {
  if (t) return t(key, values)

  return (en[key] || key).replace(/\{(\w+)\}/g, (match, name) => {
    const value = values?.[name]
    return value === undefined ? match : String(value)
  })
}

/**
 * Export a chat or sub-chat to a file.
 * Shows download dialog to save the exported content.
 */
export async function exportChat({ chatId, subChatId, format, t }: ExportOptions): Promise<void> {
  try {
    const exportData = await trpcClient.chats.exportChat.query({
      chatId,
      subChatId,
      format,
    })

    const blob = new Blob([exportData.content], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = exportData.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(translate(t, "agent.export.complete"), {
      description: translate(t, "agent.export.savedAs", {
        filename: exportData.filename,
      }),
    })
  } catch (error) {
    console.error("[exportChat] Error:", error)
    toast.error(translate(t, "agent.export.failed"), {
      description: error instanceof Error ? error.message : translate(t, "agent.export.unableToExport"),
    })
  }
}

/**
 * Copy chat or sub-chat content to clipboard.
 */
export async function copyChat({ chatId, subChatId, format, t }: ExportOptions): Promise<void> {
  try {
    const exportData = await trpcClient.chats.exportChat.query({
      chatId,
      subChatId,
      format,
    })

    try {
      await navigator.clipboard.writeText(exportData.content)
    } catch {
      // Fallback using Electron clipboard API
      if (window.desktopApi?.clipboardWrite) {
        await window.desktopApi.clipboardWrite(exportData.content)
      } else {
        throw new Error(translate(t, "agent.export.clipboardUnavailable"))
      }
    }

    toast.success(translate(t, "agent.export.copiedToClipboard"))
  } catch (error) {
    console.error("[copyChat] Error:", error)
    toast.error(translate(t, "agent.export.copyFailed"), {
      description: error instanceof Error ? error.message : translate(t, "agent.export.unableToCopy"),
    })
  }
}
