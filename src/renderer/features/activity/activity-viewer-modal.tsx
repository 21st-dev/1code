"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Button } from "../../components/ui/button"
import { type ToolActivity } from "../../lib/atoms"
import { cn } from "../../lib/utils"
import {
  Copy,
  Check,
  FileText,
  FilePen,
  Terminal,
  Search,
  Globe,
  Bot,
  ListTodo,
  HelpCircle,
  FileCode,
  Wrench,
} from "lucide-react"

// Tool icon components for display
function getToolIcon(toolName: string) {
  const iconClass = "w-5 h-5"
  switch (toolName) {
    case "Read":
      return <FileText className={iconClass} />
    case "Write":
      return <FilePen className={iconClass} />
    case "Edit":
      return <FilePen className={iconClass} />
    case "Bash":
      return <Terminal className={iconClass} />
    case "Glob":
    case "Grep":
      return <Search className={iconClass} />
    case "WebFetch":
    case "WebSearch":
      return <Globe className={iconClass} />
    case "Task":
      return <Bot className={iconClass} />
    case "TodoWrite":
      return <ListTodo className={iconClass} />
    case "AskUserQuestion":
      return <HelpCircle className={iconClass} />
    case "NotebookEdit":
      return <FileCode className={iconClass} />
    default:
      return <Wrench className={iconClass} />
  }
}

/**
 * Format timestamp for display
 */
function formatTimestamp(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

/**
 * Pretty-print JSON with syntax highlighting classes
 */
function JsonViewer({ json, maxHeight = "300px" }: { json: string | null; maxHeight?: string }) {
  const [copied, setCopied] = useState(false)

  if (!json) {
    return (
      <div className="text-muted-foreground text-sm italic">No data</div>
    )
  }

  // Try to parse and pretty-print
  let formatted = json
  try {
    const parsed = JSON.parse(json)
    formatted = JSON.stringify(parsed, null, 2)
  } catch {
    // Keep original if not valid JSON
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatted)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isTruncated = formatted.includes("... (truncated)")

  return (
    <div className="relative group">
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
      <pre
        className="bg-muted/50 rounded-md p-3 text-xs font-mono overflow-auto whitespace-pre-wrap break-all"
        style={{ maxHeight }}
      >
        {formatted}
      </pre>
      {isTruncated && (
        <div className="text-xs text-muted-foreground mt-1 italic">
          Output was truncated (exceeds 50KB limit)
        </div>
      )}
    </div>
  )
}

interface ActivityViewerModalProps {
  activity: ToolActivity | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ActivityViewerModal({
  activity,
  open,
  onOpenChange,
}: ActivityViewerModalProps) {
  if (!activity) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="text-muted-foreground">{getToolIcon(activity.toolName)}</div>
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2">
                {activity.toolName}
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    activity.state === "running" &&
                      "bg-blue-500/10 text-blue-500",
                    activity.state === "complete" &&
                      "bg-green-500/10 text-green-500",
                    activity.state === "error" &&
                      "bg-destructive/10 text-destructive",
                  )}
                >
                  {activity.state}
                </span>
              </DialogTitle>
              <div className="text-sm text-muted-foreground mt-1">
                {activity.chatName} &bull; {formatTimestamp(activity.createdAt)}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Summary */}
          <div>
            <h4 className="text-sm font-medium mb-1">Summary</h4>
            <div className="text-sm text-muted-foreground">
              {activity.summary}
            </div>
          </div>

          {/* Input */}
          <div>
            <h4 className="text-sm font-medium mb-2">Input</h4>
            <JsonViewer json={activity.input} />
          </div>

          {/* Output or Error */}
          {activity.state === "error" && activity.errorText ? (
            <div>
              <h4 className="text-sm font-medium mb-2 text-destructive">
                Error
              </h4>
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive whitespace-pre-wrap">
                {activity.errorText}
              </div>
            </div>
          ) : activity.output ? (
            <div>
              <h4 className="text-sm font-medium mb-2">Output</h4>
              <JsonViewer json={activity.output} />
            </div>
          ) : activity.state === "running" ? (
            <div>
              <h4 className="text-sm font-medium mb-2">Output</h4>
              <div className="text-muted-foreground text-sm italic">
                Tool is still running...
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
