"use client"

import { useState } from "react"
import { X } from "lucide-react"

// Code selection icon - cursor arrow with text cursor
function CodeSelectIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M14 2C13.4477 2 13 2.44772 13 3C13 3.55228 13.4477 4 14 4H15V20H14C13.4477 20 13 20.4477 13 21C13 21.5523 13.4477 22 14 22H18C18.5523 22 19 21.5523 19 21C19 20.4477 18.5523 20 18 20H17V4H18C18.5523 4 19 3.55228 19 3C19 2.44772 18.5523 2 18 2H14Z" fill="currentColor"/>
      <path d="M4.29287 5.29289C4.68338 4.90237 5.31638 4.90237 5.70698 5.29289L11.707 11.2929C12.0974 11.6834 12.0975 12.3165 11.707 12.707L5.70698 18.707C5.31648 19.0975 4.68338 19.0974 4.29287 18.707C3.90237 18.3164 3.90237 17.6834 4.29287 17.2929L9.58587 11.9999L4.29287 6.70696C3.90237 6.31643 3.90237 5.68342 4.29287 5.29289Z" fill="currentColor"/>
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
  const [isHovered, setIsHovered] = useState(false)

  // Extract just the filename from the path
  const fileName = filePath.split("/").pop() || filePath

  return (
    <div
      className="relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50 cursor-default min-w-[120px] max-w-[200px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Icon container */}
      <div className="flex items-center justify-center size-8 rounded-md bg-muted shrink-0">
        <CodeSelectIcon className="size-4 text-muted-foreground" />
      </div>

      {/* Text content */}
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-foreground truncate">
          {fileName}
        </span>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          {lineNumber && <span>Line {lineNumber}</span>}
          {lineType && (
            <span className={lineType === "new" ? "text-green-500" : "text-red-500"}>
              {lineNumber ? "· " : ""}{lineType === "new" ? "Added" : "Removed"}
            </span>
          )}
          {!lineNumber && !lineType && "Code selection"}
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
