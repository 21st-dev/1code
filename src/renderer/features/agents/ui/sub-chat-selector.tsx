"use client"

import { useCallback, useMemo, useEffect, useRef, useState, memo, forwardRef, useImperativeHandle } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  loadingSubChatsAtom,
  agentsSubChatUnseenChangesAtom,
  agentsSubChatsSidebarModeAtom,
  pendingUserQuestionsAtom,
} from "../atoms"
import { trpc } from "../../../lib/trpc"
import { X, Plus, AlignJustify, Play } from "lucide-react"
import {
  IconSpinner,
  PlanIcon,
  AgentIcon,
  IconOpenSidebarRight,
  PinFilledIcon,
  DiffIcon,
  ClockIcon,
  QuestionIcon,
} from "../../../components/ui/icons"
import { Button } from "../../../components/ui/button"
import { cn } from "../../../lib/utils"
import {
  useAgentSubChatStore,
  type SubChatMeta,
} from "../stores/sub-chat-store"
import { useShallow } from "zustand/react/shallow"
import { PopoverTrigger } from "../../../components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { Kbd } from "../../../components/ui/kbd"
import { getShortcutKey } from "../../../lib/utils/platform"
import {
  ContextMenu,
  ContextMenuTrigger,
} from "../../../components/ui/context-menu"
import { InlineEdit } from "./inline-edit"
import { api } from "../../../lib/mock-api"
import { toast } from "sonner"
import { SearchCombobox } from "../../../components/ui/search-combobox"
import { SubChatContextMenu } from "./sub-chat-context-menu"
import { formatTimeAgo } from "../utils/format-time-ago"

interface DiffStats {
  fileCount: number
  additions: number
  deletions: number
  isLoading: boolean
  hasChanges: boolean
}

// Isolated Search History Popover - prevents parent re-renders when popover opens/closes
interface SearchHistoryPopoverProps {
  sortedSubChats: SubChatMeta[]
  loadingSubChats: Map<string, string>
  subChatUnseenChanges: Set<string>
  pendingQuestionsMap: Map<string, { subChatId: string }>
  pendingPlanApprovals: Set<string>
  allSubChatsLength: number
  onSelect: (subChat: SubChatMeta) => void
}

export interface SearchHistoryPopoverRef {
  open: () => void
}

const SearchHistoryPopover = memo(forwardRef<SearchHistoryPopoverRef, SearchHistoryPopoverProps>(function SearchHistoryPopover({
  sortedSubChats,
  loadingSubChats,
  subChatUnseenChanges,
  pendingQuestionsMap,
  pendingPlanApprovals,
  allSubChatsLength,
  onSelect,
}, ref) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  // Expose open function to parent
  useImperativeHandle(ref, () => ({
    open: () => setIsHistoryOpen(true)
  }), [])

  const renderItem = useCallback((subChat: SubChatMeta) => {
    const timeAgo = formatTimeAgo(subChat.updated_at || subChat.created_at)
    const isLoading = loadingSubChats.has(subChat.id)
    const hasUnseen = subChatUnseenChanges.has(subChat.id)
    const mode = subChat.mode || "agent"
    const hasPendingQuestion = pendingQuestionsMap.has(subChat.id)
    const hasPendingPlan = pendingPlanApprovals.has(subChat.id)

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
          {(hasPendingPlan || hasUnseen) && !isLoading && !hasPendingQuestion && (
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-popover flex items-center justify-center">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                hasPendingPlan ? "bg-amber-500" : "bg-[#307BD0]"
              )} />
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
  }, [loadingSubChats, subChatUnseenChanges, pendingQuestionsMap, pendingPlanApprovals])

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
      trigger={
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 rounded-md flex items-center justify-center"
                disabled={allSubChatsLength === 0}
              >
                <ClockIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Search chats
            <Kbd>/</Kbd>
          </TooltipContent>
        </Tooltip>
      }
    />
  )
}))

