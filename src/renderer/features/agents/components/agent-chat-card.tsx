"use client"

import { useAtomValue } from "jotai"
import { cn } from "../../../lib/utils"
import { IconSpinner, PlanIcon, AgentIcon } from "../../../components/ui/canvas-icons"
import { ProjectIcon } from "../../../components/ui/project-icon"
import { agentsUnseenChangesAtom, lastChatModesAtom } from "../atoms"

interface AgentChatCardProps {
  chat: {
    id: string
    name: string
    meta: any
    sandbox_id: string | null
    branch?: string | null
  }
  isSelected: boolean
  isLoading: boolean
  onClick?: () => void
  onMouseEnter?: () => void
  variant?: "sidebar" | "quick-switch"
  project?:
    | {
        id?: string | null
        name?: string | null
        gitRepo?: string | null
        iconPath?: string | null
        updatedAt?: string | Date | null
      }
    | null
  repoName?: string | null
}

// Chat icon with status badge
function ChatIconWithBadge({
  isLoading,
  hasUnseenChanges,
  lastMode,
  isSelected = false,
  project,
}: {
  isLoading: boolean
  hasUnseenChanges: boolean
  lastMode: "plan" | "agent"
  isSelected?: boolean
  project?:
    | {
        id?: string | null
        name?: string | null
        gitRepo?: string | null
        iconPath?: string | null
        updatedAt?: string | Date | null
      }
    | null
}) {
  return (
    <div className="relative flex-shrink-0 h-4 w-4">
      <ProjectIcon project={project} className="h-4 w-4" />
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
  project,
  repoName,
}: AgentChatCardProps) {
  const unseenChanges = useAtomValue(agentsUnseenChangesAtom)
  const lastChatModes = useAtomValue(lastChatModesAtom)

  const hasUnseenChanges = unseenChanges.has(chat.id)
  const lastMode = lastChatModes.get(chat.id) || "agent"
  const actualIsLoading = isLoading

  if (variant === "quick-switch") {
    const branch = chat.branch
    const displayRepoName = repoName || project?.gitRepo || project?.name || "Local project"
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
              project={project}
            />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span
              className={cn(
                "truncate block text-sm leading-tight",
                isSelected ? "text-primary-foreground" : "text-foreground",
              )}
            >
              {chat.name || "Untitled Chat"}
            </span>
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
            project={project}
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
