"use client"

import React, { useMemo, useState, useCallback, useRef, useEffect, memo } from "react"
import { createPortal } from "react-dom"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { motion, AnimatePresence } from "motion/react"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { cn } from "../../lib/utils"
import {
  loadingSubChatsAtom,
  agentsSubChatUnseenChangesAtom,
  selectedAgentChatIdAtom,
  previousAgentChatIdAtom,
  subChatFilesAtom,
  justCreatedIdsAtom,
  pendingUserQuestionsAtom,
  undoStackAtom,
  type UndoItem,
} from "../agents/atoms"
import {
  selectedTeamIdAtom,
  selectedSubChatIdsAtom,
  isSubChatMultiSelectModeAtom,
  toggleSubChatSelectionAtom,
  selectAllSubChatsAtom,
  clearSubChatSelectionAtom,
  selectedSubChatsCountAtom,
  isDesktopAtom,
  isFullscreenAtom,
} from "../../lib/atoms"
import { trpc } from "../../lib/trpc"
import {
  useAgentSubChatStore,
  type SubChatMeta,
} from "../agents/stores/sub-chat-store"
import { useShallow } from "zustand/react/shallow"
import {
  PlusIcon,
  ArchiveIcon,
  IconDoubleChevronLeft,
  IconSpinner,
  LoadingDot,
  PlanIcon,
  AgentIcon,
  IconOpenSidebar,
  ClockIcon,
  QuestionIcon,
} from "../../components/ui/icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { Kbd } from "../../components/ui/kbd"
import { isDesktopApp, getShortcutKey } from "../../lib/utils/platform"
import { TrafficLightSpacer } from "../agents/components/traffic-light-spacer"
import { PopoverTrigger } from "../../components/ui/popover"
import { AlignJustify } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../components/ui/context-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog"
import { api } from "../../lib/mock-api"
import { trpcClient } from "../../lib/trpc"
import { toast } from "sonner"
import { AgentsRenameSubChatDialog } from "../agents/components/agents-rename-subchat-dialog"
import { SearchCombobox } from "../../components/ui/search-combobox"
import { SubChatContextMenu } from "../agents/ui/sub-chat-context-menu"
import { formatTimeAgo } from "../agents/utils/format-time-ago"
import { pluralize } from "../agents/utils/pluralize"
import { useHotkeys } from "react-hotkeys-hook"
import { useSubChatDraftsCache, getSubChatDraftKey } from "../agents/lib/drafts"
import { Checkbox } from "../../components/ui/checkbox"
import { TypewriterText } from "../../components/ui/typewriter-text"

// Isolated Search History Popover for sidebar - prevents parent re-renders when popover opens/closes
interface SidebarSearchHistoryPopoverProps {
  sortedSubChats: SubChatMeta[]
  loadingSubChats: Map<string, string>
  subChatUnseenChanges: Set<string>
  pendingQuestionsMap: Map<string, { subChatId: string }>
  allSubChatsLength: number
  onSelect: (subChat: SubChatMeta) => void
}