interface SubChatSelectorProps {
  onCreateNew: () => void
  isMobile?: boolean
  onBackToChats?: () => void
  onOpenPreview?: () => void
  canOpenPreview?: boolean
  onOpenDiff?: () => void
  canOpenDiff?: boolean
  isDiffSidebarOpen?: boolean
  diffStats?: DiffStats
}

export function SubChatSelector({
  onCreateNew,
  isMobile = false,
  onBackToChats,
  onOpenPreview,
  canOpenPreview = false,
  onOpenDiff,
  canOpenDiff = false,
  isDiffSidebarOpen = false,
  diffStats,
}: SubChatSelectorProps) {
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
  const subChatUnseenChanges = useAtomValue(agentsSubChatUnseenChangesAtom)
  const setSubChatUnseenChanges = useSetAtom(agentsSubChatUnseenChangesAtom)
  const [subChatsSidebarMode, setSubChatsSidebarMode] = useAtom(
    agentsSubChatsSidebarModeAtom,
  )
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

  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const textRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  // Using refs instead of state for gradients and truncation to avoid re-renders
  const leftGradientRef = useRef<HTMLDivElement>(null)
  const rightGradientRef = useRef<HTMLDivElement>(null)
  const truncatedTabsRef = useRef<Set<string>>(new Set())
  const searchHistoryPopoverRef = useRef<SearchHistoryPopoverRef>(null)

  // Map open IDs to metadata and sort: pinned first, then preserve user's tab order
  const openSubChats = useMemo(() => {
    const pinnedChats: SubChatMeta[] = []
    const unpinnedChats: SubChatMeta[] = []

    // Separate pinned and unpinned while preserving order
    openSubChatIds.forEach((id) => {
      const chat = allSubChats.find((sc) => sc.id === id)
      if (!chat) return

      if (pinnedSubChatIds.includes(id)) {
        pinnedChats.push(chat)
      } else {
        unpinnedChats.push(chat)
      }
    })

    // Sort pinned by recency (most recent first)
    pinnedChats.sort((a, b) => {
      const aT = new Date(a.updated_at || a.created_at || "0").getTime()
      const bT = new Date(b.updated_at || b.created_at || "0").getTime()
      return bT - aT
    })

    // Unpinned maintain their order from openSubChatIds (user's tab order)
    return [...pinnedChats, ...unpinnedChats]
  }, [openSubChatIds, allSubChats, pinnedSubChatIds])

  const onSwitch = useCallback(
    (subChatId: string) => {
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
    },
    [setSubChatUnseenChanges],
  )

  const onSwitchFromHistory = useCallback((subChatId: string) => {
    const state = useAgentSubChatStore.getState()
    const isAlreadyOpen = state.openSubChatIds.includes(subChatId)

    if (!isAlreadyOpen) {
      state.addToOpenSubChats(subChatId)
    }
    state.setActiveSubChat(subChatId)
  }, [])

  const onCloseTab = useCallback((subChatId: string) => {
    useAgentSubChatStore.getState().removeFromOpenSubChats(subChatId)
  }, [])

  const onCloseOtherTabs = useCallback((subChatId: string) => {
    const state = useAgentSubChatStore.getState()
    const idsToClose = state.openSubChatIds.filter((id) => id !== subChatId)
    idsToClose.forEach((id) => state.removeFromOpenSubChats(id))
    state.setActiveSubChat(subChatId)
  }, [])

  const onCloseTabsToRight = useCallback(
    (subChatId: string, visualIndex: number) => {
      const state = useAgentSubChatStore.getState()

      // Use visual order from sorted openSubChats, not storage order
      const idsToClose = openSubChats.slice(visualIndex + 1).map((sc) => sc.id)
      idsToClose.forEach((id) => state.removeFromOpenSubChats(id))
    },
    [openSubChats],
  )

  const [editingSubChatId, setEditingSubChatId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editLoading, setEditLoading] = useState(false)

  const renameMutation = api.agents.renameSubChat.useMutation({
    onSuccess: (_, variables) => {
      // Update local store
      useAgentSubChatStore
        .getState()
        .updateSubChatName(variables.subChatId, variables.name)
    },
    onError: (error) => {
      // Show helpful error message (like Canvas)
      if (error.data?.code === "NOT_FOUND") {
        toast.error("Send a message first before renaming this chat")
      } else {
        toast.error("Failed to rename chat")
      }
    },
  })

  const handleRenameClick = useCallback((subChat: SubChatMeta) => {
    // Allow rename attempt, will show toast if not in DB yet (like Canvas)
    setEditingSubChatId(subChat.id)
    setEditName(subChat.name || "")
  }, [])

  const handleEditSave = useCallback(
    async (subChat: SubChatMeta) => {
      const trimmedName = editName.trim()

      // If name hasn't changed, just exit editing mode
      if (trimmedName === subChat.name) {
        setEditingSubChatId(null)
        return
      }

      if (!trimmedName) {
        // Reset to original name if empty
        setEditName(subChat.name || "")
        setEditingSubChatId(null)
        return
      }

      // Store old name for revert on error (like Canvas)
      const oldName = subChat.name

      // Optimistic update
      useAgentSubChatStore.getState().updateSubChatName(subChat.id, trimmedName)

      setEditLoading(true)
      setEditingSubChatId(null)
      setEditName("")

      try {
        await renameMutation.mutateAsync({
          subChatId: subChat.id,
          name: trimmedName,
        })
      } catch {
        // Revert on error (like Canvas)
        useAgentSubChatStore
          .getState()
          .updateSubChatName(subChat.id, oldName || "New Chat")
      } finally {
        setEditLoading(false)
      }
    },
    [editName, renameMutation],
  )

  const handleEditCancel = useCallback((subChat: SubChatMeta) => {
    setEditName(subChat.name || "")
    setEditingSubChatId(null)
  }, [])

  const handleSelectFromHistory = useCallback(
    (subChat: SubChatMeta) => {
      onSwitchFromHistory(subChat.id)
    },
    [onSwitchFromHistory],
  )

  // Hotkey: / to open history popover when sidebar is closed (tabs mode)
  useEffect(() => {
    const handleHistoryHotkey = (e: KeyboardEvent) => {
      // Only in tabs mode (sidebar closed)
      if (subChatsSidebarMode !== "tabs") return

      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
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
        searchHistoryPopoverRef.current?.open()
      }
    }

    window.addEventListener("keydown", handleHistoryHotkey, true)
    return () =>
      window.removeEventListener("keydown", handleHistoryHotkey, true)
  }, [subChatsSidebarMode])

  // Keyboard shortcut: Cmd+Shift+T / Ctrl+Shift+T for new sub-chat
  // Scroll to active tab when it changes
  useEffect(() => {
    if (!activeSubChatId || !tabsContainerRef.current) return

    const container = tabsContainerRef.current
    const activeTabElement = tabRefs.current.get(activeSubChatId)

    if (activeTabElement) {
      setTimeout(() => {
        const containerRect = container.getBoundingClientRect()
        const tabRect = activeTabElement.getBoundingClientRect()

        const isTabLeftOfView = tabRect.left < containerRect.left
        const isTabRightOfView = tabRect.right > containerRect.right

        if (isTabLeftOfView || isTabRightOfView) {
          const tabCenter =
            activeTabElement.offsetLeft + activeTabElement.offsetWidth / 2
          const containerCenter = container.offsetWidth / 2
          const targetScroll = tabCenter - containerCenter
          const maxScroll = container.scrollWidth - container.offsetWidth
          const clampedScroll = Math.max(0, Math.min(targetScroll, maxScroll))

          container.scrollTo({
            left: clampedScroll,
            behavior: "smooth",
          })
        }
      }, 0)
    }
  }, [activeSubChatId, openSubChats])

  // Check if text is truncated for each tab - updates ref and DOM directly
  useEffect(() => {
    const checkTruncation = () => {
      const newTruncated = new Set<string>()
      textRefs.current.forEach((el, subChatId) => {
        if (el && el.scrollWidth > el.clientWidth) {
          newTruncated.add(subChatId)
        }
      })
      truncatedTabsRef.current = newTruncated

      // Update gradient visibility for each tab via DOM
      tabRefs.current.forEach((tabEl, subChatId) => {
        const gradientEl = tabEl.querySelector('[data-truncate-gradient]') as HTMLElement
        if (gradientEl) {
          gradientEl.style.display = newTruncated.has(subChatId) ? 'block' : 'none'
        }
      })
    }

    checkTruncation()

    const resizeObserver = new ResizeObserver(() => checkTruncation())
    textRefs.current.forEach((el) => el && resizeObserver.observe(el))

    return () => resizeObserver.disconnect()
  }, [openSubChats, activeSubChatId])

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

  const hasNoChats = openSubChats.length === 0
  const hasSingleChat = openSubChats.length === 1

  // Check scroll position for gradients - uses direct DOM manipulation
  const checkScrollPosition = useCallback(() => {
    const container = tabsContainerRef.current
    if (!container) return

    const { scrollLeft, scrollWidth, clientWidth } = container
    const isScrollable = scrollWidth > clientWidth

    const showLeft = isScrollable && scrollLeft > 0
    const showRight = isScrollable && scrollLeft < scrollWidth - clientWidth - 1

    if (leftGradientRef.current) {
      leftGradientRef.current.style.display = showLeft ? "block" : "none"
    }
    if (rightGradientRef.current) {
      rightGradientRef.current.style.display = showRight ? "block" : "none"
    }
  }, [])

  // Update gradients on scroll
  useEffect(() => {
    const container = tabsContainerRef.current
    if (!container) return

    checkScrollPosition()

    container.addEventListener("scroll", checkScrollPosition, { passive: true })
    return () => container.removeEventListener("scroll", checkScrollPosition)
  }, [checkScrollPosition])

  // Update gradients when tabs change
  useEffect(() => {
    checkScrollPosition()
  }, [openSubChats, checkScrollPosition])

  // Update gradients on window resize
  useEffect(() => {
    const handleResize = () => checkScrollPosition()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [checkScrollPosition])

  // Cleanup refs for closed tabs to prevent memory leaks
  useEffect(() => {
    const openIds = new Set(openSubChatIds)

    // Remove refs for tabs that are no longer open
    tabRefs.current.forEach((_, id) => {
      if (!openIds.has(id)) {
        tabRefs.current.delete(id)
        textRefs.current.delete(id)
      }
    })
  }, [openSubChatIds])

  return (
    <div
      className="flex items-center gap-1 h-7 w-full"
      style={{
        // @ts-expect-error - WebKit-specific property for Electron window dragging
        WebkitAppRegion: "drag",
      }}
    >
      {/* Burger button - hidden when sub-chats sidebar is open (it moves into sidebar) */}
      {onBackToChats && subChatsSidebarMode === "tabs" && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onBackToChats}
          className="h-7 w-7 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0"
          aria-label="Back to chats"
          style={{
            // @ts-expect-error - WebKit-specific property
            WebkitAppRegion: "no-drag",
          }}
        >
          <AlignJustify className="h-4 w-4" />
          <span className="sr-only">Back to chats</span>
        </Button>
      )}

      {/* Open sidebar button - only on desktop when in tabs mode */}
      {!isMobile && subChatsSidebarMode === "tabs" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSubChatsSidebarMode("sidebar")}
              className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 rounded-md flex items-center justify-center"
              style={{
                // @ts-expect-error - WebKit-specific property
                WebkitAppRegion: "no-drag",
              }}
            >
              <IconOpenSidebarRight className="h-4 w-4 scale-x-[-1]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Open chats pane</TooltipContent>
        </Tooltip>
      )}

      <div
        className="relative flex-1 min-w-0 flex items-center"
        style={{
          // @ts-expect-error - WebKit-specific property
          WebkitAppRegion: "no-drag",
        }}
      >
        {/* Left gradient - visibility controlled via ref */}
        <div
          ref={leftGradientRef}
          className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none z-30"
          style={{ display: "none" }}
        />

        {/* Scrollable tabs container - with padding-right for plus button */}
        <div
          ref={tabsContainerRef}
          className={cn(
            "flex items-center px-1 py-1 -my-1 gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-hide pr-12",
            // Hide tabs when sidebar is open (desktop) or when only one chat exists
            (subChatsSidebarMode === "sidebar" && !isMobile) && "hidden",
            hasSingleChat && "hidden",
          )}
        >
          {hasNoChats
            ? null
            : openSubChats.map((subChat, index) => {
                const isActive = activeSubChatId === subChat.id
                const isLoading = loadingSubChats.has(subChat.id)
                const hasUnseen = subChatUnseenChanges.has(subChat.id)
                const hasTabsToRight = index < openSubChats.length - 1
                const isPinned = pinnedSubChatIds.includes(subChat.id)
                // Get mode from sub-chat itself (defaults to "agent")
                const mode = subChat.mode || "agent"
                // Check if this chat is waiting for user answer
                const hasPendingQuestion = pendingQuestionsMap.has(subChat.id)
                // Check if this chat has a pending plan approval
                const hasPendingPlan = pendingPlanApprovals.has(subChat.id)

                return (
                  <ContextMenu key={subChat.id}>
                    <ContextMenuTrigger asChild>
                      <button
                        ref={(el) => {
                          if (el) {
                            tabRefs.current.set(subChat.id, el)
                          } else {
                            tabRefs.current.delete(subChat.id)
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          if (editingSubChatId !== subChat.id) {
                            onSwitch(subChat.id)
                          }
                        }}
                        onMouseDown={(e) => {
                          // Middle-click to close tab (like Chrome)
                          if (e.button === 1 && openSubChats.length > 1) {
                            e.preventDefault()
                            e.stopPropagation()
                            onCloseTab(subChat.id)
                          }
                        }}
                        onAuxClick={(e) => {
                          // Prevent context menu on middle-click
                          if (e.button === 1) {
                            e.preventDefault()
                            e.stopPropagation()
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          if (editingSubChatId !== subChat.id) {
                            handleRenameClick(subChat)
                          }
                        }}
                        className={cn(
                          "group relative flex items-center text-sm rounded-md transition-colors duration-75 cursor-pointer h-6 flex-shrink-0",
                          "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                          editingSubChatId === subChat.id
                            ? "overflow-visible px-0"
                            : "overflow-hidden px-1.5 py-0.5 whitespace-nowrap min-w-[50px] gap-1.5",
                          isActive
                            ? "bg-muted text-foreground max-w-[180px]"
                            : "hover:bg-muted/80 max-w-[150px]",
                        )}
                      >
                        {/* Icon: question icon (priority) OR loading spinner OR mode icon with badge (hide when editing) */}
                        {editingSubChatId !== subChat.id && (
                          <div className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center relative">
                            {hasPendingQuestion ? (
                              // Waiting for user answer: show question icon (highest priority)
                              <QuestionIcon className="w-3.5 h-3.5 text-blue-500" />
                            ) : isLoading ? (
                              // Loading: show spinner
                              <IconSpinner className="w-3.5 h-3.5 text-muted-foreground" />
                            ) : (
                              <>
                                {/* Main mode icon */}
                                {mode === "plan" ? (
                                  <PlanIcon className="w-3.5 h-3.5 text-muted-foreground" />
                                ) : (
                                  <AgentIcon className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                {/* Badge in bottom-right corner: amber dot (plan) > unseen dot > pin icon */}
                                {(hasPendingPlan || hasUnseen || isPinned) && (
                                  <div
                                    className={cn(
                                      "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full flex items-center justify-center",
                                      isActive ? "bg-muted" : "bg-background",
                                    )}
                                  >
                                    {hasPendingPlan ? (
                                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    ) : hasUnseen ? (
                                      <div className="w-1.5 h-1.5 rounded-full bg-[#307BD0]" />
                                    ) : isPinned ? (
                                      <PinFilledIcon className="w-2 h-2 text-muted-foreground" />
                                    ) : null}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}

                        {editingSubChatId === subChat.id ? (
                          <InlineEdit
                            value={editName}
                            onChange={setEditName}
                            onSave={() => handleEditSave(subChat)}
                            onCancel={() => handleEditCancel(subChat)}
                            isEditing={true}
                            disabled={editLoading}
                            className="text-sm !px-1 !py-0 !h-6 min-w-[100px] border border-input rounded-md !ring-0 !shadow-none focus-visible:!ring-0 focus-visible:!ring-offset-0 focus-visible:!border-input"
                          />
                        ) : (
                          <span
                            ref={(el) => {
                              if (el) {
                                textRefs.current.set(subChat.id, el)
                              } else {
                                textRefs.current.delete(subChat.id)
                              }
                            }}
                            className="relative z-0 text-left flex-1 min-w-0 pr-1 overflow-hidden block whitespace-nowrap"
                          >
                            {subChat.name || "New Chat"}
                          </span>
                        )}

                        {/* Gradient fade on the right when text is truncated and not editing - visibility controlled via DOM */}
                        {editingSubChatId !== subChat.id && (
                          <div
                            data-truncate-gradient
                            className={cn(
                              "absolute right-0 top-0 bottom-0 w-6 pointer-events-none z-[1] rounded-r-md opacity-100 group-hover:opacity-0 transition-opacity duration-200",
                              isActive
                                ? "bg-gradient-to-l from-muted to-transparent"
                                : "bg-gradient-to-l from-background to-transparent",
                            )}
                            style={{ display: truncatedTabsRef.current.has(subChat.id) ? "block" : "none" }}
                          />
                        )}

                        {/* Close button - only show when hovered and multiple tabs and not editing */}
                        {openSubChats.length > 1 &&
                          editingSubChatId !== subChat.id && (
                            <div className="absolute right-0 top-0 bottom-0 flex items-center justify-end pr-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                              <div
                                className={cn(
                                  "absolute right-0 top-0 bottom-0 w-9 flex items-center justify-center rounded-r-md",
                                  isActive
                                    ? "bg-[linear-gradient(to_left,hsl(var(--muted))_0%,hsl(var(--muted))_60%,transparent_100%)]"
                                    : "bg-[linear-gradient(to_left,color-mix(in_srgb,hsl(var(--muted))_80%,hsl(var(--background)))_0%,color-mix(in_srgb,hsl(var(--muted))_80%,hsl(var(--background)))_60%,transparent_100%)]",
                                )}
                              />
                              <span
                                role="button"
                                tabIndex={-1}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onCloseTab(subChat.id)
                                }}
                                className="relative z-20 hover:text-foreground rounded p-0.5 transition-[color,transform] duration-150 ease-out active:scale-[0.97] cursor-pointer"
                                title={
                                  isActive
                                    ? `Close tab (${getShortcutKey("closeTab")})`
                                    : "Close tab"
                                }
                              >
                                <X className="h-3 w-3" />
                              </span>
                            </div>
                          )}
                      </button>
                    </ContextMenuTrigger>
                    <SubChatContextMenu
                      subChat={subChat}
                      isPinned={isPinned}
                      onTogglePin={togglePinSubChat}
                      onRename={handleRenameClick}
                      onArchive={onCloseTab}
                      onArchiveOthers={onCloseOtherTabs}
                      isOnlyChat={openSubChats.length === 1}
                      showCloseTabOptions={true}
                      onCloseTab={onCloseTab}
                      onCloseOtherTabs={onCloseOtherTabs}
                      onCloseTabsToRight={onCloseTabsToRight}
                      visualIndex={index}
                      hasTabsToRight={hasTabsToRight}
                      canCloseOtherTabs={openSubChats.length > 2}
                      chatId={parentChatId}
                    />
                  </ContextMenu>
                )
              })}
        </div>

        {/* Plus button - absolute positioned on right with gradient cover */}
        {(isMobile || (!isMobile && subChatsSidebarMode === "tabs")) && (
          <div className="absolute right-0 top-0 bottom-0 flex items-center z-20">
            {/* Gradient to cover content peeking from the left */}
            <div className="w-6 h-full bg-gradient-to-r from-transparent to-background" />
            <div className="h-full flex items-center bg-background pr-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onCreateNew}
                    className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  New chat
                  <Kbd>{getShortcutKey("newTab")}</Kbd>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons - always visible on mobile, on desktop only in tabs mode */}
      {(isMobile || (!isMobile && subChatsSidebarMode === "tabs")) && (
        <div
          className="flex items-center gap-1"
          style={{
            // @ts-expect-error - WebKit-specific property
            WebkitAppRegion: "no-drag",
          }}
        >
          <SearchHistoryPopover
            ref={searchHistoryPopoverRef}
            sortedSubChats={sortedSubChats}
            loadingSubChats={loadingSubChats}
            subChatUnseenChanges={subChatUnseenChanges}
            pendingQuestionsMap={pendingQuestionsMap}
            pendingPlanApprovals={pendingPlanApprovals}
            allSubChatsLength={allSubChats.length}
            onSelect={handleSelectFromHistory}
          />
        </div>
      )}

      {/* Diff button - always visible on desktop when sandbox exists */}
      {!isMobile && canOpenDiff && (
        <div
          className="rounded-md bg-background/10 backdrop-blur-[10px] flex items-center justify-center"
          style={{
            // @ts-expect-error - WebKit-specific property
            WebkitAppRegion: "no-drag",
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenDiff?.()}
                className="h-6 w-6 p-0 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 rounded-md flex items-center justify-center hover:bg-foreground/10"
              >
                {diffStats?.isLoading ? (
                  <IconSpinner className="h-4 w-4" />
                ) : (
                  <DiffIcon className="h-4 w-4" />
                )}
                <span className="sr-only">Open diff</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {diffStats?.isLoading ? (
                "Loading changes..."
              ) : diffStats?.hasChanges ? (
                <>
                  <span>View changes</span>
                  <Kbd>⌘D</Kbd>
                </>
              ) : (
                "No changes"
              )}
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Diff button - only on mobile when diff is available */}
      {isMobile && onOpenDiff && canOpenDiff && (
        <div
          className="rounded-md bg-background/10 backdrop-blur-[10px] flex items-center justify-center"
          style={{
            // @ts-expect-error - WebKit-specific property
            WebkitAppRegion: "no-drag",
          }}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenDiff}
            className="h-7 w-7 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 flex items-center justify-center"
          >
            <DiffIcon className="h-4 w-4" />
            <span className="sr-only">Open diff</span>
          </Button>
        </div>
      )}

      {/* Play button - only on mobile when preview is available */}
      {isMobile && onOpenPreview && canOpenPreview && (
        <div
          className="rounded-md bg-background/10 backdrop-blur-[10px] flex items-center justify-center"
          style={{
            // @ts-expect-error - WebKit-specific property
            WebkitAppRegion: "no-drag",
          }}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenPreview}
            className="h-7 w-7 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 flex items-center justify-center"
          >
            <Play className="h-4 w-4" />
            <span className="sr-only">Open preview</span>
          </Button>
        </div>
      )}

    </div>
  )
}
