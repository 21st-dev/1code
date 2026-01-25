"use client"

import { useState } from "react"
import { X } from "lucide-react"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../../../components/ui/hover-card"

// Text selection icon - "A" with text cursor
function TextSelectIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M8.50027 4C8.91147 4 9.28067 4.25166 9.43107 4.63435L14.9311 18.6343C15.133 19.1484 14.88 19.7288 14.366 19.9308C13.8519 20.1327 13.2715 19.8797 13.0695 19.3657L11.3545 15H5.64607L3.93107 19.3657C3.72907 19.8797 3.14867 20.1327 2.63462 19.9308C2.12058 19.7288 1.86757 19.1484 2.06952 18.6343L7.56947 4.63435C7.71987 4.25166 8.08907 4 8.50027 4ZM6.43177 13H10.5688L8.50027 7.73484L6.43177 13Z" fill="currentColor"/>
      <path d="M17 2C16.4477 2 16 2.44772 16 3C16 3.55228 16.4477 4 17 4H18V20H17C16.4477 20 16 20.4477 16 21C16 21.5523 16.4477 22 17 22H21C21.5523 22 22 21.5523 22 21C22 20.4477 21.5523 20 21 20H20V4H21C21.5523 4 22 3.55228 22 3C22 2.44772 21.5523 2 21 2H17Z" fill="currentColor"/>
    </svg>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

interface AgentPastedTextItemProps {
  filePath: string
  filename: string
  size: number
  preview: string
  onRemove?: () => void
}

export function AgentPastedTextItem({
  filePath,
  filename,
  size,
  preview,
  onRemove,
}: AgentPastedTextItemProps) {
  const [isHovered, setIsHovered] = useState(false)

  // Get a short title from the preview
  const title = preview.split("\n")[0]?.slice(0, 20) || preview.slice(0, 20)
  const displayTitle = title.length < preview.length ? `${title}...` : title

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div
          className="relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50 cursor-default min-w-[120px] max-w-[200px]"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Icon container */}
          <div className="flex items-center justify-center size-8 rounded-md bg-muted shrink-0">
            <TextSelectIcon className="size-4 text-muted-foreground" />
          </div>

          {/* Text content */}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-foreground truncate">
              {displayTitle}
            </span>
            <span className="text-xs text-muted-foreground">
              Pasted Text · {formatSize(size)}
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
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-80">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TextSelectIcon className="size-3" />
            <span>Pasted text · {formatSize(size)}</span>
          </div>
          <pre className="text-sm whitespace-pre-wrap break-words font-mono max-h-32 overflow-y-auto scrollbar-thin">
            {preview}
          </pre>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
