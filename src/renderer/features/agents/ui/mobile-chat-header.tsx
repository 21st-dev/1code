"use client"

import { useCallback, useMemo, useState } from "react"
import { useAtomValue } from "jotai"
import { loadingSubChatsAtom } from "../atoms"
import { Plus, ChevronDown, Play, AlignJustify, FolderDown, MessageCircleQuestion } from "lucide-react"
import {
  IconSpinner,
  PlanIcon,
  AgentIcon,
  DiffIcon,
  CustomTerminalIcon,
  IconTextUndo,
} from "../../../components/ui/icons"
import { Button } from "../../../components/ui/button"
import { cn } from "../../../lib/utils"
import {
  useAgentSubChatStore,
  type SubChatMeta,
} from "../stores/sub-chat-store"
import { PopoverTrigger } from "../../../components/ui/popover"
import { SearchCombobox } from "../../../components/ui/search-combobox"
import { formatTimeAgo } from "../utils/format-time-ago"

interface DiffStats {
  fileCount: number
  additions: number
  deletions: number
  isLoading: boolean
  hasChanges: boolean
}

interface MobileChatHeaderProps {
  onCreateNew: () => void
  onBackToChats?: () => void
  onOpenPreview?: () => void
  canOpenPreview?: boolean
  onOpenDiff?: () => void
  canOpenDiff?: boolean
  diffStats?: DiffStats
  onOpenTerminal?: () => void
  canOpenTerminal?: boolean
  isTerminalOpen?: boolean
  isArchived?: boolean
  onRestore?: () => void
  onOpenLocally?: () => void
  showOpenLocally?: boolean
}

