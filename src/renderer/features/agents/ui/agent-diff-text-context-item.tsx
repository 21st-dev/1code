"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { useI18n } from "../../../lib/i18n"
import { isPlanFile } from "./agent-tool-utils"

// Code selection icon - cursor arrow with text cursor
function CodeSelectIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M14 2C13.4477 2 13 2.44772 13 3C13 3.55228 13.4477 4 14 4H15V20H14C13.4477 20 13 20.4477 13 21C13 21.5523 13.4477 22 14 22H18C18.5523 22 19 21.5523 19 21C19 20.4477 18.5523 20 18 20H17V4H18C18.5523 4 19 3.55228 19 3C19 2.44772 18.5523 2 18 2H14Z" fill="currentColor"/>
      <path d="M4.29287 5.29289C4.68338 4.90237 5.31638 4.90237 5.70698 5.29289L11.707 11.2929C12.0974 11.6834 12.0975 12.3165 11.707 12.707L5.70698 18.707C5.31648 19.0975 4.68338 19.0974 4.29287 18.707C3.90237 18.3164 3.90237 17.6834 4.29287 17.2929L9.58587 11.9999L4.29287 6.70696C3.90237 6.31643 3.90237 5.68342 4.29287 5.29289Z" fill="currentColor"/>
    </svg>
  )
}

// Text selection icon - cursor with text lines
function TextSelectIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 4C4.44772 4 4 4.44772 4 5C4 5.55228 4.44772 6 5 6H19C19.5523 6 20 5.55228 20 5C20 4.44772 19.5523 4 19 4H5Z" fill="currentColor"/>
      <path d="M5 9C4.44772 9 4 9.44772 4 10C4 10.5523 4.44772 11 5 11H15C15.5523 11 16 10.5523 16 10C16 9.44772 15.5523 9 15 9H5Z" fill="currentColor"/>
      <path d="M5 14C4.44772 14 4 14.4477 4 15C4 15.5523 4.44772 16 5 16H11C11.5523 16 12 15.5523 12 15C12 14.4477 11.5523 14 11 14H5Z" fill="currentColor"/>
      <path d="M5 19C4.44772 19 4 19.4477 4 20C4 20.5523 4.44772 21 5 21H17C17.5523 21 18 20.5523 18 20C18 19.4477 17.5523 19 17 19H5Z" fill="currentColor"/>
    </svg>
  )
}

interface AgentDiffTextContextItemProps {
  text: string
  preview: string
  filePath: string
  lineNumber?: number
  lineType?: "old" | "new"
  onRemove?: () => void
}

export function AgentDiffTextContextItem({
  text,
  preview,
  filePath,
  lineNumber,
  lineType,
  onRemove,
}: AgentDiffTextContextItemProps) {
  const { t } = useI18n()
  const [isHovered, setIsHovered] = useState(false)

  // Check if this is a plan selection
  const isPlan = isPlanFile(filePath)

  // Extract just the filename from the path
  const fileName = filePath.split("/").pop() || filePath

  return (
    <div
      className="relative flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg bg-muted/50 cursor-default min-w-[120px] max-w-[200px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Icon container */}
      <div className="flex items-center justify-center w-8 self-stretch rounded-md bg-muted shrink-0">
        {isPlan ? (
          <TextSelectIcon className="size-4 text-muted-foreground" />
        ) : (
          <CodeSelectIcon className="size-4 text-muted-foreground" />
        )}
      </div>

      {/* Text content */}
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-foreground truncate">
          {isPlan ? "Plan" : fileName}
        </span>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          {isPlan ? (
            t("agent.textSelection.selectedText")
          ) : (
            <>
              {lineNumber && <span>{t("agent.textSelection.line", { line: lineNumber })}</span>}
              {lineType && (
                <span className={lineType === "new" ? "text-green-500" : "text-red-500"}>
                  {lineNumber ? "· " : ""}
                  {lineType === "new"
                    ? t("agent.textSelection.added")
                    : t("agent.textSelection.removed")}
                </span>
              )}
              {!lineNumber && !lineType && t("agent.textSelection.codeSelection")}
            </>
          )}
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
