"use client"

import { useAtom, useAtomValue } from "jotai"
import type React from "react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  ArchiveIcon,
  GitHubLogo,
  SearchIcon,
  TrashIcon,
  UnarchiveIcon,
} from "../../../components/ui/icons"
import { Input } from "../../../components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover"
import { showWorkspaceIconAtom } from "../../../lib/atoms"
import { useI18n } from "../../../lib/i18n"
import { trpc, trpcClient } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import {
  archivePopoverOpenAtom,
  archiveSearchQueryAtom,
  selectedAgentChatIdAtom,
} from "../atoms"

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
    return (
      <GitHubLogo
        className={cn(className, "text-muted-foreground flex-shrink-0")}
      />
    )
  }

  return (
    <div className={cn(className, "relative flex-shrink-0")}>
      {/* Placeholder background while loading */}
      {!isLoaded && <div className="absolute inset-0 rounded-sm bg-muted" />}
      <img
        src={`https://github.com/${gitOwner}.png?size=64`}
        alt={gitOwner}
        className={cn(
          className,
          "rounded-sm flex-shrink-0",
          isLoaded ? "opacity-100" : "opacity-0",
        )}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  )
}

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

// Normalized chat type for archive popover.
interface NormalizedArchivedChat {
  id: string
  name: string | null
  branch: string | null
  projectId: string | null
  repository: string | null
  gitOwner: string | null
  gitProvider: string | null
  updatedAt: Date | string | null
  archivedAt: Date | string | null
}

// Memoized chat item component to prevent unnecessary re-renders
interface ArchiveChatItemProps {
  chat: NormalizedArchivedChat
  index: number
  isSelected: boolean
  isCurrentChat: boolean
  showIcon: boolean
  projectsMap: Map<
    string,
    {
      gitOwner: string | null
      gitRepo: string | null
      gitProvider: string | null
      name: string
    }
  >
  stats?: { fileCount: number; additions: number; deletions: number }
  onSelect: (id: string) => void
  onRestore: (id: string) => void
  onDelete: (id: string) => void
  setRef: (index: number, el: HTMLDivElement | null) => void
  deletePending: boolean
}