const SidebarSearchHistoryPopover = memo(function SidebarSearchHistoryPopover({
  sortedSubChats,
  loadingSubChats,
  subChatUnseenChanges,
  pendingQuestionsMap,
  allSubChatsLength,
  onSelect,
}: SidebarSearchHistoryPopoverProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  const renderItem = useCallback((subChat: SubChatMeta) => {
    const timeAgo = formatTimeAgo(subChat.updated_at || subChat.created_at)
    const isLoading = loadingSubChats.has(subChat.id)
    const hasUnseen = subChatUnseenChanges.has(subChat.id)
    const mode = subChat.mode || "agent"
    const hasPendingQuestion = pendingQuestionsMap.has(subChat.id)

    return (
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center relative">
          {hasPendingQuestion ? (
            <QuestionIcon className="w-4 h-4 text-blue-500" />
          ) : isLoading ? (
            <IconSpinner className="w-4 h-4 text-muted-foreground" />
          ) : mode === "plan" ? (
            <PlanIcon className="w-4 h-4 text-muted-foreground" />
          ) : (
            <AgentIcon className="w-4 h-4 text-muted-foreground" />
          )}
          {hasUnseen && !isLoading && !hasPendingQuestion && (
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-popover flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-[#307BD0]" />
            </div>
          )}
        </div>
        <span className="text-sm truncate flex-1">
          {subChat.name || "New Chat"}
        </span>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {timeAgo}
        </span>
      </div>
    )
  }, [loadingSubChats, subChatUnseenChanges, pendingQuestionsMap])

  return (
    <SearchCombobox
      isOpen={isHistoryOpen}
      onOpenChange={setIsHistoryOpen}
      items={sortedSubChats}
      onSelect={onSelect}
      placeholder="Search chats..."
      emptyMessage="No results"
      getItemValue={(subChat) => `${subChat.name || "New Chat"} ${subChat.id}`}
      renderItem={renderItem}
      side="bottom"
      align="end"
      sideOffset={4}
      collisionPadding={16}
      trigger={
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 rounded-md"
                disabled={allSubChatsLength === 0}
              >
                <ClockIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Chat history</TooltipContent>
        </Tooltip>
      }
    />
  )
})

interface AgentsSubChatsSidebarProps {
  onClose?: () => void
  isMobile?: boolean
  onBackToChats?: () => void
  isSidebarOpen?: boolean
  isLoading?: boolean
  agentName?: string
}

export function AgentsSubChatsSidebar({
  onClose,
  isMobile = false,
  onBackToChats,
  isSidebarOpen = false,
  isLoading = false,
  agentName,
}: AgentsSubChatsSidebarProps) {
  // Use shallow comparison to prevent re-renders when arrays have same content
  const { activeSubChatId, openSubChatIds, pinnedSubChatIds, allSubChats, parentChatId, togglePinSubChat } = useAgentSubChatStore(
    useShallow((state) => ({
      activeSubChatId: state.activeSubChatId,
      openSubChatIds: state.openSubChatIds,
      pinnedSubChatIds: state.pinnedSubChatIds,
      allSubChats: state.allSubChats,
      parentChatId: state.chatId,
      togglePinSubChat: state.togglePinSubChat,
    }))
  )
  const [loadingSubChats] = useAtom(loadingSubChatsAtom)
  const subChatFiles = useAtomValue(subChatFilesAtom)
  const selectedTeamId = useAtomValue(selectedTeamIdAtom)
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const previousChatId = useAtomValue(previousAgentChatIdAtom)

  // Fetch agent chats for navigation after archive
  const { data: agentChats } = api.agents.getAgentChats.useQuery(
    { teamId: selectedTeamId! },
    { enabled: !!selectedTeamId },
  )

  const utils = trpc.useUtils()

  // Archive parent chat mutation
  const archiveChatMutation = trpc.chats.archive.useMutation({
    onSuccess: (_, variables) => {
      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()

      // Navigate to previous chat or new workspace
      if (selectedChatId === variables.id) {
        const isPreviousAvailable = previousChatId &&
          agentChats?.some((c) => c.id === previousChatId)

        if (isPreviousAvailable) {
          setSelectedChatId(previousChatId)
        } else {
          setSelectedChatId(null)
        }
      }
    },
  })
  const subChatUnseenChanges = useAtomValue(agentsSubChatUnseenChangesAtom)
  const setSubChatUnseenChanges = useSetAtom(agentsSubChatUnseenChangesAtom)
  const [justCreatedIds, setJustCreatedIds] = useAtom(justCreatedIdsAtom)
  const pendingQuestionsMap = useAtomValue(pendingUserQuestionsAtom)

  // Pending plan approvals from DB - only for open sub-chats
  const { data: pendingPlanApprovalsData } = trpc.chats.getPendingPlanApprovals.useQuery(
    { openSubChatIds },
    { refetchInterval: 5000, enabled: openSubChatIds.length > 0, placeholderData: (prev) => prev }
  )
  const pendingPlanApprovals = useMemo(() => {
    const set = new Set<string>()
    if (pendingPlanApprovalsData) {
      for (const { subChatId } of pendingPlanApprovalsData) {
        set.add(subChatId)
      }
    }
    return set
  }, [pendingPlanApprovalsData])

  // Unified undo stack for Cmd+Z support
  const setUndoStack = useSetAtom(undoStackAtom)
  const [searchQuery, setSearchQuery] = useState("")
  const [focusedChatIndex, setFocusedChatIndex] = useState<number>(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renamingSubChat, setRenamingSubChat] = useState<SubChatMeta | null>(
    null,
  )
  const [renameLoading, setRenameLoading] = useState(false)
  const [showTopGradient, setShowTopGradient] = useState(false)
  const [showBottomGradient, setShowBottomGradient] = useState(false)
  // Using ref instead of state to avoid re-renders on hover
  const hoveredChatIndexRef = useRef<number>(-1)
  const [archiveAgentDialogOpen, setArchiveAgentDialogOpen] = useState(false)
  const [subChatToArchive, setSubChatToArchive] = useState<SubChatMeta | null>(
    null,
  )

  // SubChat name tooltip - using refs instead of state to avoid re-renders on hover
  const subChatNameRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const subChatTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Multi-select state
  const [selectedSubChatIds, setSelectedSubChatIds] = useAtom(
    selectedSubChatIdsAtom,
  )
  const isMultiSelectMode = useAtomValue(isSubChatMultiSelectModeAtom)
  const selectedSubChatsCount = useAtomValue(selectedSubChatsCountAtom)
  const toggleSubChatSelection = useSetAtom(toggleSubChatSelectionAtom)
  const selectAllSubChats = useSetAtom(selectAllSubChatsAtom)
  const clearSubChatSelection = useSetAtom(clearSubChatSelectionAtom)

  // Global desktop/fullscreen state from atoms (initialized in AgentsLayout)
  const isDesktop = useAtomValue(isDesktopAtom)
  const isFullscreen = useAtomValue(isFullscreenAtom)

  // Map open IDs to metadata and sort by updated_at (most recent first)
  const openSubChats = useMemo(() => {
    const chats = openSubChatIds
      .map((id) => allSubChats.find((sc) => sc.id === id))
      .filter((sc): sc is SubChatMeta => !!sc)
      .sort((a, b) => {
        const aT = new Date(a.updated_at || a.created_at || "0").getTime()
        const bT = new Date(b.updated_at || b.created_at || "0").getTime()
        return bT - aT // Most recent first
      })

    return chats
  }, [openSubChatIds, allSubChats])

  // Filter and separate pinned/unpinned sub-chats
  const { pinnedChats, unpinnedChats } = useMemo(() => {
    const filtered = searchQuery.trim()
      ? openSubChats.filter((chat) =>
          chat.name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : openSubChats

    const pinned = filtered.filter((chat) => pinnedSubChatIds.includes(chat.id))
    const unpinned = filtered.filter(
      (chat) => !pinnedSubChatIds.includes(chat.id),
    )

    return { pinnedChats: pinned, unpinnedChats: unpinned }
  }, [searchQuery, openSubChats, pinnedSubChatIds])

  const filteredSubChats = useMemo(() => {
    return [...pinnedChats, ...unpinnedChats]
  }, [pinnedChats, unpinnedChats])

  // Reset focused index when search query changes
  React.useEffect(() => {
    setFocusedChatIndex(-1)
  }, [searchQuery, filteredSubChats.length])

  // Scroll focused item into view
  React.useEffect(() => {
    if (focusedChatIndex >= 0 && filteredSubChats.length > 0) {
      const focusedElement = scrollContainerRef.current?.querySelector(
        `[data-subchat-index="${focusedChatIndex}"]`,
      ) as HTMLElement
      if (focusedElement) {
        focusedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        })
      }
    }
  }, [focusedChatIndex, filteredSubChats.length])

  // Unified scroll handler for gradients (works with both event and direct calls)
  const updateScrollGradients = useCallback((element?: HTMLDivElement) => {
    const container = element || scrollContainerRef.current
    if (!container) return

    const { scrollTop, scrollHeight, clientHeight } = container
    const isScrollable = scrollHeight > clientHeight

    if (!isScrollable) {
      setShowBottomGradient(false)
      setShowTopGradient(false)
      return
    }

    const threshold = 5
    const isAtTop = scrollTop <= threshold
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - threshold

    setShowTopGradient(!isAtTop)
    setShowBottomGradient(!isAtBottom)
  }, [])

  // Handler for React onScroll event
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      updateScrollGradients(e.currentTarget)
    },
    [updateScrollGradients],
  )

  // Initialize gradients on mount and observe container size changes
  React.useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    updateScrollGradients()
    const resizeObserver = new ResizeObserver(() => updateScrollGradients())
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [filteredSubChats, updateScrollGradients])

  // Hotkey: / to focus search input (only when sidebar is visible and input not focused)
  React.useEffect(() => {
    const handleSearchHotkey = (e: KeyboardEvent) => {
      // Only trigger if / is pressed without Cmd/Ctrl/Alt
      // Note: e.key automatically handles keyboard layouts (Shift is not checked, allowing international layouts)
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Don't trigger if already focused on an input/textarea
        const activeEl = document.activeElement
        if (
          activeEl?.tagName === "INPUT" ||
          activeEl?.tagName === "TEXTAREA" ||
          activeEl?.hasAttribute("contenteditable")
        ) {
          return
        }

        e.preventDefault()
        e.stopPropagation()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }

    // Use capture phase to intercept before other handlers (e.g., prompt input)
    // Cleanup is guaranteed on unmount to prevent memory leaks
    window.addEventListener("keydown", handleSearchHotkey, { capture: true })
    return () =>
      window.removeEventListener("keydown", handleSearchHotkey, {
        capture: true,
      })
    // Empty deps: handler is stable and uses only ref which doesn't need tracking
  }, [])

  // Derive which sub-chats are loading (keys = subChatIds)
  const loadingChatIds = useMemo(
    () => new Set([...loadingSubChats.keys()]),
    [loadingSubChats],
  )

  const handleSubChatClick = (subChatId: string) => {
    const store = useAgentSubChatStore.getState()
    store.setActiveSubChat(subChatId)

    // Clear unseen indicator for this sub-chat
    setSubChatUnseenChanges((prev: Set<string>) => {
      if (prev.has(subChatId)) {
        const next = new Set(prev)
        next.delete(subChatId)
        return next
      }
      return prev
    })
  }

  const handleArchiveSubChat = useCallback(
    (subChatId: string) => {
      // If this is the last open subchat, show confirmation dialog
      if (openSubChats.length === 1) {
        const subChat = allSubChats.find((sc) => sc.id === subChatId)
        if (subChat) {
          setSubChatToArchive(subChat)
          setArchiveAgentDialogOpen(true)
        }
        return
      }
      // Archive = remove from open tabs (but keep in allSubChats for history)
      useAgentSubChatStore.getState().removeFromOpenSubChats(subChatId)

      // Add to unified undo stack for Cmd+Z
      if (parentChatId) {
        const timeoutId = setTimeout(() => {
          setUndoStack((prev) => prev.filter(
            (item) => !(item.type === "subchat" && item.subChatId === subChatId)
          ))
        }, 10000)

        setUndoStack((prev) => [...prev, {
          type: "subchat",
          subChatId,
          chatId: parentChatId,
          timeoutId,
        }])
      }
    },
    [openSubChats.length, allSubChats, parentChatId, setUndoStack],
  )

  const handleConfirmArchiveAgent = useCallback(() => {
    if (parentChatId) {
      // Archive the parent agent chat
      archiveChatMutation.mutate({ id: parentChatId })
    }
    setArchiveAgentDialogOpen(false)
    setSubChatToArchive(null)
  }, [parentChatId, archiveChatMutation])

  // Handle sub-chat card hover for truncated name tooltip (1s delay)
  // Uses direct DOM manipulation instead of state to avoid re-renders
  const handleSubChatMouseEnter = useCallback(
    (subChatId: string, name: string, cardElement: HTMLElement) => {
      // Clear any existing timer
      if (subChatTooltipTimerRef.current) {
        clearTimeout(subChatTooltipTimerRef.current)
      }

      const nameEl = subChatNameRefs.current.get(subChatId)
      if (!nameEl) return

      // Check if name is truncated
      const isTruncated = nameEl.scrollWidth > nameEl.clientWidth
      if (!isTruncated) return

      // Show tooltip after 1 second delay via DOM manipulation (no state update)
      subChatTooltipTimerRef.current = setTimeout(() => {
        const tooltip = tooltipRef.current
        if (!tooltip) return

        const rect = cardElement.getBoundingClientRect()
        tooltip.style.display = "block"
        tooltip.style.top = `${rect.top + rect.height / 2}px`
        tooltip.style.left = `${rect.right + 8}px`
        tooltip.textContent = name
      }, 1000)
    },
    [],
  )

  const handleSubChatMouseLeave = useCallback(() => {
    // Clear timer if hovering ends before delay
    if (subChatTooltipTimerRef.current) {
      clearTimeout(subChatTooltipTimerRef.current)
      subChatTooltipTimerRef.current = null
    }
    // Hide tooltip via DOM - no state update, no re-render
    const tooltip = tooltipRef.current
    if (tooltip) {
      tooltip.style.display = "none"
    }
  }, [])

  const handleArchiveAllBelow = useCallback(
    (subChatId: string) => {
      const currentIndex = filteredSubChats.findIndex((c) => c.id === subChatId)
      if (currentIndex === -1 || currentIndex === filteredSubChats.length - 1)
        return

      const state = useAgentSubChatStore.getState()
      const idsToClose = filteredSubChats
        .slice(currentIndex + 1)
        .map((c) => c.id)

      idsToClose.forEach((id) => state.removeFromOpenSubChats(id))

      // Add each to unified undo stack for Cmd+Z
      if (parentChatId) {
        const newItems: UndoItem[] = idsToClose.map((id) => {
          const timeoutId = setTimeout(() => {
            setUndoStack((prev) => prev.filter(
              (item) => !(item.type === "subchat" && item.subChatId === id)
            ))
          }, 10000)
          return { type: "subchat" as const, subChatId: id, chatId: parentChatId, timeoutId }
        })
        setUndoStack((prev) => [...prev, ...newItems])
      }
    },
    [filteredSubChats, parentChatId, setUndoStack],
  )

  const onCloseOtherChats = useCallback((subChatId: string) => {
    const state = useAgentSubChatStore.getState()
    const idsToClose = state.openSubChatIds.filter((id) => id !== subChatId)
    idsToClose.forEach((id) => state.removeFromOpenSubChats(id))
    state.setActiveSubChat(subChatId)

    // Add each to unified undo stack for Cmd+Z
    if (parentChatId) {
      const newItems: UndoItem[] = idsToClose.map((id) => {
        const timeoutId = setTimeout(() => {
          setUndoStack((prev) => prev.filter(
            (item) => !(item.type === "subchat" && item.subChatId === id)
          ))
        }, 10000)
        return { type: "subchat" as const, subChatId: id, chatId: parentChatId, timeoutId }
      })
      setUndoStack((prev) => [...prev, ...newItems])
    }
  }, [parentChatId, setUndoStack])

  const renameMutation = api.agents.renameSubChat.useMutation({
    // Note: store is updated optimistically in handleRenameSave, no need for onSuccess
    onError: (error) => {
      if (error.data?.code === "NOT_FOUND") {
        toast.error("Send a message first before renaming this chat")
      } else {
        toast.error("Failed to rename chat")
      }
    },
  })

  const handleRenameClick = useCallback((subChat: SubChatMeta) => {
    setRenamingSubChat(subChat)
    setRenameDialogOpen(true)
  }, [])

  const handleRenameSave = useCallback(
    async (newName: string) => {
      if (!renamingSubChat) return

      const subChatId = renamingSubChat.id
      const oldName = renamingSubChat.name

      // Optimistically update store
      useAgentSubChatStore.getState().updateSubChatName(subChatId, newName)

      // Remove from justCreatedIds to prevent typewriter animation on manual rename
      setJustCreatedIds((prev) => {
        if (prev.has(subChatId)) {
          const next = new Set(prev)
          next.delete(subChatId)
          return next
        }
        return prev
      })

      setRenameLoading(true)

      try {
        await renameMutation.mutateAsync({
          subChatId,
          name: newName,
        })
      } catch {
        // Rollback on error
        useAgentSubChatStore
          .getState()
          .updateSubChatName(subChatId, oldName || "New Chat")
      } finally {
        setRenameLoading(false)
        setRenamingSubChat(null)
      }
    },
    [renamingSubChat, renameMutation, setJustCreatedIds],
  )

  const handleCreateNew = async () => {
    if (!parentChatId) return

    const store = useAgentSubChatStore.getState()

    // Create sub-chat in DB first to get the real ID
    const newSubChat = await trpcClient.chats.createSubChat.mutate({
      chatId: parentChatId,
      name: "New Chat",
      mode: "agent",
    })
    const newId = newSubChat.id

    // Track this subchat as just created for typewriter effect
    setJustCreatedIds((prev) => new Set([...prev, newId]))

    // Add to allSubChats with placeholder name
    store.addToAllSubChats({
      id: newId,
      name: "New Chat",
      created_at: new Date().toISOString(),
      mode: "agent",
    })

    // Add to open tabs and set as active
    store.addToOpenSubChats(newId)
    store.setActiveSubChat(newId)
  }

  const handleSelectFromHistory = useCallback((subChat: SubChatMeta) => {
    const state = useAgentSubChatStore.getState()
    const isAlreadyOpen = state.openSubChatIds.includes(subChat.id)

    if (!isAlreadyOpen) {
      state.addToOpenSubChats(subChat.id)
    }
    state.setActiveSubChat(subChat.id)

    setIsHistoryOpen(false)
  }, [])

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

  // Update gradients when filtered chats change or on resize
  useEffect(() => {
    updateScrollGradients()
  }, [filteredSubChats, updateScrollGradients])

  // Update gradients on window resize
  useEffect(() => {
    const handleResize = () => updateScrollGradients()
    window.addEventListener("resize", handleResize, { passive: true })
    return () => window.removeEventListener("resize", handleResize)
  }, [updateScrollGradients])

  // Check if all selected sub-chats are pinned
  const areAllSelectedPinned = useMemo(() => {
    if (selectedSubChatIds.size === 0) return false
    return Array.from(selectedSubChatIds).every((id) =>
      pinnedSubChatIds.includes(id),
    )
  }, [selectedSubChatIds, pinnedSubChatIds])

  // Check if all selected sub-chats are unpinned
  const areAllSelectedUnpinned = useMemo(() => {
    if (selectedSubChatIds.size === 0) return false
    return Array.from(selectedSubChatIds).every(
      (id) => !pinnedSubChatIds.includes(id),
    )
  }, [selectedSubChatIds, pinnedSubChatIds])

  // Show pin option only if all selected have same pin state
  const canShowPinOption = areAllSelectedPinned || areAllSelectedUnpinned

  // Handle bulk pin of selected sub-chats
  const handleBulkPin = useCallback(() => {
    const idsToPin = Array.from(selectedSubChatIds)
    if (idsToPin.length > 0) {
      idsToPin.forEach((id) => {
        if (!pinnedSubChatIds.includes(id)) {
          togglePinSubChat(id)
        }
      })
      clearSubChatSelection()
    }
  }, [
    selectedSubChatIds,
    pinnedSubChatIds,
    togglePinSubChat,
    clearSubChatSelection,
  ])

  // Handle bulk unpin of selected sub-chats
  const handleBulkUnpin = useCallback(() => {
    const idsToUnpin = Array.from(selectedSubChatIds)
    if (idsToUnpin.length > 0) {
      idsToUnpin.forEach((id) => {
        if (pinnedSubChatIds.includes(id)) {
          togglePinSubChat(id)
        }
      })
      clearSubChatSelection()
    }
  }, [
    selectedSubChatIds,
    pinnedSubChatIds,
    togglePinSubChat,
    clearSubChatSelection,
  ])

  // Handle bulk archive of selected sub-chats
  const handleBulkArchive = useCallback(() => {
    const idsToArchive = Array.from(selectedSubChatIds)
    if (idsToArchive.length > 0) {
      // Check if closing all open tabs
      const remainingOpenIds = openSubChatIds.filter(
        (id) => !idsToArchive.includes(id),
      )

      if (remainingOpenIds.length === 0) {
        // Closing all tabs - show archive agent confirmation
        const firstSubChat = allSubChats.find((sc) =>
          idsToArchive.includes(sc.id),
        )
        if (firstSubChat) {
          setSubChatToArchive(firstSubChat)
          setArchiveAgentDialogOpen(true)
          clearSubChatSelection()
        }
      } else {
        // Some tabs remain - just close selected ones
        const state = useAgentSubChatStore.getState()
        idsToArchive.forEach((id) => state.removeFromOpenSubChats(id))
        clearSubChatSelection()

        // Add each to unified undo stack for Cmd+Z
        if (parentChatId) {
          const newItems: UndoItem[] = idsToArchive.map((id) => {
            const timeoutId = setTimeout(() => {
              setUndoStack((prev) => prev.filter(
                (item) => !(item.type === "subchat" && item.subChatId === id)
              ))
            }, 10000)
            return { type: "subchat" as const, subChatId: id, chatId: parentChatId, timeoutId }
          })
          setUndoStack((prev) => [...prev, ...newItems])
        }
      }
    }
  }, [selectedSubChatIds, openSubChatIds, allSubChats, clearSubChatSelection, parentChatId, setUndoStack])

  // Handle checkbox click
  const handleCheckboxClick = (e: React.MouseEvent, subChatId: string) => {
    e.stopPropagation()
    toggleSubChatSelection(subChatId)
  }

  // Handle sub-chat item click with shift support
  const handleSubChatItemClick = (
    subChatId: string,
    e?: React.MouseEvent,
    globalIndex?: number,
  ) => {
    // Shift+click for range selection
    if (e?.shiftKey) {
      e.preventDefault()

      const clickedIndex =
        globalIndex ?? filteredSubChats.findIndex((c) => c.id === subChatId)

      if (clickedIndex === -1) return

      // Find the anchor: use active sub-chat
      let anchorIndex = -1

      if (activeSubChatId) {
        anchorIndex = filteredSubChats.findIndex(
          (c) => c.id === activeSubChatId,
        )
      }

      // If no active sub-chat, try to use the first selected item
      if (anchorIndex === -1 && selectedSubChatIds.size > 0) {
        for (let i = 0; i < filteredSubChats.length; i++) {
          if (selectedSubChatIds.has(filteredSubChats[i]!.id)) {
            anchorIndex = i
            break
          }
        }
      }

      // If still no anchor, just select the clicked item
      if (anchorIndex === -1) {
        if (!selectedSubChatIds.has(subChatId)) {
          toggleSubChatSelection(subChatId)
        }
        return
      }

      // Select range from anchor to clicked item
      const startIndex = Math.min(anchorIndex, clickedIndex)
      const endIndex = Math.max(anchorIndex, clickedIndex)

      const newSelection = new Set(selectedSubChatIds)
      for (let i = startIndex; i <= endIndex; i++) {
        const chat = filteredSubChats[i]
        if (chat) {
          newSelection.add(chat.id)
        }
      }
      setSelectedSubChatIds(newSelection)
      return
    }

    // Normal click - navigate to sub-chat
    handleSubChatClick(subChatId)
  }

  // Multi-select hotkeys
  // X to toggle selection of hovered or focused chat
  useHotkeys(
    "x",
    () => {
      if (!filteredSubChats || filteredSubChats.length === 0) return

      // Prefer hovered (via ref), then focused
      const targetIndex =
        hoveredChatIndexRef.current >= 0
          ? hoveredChatIndexRef.current
          : focusedChatIndex >= 0
            ? focusedChatIndex
            : -1

      if (targetIndex >= 0 && targetIndex < filteredSubChats.length) {
        const subChatId = filteredSubChats[targetIndex]!.id
        toggleSubChatSelection(subChatId)
      }
    },
    [
      filteredSubChats,
      focusedChatIndex,
      toggleSubChatSelection,
    ],
  )

  // Cmd+A / Ctrl+A to select all sub-chats (only when at least one is already selected)
  useHotkeys(
    "mod+a",
    (e) => {
      if (isMultiSelectMode && filteredSubChats.length > 0) {
        e.preventDefault()
        selectAllSubChats(filteredSubChats.map((c) => c.id))
      }
    },
    [filteredSubChats, selectAllSubChats, isMultiSelectMode],
  )

  // Escape to clear selection (but not when dialogs are open)
  useHotkeys(
    "escape",
    () => {
      if (archiveAgentDialogOpen || renameDialogOpen) return
      if (isMultiSelectMode) {
        clearSubChatSelection()
        setFocusedChatIndex(-1)
      }
    },
    [
      isMultiSelectMode,
      clearSubChatSelection,
      archiveAgentDialogOpen,
      renameDialogOpen,
    ],
  )

  // Clear selection when parent chat changes
  useEffect(() => {
    clearSubChatSelection()
  }, [parentChatId, clearSubChatSelection])

  // Drafts cache - uses event-based sync instead of polling
  const draftsCache = useSubChatDraftsCache()

  // Get draft for a sub-chat
  const getDraftText = useCallback(
    (subChatId: string): string | null => {
      if (!parentChatId) return null
      const key = getSubChatDraftKey(parentChatId, subChatId)
      return draftsCache[key] || null
    },
    [parentChatId, draftsCache],
  )

  // History and Close buttons - reusable element
  const headerButtons = onClose && (
    <div className="flex items-center gap-1">
      <SidebarSearchHistoryPopover
        sortedSubChats={sortedSubChats}
        loadingSubChats={loadingSubChats}
        subChatUnseenChanges={subChatUnseenChanges}
        pendingQuestionsMap={pendingQuestionsMap}
        allSubChatsLength={allSubChats.length}
        onSelect={handleSelectFromHistory}
      />
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            tabIndex={-1}
            className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
            aria-label="Close sidebar"
          >
            <IconDoubleChevronLeft className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Close chats pane</TooltipContent>
      </Tooltip>
    </div>
  )

  return (
    <div
      className="flex flex-col h-full bg-background border-r overflow-hidden relative"
      style={{ borderRightWidth: "0.5px" }}
    >
      {/* Draggable area for window movement - background layer (hidden in fullscreen) */}
      {isDesktop && !isFullscreen && (
        <div
          className="absolute inset-0 z-0"
          style={{
            // @ts-expect-error - WebKit-specific property
            WebkitAppRegion: "drag",
          }}
        />
      )}

      {/* Spacer for macOS traffic lights - only when agents sidebar is open */}
      {isSidebarOpen && (
        <TrafficLightSpacer isDesktop={isDesktop} isFullscreen={isFullscreen} />
      )}

      {/* Header buttons - absolutely positioned when agents sidebar is open */}
      {isSidebarOpen && (
        <div
          className="absolute right-2 top-2 z-20"
          style={{
            // @ts-expect-error - WebKit-specific property
            WebkitAppRegion: "no-drag",
          }}
        >
          {headerButtons}
        </div>
      )}

      {/* Header */}
      <div className="p-2 pb-3 flex-shrink-0 relative z-10">
        <div className="space-y-2">
          {/* Top row - different layout based on agents sidebar state */}
          {isSidebarOpen ? (
            <div className="h-6" />
          ) : (
            <div className="flex items-center justify-between gap-1 mb-1">
              {onBackToChats && (
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onBackToChats}
                      tabIndex={-1}
                      className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 rounded-md"
                      aria-label="Toggle agents sidebar"
                      style={{
                        // @ts-expect-error - WebKit-specific property
                        WebkitAppRegion: "no-drag",
                      }}
                    >
                      <AlignJustify className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open chats sidebar</TooltipContent>
                </Tooltip>
              )}
              <div className="flex-1" />
              <div
                style={{
                  // @ts-expect-error - WebKit-specific property
                  WebkitAppRegion: "no-drag",
                }}
              >
                {headerButtons}
              </div>
            </div>
          )}
          {/* Search Input */}
          <div
            className="relative"
            style={{
              // @ts-expect-error - WebKit-specific property
              WebkitAppRegion: "no-drag",
            }}
          >
            <Input
              ref={searchInputRef}
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault()
                  searchInputRef.current?.blur()
                  setFocusedChatIndex(-1)
                  return
                }

                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  setFocusedChatIndex((prev) => {
                    if (prev === -1) return 0
                    return prev < filteredSubChats.length - 1 ? prev + 1 : prev
                  })
                  return
                }

                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  setFocusedChatIndex((prev) => {
                    if (prev === -1) return filteredSubChats.length - 1
                    return prev > 0 ? prev - 1 : prev
                  })
                  return
                }

                if (e.key === "Enter") {
                  e.preventDefault()
                  if (focusedChatIndex >= 0) {
                    const focusedChat = filteredSubChats[focusedChatIndex]
                    if (focusedChat) {
                      handleSubChatClick(focusedChat.id)
                      searchInputRef.current?.blur()
                      setFocusedChatIndex(-1)
                    }
                  }
                  return
                }
              }}
              className="h-7 w-full rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40"
            />
          </div>
          {/* New Chat Button */}
          <div
            style={{
              // @ts-expect-error - WebKit-specific property
              WebkitAppRegion: "no-drag",
            }}
          >
            <Tooltip delayDuration={500}>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleCreateNew}
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 w-full hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground rounded-lg"
                >
                  <span className="text-sm font-medium">New Chat</span>
                </Button>
              </TooltipTrigger>
            <TooltipContent side="right">
              Create a new chat
              <Kbd>{getShortcutKey("newTab")}</Kbd>
            </TooltipContent>
          </Tooltip>
          </div>
        </div>
      </div>

      {/* Scrollable Sub-Chats List */}
      <div
        className="flex-1 min-h-0 relative z-10"
        style={{
          // @ts-expect-error - WebKit-specific property
          WebkitAppRegion: "no-drag",
        }}
      >
        {/* Loading state - centered spinner */}
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <IconSpinner className="w-4 h-4 text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Top gradient */}
            {showTopGradient && (
              <div className="absolute left-0 right-0 top-0 h-8 bg-gradient-to-b from-background to-transparent pointer-events-none z-10" />
            )}

            {/* Bottom gradient */}
            {showBottomGradient && (
              <div className="absolute left-0 right-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none z-10" />
            )}

            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className={cn(
                "h-full overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent",
                isMultiSelectMode ? "px-0" : "px-2",
              )}
            >
              {filteredSubChats.length > 0 ? (
                <div
                  className={cn("mb-4", isMultiSelectMode ? "px-0" : "-mx-1")}
                >
                  {/* Pinned section */}
                  {pinnedChats.length > 0 && (
                    <>
                      <div
                        className={cn(
                          "flex items-center h-4 mb-1",
                          isMultiSelectMode ? "pl-3" : "pl-2",
                        )}
                      >
                        <h3 className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                          Pinned Chats
                        </h3>
                      </div>
                      <div className="list-none p-0 m-0 mb-3">
                        {pinnedChats.map((subChat, index) => {
                          const isSubChatLoading = loadingChatIds.has(
                            subChat.id,
                          )
                          const isActive = activeSubChatId === subChat.id
                          const isPinned = pinnedSubChatIds.includes(subChat.id)
                          const globalIndex = filteredSubChats.findIndex(
                            (c) => c.id === subChat.id,
                          )
                          const isFocused =
                            focusedChatIndex === globalIndex &&
                            focusedChatIndex >= 0
                          const hasUnseen = subChatUnseenChanges.has(subChat.id)
                          const timeAgo = formatTimeAgo(
                            subChat.updated_at || subChat.created_at,
                          )
                          const mode = subChat.mode || "agent"
                          const isChecked = selectedSubChatIds.has(subChat.id)
                          const draftText = getDraftText(subChat.id)
                          const hasPendingQuestion = pendingQuestionsMap.has(subChat.id)
                          const hasPendingPlan = pendingPlanApprovals.has(subChat.id)
                          const fileChanges = subChatFiles.get(subChat.id) || []
                          const stats =
                            fileChanges.length > 0
                              ? fileChanges.reduce(
                                  (acc, f) => ({
                                    fileCount: acc.fileCount + 1,
                                    additions: acc.additions + f.additions,
                                    deletions: acc.deletions + f.deletions,
                                  }),
                                  { fileCount: 0, additions: 0, deletions: 0 },
                                )
                              : null

                          return (
                            <ContextMenu key={subChat.id}>
                              <ContextMenuTrigger asChild>
                                <div
                                  data-subchat-index={globalIndex}
                                  onClick={(e) =>
                                    handleSubChatItemClick(
                                      subChat.id,
                                      e,
                                      globalIndex,
                                    )
                                  }
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault()
                                      handleSubChatItemClick(
                                        subChat.id,
                                        undefined,
                                        globalIndex,
                                      )
                                    }
                                  }}
                                  onMouseEnter={(e) => {
                                    hoveredChatIndexRef.current = globalIndex
                                    handleSubChatMouseEnter(
                                      subChat.id,
                                      subChat.name || "New Chat",
                                      e.currentTarget,
                                    )
                                  }}
                                  onMouseLeave={() => {
                                    hoveredChatIndexRef.current = -1
                                    handleSubChatMouseLeave()
                                  }}
                                  className={cn(
                                    "w-full text-left py-1.5 transition-colors duration-75 cursor-pointer group relative",
                                    "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                                    isMultiSelectMode ? "px-3" : "pl-2 pr-2",
                                    isMultiSelectMode ? "" : "rounded-md",
                                    isActive
                                      ? "bg-foreground/5 text-foreground"
                                      : isChecked
                                        ? "bg-foreground/5 text-foreground"
                                        : isFocused
                                          ? "bg-foreground/5 text-foreground"
                                          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                                  )}
                                >
                                  <div className="flex items-start gap-2.5">
                                    {/* Icon/Checkbox container */}
                                    <div className="pt-0.5 flex-shrink-0 w-4 h-4 flex items-center justify-center relative">
                                      {/* Checkbox - shown in multi-select mode */}
                                      <div
                                        className={cn(
                                          "absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-150 ease-out",
                                          isMultiSelectMode
                                            ? "opacity-100 scale-100"
                                            : "opacity-0 scale-95 pointer-events-none",
                                        )}
                                        onClick={(e) =>
                                          handleCheckboxClick(e, subChat.id)
                                        }
                                      >
                                        <Checkbox
                                          checked={isChecked}
                                          className="cursor-pointer h-4 w-4"
                                          tabIndex={isMultiSelectMode ? 0 : -1}
                                        />
                                      </div>
                                      {/* Mode icon or Question icon - hidden in multi-select mode */}
                                      <div
                                        className={cn(
                                          "transition-[opacity,transform] duration-150 ease-out",
                                          isMultiSelectMode
                                            ? "opacity-0 scale-95 pointer-events-none"
                                            : "opacity-100 scale-100",
                                        )}
                                      >
                                        {hasPendingQuestion ? (
                                          <QuestionIcon className="w-4 h-4 text-blue-500" />
                                        ) : mode === "plan" ? (
                                          <PlanIcon className="w-4 h-4 text-muted-foreground" />
                                        ) : (
                                          <AgentIcon className="w-4 h-4 text-muted-foreground" />
                                        )}
                                      </div>
                                      {/* Badge in bottom-right corner - hidden in multi-select mode and when pending question */}
                                      {(isSubChatLoading || hasUnseen || hasPendingPlan) &&
                                        !isMultiSelectMode && !hasPendingQuestion && (
                                          <div
                                            className={cn(
                                              "absolute -bottom-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center",
                                              isActive
                                                ? "bg-[#E8E8E8] dark:bg-[#1B1B1B]"
                                                : "bg-[#F4F4F4] group-hover:bg-[#E8E8E8] dark:bg-[#101010] dark:group-hover:bg-[#1B1B1B]",
                                            )}
                                          >
                                            {/* Priority: loader > amber dot (pending plan) > blue dot (unseen) */}
                                            {isSubChatLoading ? (
                                              <LoadingDot isLoading={true} className="w-2.5 h-2.5 text-muted-foreground" />
                                            ) : hasPendingPlan ? (
                                              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                            ) : (
                                              <LoadingDot isLoading={false} className="w-2.5 h-2.5 text-muted-foreground" />
                                            )}
                                          </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                      <div className="flex items-center gap-1">
                                        <span
                                          ref={(el) => {
                                            if (el)
                                              subChatNameRefs.current.set(
                                                subChat.id,
                                                el,
                                              )
                                          }}
                                          className="truncate block text-sm leading-tight flex-1"
                                        >
                                          <TypewriterText
                                            text={subChat.name || ""}
                                            placeholder="New Chat"
                                            id={subChat.id}
                                            isJustCreated={justCreatedIds.has(subChat.id)}
                                            showPlaceholder={true}
                                          />
                                        </span>
                                        {!isMultiSelectMode && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleArchiveSubChat(subChat.id)
                                            }}
                                            tabIndex={-1}
                                            className="flex-shrink-0 text-muted-foreground hover:text-foreground active:text-foreground transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                                            aria-label="Archive agent"
                                          >
                                            <ArchiveIcon className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 min-w-0">
                                        {draftText ? (
                                          <span className="truncate flex-1 min-w-0">
                                            <span className="text-blue-500">Draft:</span>{" "}
                                            {draftText}
                                          </span>
                                        ) : (
                                          <span className="truncate flex-1 min-w-0">
                                            {stats ? (
                                              <>
                                                {stats.fileCount}{" "}
                                                {stats.fileCount === 1
                                                  ? "file"
                                                  : "files"}
                                              </>
                                            ) : null}
                                          </span>
                                        )}
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                          {!draftText && stats && (stats.additions > 0 || stats.deletions > 0) && (
                                            <>
                                              <span className="text-green-600 dark:text-green-400">
                                                +{stats.additions}
                                              </span>
                                              <span className="text-red-600 dark:text-red-400">
                                                -{stats.deletions}
                                              </span>
                                            </>
                                          )}
                                          <span>{timeAgo}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </ContextMenuTrigger>
                              {/* Multi-select context menu */}
                              {isMultiSelectMode &&
                              selectedSubChatIds.has(subChat.id) ? (
                                <ContextMenuContent className="w-48">
                                  {canShowPinOption && (
                                    <>
                                      <ContextMenuItem
                                        onClick={
                                          areAllSelectedPinned
                                            ? handleBulkUnpin
                                            : handleBulkPin
                                        }
                                      >
                                        {areAllSelectedPinned
                                          ? `Unpin ${selectedSubChatIds.size} ${pluralize(selectedSubChatIds.size, "chat")}`
                                          : `Pin ${selectedSubChatIds.size} ${pluralize(selectedSubChatIds.size, "chat")}`}
                                      </ContextMenuItem>
                                      <ContextMenuSeparator />
                                    </>
                                  )}
                                  <ContextMenuItem onClick={handleBulkArchive}>
                                    Archive {selectedSubChatIds.size}{" "}
                                    {pluralize(selectedSubChatIds.size, "chat")}
                                  </ContextMenuItem>
                                </ContextMenuContent>
                              ) : (
                                <SubChatContextMenu
                                  subChat={subChat}
                                  isPinned={isPinned}
                                  onTogglePin={togglePinSubChat}
                                  onRename={handleRenameClick}
                                  onArchive={handleArchiveSubChat}
                                  onArchiveAllBelow={handleArchiveAllBelow}
                                  onArchiveOthers={onCloseOtherChats}
                                  isOnlyChat={openSubChats.length === 1}
                                  currentIndex={globalIndex}
                                  totalCount={filteredSubChats.length}
                                  chatId={parentChatId}
                                />
                              )}
                            </ContextMenu>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {/* Unpinned section */}
                  {unpinnedChats.length > 0 && (
                    <>
                      <div
                        className={cn(
                          "flex items-center h-4 mb-1",
                          isMultiSelectMode ? "pl-3" : "pl-2",
                        )}
                      >
                        <h3 className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                          {pinnedChats.length > 0 ? "Recent chats" : "Chats"}
                        </h3>
                      </div>
                      <div className="list-none p-0 m-0">
                        {unpinnedChats.map((subChat, index) => {
                          const isSubChatLoading = loadingChatIds.has(
                            subChat.id,
                          )
                          const isActive = activeSubChatId === subChat.id
                          const isPinned = pinnedSubChatIds.includes(subChat.id)
                          const globalIndex = filteredSubChats.findIndex(
                            (c) => c.id === subChat.id,
                          )
                          const isFocused =
                            focusedChatIndex === globalIndex &&
                            focusedChatIndex >= 0
                          const hasUnseen = subChatUnseenChanges.has(subChat.id)
                          const timeAgo = formatTimeAgo(
                            subChat.updated_at || subChat.created_at,
                          )
                          const mode = subChat.mode || "agent"
                          const isChecked = selectedSubChatIds.has(subChat.id)
                          const draftText = getDraftText(subChat.id)
                          const hasPendingQuestion = pendingQuestionsMap.has(subChat.id)
                          const hasPendingPlan = pendingPlanApprovals.has(subChat.id)
                          const fileChanges = subChatFiles.get(subChat.id) || []
                          const stats =
                            fileChanges.length > 0
                              ? fileChanges.reduce(
                                  (acc, f) => ({
                                    fileCount: acc.fileCount + 1,
                                    additions: acc.additions + f.additions,
                                    deletions: acc.deletions + f.deletions,
                                  }),
                                  { fileCount: 0, additions: 0, deletions: 0 },
                                )
                              : null

                          return (
                            <ContextMenu key={subChat.id}>
                              <ContextMenuTrigger asChild>
                                <div
                                  data-subchat-index={globalIndex}
                                  onClick={(e) =>
                                    handleSubChatItemClick(
                                      subChat.id,
                                      e,
                                      globalIndex,
                                    )
                                  }
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault()
                                      handleSubChatItemClick(
                                        subChat.id,
                                        undefined,
                                        globalIndex,
                                      )
                                    }
                                  }}
                                  onMouseEnter={(e) => {
                                    hoveredChatIndexRef.current = globalIndex
                                    handleSubChatMouseEnter(
                                      subChat.id,
                                      subChat.name || "New Chat",
                                      e.currentTarget,
                                    )
                                  }}
                                  onMouseLeave={() => {
                                    hoveredChatIndexRef.current = -1
                                    handleSubChatMouseLeave()
                                  }}
                                  className={cn(
                                    "w-full text-left py-1.5 transition-colors duration-75 cursor-pointer group relative",
                                    "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                                    isMultiSelectMode ? "px-3" : "pl-2 pr-2",
                                    isMultiSelectMode ? "" : "rounded-md",
                                    isActive
                                      ? "bg-foreground/5 text-foreground"
                                      : isChecked
                                        ? "bg-foreground/5 text-foreground"
                                        : isFocused
                                          ? "bg-foreground/5 text-foreground"
                                          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                                  )}
                                >
                                  <div className="flex items-start gap-2.5">
                                    {/* Icon/Checkbox container */}
                                    <div className="pt-0.5 flex-shrink-0 w-4 h-4 flex items-center justify-center relative">
                                      {/* Checkbox - shown in multi-select mode */}
                                      <div
                                        className={cn(
                                          "absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-150 ease-out",
                                          isMultiSelectMode
                                            ? "opacity-100 scale-100"
                                            : "opacity-0 scale-95 pointer-events-none",
                                        )}
                                        onClick={(e) =>
                                          handleCheckboxClick(e, subChat.id)
                                        }
                                      >
                                        <Checkbox
                                          checked={isChecked}
                                          className="cursor-pointer h-4 w-4"
                                          tabIndex={isMultiSelectMode ? 0 : -1}
                                        />
                                      </div>
                                      {/* Mode icon or Question icon - hidden in multi-select mode */}
                                      <div
                                        className={cn(
                                          "transition-[opacity,transform] duration-150 ease-out",
                                          isMultiSelectMode
                                            ? "opacity-0 scale-95 pointer-events-none"
                                            : "opacity-100 scale-100",
                                        )}
                                      >
                                        {hasPendingQuestion ? (
                                          <QuestionIcon className="w-4 h-4 text-blue-500" />
                                        ) : mode === "plan" ? (
                                          <PlanIcon className="w-4 h-4 text-muted-foreground" />
                                        ) : (
                                          <AgentIcon className="w-4 h-4 text-muted-foreground" />
                                        )}
                                      </div>
                                      {/* Badge - hidden in multi-select mode and when pending question */}
                                      {(isSubChatLoading || hasUnseen || hasPendingPlan) &&
                                        !isMultiSelectMode && !hasPendingQuestion && (
                                          <div
                                            className={cn(
                                              "absolute -bottom-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center",
                                              isActive
                                                ? "bg-[#E8E8E8] dark:bg-[#1B1B1B]"
                                                : "bg-[#F4F4F4] group-hover:bg-[#E8E8E8] dark:bg-[#101010] dark:group-hover:bg-[#1B1B1B]",
                                            )}
                                          >
                                            {/* Priority: loader > amber dot (pending plan) > blue dot (unseen) */}
                                            {isSubChatLoading ? (
                                              <LoadingDot isLoading={true} className="w-2.5 h-2.5 text-muted-foreground" />
                                            ) : hasPendingPlan ? (
                                              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                            ) : (
                                              <LoadingDot isLoading={false} className="w-2.5 h-2.5 text-muted-foreground" />
                                            )}
                                          </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                      <div className="flex items-center gap-1">
                                        <span
                                          ref={(el) => {
                                            if (el)
                                              subChatNameRefs.current.set(
                                                subChat.id,
                                                el,
                                              )
                                          }}
                                          className="truncate block text-sm leading-tight flex-1"
                                        >
                                          <TypewriterText
                                            text={subChat.name || ""}
                                            placeholder="New Chat"
                                            id={subChat.id}
                                            isJustCreated={justCreatedIds.has(subChat.id)}
                                            showPlaceholder={true}
                                          />
                                        </span>
                                        {!isMultiSelectMode && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleArchiveSubChat(subChat.id)
                                            }}
                                            tabIndex={-1}
                                            className="flex-shrink-0 text-muted-foreground hover:text-foreground active:text-foreground transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                                            aria-label="Archive agent"
                                          >
                                            <ArchiveIcon className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 min-w-0">
                                        {draftText ? (
                                          <span className="truncate flex-1 min-w-0">
                                            <span className="text-blue-500">Draft:</span>{" "}
                                            {draftText}
                                          </span>
                                        ) : (
                                          <span className="truncate flex-1 min-w-0">
                                            {stats ? (
                                              <>
                                                {stats.fileCount}{" "}
                                                {stats.fileCount === 1
                                                  ? "file"
                                                  : "files"}
                                              </>
                                            ) : null}
                                          </span>
                                        )}
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                          {!draftText && stats && (stats.additions > 0 || stats.deletions > 0) && (
                                            <>
                                              <span className="text-green-600 dark:text-green-400">
                                                +{stats.additions}
                                              </span>
                                              <span className="text-red-600 dark:text-red-400">
                                                -{stats.deletions}
                                              </span>
                                            </>
                                          )}
                                          <span>{timeAgo}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </ContextMenuTrigger>
                              {/* Multi-select context menu */}
                              {isMultiSelectMode &&
                              selectedSubChatIds.has(subChat.id) ? (
                                <ContextMenuContent className="w-48">
                                  {canShowPinOption && (
                                    <>
                                      <ContextMenuItem
                                        onClick={
                                          areAllSelectedPinned
                                            ? handleBulkUnpin
                                            : handleBulkPin
                                        }
                                      >
                                        {areAllSelectedPinned
                                          ? `Unpin ${selectedSubChatIds.size} ${pluralize(selectedSubChatIds.size, "chat")}`
                                          : `Pin ${selectedSubChatIds.size} ${pluralize(selectedSubChatIds.size, "chat")}`}
                                      </ContextMenuItem>
                                      <ContextMenuSeparator />
                                    </>
                                  )}
                                  <ContextMenuItem onClick={handleBulkArchive}>
                                    Archive {selectedSubChatIds.size}{" "}
                                    {pluralize(selectedSubChatIds.size, "chat")}
                                  </ContextMenuItem>
                                </ContextMenuContent>
                              ) : (
                                <SubChatContextMenu
                                  subChat={subChat}
                                  isPinned={isPinned}
                                  onTogglePin={togglePinSubChat}
                                  onRename={handleRenameClick}
                                  onArchive={handleArchiveSubChat}
                                  onArchiveAllBelow={handleArchiveAllBelow}
                                  onArchiveOthers={onCloseOtherChats}
                                  isOnlyChat={openSubChats.length === 1}
                                  currentIndex={globalIndex}
                                  totalCount={filteredSubChats.length}
                                  chatId={parentChatId}
                                />
                              )}
                            </ContextMenu>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              ) : searchQuery.trim() ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4 text-center">
                  <div>
                    <p className="mb-1">No results</p>
                    <p className="text-xs text-muted-foreground/60">
                      Try a different search term
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Multi-select Footer Toolbar */}
      <AnimatePresence mode="wait">
        {isMultiSelectMode && (
          <motion.div
            key="multiselect-footer"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0 }}
            className="flex-shrink-0 p-2 bg-background space-y-2 relative z-10"
            style={{
              // @ts-expect-error - WebKit-specific property
              WebkitAppRegion: "no-drag",
            }}
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-muted-foreground">
                {selectedSubChatsCount} selected
              </span>
              <button
                onClick={clearSubChatSelection}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkArchive}
                className="flex-1 h-8 gap-1.5 text-xs rounded-lg"
              >
                <ArchiveIcon className="h-3.5 w-3.5" />
                Archive
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rename Dialog */}
      <AgentsRenameSubChatDialog
        isOpen={renameDialogOpen}
        onClose={() => {
          setRenameDialogOpen(false)
          setRenamingSubChat(null)
        }}
        onSave={handleRenameSave}
        currentName={renamingSubChat?.name || ""}
        isLoading={renameLoading}
      />

      {/* Archive Agent Confirmation Dialog */}
      <AlertDialog
        open={archiveAgentDialogOpen}
        onOpenChange={(open) => {
          setArchiveAgentDialogOpen(open)
          if (!open) {
            setSubChatToArchive(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive agent</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription className="px-5 pb-5">
            Do you want to archive agent{" "}
            <span className="font-medium text-foreground">
              {agentName || subChatToArchive?.name || "this agent"}
            </span>
            ? You can restore it from history later.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmArchiveAgent}
              autoFocus
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* SubChat name tooltip portal - always rendered, visibility controlled via ref */}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[100000] max-w-xs px-2 py-1 text-xs bg-popover border border-border rounded-md shadow-lg pointer-events-none text-foreground/90 whitespace-nowrap"
            style={{
              display: "none",
              transform: "translateY(-50%)",
            }}
          />,
          document.body,
        )}
    </div>
  )
}
