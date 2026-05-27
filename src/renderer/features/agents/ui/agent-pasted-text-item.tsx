"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { useI18n } from "../../../lib/i18n"

// Text selection icon - "A" with text cursor
function TextSelectIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M8.50027 4C8.91147 4 9.28067 4.25166 9.43107 4.63435L14.9311 18.6343C15.133 19.1484 14.88 19.7288 14.366 19.9308C13.8519 20.1327 13.2715 19.8797 13.0695 19.3657L11.3545 15H5.64607L3.93107 19.3657C3.72907 19.8797 3.14867 20.1327 2.63462 19.9308C2.12058 19.7288 1.86757 19.1484 2.06952 18.6343L7.56947 4.63435C7.71987 4.25166 8.08907 4 8.50027 4ZM6.43177 13H10.5688L8.50027 7.73484L6.43177 13Z" fill="currentColor"/>
      <path d="M17 2C16.4477 2 16 2.44772 16 3C16 3.55228 16.4477 4 17 4H18V20H17C16.4477 20 16 20.4477 16 21C16 21.5523 16.4477 22 17 22H21C21.5523 22 22 21.5523 22 21C22 20.4477 21.5523 20 21 20H20V4H21C21.5523 4 22 3.55228 22 3C22 2.44772 21.5523 2 21 2H17Z" fill="currentColor"/>
    </svg>
  )
}

// Chat history icon - message square
function ChatHistoryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

interface AgentPastedTextItemProps {
  filePath: string
  filename: string
  size: number
  preview: string
  kind?: "pasted" | "chatHistory"
  onRemove?: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AgentPastedTextItem({
  filePath,
  filename,
  size,
  preview,
  kind = "pasted",
  onRemove,
}: AgentPastedTextItemProps) {
  const { t } = useI18n()
  const [isHovered, setIsHovered] = useState(false)

  const isChatHistory = kind === "chatHistory"

  // Get a short title from the preview
  const title = isChatHistory
    ? (preview?.trim() || t("agent.pastedText.previousChat"))
    : (preview.split("\n")[0]?.trim() || preview.trim())
  const displayTitle = title.length > 20 ? `${title.slice(0, 20)}...` : title

  const subtitle = `${isChatHistory ? t("agent.pastedText.pastChat") : t("agent.pastedText.pastedText")} · ${formatSize(size)}`

  return (
    <div
      className="relative flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg bg-muted/50 cursor-default min-w-[120px] max-w-[200px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Icon container */}
      <div className="flex items-center justify-center w-8 self-stretch rounded-md bg-muted shrink-0">
        {isChatHistory ? (
          <ChatHistoryIcon className="size-4 text-muted-foreground" />
        ) : (
          <TextSelectIcon className="size-4 text-muted-foreground" />
        )}
      </div>

      {/* Text content */}
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-foreground truncate">
          {displayTitle}
        </span>
        <span className="text-xs text-muted-foreground">
          {subtitle}
        </span>
      </div>

      {/* Remove button */}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className={`absolute -top-1.5 -right-1.5 size-4 rounded-full bg-background border border-border
                     flex items-center justify-center transition-[opacity,transform] duration-150 ease-out active:scale-[0.97] z-10
                     text-muted-foreground hover:text-foreground
                     ${isHovered ? "opacity-100" : "opacity-0"}`}
          type="button"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}