const ArchiveChatItem = memo(function ArchiveChatItem({
  chat,
  index,
  isSelected,
  isCurrentChat,
  showIcon,
  projectsMap,
  stats,
  onSelect,
  onRestore,
  onDelete,
  setRef,
  deletePending,
}: ArchiveChatItemProps) {
  const { t } = useI18n()
  const branch = chat.branch
  const project = chat.projectId ? projectsMap.get(chat.projectId) : null
  const gitOwner = chat.gitOwner || project?.gitOwner
  const gitRepo = chat.repository || project?.gitRepo
  const gitProvider = chat.gitProvider || project?.gitProvider
  const isGitHubRepo = gitProvider === "github" && !!gitOwner

  const repoName = gitRepo || project?.name
  const displayText = branch
    ? repoName
      ? `${repoName} • ${branch}`
      : branch
    : repoName || "Local project"

  const handleClick = useCallback(() => {
    onSelect(chat.id)
  }, [onSelect, chat.id])

  const handleRestore = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onRestore(chat.id)
    },
    [onRestore, chat.id],
  )

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDelete(chat.id)
    },
    [onDelete, chat.id],
  )

  const handleRef = useCallback(
    (el: HTMLDivElement | null) => {
      setRef(index, el)
    },
    [setRef, index],
  )

  return (
    <div
      ref={handleRef}
      onClick={handleClick}
      className={cn(
        "w-[calc(100%-8px)] mx-1 text-left min-h-[32px] py-[5px] px-1.5 rounded-md transition-colors duration-75 cursor-pointer group relative",
        "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
        isSelected || isCurrentChat
          ? "dark:bg-neutral-800 bg-accent text-foreground"
          : "text-muted-foreground dark:hover:bg-neutral-800 hover:bg-accent hover:text-foreground",
      )}
    >
      <div className="flex items-start gap-2.5">
        {showIcon && (
          <div className="pt-0.5">
            {isGitHubRepo && gitOwner ? (
              <GitHubAvatar gitOwner={gitOwner} />
            ) : (
              <GitHubLogo
                className={cn(
                  "h-4 w-4 flex-shrink-0 transition-colors duration-75",
                  isSelected ? "text-foreground" : "text-muted-foreground",
                )}
              />
            )}
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="truncate block text-sm leading-tight flex-1">
              {chat.name || (
                <span className="text-muted-foreground/50">
                  {t("sidebar.workspacePlaceholder")}
                </span>
              )}
            </span>
            <div className="flex flex-shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={handleRestore}
                className="text-muted-foreground hover:text-foreground active:text-foreground transition-[color,transform] duration-150 ease-out active:scale-[0.97]"
                aria-label={t("agent.chat.restore")}
              >
                <UnarchiveIcon className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deletePending}
                className="text-muted-foreground hover:text-destructive active:text-destructive transition-[color,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
                aria-label={t("sidebar.permanentDelete")}
              >
                <TrashIcon className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60 truncate min-w-0">
              <span className="truncate">{displayText}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 text-[11px]">
              {stats && (stats.additions > 0 || stats.deletions > 0) && (
                <>
                  <span className="text-green-600 dark:text-green-400">
                    +{stats.additions}
                  </span>
                  <span className="text-red-600 dark:text-red-400">
                    -{stats.deletions}
                  </span>
                </>
              )}
              <span className="text-muted-foreground/60">
                {formatTime(chat.updatedAt ?? new Date())}
              </span>
            </div>
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

export const ArchivePopover = memo(function ArchivePopover({
  trigger,
}: ArchivePopoverProps) {
  const { t } = useI18n()
  const [open, setOpen] = useAtom(archivePopoverOpenAtom)
  const [searchQuery, setSearchQuery] = useAtom(archiveSearchQueryAtom)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const popoverContentRef = useRef<HTMLDivElement>(null)
  const chatItemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const showWorkspaceIcon = useAtomValue(showWorkspaceIconAtom)
  const [isClearingArchive, setIsClearingArchive] = useState(false)

  // Get utils outside of callbacks - hooks must be called at top level
  const utils = trpc.useUtils()

  // Local archived chats (always fetch)
  const { data: localArchivedChats, isLoading: isLocalLoading } =
    trpc.chats.listArchived.useQuery(
      {},
      {
        enabled: open,
        staleTime: 5 * 60 * 1000,
        placeholderData: (prev) => prev,
      },
    )

  const isLoading = isLocalLoading

  // Fetch all projects for git info (for local chats)
  const { data: projects } = trpc.projects.list.useQuery(undefined)

  // Collect chat IDs for file stats query (only local chats)
  const archivedChatIds = useMemo(() => {
    if (!localArchivedChats) return []
    return localArchivedChats.map((chat) => chat.id)
  }, [localArchivedChats])

  // Fetch file stats for archived local chats
  const { data: fileStatsData } = trpc.chats.getFileStats.useQuery(
    { chatIds: archivedChatIds },
    {
      enabled: open && archivedChatIds.length > 0,
      staleTime: 5 * 60 * 1000,
      placeholderData: (prev) => prev,
    },
  )

  // Create map for quick project lookup by id
  const projectsMap = useMemo(() => {
    if (!projects) return new Map()
    return new Map(projects.map((p) => [p.id, p]))
  }, [projects])

  // Create map for quick file stats lookup by chat id
  const fileStatsMap = useMemo(() => {
    if (!fileStatsData)
      return new Map<
        string,
        { fileCount: number; additions: number; deletions: number }
      >()
    return new Map(
      fileStatsData.map((s) => [
        s.chatId,
        {
          fileCount: s.fileCount,
          additions: s.additions,
          deletions: s.deletions,
        },
      ]),
    )
  }, [fileStatsData])

  // Local restore mutation
  const localRestoreMutation = trpc.chats.restore.useMutation({
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

  const localDeleteMutation = trpc.chats.delete.useMutation({
    onSuccess: (_, variables) => {
      utils.chats.list.setData({}, (oldData) =>
        oldData?.filter((chat) => chat.id !== variables.id),
      )
      utils.chats.listArchived.setData({}, (oldData) =>
        oldData?.filter((chat) => chat.id !== variables.id),
      )
      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()
      if (selectedChatId === variables.id) {
        setSelectedChatId(null)
      }
    },
    onError: (error) => {
      toast.error(error.message || t("sidebar.deleteFailed"))
    },
  })

  // Normalize archived chats.
  const normalizedChats = useMemo((): NormalizedArchivedChat[] => {
    return (localArchivedChats ?? []).map((chat) => ({
      id: chat.id,
      name: chat.name,
      branch: chat.branch,
      projectId: chat.projectId,
      repository: null,
      gitOwner: null,
      gitProvider: null,
      updatedAt: chat.updatedAt,
      archivedAt: chat.archivedAt,
    }))
  }, [localArchivedChats])

  // Filter and sort archived chats (always newest first)
  const filteredChats = useMemo(() => {
    return normalizedChats
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
      .sort((a, b) => {
        const aTime = a.archivedAt ? new Date(a.archivedAt).getTime() : 0
        const bTime = b.archivedAt ? new Date(b.archivedAt).getTime() : 0
        return bTime - aTime
      })
  }, [normalizedChats, searchQuery])

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
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
          localRestoreMutation.mutate({ id: chat.id })
          setSelectedChatId(chat.id)
          setOpen(false)
        }
      }
    },
    [
      filteredChats,
      selectedIndex,
      localRestoreMutation,
      setSelectedChatId,
      setOpen,
    ],
  )

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
    if (open && normalizedChats && normalizedChats.length === 0) {
      setOpen(false)
    }
  }, [normalizedChats, open, setOpen])

  // Memoized callbacks for chat items
  const handleSelectChat = useCallback(
    (id: string) => {
      setSelectedChatId(id)
    },
    [setSelectedChatId],
  )

  const handleRestoreChat = useCallback(
    (id: string) => {
      localRestoreMutation.mutate({ id })
      setSelectedChatId(id)
    },
    [localRestoreMutation, setSelectedChatId],
  )

  const handleDeleteChat = useCallback(
    (id: string) => {
      const chat = normalizedChats.find((item) => item.id === id)
      if (!chat) return

      if (chat.projectId) {
        const stats = fileStatsMap.get(id)
        const hasChanges = !!(
          stats &&
          (stats.additions > 0 || stats.deletions > 0)
        )
        const confirmed = window.confirm(
          hasChanges
            ? t("sidebar.confirmDeleteWorkspaceWithChanges", {
                fileCount: stats.fileCount,
                additions: stats.additions,
                deletions: stats.deletions,
              })
            : t("sidebar.confirmDeleteWorkspace"),
        )
        if (!confirmed) return
      }

      localDeleteMutation.mutate({ id })
    },
    [fileStatsMap, localDeleteMutation, normalizedChats, t],
  )

  const handleClearArchive = useCallback(async () => {
    if (isClearingArchive || normalizedChats.length === 0) return

    const chatIds = normalizedChats.map((chat) => chat.id)
    const confirmed = window.confirm(
      t("sidebar.confirmClearArchive", { count: chatIds.length }),
    )
    if (!confirmed) return

    setIsClearingArchive(true)
    try {
      await Promise.all(
        chatIds.map((id) => trpcClient.chats.delete.mutate({ id })),
      )
      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()
      if (selectedChatId && chatIds.includes(selectedChatId)) {
        setSelectedChatId(null)
      }
      setOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("sidebar.deleteFailed"),
      )
    } finally {
      setIsClearingArchive(false)
    }
  }, [
    isClearingArchive,
    normalizedChats,
    selectedChatId,
    setOpen,
    setSelectedChatId,
    t,
    utils.chats.list,
    utils.chats.listArchived,
  ])

  const handleSetRef = useCallback(
    (index: number, el: HTMLDivElement | null) => {
      chatItemRefs.current[index] = el
    },
    [],
  )

  // Memoized search input handler
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value)
    },
    [setSearchQuery],
  )

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
        <div className="p-1 border-b">
          <div className="relative flex items-center gap-1.5 h-7 px-1.5 rounded-md bg-muted/50">
            <SearchIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              ref={searchInputRef}
              placeholder={t("agent.search.placeholder")}
              value={searchQuery}
              onChange={handleSearchChange}
              className="h-auto p-0 border-0 bg-transparent text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          {normalizedChats.length > 0 && (
            <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
              <span>
                {t("sidebar.archivedCount", { count: normalizedChats.length })}
              </span>
              <button
                type="button"
                onClick={handleClearArchive}
                disabled={isClearingArchive}
                className="rounded-sm px-1 py-0.5 text-destructive hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
              >
                {isClearingArchive
                  ? t("sidebar.deleting")
                  : t("sidebar.clearArchive")}
              </button>
            </div>
          )}
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
            filteredChats.map((chat, index) => {
              const isCurrentChat = selectedChatId === chat.id
              return (
                <ArchiveChatItem
                  key={chat.id}
                  chat={chat}
                  index={index}
                  isSelected={index === selectedIndex}
                  isCurrentChat={isCurrentChat}
                  showIcon={showWorkspaceIcon}
                  projectsMap={projectsMap}
                  stats={fileStatsMap.get(chat.id)}
                  onSelect={handleSelectChat}
                  onRestore={handleRestoreChat}
                  onDelete={handleDeleteChat}
                  setRef={handleSetRef}
                  deletePending={localDeleteMutation.isPending}
                />
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
})
