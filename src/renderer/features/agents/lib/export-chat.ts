import { trpcClient } from "../../../lib/trpc"
import { toast } from "sonner"

export type ExportFormat = "markdown" | "json" | "text"

interface ExportOptions {
  chatId: string
  subChatId?: string
  format: ExportFormat
}

/**
 * Export a chat or sub-chat to a file.
 * Shows download dialog to save the exported content.
 */
export async function exportChat({ chatId, subChatId, format }: ExportOptions): Promise<void> {
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

    toast.success("Export complete", {
      description: `Saved as ${exportData.filename}`,
    })
  } catch (error) {
    console.error("[exportChat] Error:", error)
    toast.error("Export failed", {
      description: error instanceof Error ? error.message : "Unable to export chat",
    })
  }
}

/**
 * Copy chat or sub-chat content to clipboard.
 */
export async function copyChat({ chatId, subChatId, format }: ExportOptions): Promise<void> {
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
        throw new Error("Clipboard not available")
      }
    }

    toast.success("Copied to clipboard")
  } catch (error) {
    console.error("[copyChat] Error:", error)
    toast.error("Copy failed", {
      description: error instanceof Error ? error.message : "Unable to copy chat",
    })
  }
}