export function MobileChatHeader({
  onCreateNew,
  onBackToChats,
  onOpenPreview,
  canOpenPreview = false,
  onOpenDiff,
  canOpenDiff = false,
  diffStats,
  onOpenTerminal,
  canOpenTerminal = false,
  isTerminalOpen = false,
  isArchived = false,
  onRestore,
  onOpenLocally,
  showOpenLocally = false,
}: MobileChatHeaderProps) {
  const activeSubChatId = useAgentSubChatStore((state) => state.activeSubChatId)
  const allSubChats = useAgentSubChatStore((state) => state.allSubChats)
  const loadingSubChatsAtomValue = useAtomValue(loadingSubChatsAtom)

  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  // Find active sub-chat metadata
  const activeSubChat = useMemo(() => {
    return allSubChats.find((sc) => sc.id === activeSubChatId)
  }, [allSubChats, activeSubChatId])

  const isLoading = activeSubChatId
    ? loadingSubChatsAtomValue.has(activeSubChatId)
    : false
  const mode = activeSubChat?.mode || "agent"

  // Sort sub-chats by most recent first for history
  const sortedSubChats = useMemo(
    () =>
      [...allSubChats].sort((a, b) => {
        const aT = new Date(a.updated_at || a.created_at || "0").getTime()
        const bT = new Date(b.updated_at || b.created_at || "0").getTime()
        return bT - aT
      }),
    [allSubChats],
  )

  const onSwitchFromHistory = useCallback((subChatId: string) => {
    const state = useAgentSubChatStore.getState()
    const isAlreadyOpen = state.openSubChatIds.includes(subChatId)

    if (!isAlreadyOpen) {
      state.addToOpenSubChats(subChatId)
    }
    state.setActiveSubChat(subChatId)
  }, [])

  const handleSelectFromHistory = useCallback(
    (subChat: SubChatMeta) => {
      onSwitchFromHistory(subChat.id)
      setIsHistoryOpen(false)
    },
    [onSwitchFromHistory],
  )

  return (
    <div
      className="flex items-center gap-1.5 h-7 w-full min-w-0"
      style={{
        // @ts-expect-error - WebKit-specific property for Electron window dragging
        WebkitAppRegion: "drag",
      }}
    >
      {/* Burger button - opens all projects */}
      {onBackToChats && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onBackToChats}
          className="h-7 w-7 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 rounded-md"
          aria-label="All projects"
          style={{
            // @ts-expect-error - WebKit-specific property
            WebkitAppRegion: "no-drag",
          }}
        >
          <AlignJustify className="h-4 w-4" />
        </Button>
      )}

      {/* Active chat trigger - opens history (shrinks to content, max-width limited) */}
      <SearchCombobox
        isOpen={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        items={sortedSubChats}
        onSelect={handleSelectFromHistory}
        placeholder="Search chats..."
        emptyMessage="No results"
        align="start"
        side="bottom"
        sideOffset={8}
        getItemValue={(subChat) =>
          `${subChat.name || "New Chat"} ${subChat.id}`
        }
        renderItem={(subChat) => {
          const timeAgo = formatTimeAgo(
            subChat.updated_at || subChat.created_at,
          )
          const isActive = subChat.id === activeSubChatId
          return (
            <div
              className={cn(
                "flex items-center gap-2 flex-1 min-w-0",
                isActive && "font-medium",
              )}
            >
              <span className="text-sm truncate">
                {subChat.name || "New Chat"}
              </span>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {timeAgo}
              </span>
            </div>
          )
        }}
        trigger={
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-1.5 h-7 px-2 rounded-md text-sm",
                "bg-muted/50 hover:bg-muted transition-colors",
                "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                "min-w-0 max-w-[50vw] shrink",
              )}
              style={{
                // @ts-expect-error - WebKit-specific property
                WebkitAppRegion: "no-drag",
              }}
            >
              {/* Icon */}
              <div className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">
                {isLoading ? (
                  <IconSpinner className="w-3.5 h-3.5 text-muted-foreground" />
                ) : mode === "plan" ? (
                  <PlanIcon className="w-3.5 h-3.5 text-muted-foreground" />
                ) : mode === "ask" ? (
                  <MessageCircleQuestion className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <AgentIcon className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>

              {/* Name */}
              <span className="truncate text-left">
                {activeSubChat?.name || "New Chat"}
              </span>

              {/* Chevron */}
              <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            </button>
          </PopoverTrigger>
        }
      />

      {/* Spacer to push buttons to the right */}
      <div className="flex-1" />

      {/* Action buttons - always on the right */}
      <div
        className="flex items-center gap-1 flex-shrink-0"
        style={{
          // @ts-expect-error - WebKit-specific property
          WebkitAppRegion: "no-drag",
        }}
      >
        {/* Open Locally - only for sandbox chats */}
        {showOpenLocally && onOpenLocally && (
          <Button
            variant="default"
            size="sm"
            onClick={onOpenLocally}
            className="h-7 px-2.5 gap-1.5 text-xs font-medium"
          >
            <FolderDown className="h-3.5 w-3.5" />
            Open Locally
          </Button>
        )}

        {/* Create new */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onCreateNew}
          className="h-7 w-7 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md"
        >
          <Plus className="h-4 w-4" />
        </Button>

        {/* Terminal button - hidden when terminal is already open */}
        {onOpenTerminal && canOpenTerminal && !isTerminalOpen && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenTerminal}
            className="h-7 w-7 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md"
          >
            <CustomTerminalIcon className="h-4 w-4" />
          </Button>
        )}

        {/* Diff button */}
        {onOpenDiff && canOpenDiff && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenDiff}
            disabled={!diffStats?.hasChanges || diffStats?.isLoading}
            className={cn(
              "h-7 w-7 p-0 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md",
              diffStats?.hasChanges && !diffStats?.isLoading
                ? "hover:bg-foreground/10"
                : "text-muted-foreground",
            )}
          >
            {diffStats?.isLoading ? (
              <IconSpinner className="h-4 w-4" />
            ) : (
              <DiffIcon className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Preview button */}
        {onOpenPreview && canOpenPreview && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenPreview}
            className="h-7 w-7 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md"
          >
            <Play className="h-4 w-4" />
          </Button>
        )}

        {/* Restore button - only when viewing archived workspace */}
        {isArchived && onRestore && (
          <Button
            variant="ghost"
            onClick={onRestore}
            className="h-7 px-2 gap-1.5 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md flex items-center"
          >
            <IconTextUndo className="h-4 w-4" />
            <span className="text-xs">Restore</span>
          </Button>
        )}
      </div>
    </div>
  )
}
