"use client"

import { useState, useCallback } from "react"
import { cn } from "../../../lib/utils"
import {
  GitHubLogo,
  IconSpinner,
  PlanIcon,
  AgentIcon,
} from "../../../components/ui/canvas-icons"
import { useAtomValue } from "jotai"
import { agentsUnseenChangesAtom, lastChatModesAtom } from "../atoms"

// GitHub avatar with loading placeholder
function GitHubAvatar({
  gitOwner,
  className = "h-4 w-4",
}: {
  gitOwner: string
  className?: string
}) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  const handleLoad = useCallback(() => setIsLoaded(true), [])
  const handleError = useCallback(() => setHasError(true), [])

  if (hasError) {
    return <GitHubLogo className={cn(className, "text-muted-foreground flex-shrink-0")} />
  }

  return (
    <div className={cn(className, "relative flex-shrink-0")}>
      {/* Placeholder background while loading */}
      {!isLoaded && (
        <div className="absolute inset-0 rounded-sm bg-muted" />
      )}
      <img
        src={`https://github.com/${gitOwner}.png?size=64`}
        alt={gitOwner}
        className={cn(className, "rounded-sm flex-shrink-0", isLoaded ? 'opacity-100' : 'opacity-0')}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  )
}

interface AgentChatCardProps {
  chat: {
    id: string
    name: string | null
    meta?: any
    sandbox_id?: string | null
    branch?: string | null
  }
  isSelected: boolean
  isLoading: boolean
  onClick?: () => void
  onMouseEnter?: () => void
  variant?: "sidebar" | "quick-switch"
  // Git info from project (passed from parent)
  gitOwner?: string | null
  gitProvider?: string | null
  repoName?: string | null
}

// Chat icon with status badge
function ChatIconWithBadge({
  isLoading,
  hasUnseenChanges,
  lastMode,
  isSelected = false,
  gitOwner,
  gitProvider,
}: {
  isLoading: boolean
  hasUnseenChanges: boolean
  lastMode: "plan" | "agent"
  isSelected?: boolean
  gitOwner?: string | null
  gitProvider?: string | null
}) {
  // Show GitHub avatar if available, otherwise blank project icon
  const renderMainIcon = () => {
    if (gitOwner && gitProvider === "github") {
      return <GitHubAvatar gitOwner={gitOwner} />
    }

    return (
      <GitHubLogo className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    )
  }

  return (
    <div className="relative flex-shrink-0 h-4 w-4">
      {renderMainIcon()}
      {/* Badge in bottom-right corner */}
      <div
        className={cn(
          "absolute -bottom-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center",
          isSelected ? "bg-primary" : "bg-background",
        )}
      >
        {isLoading ? (
          <IconSpinner
            className={cn(
              "w-2.5 h-2.5",
              isSelected ? "text-primary-foreground" : "text-muted-foreground",
            )}
          />
        ) : hasUnseenChanges ? (
          <div className="w-2 h-2 rounded-full bg-[#307BD0]" />
        ) : lastMode === "plan" ? (
          <PlanIcon
            className={cn(
              "w-2.5 h-2.5",
              isSelected ? "text-primary-foreground" : "text-muted-foreground",
            )}
          />
        ) : (
          <AgentIcon
            className={cn(
              "w-2.5 h-2.5",
              isSelected ? "text-primary-foreground" : "text-muted-foreground",
            )}
          />
        )}
      </div>
    </div>
  )
}

export function AgentChatCard({
  chat,
  isSelected,
  isLoading,
  onClick,
  onMouseEnter,
  variant = "sidebar",
  gitOwner,
  gitProvider,
  repoName,
}: AgentChatCardProps) {
  // Get status atoms
  const unseenChanges = useAtomValue(agentsUnseenChangesAtom)
  const lastChatModes = useAtomValue(lastChatModesAtom)

  const hasUnseenChanges = unseenChanges.has(chat.id)
  const lastMode = lastChatModes.get(chat.id) || "agent"
  // isLoading is already derived from loadingSubChatsAtom (local tracking)
  const actualIsLoading = isLoading

  if (variant === "quick-switch") {
    // Desktop: use branch from chat and repo name from project
    const branch = chat.branch
    const displayRepoName = repoName || "Local project"
    const displayText = branch
      ? `${displayRepoName} • ${branch}`
      : displayRepoName

    return (
      <div
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className={cn(
          "relative rounded-2xl overflow-hidden min-w-[160px] max-w-[180px] p-2 cursor-pointer",
          isSelected ? "bg-primary shadow-lg" : "bg-transparent",
        )}
      >
        <div className="flex items-start gap-2.5">
          <div className="pt-0.5">
            <ChatIconWithBadge
              isLoading={actualIsLoading}
              hasUnseenChanges={hasUnseenChanges}
              lastMode={lastMode}
              isSelected={isSelected}
              gitOwner={gitOwner}
              gitProvider={gitProvider}
            />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            {/* Chat name */}
            <span
              className={cn(
                "truncate block text-sm leading-tight",
                isSelected ? "text-primary-foreground" : "text-foreground",
              )}
            >
              {chat.name || "Untitled Chat"}
            </span>
            {/* Branch/Repository info */}
            <span
              className={cn(
                "text-[11px] truncate",
                isSelected
                  ? "text-primary-foreground/60"
                  : "text-muted-foreground/60",
              )}
            >
              {displayText}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Sidebar variant (default)
  return (
    <div
      onClick={onClick}
      className={cn(
        "w-full text-left pl-2 pr-2 py-1.5 rounded-md transition-colors duration-150 cursor-pointer group relative",
        "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
        isSelected
          ? "bg-foreground/5 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="pt-0.5">
          <ChatIconWithBadge
            isLoading={actualIsLoading}
            hasUnseenChanges={hasUnseenChanges}
            lastMode={lastMode}
            isSelected={isSelected}
            gitOwner={gitOwner}
            gitProvider={gitProvider}
          />
        </div>
        <div className="flex-1 min-w-0">
          <span className="truncate block text-sm leading-tight">
            {chat.name || "Untitled Chat"}
          </span>
        </div>
      </div>
    </div>
  )
}
