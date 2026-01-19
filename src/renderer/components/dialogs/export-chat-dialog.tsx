import * as React from "react"
import { useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "../ui/button"
import { X, Download, FileJson, FileText, Copy, Check } from "lucide-react"
import { trpc } from "../../lib/trpc"

type ExportFormat = "markdown" | "json" | "text"

interface ExportChatDialogProps {
  isOpen: boolean
  onClose: () => void
  chatId: string
  chatName: string | null
}

export function ExportChatDialog({
  isOpen,
  onClose,
  chatId,
  chatName,
}: ExportChatDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("markdown")
  const [copied, setCopied] = useState(false)

  const { data: exportData, isLoading } = trpc.chats.exportChat.useQuery(
    { chatId, format: selectedFormat },
    { enabled: isOpen }
  )

  const { data: stats } = trpc.chats.getChatStats.useQuery(
    { chatId },
    { enabled: isOpen }
  )

  const handleDownload = () => {
    if (!exportData) return

    const blob = new Blob([exportData.content], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = exportData.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleCopy = async () => {
    if (!exportData) return

    try {
      await navigator.clipboard.writeText(exportData.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for older browsers
      const textarea = document.createElement("textarea")
      textarea.value = exportData.content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen || typeof document === "undefined") return null

  const formatOptions: { value: ExportFormat; label: string; icon: React.ReactNode; description: string }[] = [
    {
      value: "markdown",
      label: "Markdown",
      icon: <FileText className="h-4 w-4" />,
      description: "readable format with code blocks",
    },
    {
      value: "json",
      label: "JSON",
      icon: <FileJson className="h-4 w-4" />,
      description: "full data for import/backup",
    },
    {
      value: "text",
      label: "Plain Text",
      icon: <FileText className="h-4 w-4" />,
      description: "simple text without formatting",
    },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* dialog */}
      <div className="relative bg-background border border-border rounded-lg shadow-lg w-full max-w-lg mx-4 p-6">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-semibold mb-1">Export Conversation</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {chatName || "Untitled Chat"}
        </p>

        {/* stats */}
        {stats && (
          <div className="flex gap-4 text-xs text-muted-foreground mb-4 pb-4 border-b border-border">
            <span>{stats.messageCount} messages</span>
            <span>{stats.toolCalls} tool calls</span>
            {stats.totalInputTokens > 0 && (
              <span>{Math.round((stats.totalInputTokens + stats.totalOutputTokens) / 1000)}k tokens</span>
            )}
          </div>
        )}

        {/* format selection */}
        <div className="space-y-2 mb-4">
          <label className="text-sm font-medium">Format</label>
          <div className="grid grid-cols-3 gap-2">
            {formatOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedFormat(option.value)}
                className={`
                  flex flex-col items-center gap-1 p-3 rounded-md border transition-colors
                  ${selectedFormat === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                  }
                `}
              >
                {option.icon}
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">
                  {option.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* preview */}
        {exportData && !isLoading && (
          <div className="mb-4">
            <label className="text-sm font-medium mb-2 block">Preview</label>
            <div className="bg-muted/50 rounded-md p-3 max-h-40 overflow-auto font-mono text-xs">
              <pre className="whitespace-pre-wrap break-words">
                {exportData.content.slice(0, 500)}
                {exportData.content.length > 500 && "..."}
              </pre>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="mb-4 py-8 text-center text-sm text-muted-foreground">
            preparing export...
          </div>
        )}

        {/* actions */}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleCopy}
            disabled={!exportData || isLoading}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-1" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </>
            )}
          </Button>
          <Button
            onClick={handleDownload}
            disabled={!exportData || isLoading}
          >
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
