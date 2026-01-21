"use client"

import React, { useMemo, useRef, useEffect, useState, useCallback, memo } from "react"
import { useAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import {
  archivePopoverOpenAtom,
  archiveSearchQueryAtom,
  selectedAgentChatIdAtom,
} from "../atoms"
import { Input } from "../../../components/ui/input"
import {
  SearchIcon,
  ArchiveIcon,
  IconTextUndo,
  GitHubLogo,
} from "../../../components/ui/icons"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover"
import { cn } from "../../../lib/utils"

// Format relative time - moved outside component to avoid recreation
const formatTime = (dateInput: Date | string) => {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "now"
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`
  return `${Math.floor(diffDays / 365)}y`
}

// Memoized chat item component to prevent unnecessary re-renders
interface ArchiveChatItemProps {
  chat: {
    id: string
    name: string | null
    branch: string | null
    projectId: string
    updatedAt: Date | null
    archivedAt: Date | null
  }
  index: number
  isSelected: boolean
  isCurrentChat: boolean
  projectsMap: Map<string, { gitOwner: string | null; gitRepo: string | null; gitProvider: string | null; name: string }>
  onSelect: (id: string) => void
  onRestore: (id: string) => void
  setRef: (index: number, el: HTMLDivElement | null) => void
}

const ArchiveChatItem = memo(function ArchiveChatItem({
  chat,
  index,
  isSelected,
  isCurrentChat,
  projectsMap,
  onSelect,
  onRestore,
  setRef,
}: ArchiveChatItemProps) {
  const branch = chat.branch
  const project = projectsMap.get(chat.projectId)
  const gitOwner = project?.gitOwner
  const gitRepo = project?.gitRepo
  const gitProvider = project?.gitProvider
  const isGitHubRepo = gitProvider === "github" && !!gitOwner
  const avatarUrl = isGitHubRepo
    ? `https://github.com/${gitOwner}.png?size=64`
    : null

  const repoName = gitRepo || project?.name
  const displayText = branch
    ? repoName
      ? `${repoName} • ${branch}`
      : branch
    : repoName || "Local project"

  const handleClick = useCallback(() => {
    onSelect(chat.id)
  }, [onSelect, chat.id])

  const handleRestore = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onRestore(chat.id)
  }, [onRestore, chat.id])

  const handleRef = useCallback((el: HTMLDivElement | null) => {
    setRef(index, el)
  }, [setRef, index])

  return (
    <div
      ref={handleRef}
      onClick={handleClick}
      className={cn(
        "w-[calc(100%-8px)] mx-1 text-left min-h-[32px] py-[5px] px-1.5 rounded-md transition-colors duration-150 cursor-pointer group relative",
        "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
        isSelected || isCurrentChat
          ? "dark:bg-neutral-800 bg-accent text-foreground"
          : "text-muted-foreground dark:hover:bg-neutral-800 hover:bg-accent hover:text-foreground",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="pt-0.5">
          {isGitHubRepo ? (
            avatarUrl ? (
              <img
                src={avatarUrl}
                alt={gitOwner || "GitHub"}
                className="h-4 w-4 rounded-sm flex-shrink-0"
              />
            ) : (
              <GitHubLogo
                className={cn(
                  "h-4 w-4 flex-shrink-0 transition-colors duration-150",
                  isSelected
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              />
            )
          ) : (
            <GitHubLogo
              className={cn(
                "h-4 w-4 flex-shrink-0 transition-colors duration-150",
                isSelected
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            />
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="truncate block text-sm leading-tight flex-1">
              {chat.name || (
                <span className="text-muted-foreground/50">
                  New workspace
                </span>
              )}
            </span>
            <button
              onClick={handleRestore}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground active:text-foreground transition-[color,transform] duration-150 ease-out active:scale-[0.97]"
              aria-label="Restore chat"
            >
              <IconTextUndo className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground/60 truncate">
              {displayText}
            </span>
            <span className="text-[11px] text-muted-foreground/60 flex-shrink-0">
              {formatTime(
                chat.updatedAt?.toISOString() ??
                  new Date().toISOString(),
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
})

// Desktop: uses project info for git owner/provider

interface ArchivePopoverProps {
  trigger: React.ReactNode
}

export const ArchivePopover = memo(function ArchivePopover({ trigger }: ArchivePopoverProps) {
  const [open, setOpen] = useAtom(archivePopoverOpenAtom)
  const [searchQuery, setSearchQuery] = useAtom(archiveSearchQueryAtom)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const popoverContentRef = useRef<HTMLDivElement>(null)
  const chatItemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)

  // Get utils outside of callbacks - hooks must be called at top level
  const utils = trpc.useUtils()

  const { data: archivedChats, isLoading } = trpc.chats.listArchived.useQuery(
    {},
    { enabled: open },
  )

  // Fetch all projects for git info
  const { data: projects } = trpc.projects.list.useQuery()

  // Create map for quick project lookup by id
  const projectsMap = useMemo(() => {
    if (!projects) return new Map()
    return new Map(projects.map((p) => [p.id, p]))
  }, [projects])

  const restoreMutation = trpc.chats.restore.useMutation({
    onSuccess: (restoredChat) => {
      // Optimistically add restored chat to the main list cache
      if (restoredChat) {
        utils.chats.list.setData({}, (oldData) => {
          if (!oldData) return [restoredChat]
          // Add to beginning if not already present
          if (oldData.some((c) => c.id === restoredChat.id)) return oldData
          return [restoredChat, ...oldData]
        })
      }
      // Invalidate both lists to refresh
      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()
    },
  })

  // Filter and sort archived chats (always newest first)
  const filteredChats = useMemo(() => {
    if (!archivedChats) return []

    return archivedChats
      .filter((chat) => {
        // Search filter by name only
        if (
          searchQuery.trim() &&
          !(chat.name ?? "").toLowerCase().includes(searchQuery.toLowerCase())
        ) {
          return false
        }
        return true
      })
      .sort(
        (a, b) =>
          new Date(b.archivedAt!).getTime() - new Date(a.archivedAt!).getTime(),
      )
  }, [archivedChats, searchQuery])

  // Clear search query and sync selected index when popover opens
  useEffect(() => {
    if (open) {
      setSearchQuery("")
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 0)
    }
  }, [open, setSearchQuery])

  // Sync selected index with filtered chats
  useEffect(() => {
    if (open && filteredChats.length > 0) {
      // Find index of currently selected chat, default to 0 if not found
      const currentIndex = filteredChats.findIndex(
        (chat) => chat.id === selectedChatId,
      )
      setSelectedIndex(currentIndex >= 0 ? currentIndex : 0)
    }
  }, [open, filteredChats, selectedChatId])

  // Keyboard navigation - memoized to prevent recreation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (filteredChats.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % filteredChats.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(
        (prev) => (prev - 1 + filteredChats.length) % filteredChats.length,
      )
    } else if (e.key === "Enter") {
      e.preventDefault()
      const chat = filteredChats[selectedIndex]
      if (chat) {
        restoreMutation.mutate({ id: chat.id })
        setSelectedChatId(chat.id)
        setOpen(false)
      }
    }
  }, [filteredChats, selectedIndex, restoreMutation, setSelectedChatId, setOpen])

  // Reset selected index and clear refs when search changes
  useEffect(() => {
    setSelectedIndex(0)
    chatItemRefs.current = []
  }, [searchQuery])

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = chatItemRefs.current[selectedIndex]
    if (selectedElement) {
      selectedElement.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      })
    }
  }, [selectedIndex])

  // Auto-close popover when archive becomes empty
  useEffect(() => {
    if (open && archivedChats && archivedChats.length === 0) {
      setOpen(false)
    }
  }, [archivedChats, open, setOpen])

  // Memoized callbacks for chat items
  const handleSelectChat = useCallback((id: string) => {
    setSelectedChatId(id)
  }, [setSelectedChatId])

  const handleRestoreChat = useCallback((id: string) => {
    restoreMutation.mutate({ id })
  }, [restoreMutation])

  const handleSetRef = useCallback((index: number, el: HTMLDivElement | null) => {
    chatItemRefs.current[index] = el
  }, [])

  // Memoized search input handler
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }, [setSearchQuery])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        ref={popoverContentRef}
        side="right"
        align="end"
        sideOffset={8}
        forceDark={false}
        className="w-[250px] h-[400px] p-0 flex flex-col overflow-hidden"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {/* Search */}
        <div className="px-1 pt-1 pb-1 border-b">
          <div className="relative flex items-center gap-1.5 h-7 px-1.5 mx-1 rounded-md bg-muted/50">
            <SearchIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              ref={searchInputRef}
              placeholder="Search..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="h-auto p-0 border-0 bg-transparent text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        {/* Archived Chats List */}
        <div className="flex-1 overflow-y-auto py-1">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
              Loading...
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <ArchiveIcon className="h-6 w-6 mb-2 text-muted-foreground opacity-40" />
              <p className="text-xs text-muted-foreground opacity-40 pb-10">
                No archived agents
              </p>
            </div>
          ) : (
            filteredChats.map((chat, index) => (
              <ArchiveChatItem
                key={chat.id}
                chat={chat}
                index={index}
                isSelected={index === selectedIndex}
                isCurrentChat={selectedChatId === chat.id}
                projectsMap={projectsMap}
                onSelect={handleSelectChat}
                onRestore={handleRestoreChat}
                setRef={handleSetRef}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
})
