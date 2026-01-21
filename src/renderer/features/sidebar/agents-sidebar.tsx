"use client"

import React from "react"
import { useState, useRef, useMemo, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "motion/react"
import { Button as ButtonCustom } from "../../components/ui/button"
import { cn } from "../../lib/utils"
import { useSetAtom, useAtom, useAtomValue } from "jotai"
import {
  createTeamDialogOpenAtom,
  agentsSettingsDialogActiveTabAtom,
  agentsSettingsDialogOpenAtom,
  agentsHelpPopoverOpenAtom,
  agentsShortcutsDialogOpenAtom,
  selectedAgentChatIdsAtom,
  isAgentMultiSelectModeAtom,
  toggleAgentChatSelectionAtom,
  selectAllAgentChatsAtom,
  clearAgentChatSelectionAtom,
  selectedAgentChatsCountAtom,
  isDesktopAtom,
  isFullscreenAtom,
} from "../../lib/atoms"
import { ArchivePopover } from "../agents/ui/archive-popover"
import { WorkflowsSidebarSection } from "../workflows/ui/workflows-sidebar-section"
import { selectedWorkflowCategoryAtom } from "../workflows/atoms"
import { McpSidebarSection } from "../mcp/ui/mcp-sidebar-section"
import { selectedMcpCategoryAtom } from "../mcp/atoms"
import { ChevronDown, MoreHorizontal } from "lucide-react"
// import { useRouter } from "next/navigation" // Desktop doesn't use next/navigation
// import { useCombinedAuth } from "@/lib/hooks/use-combined-auth"
const useCombinedAuth = () => ({ userId: null })
// import { AuthDialog } from "@/components/auth/auth-dialog"
const AuthDialog = () => null
// Desktop: archive is handled inline, not via hook
// import { DiscordIcon } from "@/components/icons"
import { DiscordIcon } from "../../icons"
import { AgentsRenameSubChatDialog } from "../agents/components/agents-rename-subchat-dialog"
import { trpc } from "../../lib/trpc"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { Kbd } from "../../components/ui/kbd"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../components/ui/context-menu"
import {
  IconDoubleChevronLeft,
  SettingsIcon,
  PlusIcon,
  ProfileIcon,
  PublisherStudioIcon,
  SearchIcon,
  GitHubLogo,
  IconSpinner,
  ArchiveIcon,
  TrashIcon,
  QuestionCircleIcon,
  KeyboardIcon,
  TicketIcon,
} from "../../components/ui/icons"
import { Logo } from "../../components/ui/logo"
import { Input } from "../../components/ui/input"
import { Button } from "../../components/ui/button"
import {
  selectedAgentChatIdAtom,
  selectedDraftIdAtom,
  loadingSubChatsAtom,
  agentsUnseenChangesAtom,
  archivePopoverOpenAtom,
  agentsDebugModeAtom,
  selectedProjectAtom,
  justCreatedIdsAtom,
} from "../agents/atoms"
import { AgentsHelpPopover } from "../agents/components/agents-help-popover"
import { getShortcutKey, isDesktopApp } from "../../lib/utils/platform"
import { pluralize } from "../agents/utils/pluralize"
import { useNewChatDrafts, deleteNewChatDraft, type NewChatDraft } from "../agents/lib/drafts"
import {
  TrafficLightSpacer,
  TrafficLights,
} from "../agents/components/traffic-light-spacer"
import { useHotkeys } from "react-hotkeys-hook"
import { Checkbox } from "../../components/ui/checkbox"
import { useHaptic } from "./hooks/use-haptic"
import { TypewriterText } from "../../components/ui/typewriter-text"

// Feedback URL: uses env variable for hosted version, falls back to public Discord for open source
const FEEDBACK_URL =
  import.meta.env.VITE_FEEDBACK_URL || "https://discord.gg/8ektTZGnj4"

// Component to render chat icon with loading status
const ChatIcon = React.memo(function ChatIcon({
  isSelected,
  isLoading,
  hasUnseenChanges = false,
  isMultiSelectMode = false,
  isChecked = false,
  onCheckboxClick,
  gitOwner,
  gitProvider,
}: {
  isSelected: boolean
  isLoading: boolean
  hasUnseenChanges?: boolean
  isMultiSelectMode?: boolean
  isChecked?: boolean
  onCheckboxClick?: (e: React.MouseEvent) => void
  gitOwner?: string | null
  gitProvider?: string | null
}) {
  // Show GitHub avatar if available, otherwise blank project icon
  const renderMainIcon = () => {
    if (gitOwner && gitProvider === "github") {
      return (
        <img
          src={`https://github.com/${gitOwner}.png?size=64`}
          alt={gitOwner}
          className="h-4 w-4 rounded-sm flex-shrink-0"
        />
      )
    }
    return (
      <GitHubLogo
        className={cn(
          "h-4 w-4 flex-shrink-0 transition-colors",
          isSelected ? "text-foreground" : "text-muted-foreground",
        )}
      />
    )
  }

  return (
    <div className="relative flex-shrink-0 w-4 h-4">
      {/* Checkbox slides in from left, icon slides out */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-150 ease-out",
          isMultiSelectMode
            ? "opacity-100 scale-100"
            : "opacity-0 scale-95 pointer-events-none",
        )}
        onClick={onCheckboxClick}
      >
        <Checkbox
          checked={isChecked}
          className="cursor-pointer h-4 w-4"
          tabIndex={isMultiSelectMode ? 0 : -1}
        />
      </div>
      {/* Main icon fades out when multi-select is active */}
      <div
        className={cn(
          "transition-[opacity,transform] duration-150 ease-out",
          isMultiSelectMode
            ? "opacity-0 scale-95 pointer-events-none"
            : "opacity-100 scale-100",
        )}
      >
        {renderMainIcon()}
      </div>
      {/* Badge in bottom-right corner: loader or unseen dot - hidden during multi-select */}
      {(isLoading || hasUnseenChanges) && !isMultiSelectMode && (
        <div
          className={cn(
            "absolute -bottom-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center",
            // Светлая тема: выбран/ховер #E8E8E8
            // Темная тема: дефолт #101010, выбран/ховер #1B1B1B
            isSelected
              ? "bg-[#E8E8E8] dark:bg-[#1B1B1B]"
              : "bg-[#F4F4F4] group-hover:bg-[#E8E8E8] dark:bg-[#101010] dark:group-hover:bg-[#1B1B1B]",
          )}
        >
          {isLoading ? (
            <IconSpinner className="w-2.5 h-2.5 text-muted-foreground" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-[#307BD0]" />
          )}
        </div>
      )}
    </div>
  )
})

interface AgentsSidebarProps {
  userId?: string | null | undefined
  clerkUser?: any
  onToggleSidebar?: () => void
  isMobileFullscreen?: boolean
  onChatSelect?: () => void
}

export function AgentsSidebar({
  userId = "demo-user-id",
  clerkUser = null,
  onToggleSidebar,
  isMobileFullscreen = false,
  onChatSelect,
}: AgentsSidebarProps) {
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const setSelectedCategory = useSetAtom(selectedWorkflowCategoryAtom)
  const setSelectedMcpCategory = useSetAtom(selectedMcpCategoryAtom)
  const [selectedDraftId, setSelectedDraftId] = useAtom(selectedDraftIdAtom)
  const [loadingSubChats] = useAtom(loadingSubChatsAtom)
  const [isSidebarHovered, setIsSidebarHovered] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [focusedChatIndex, setFocusedChatIndex] = useState<number>(-1) // -1 means no focus
  const [hoveredChatIndex, setHoveredChatIndex] = useState<number>(-1) // Track hovered chat for X hotkey

  // Global desktop/fullscreen state from atoms (initialized in AgentsLayout)
  const isDesktop = useAtomValue(isDesktopAtom)
  const isFullscreen = useAtomValue(isFullscreenAtom)

  // Multi-select state
  const [selectedChatIds, setSelectedChatIds] = useAtom(
    selectedAgentChatIdsAtom,
  )
  const isMultiSelectMode = useAtomValue(isAgentMultiSelectModeAtom)
  const selectedChatsCount = useAtomValue(selectedAgentChatsCountAtom)
  const toggleChatSelection = useSetAtom(toggleAgentChatSelectionAtom)
  const selectAllChats = useSetAtom(selectAllAgentChatsAtom)
  const clearChatSelection = useSetAtom(clearAgentChatSelectionAtom)

  // Scroll gradient state for agents list
  const [showBottomGradient, setShowBottomGradient] = useState(false)
  const [showTopGradient, setShowTopGradient] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Multiple drafts state - uses event-based sync instead of polling
  const drafts = useNewChatDrafts()

  // Read unseen changes from global atoms
  const unseenChanges = useAtomValue(agentsUnseenChangesAtom)
  const archivePopoverOpen = useAtomValue(archivePopoverOpenAtom)
  const justCreatedIds = useAtomValue(justCreatedIdsAtom)
  const [helpPopoverOpen, setHelpPopoverOpen] = useAtom(
    agentsHelpPopoverOpenAtom,
  )
  const setShortcutsDialogOpen = useSetAtom(agentsShortcutsDialogOpenAtom)
  const [blockHelpTooltip, setBlockHelpTooltip] = useState(false)
  const [blockArchiveTooltip, setBlockArchiveTooltip] = useState(false)
  const prevHelpPopoverOpen = useRef(false)
  const prevArchivePopoverOpen = useRef(false)

  // Haptic feedback
  const { trigger: triggerHaptic } = useHaptic()

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renamingChat, setRenamingChat] = useState<{
    id: string
    name: string
  } | null>(null)
  const [renameLoading, setRenameLoading] = useState(false)

  // Track initial mount to skip footer animation on load
  const hasFooterAnimated = useRef(false)

  // Pinned chats (stored in localStorage per project)
  const [pinnedChatIds, setPinnedChatIds] = useState<Set<string>>(new Set())
  const helpButtonRef = useRef<HTMLButtonElement>(null)
  const archiveButtonRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Agent name tooltip state (for truncated names)
  const [agentTooltip, setAgentTooltip] = useState<{
    visible: boolean
    position: { top: number; left: number }
    name: string
  } | null>(null)
  const nameRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const agentTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const setSettingsDialogOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const { isLoaded: isAuthLoaded } = useCombinedAuth()
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const setCreateTeamDialogOpen = useSetAtom(createTeamDialogOpenAtom)

  // Debug mode for testing first-time user experience
  const debugMode = useAtomValue(agentsDebugModeAtom)

  // Desktop: use selectedProject instead of teams
  const [selectedProject] = useAtom(selectedProjectAtom)

  // Fetch all chats (no project filter)
  const { data: agentChats } = trpc.chats.list.useQuery({})

  // Fetch all projects for git info
  const { data: projects } = trpc.projects.list.useQuery()

  // Create map for quick project lookup by id
  const projectsMap = useMemo(() => {
    if (!projects) return new Map()
    return new Map(projects.map((p) => [p.id, p]))
  }, [projects])

  // Fetch all archived chats (to get count)
  const { data: archivedChats } = trpc.chats.listArchived.useQuery({})
  const archivedChatsCount = archivedChats?.length ?? 0

  // Get utils outside of callbacks - hooks must be called at top level
  const utils = trpc.useUtils()

  // Block tooltips temporarily after popover closes and remove focus
  useEffect(() => {
    // Only trigger when transitioning from open (true) to closed (false)
    if (prevHelpPopoverOpen.current && !helpPopoverOpen) {
      // Help popover just closed, remove focus and block tooltip for 300ms
      helpButtonRef.current?.blur()
      setBlockHelpTooltip(true)
      const timer = setTimeout(() => setBlockHelpTooltip(false), 300)
      prevHelpPopoverOpen.current = helpPopoverOpen
      return () => clearTimeout(timer)
    }
    prevHelpPopoverOpen.current = helpPopoverOpen
  }, [helpPopoverOpen])

  useEffect(() => {
    // Only trigger when transitioning from open (true) to closed (false)
    if (prevArchivePopoverOpen.current && !archivePopoverOpen) {
      // Archive popover just closed, remove focus and block tooltip for 300ms
      archiveButtonRef.current?.blur()
      setBlockArchiveTooltip(true)
      const timer = setTimeout(() => setBlockArchiveTooltip(false), 300)
      prevArchivePopoverOpen.current = archivePopoverOpen
      return () => clearTimeout(timer)
    }
    prevArchivePopoverOpen.current = archivePopoverOpen
  }, [archivePopoverOpen])

  // Stack of archived chats for multiple Cmd+Z undos
  const archivedStackRef = useRef<Array<{
    chatId: string
    timeoutId: ReturnType<typeof setTimeout>
  }>>([])

  // Restore chat mutation (for undo)
  const restoreChatMutation = trpc.chats.restore.useMutation({
    onSuccess: () => {
      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()
    },
  })

  // Remove item from stack by chatId
  const removeFromStack = useCallback((chatId: string) => {
    const index = archivedStackRef.current.findIndex((item) => item.chatId === chatId)
    if (index !== -1) {
      clearTimeout(archivedStackRef.current[index].timeoutId)
      archivedStackRef.current.splice(index, 1)
    }
  }, [])

  // Archive chat mutation
  const archiveChatMutation = trpc.chats.archive.useMutation({
    onSuccess: (_, variables) => {
      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()
      // If archiving the currently selected chat, clear selection
      if (selectedChatId) {
        setSelectedChatId(null)
      }

      // Clear after 10 seconds (Cmd+Z window)
      const timeoutId = setTimeout(() => {
        removeFromStack(variables.id)
      }, 10000)

      // Add to stack for Cmd+Z
      archivedStackRef.current.push({
        chatId: variables.id,
        timeoutId,
      })
    },
  })

  // Cmd+Z to undo archive (supports multiple undos)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && archivedStackRef.current.length > 0) {
        e.preventDefault()
        // Pop the most recent archived item
        const item = archivedStackRef.current.pop()
        if (item) {
          clearTimeout(item.timeoutId)
          restoreChatMutation.mutate({ id: item.chatId })
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [restoreChatMutation])

  // Batch archive mutation
  const archiveChatsBatchMutation = trpc.chats.archiveBatch.useMutation({
    onSuccess: () => {
      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()
    },
  })

  // Reset selected chat when project changes (but not on initial load)
  const prevProjectIdRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    // Skip on initial mount (prevProjectIdRef is undefined)
    if (prevProjectIdRef.current === undefined) {
      prevProjectIdRef.current = selectedProject?.id ?? null
      return
    }
    // Only reset if project actually changed from a real value (not from null/initial load)
    if (
      prevProjectIdRef.current !== null &&
      prevProjectIdRef.current !== selectedProject?.id &&
      selectedChatId
    ) {
      setSelectedChatId(null)
    }
    prevProjectIdRef.current = selectedProject?.id ?? null
  }, [selectedProject?.id]) // Don't include selectedChatId in deps to avoid loops

  // Load pinned IDs from localStorage when project changes
  useEffect(() => {
    if (!selectedProject?.id) {
      setPinnedChatIds(new Set())
      return
    }
    try {
      const stored = localStorage.getItem(
        `agent-pinned-chats-${selectedProject.id}`,
      )
      setPinnedChatIds(stored ? new Set(JSON.parse(stored)) : new Set())
    } catch {
      setPinnedChatIds(new Set())
    }
  }, [selectedProject?.id])

  // Save pinned IDs to localStorage when they change
  const prevPinnedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!selectedProject?.id) return
    // Only save if pinnedChatIds actually changed (avoid saving on load)
    if (
      (pinnedChatIds !== prevPinnedRef.current && pinnedChatIds.size > 0) ||
      prevPinnedRef.current.size > 0
    ) {
      localStorage.setItem(
        `agent-pinned-chats-${selectedProject.id}`,
        JSON.stringify([...pinnedChatIds]),
      )
    }
    prevPinnedRef.current = pinnedChatIds
  }, [pinnedChatIds, selectedProject?.id])

  // Rename mutation
  const renameChatMutation = trpc.chats.rename.useMutation({
    onSuccess: () => {
      utils.chats.list.invalidate()
    },
    onError: () => {
      toast.error("Failed to rename agent")
    },
  })

  const handleTogglePin = (chatId: string) => {
    setPinnedChatIds((prev) => {
      const next = new Set(prev)
      if (next.has(chatId)) {
        next.delete(chatId)
      } else {
        next.add(chatId)
      }
      return next
    })
  }

  const handleRenameClick = (chat: { id: string; name: string }) => {
    setRenamingChat(chat)
    setRenameDialogOpen(true)
  }

  const handleRenameSave = async (newName: string) => {
    if (!renamingChat) return

    const chatId = renamingChat.id
    const oldName = renamingChat.name

    // Optimistically update the query cache
    utils.chats.list.setData({}, (old) => {
      if (!old) return old
      return old.map((c) => (c.id === chatId ? { ...c, name: newName } : c))
    })

    setRenameLoading(true)

    try {
      await renameChatMutation.mutateAsync({
        id: chatId,
        name: newName,
      })
    } catch {
      // Rollback on error
      utils.chats.list.setData({}, (old) => {
        if (!old) return old
        return old.map((c) => (c.id === chatId ? { ...c, name: oldName } : c))
      })
    } finally {
      setRenameLoading(false)
      setRenamingChat(null)
    }
  }

  const handleArchiveAllBelow = (chatId: string) => {
    const currentIndex = filteredChats.findIndex((c) => c.id === chatId)
    if (currentIndex === -1 || currentIndex === filteredChats.length - 1) return

    const chatsToArchive = filteredChats
      .slice(currentIndex + 1)
      .map((c) => c.id)

    if (chatsToArchive.length > 0) {
      archiveChatsBatchMutation.mutate({ chatIds: chatsToArchive })
    }
  }

  const handleArchiveOthers = (chatId: string) => {
    const chatsToArchive = filteredChats
      .filter((c) => c.id !== chatId)
      .map((c) => c.id)

    if (chatsToArchive.length > 0) {
      archiveChatsBatchMutation.mutate({ chatIds: chatsToArchive })
    }
  }

  // Handle bulk archive of selected chats
  const handleBulkArchive = () => {
    const chatIdsToArchive = Array.from(selectedChatIds)
    if (chatIdsToArchive.length > 0) {
      // If active chat is being archived, select the next available chat
      const isArchivingActivChat =
        selectedChatId && chatIdsToArchive.includes(selectedChatId)

      archiveChatsBatchMutation.mutate(
        { chatIds: chatIdsToArchive },
        {
          onSuccess: () => {
            if (isArchivingActivChat) {
              // Find first chat that's not being archived
              const nextChat = filteredChats.find(
                (chat) => !chatIdsToArchive.includes(chat.id),
              )
              setSelectedChatId(nextChat?.id || null)
            }
            clearChatSelection()
          },
        },
      )
    }
  }

  // Check if all selected chats are pinned
  const areAllSelectedPinned = useMemo(() => {
    if (selectedChatIds.size === 0) return false
    return Array.from(selectedChatIds).every((id) => pinnedChatIds.has(id))
  }, [selectedChatIds, pinnedChatIds])

  // Check if all selected chats are unpinned
  const areAllSelectedUnpinned = useMemo(() => {
    if (selectedChatIds.size === 0) return false
    return Array.from(selectedChatIds).every((id) => !pinnedChatIds.has(id))
  }, [selectedChatIds, pinnedChatIds])

  // Show pin option only if all selected have same pin state
  const canShowPinOption = areAllSelectedPinned || areAllSelectedUnpinned

  // Handle bulk pin of selected chats
  const handleBulkPin = () => {
    const chatIdsToPin = Array.from(selectedChatIds)
    if (chatIdsToPin.length > 0) {
      setPinnedChatIds((prev) => {
        const next = new Set(prev)
        chatIdsToPin.forEach((id) => next.add(id))
        return next
      })
      clearChatSelection()
    }
  }

  // Handle bulk unpin of selected chats
  const handleBulkUnpin = () => {
    const chatIdsToUnpin = Array.from(selectedChatIds)
    if (chatIdsToUnpin.length > 0) {
      setPinnedChatIds((prev) => {
        const next = new Set(prev)
        chatIdsToUnpin.forEach((id) => next.delete(id))
        return next
      })
      clearChatSelection()
    }
  }

  // Get clerk username
  const clerkUsername = clerkUser?.username

  // Filter and separate pinned/unpinned agents
  const { pinnedAgents, unpinnedAgents, filteredChats } = useMemo(() => {
    if (!agentChats)
      return { pinnedAgents: [], unpinnedAgents: [], filteredChats: [] }

    const filtered = searchQuery.trim()
      ? agentChats.filter((chat) =>
          chat.name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : agentChats

    const pinned = filtered.filter((chat) => pinnedChatIds.has(chat.id))
    const unpinned = filtered.filter((chat) => !pinnedChatIds.has(chat.id))

    return {
      pinnedAgents: pinned,
      unpinnedAgents: unpinned,
      filteredChats: [...pinned, ...unpinned],
    }
  }, [searchQuery, agentChats, pinnedChatIds])

  // Delete a draft from localStorage
  const handleDeleteDraft = useCallback(
    (draftId: string) => {
      deleteNewChatDraft(draftId)
      // If the deleted draft was selected, clear selection
      if (selectedDraftId === draftId) {
        setSelectedDraftId(null)
      }
    },
    [selectedDraftId, setSelectedDraftId],
  )

  // Reset focused index when search query changes
  useEffect(() => {
    setFocusedChatIndex(-1)
  }, [searchQuery, filteredChats.length])

  // Scroll focused item into view
  useEffect(() => {
    if (focusedChatIndex >= 0 && filteredChats.length > 0) {
      const focusedElement = scrollContainerRef.current?.querySelector(
        `[data-chat-index="${focusedChatIndex}"]`,
      ) as HTMLElement
      if (focusedElement) {
        focusedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        })
      }
    }
  }, [focusedChatIndex, filteredChats.length])

  // Derive which chats have loading sub-chats
  const loadingChatIds = useMemo(
    () => new Set([...loadingSubChats.values()]),
    [loadingSubChats],
  )

  const handleNewAgent = () => {
    triggerHaptic("light")
    setSelectedChatId(null)
    setSelectedDraftId(null) // Clear selected draft so form starts empty
    // On mobile, switch to chat mode to show NewChatForm
    if (isMobileFullscreen && onChatSelect) {
      onChatSelect()
    }
  }

  const handleChatClick = (
    chatId: string,
    e?: React.MouseEvent,
    globalIndex?: number,
  ) => {
    // Shift+click for range selection (works in both normal and multi-select mode)
    if (e?.shiftKey) {
      e.preventDefault()

      const clickedIndex =
        globalIndex ?? filteredChats.findIndex((c) => c.id === chatId)

      if (clickedIndex === -1) return

      // Find the anchor: use active chat or last selected item
      let anchorIndex = -1

      // First try: use currently active/selected chat as anchor
      if (selectedChatId) {
        anchorIndex = filteredChats.findIndex((c) => c.id === selectedChatId)
      }

      // If no active chat, try to use the last item in selection
      if (anchorIndex === -1 && selectedChatIds.size > 0) {
        // Find the first selected item in the list as anchor
        for (let i = 0; i < filteredChats.length; i++) {
          if (selectedChatIds.has(filteredChats[i]!.id)) {
            anchorIndex = i
            break
          }
        }
      }

      // If still no anchor, just select the clicked item
      if (anchorIndex === -1) {
        if (!selectedChatIds.has(chatId)) {
          toggleChatSelection(chatId)
        }
        return
      }

      // Select range from anchor to clicked item
      const startIndex = Math.min(anchorIndex, clickedIndex)
      const endIndex = Math.max(anchorIndex, clickedIndex)

      // Build new selection set with the range
      const newSelection = new Set(selectedChatIds)
      for (let i = startIndex; i <= endIndex; i++) {
        const chat = filteredChats[i]
        if (chat) {
          newSelection.add(chat.id)
        }
      }
      setSelectedChatIds(newSelection)
      return
    }

    // In multi-select mode, clicking on the item still navigates to the chat
    // Only clicking on the checkbox toggles selection
    setSelectedChatId(chatId)

    // Clear workflow category when chat is selected (to show chat view)
    setSelectedCategory(null)
    // Clear MCP category when chat is selected
    setSelectedMcpCategory(null)

    // On mobile, notify parent to switch to chat mode
    if (isMobileFullscreen && onChatSelect) {
      onChatSelect()
    }
  }

  const handleCheckboxClick = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation()
    toggleChatSelection(chatId)
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60_000)
    const diffHours = Math.floor(diffMs / 3_600_000)
    const diffDays = Math.floor(diffMs / 86_400_000)

    if (diffMins < 1) return "now"
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`
    return `${Math.floor(diffDays / 365)}y`
  }

  // Handle agent card hover for truncated name tooltip (1s delay)
  const handleAgentMouseEnter = useCallback(
    (chatId: string, name: string, cardElement: HTMLElement) => {
      // Clear any existing timer
      if (agentTooltipTimerRef.current) {
        clearTimeout(agentTooltipTimerRef.current)
      }

      const nameEl = nameRefs.current.get(chatId)
      if (!nameEl) return

      // Check if name is truncated
      const isTruncated = nameEl.scrollWidth > nameEl.clientWidth
      if (!isTruncated) return

      // Show tooltip after 1 second delay
      agentTooltipTimerRef.current = setTimeout(() => {
        const rect = cardElement.getBoundingClientRect()
        setAgentTooltip({
          visible: true,
          position: {
            top: rect.top + rect.height / 2,
            left: rect.right + 8,
          },
          name,
        })
      }, 1000)
    },
    [],
  )

  const handleAgentMouseLeave = useCallback(() => {
    // Clear timer if hovering ends before delay
    if (agentTooltipTimerRef.current) {
      clearTimeout(agentTooltipTimerRef.current)
      agentTooltipTimerRef.current = null
    }
    setAgentTooltip(null)
  }, [])

  // Check if scroll is needed and show/hide gradients
  React.useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const checkScroll = () => {
      const needsScroll = container.scrollHeight > container.clientHeight
      if (needsScroll) {
        setShowBottomGradient(true)
        setShowTopGradient(false)
      } else {
        setShowBottomGradient(false)
        setShowTopGradient(false)
      }
    }

    checkScroll()
    // Re-check when content might change
    const resizeObserver = new ResizeObserver(checkScroll)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [filteredChats])

  // Direct listener for Cmd+F to focus search input
  useEffect(() => {
    const handleSearchHotkey = (e: KeyboardEvent) => {
      // Check for Cmd+F or Ctrl+F (only for search functionality)
      if (
        (e.metaKey || e.ctrlKey) &&
        e.code === "KeyF" &&
        !e.shiftKey &&
        !e.altKey
      ) {
        e.preventDefault()
        e.stopPropagation()

        // Focus search input
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }

    window.addEventListener("keydown", handleSearchHotkey, true)

    return () => {
      window.removeEventListener("keydown", handleSearchHotkey, true)
    }
  }, [])

  // Multi-select hotkeys
  // X to toggle selection of hovered or focused chat
  useHotkeys(
    "x",
    () => {
      if (!filteredChats || filteredChats.length === 0) return

      // Prefer hovered, then focused - do NOT fallback to 0 (would conflict with sub-chat sidebar)
      const targetIndex =
        hoveredChatIndex >= 0
          ? hoveredChatIndex
          : focusedChatIndex >= 0
            ? focusedChatIndex
            : -1

      if (targetIndex >= 0 && targetIndex < filteredChats.length) {
        const chatId = filteredChats[targetIndex]!.id
        // Toggle selection (both select and deselect)
        toggleChatSelection(chatId)
      }
    },
    [filteredChats, hoveredChatIndex, focusedChatIndex, toggleChatSelection],
  )

  // Cmd+A / Ctrl+A to select all chats (only when at least one is already selected)
  useHotkeys(
    "mod+a",
    (e) => {
      if (isMultiSelectMode && filteredChats && filteredChats.length > 0) {
        e.preventDefault()
        selectAllChats(filteredChats.map((c) => c.id))
      }
    },
    [filteredChats, selectAllChats, isMultiSelectMode],
  )

  // Escape to clear selection
  useHotkeys(
    "escape",
    () => {
      if (isMultiSelectMode) {
        clearChatSelection()
        setFocusedChatIndex(-1)
      }
    },
    [isMultiSelectMode, clearChatSelection],
  )

  // Clear selection when project changes
  useEffect(() => {
    clearChatSelection()
  }, [selectedProject?.id, clearChatSelection])

  // Handle scroll for gradients
  const handleAgentsScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
      const needsScroll = scrollHeight > clientHeight

      if (!needsScroll) {
        setShowBottomGradient(false)
        setShowTopGradient(false)
        return
      }

      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5
      const isAtTop = scrollTop <= 5

      setShowBottomGradient(!isAtBottom)
      setShowTopGradient(!isAtTop)
    },
    [],
  )

  // Mobile fullscreen mode - render without ResizableSidebar wrapper
  const sidebarContent = (
    <div
      className={cn(
        "group/sidebar flex flex-col gap-0 overflow-hidden select-none",
        isMobileFullscreen
          ? "h-full w-full bg-background"
          : "h-full bg-tl-background",
      )}
      onMouseEnter={() => setIsSidebarHovered(true)}
      onMouseLeave={(e) => {
        // Electron's drag region (WebkitAppRegion: "drag") returns a non-HTMLElement
        // object as relatedTarget. We preserve hover state in this case so the
        // traffic lights remain visible when hovering over the drag area.
        const relatedTarget = e.relatedTarget
        if (!relatedTarget || !(relatedTarget instanceof HTMLElement)) return
        const isStillInSidebar = relatedTarget.closest("[data-sidebar-content]")
        if (!isStillInSidebar) {
          setIsSidebarHovered(false)
        }
      }}
      data-mobile-fullscreen={isMobileFullscreen || undefined}
      data-sidebar-content
    >
      {/* Header area with close button at top-right (next to traffic lights) */}
      {/* This div has its own hover handlers because the drag region blocks events from bubbling to parent */}
      <div
        className="relative flex-shrink-0"
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={(e) => {
          // Electron's drag region (WebkitAppRegion: "drag") returns a non-HTMLElement
          // object as relatedTarget. We preserve hover state in this case so the
          // traffic lights remain visible when hovering over the drag area.
          const relatedTarget = e.relatedTarget
          if (!relatedTarget || !(relatedTarget instanceof HTMLElement)) return
          const isStillInSidebar = relatedTarget.closest(
            "[data-sidebar-content]",
          )
          if (!isStillInSidebar) {
            setIsSidebarHovered(false)
          }
        }}
      >
        {/* Draggable area for window movement - background layer (hidden in fullscreen) */}
        {isDesktop && !isFullscreen && (
          <div
            className="absolute inset-x-0 top-0 h-[32px] z-0"
            style={{
              // @ts-expect-error - WebKit-specific property
              WebkitAppRegion: "drag",
            }}
            data-sidebar-content
          />
        )}

        {/* Custom traffic lights - positioned at top left, centered in 32px area */}
        <TrafficLights
          isHovered={isSidebarHovered || isDropdownOpen}
          isFullscreen={isFullscreen}
          isDesktop={isDesktop}
          className="absolute left-4 top-[14px] z-20"
        />

        {/* Close button - positioned at top right, adjusted for traffic lights area when not fullscreen */}
        {!isMobileFullscreen && (
          <div
            className={cn(
              "absolute right-2 z-20 transition-opacity duration-150",
              // In fullscreen or non-desktop, position at top-2. In desktop mode with traffic lights, also top-2
              "top-2",
              isSidebarHovered || isDropdownOpen ? "opacity-100" : "opacity-0",
            )}
            style={{
              // Make clickable over drag region
              // @ts-expect-error - WebKit-specific property
              WebkitAppRegion: "no-drag",
            }}
          >
            <TooltipProvider>
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  <ButtonCustom
                    variant="ghost"
                    size="icon"
                    onClick={onToggleSidebar}
                    tabIndex={-1}
                    className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
                    aria-label="Close sidebar"
                  >
                    <IconDoubleChevronLeft className="h-4 w-4" />
                  </ButtonCustom>
                </TooltipTrigger>
                <TooltipContent>
                  Close sidebar
                  <Kbd>⌘\</Kbd>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {/* Spacer for macOS traffic lights (close/minimize/maximize) */}
        <TrafficLightSpacer isFullscreen={isFullscreen} isDesktop={isDesktop} />

        {/* Team dropdown - below traffic lights */}
        <div className="px-2 pt-2 pb-2">
          <div className="flex items-center gap-1">
            {/* Tiny team dropdown */}
            <div className="flex-1 min-w-0">
              <DropdownMenu
                open={isDropdownOpen}
                onOpenChange={setIsDropdownOpen}
              >
                <DropdownMenuTrigger asChild>
                  <ButtonCustom
                    variant="ghost"
                    className="h-6 px-1.5 justify-start hover:bg-foreground/10 rounded-md group/team-button max-w-full"
                    suppressHydrationWarning
                  >
                    <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                      <div className="flex items-center justify-center flex-shrink-0">
                        <Logo className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="text-sm font-medium text-foreground truncate">
                          1Code
                        </div>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-3 text-muted-foreground flex-shrink-0 overflow-hidden",
                          isDropdownOpen
                            ? "opacity-100 w-3"
                            : "opacity-0 w-0 group-hover/team-button:opacity-100 group-hover/team-button:w-3",
                        )}
                      />
                    </div>
                  </ButtonCustom>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-52 pt-0"
                  sideOffset={8}
                >
                  {userId ? (
                    <>
                      {/* Project section at the top */}
                      <div className="relative rounded-t-xl border-b overflow-hidden">
                        <div className="absolute inset-0 bg-popover brightness-110" />
                        <div className="relative pl-2 pt-1.5 pb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded flex items-center justify-center bg-background flex-shrink-0 overflow-hidden">
                              <Logo className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="font-medium text-sm text-foreground truncate">
                                User
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Settings */}
                      <DropdownMenuItem
                        className="gap-2"
                        onSelect={() => {
                          setIsDropdownOpen(false)
                          setSettingsActiveTab("profile")
                          setSettingsDialogOpen(true)
                        }}
                      >
                        <SettingsIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        Settings
                      </DropdownMenuItem>

                      {/* Help Submenu */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="gap-2">
                          <QuestionCircleIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="flex-1">Help</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent
                          className="w-36"
                          sideOffset={6}
                          alignOffset={-4}
                        >
                          <DropdownMenuItem
                            onSelect={() => {
                              window.open(
                                "https://discord.gg/8ektTZGnj4",
                                "_blank",
                              )
                              setIsDropdownOpen(false)
                            }}
                            className="gap-2"
                          >
                            <DiscordIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="flex-1">Discord</span>
                          </DropdownMenuItem>
                          {!isMobileFullscreen && (
                            <DropdownMenuItem
                              onSelect={() => {
                                setIsDropdownOpen(false)
                                setShortcutsDialogOpen(true)
                              }}
                              className="gap-2"
                            >
                              <KeyboardIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="flex-1">Shortcuts</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </>
                  ) : (
                    <>
                      {/* Help Submenu */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="gap-2">
                          <QuestionCircleIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="flex-1">Help</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent
                          className="w-36"
                          sideOffset={6}
                          alignOffset={-4}
                        >
                          <DropdownMenuItem
                            onSelect={() => {
                              window.open(
                                "https://discord.gg/8ektTZGnj4",
                                "_blank",
                              )
                              setIsDropdownOpen(false)
                            }}
                            className="gap-2"
                          >
                            <DiscordIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="flex-1">Discord</span>
                          </DropdownMenuItem>
                          {!isMobileFullscreen && (
                            <DropdownMenuItem
                              onSelect={() => {
                                setIsDropdownOpen(false)
                                setShortcutsDialogOpen(true)
                              }}
                              className="gap-2"
                            >
                              <KeyboardIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="flex-1">Shortcuts</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Search and New Workspace */}
      <div className="px-2 pb-3 flex-shrink-0">
        <div className="space-y-2">
          {/* Search Input */}
          <div className="relative">
            <Input
              ref={searchInputRef}
              placeholder="Search workspaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault()
                  searchInputRef.current?.blur()
                  setFocusedChatIndex(-1) // Reset focus
                  return
                }

                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  setFocusedChatIndex((prev) => {
                    // If no focus yet, start from first item
                    if (prev === -1) return 0
                    // Otherwise move down
                    return prev < filteredChats.length - 1 ? prev + 1 : prev
                  })
                  return
                }

                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  setFocusedChatIndex((prev) => {
                    // If no focus yet, start from last item
                    if (prev === -1) return filteredChats.length - 1
                    // Otherwise move up
                    return prev > 0 ? prev - 1 : prev
                  })
                  return
                }

                if (e.key === "Enter") {
                  e.preventDefault()
                  // Only open if something is focused (not -1)
                  if (focusedChatIndex >= 0) {
                    const focusedChat = filteredChats[focusedChatIndex]
                    if (focusedChat) {
                      handleChatClick(focusedChat.id)
                      searchInputRef.current?.blur()
                      setFocusedChatIndex(-1) // Reset focus after selection
                    }
                  }
                  return
                }
              }}
              className={cn(
                "w-full rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40",
                isMobileFullscreen ? "h-10" : "h-7",
              )}
            />
          </div>
          {/* New Workspace Button */}
          <TooltipProvider>
            <Tooltip delayDuration={500}>
              <TooltipTrigger asChild>
                <ButtonCustom
                  onClick={handleNewAgent}
                  variant="outline"
                  size="sm"
                  className={cn(
                    "px-2 w-full hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground rounded-lg gap-1.5",
                    isMobileFullscreen ? "h-10" : "h-7",
                  )}
                >
                  <span className="text-sm font-medium">New Workspace</span>
                </ButtonCustom>
              </TooltipTrigger>
              <TooltipContent side="right">
                Start a new workspace
                <Kbd>{getShortcutKey("newAgent")}</Kbd>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Scrollable Agents List */}
      <div className="flex-1 min-h-0 relative">
        <div
          ref={scrollContainerRef}
          onScroll={handleAgentsScroll}
          className={cn(
            "h-full overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent",
            isMultiSelectMode ? "px-0" : "px-2",
          )}
        >
          {/* Drafts Section - always show if there are drafts */}
          {drafts.length > 0 && !searchQuery && (
            <div className={cn("mb-4", isMultiSelectMode ? "px-0" : "-mx-1")}>
              <div
                className={cn(
                  "flex items-center h-4 mb-1",
                  isMultiSelectMode ? "pl-3" : "pl-2",
                )}
              >
                <h3 className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                  Drafts
                </h3>
              </div>
              <div className="list-none p-0 m-0">
                {drafts.map((draft) => {
                  const isSelected = selectedDraftId === draft.id && !selectedChatId
                  return (
                  <div
                    key={draft.id}
                    onClick={() => {
                      // Navigate to NewChatForm with this draft selected
                      setSelectedChatId(null)
                      setSelectedDraftId(draft.id)
                      if (isMobileFullscreen && onChatSelect) {
                        onChatSelect()
                      }
                    }}
                    className={cn(
                      "w-full text-left py-1.5 cursor-pointer group relative",
                      "transition-colors duration-150",
                      "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                      isMultiSelectMode ? "px-3" : "pl-2 pr-2",
                      !isMultiSelectMode && "rounded-md",
                      isSelected
                        ? "bg-foreground/5 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="pt-0.5">
                        <div className="relative flex-shrink-0 w-4 h-4">
                          {draft.project?.gitOwner &&
                          draft.project?.gitProvider === "github" ? (
                            <img
                              src={`https://github.com/${draft.project.gitOwner}.png?size=64`}
                              alt={draft.project.gitOwner}
                              className="h-4 w-4 rounded-sm flex-shrink-0"
                            />
                          ) : (
                            <GitHubLogo className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className="truncate block text-sm leading-tight flex-1">
                            {draft.text.slice(0, 50)}
                            {draft.text.length > 50 ? "..." : ""}
                          </span>
                          {/* Delete button - shown on hover */}
                          {!isMultiSelectMode && !isMobileFullscreen && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteDraft(draft.id)
                              }}
                              tabIndex={-1}
                              className="flex-shrink-0 text-muted-foreground hover:text-foreground active:text-foreground transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                              aria-label="Delete draft"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-muted-foreground/60 truncate">
                            <span className="text-blue-500">Draft</span>
                            {draft.project?.gitRepo
                              ? ` • ${draft.project.gitRepo}`
                              : draft.project?.name
                                ? ` • ${draft.project.name}`
                                : ""}
                          </span>
                          <span className="text-[11px] text-muted-foreground/60 flex-shrink-0">
                            {formatTime(new Date(draft.updatedAt).toISOString())}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Chats Section */}
          {filteredChats.length > 0 ? (
            <div className={cn("mb-4", isMultiSelectMode ? "px-0" : "-mx-1")}>
              {/* Pinned section */}
              {pinnedAgents.length > 0 && (
                <>
                  <div
                    className={cn(
                      "flex items-center h-4 mb-1",
                      isMultiSelectMode ? "pl-3" : "pl-2",
                    )}
                  >
                    <h3 className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                      Pinned Workspaces
                    </h3>
                  </div>
                  <div className="list-none p-0 m-0 mb-3">
                    {pinnedAgents.map((chat, index) => {
                      const isLoading = loadingChatIds.has(chat.id)
                      const isSelected = selectedChatId === chat.id
                      const isPinned = pinnedChatIds.has(chat.id)
                      const globalIndex = filteredChats.findIndex(
                        (c) => c.id === chat.id,
                      )
                      const isFocused =
                        focusedChatIndex === globalIndex &&
                        focusedChatIndex >= 0
                      // Desktop: use branch from chat and repo name from project
                      const branch = chat.branch
                      const project = projectsMap.get(chat.projectId)
                      const repoName = project?.gitRepo || project?.name
                      const displayText = branch
                        ? repoName
                          ? `${repoName} • ${branch}`
                          : branch
                        : repoName || "Local project"

                      const isChecked = selectedChatIds.has(chat.id)

                      return (
                        <ContextMenu key={chat.id}>
                          <ContextMenuTrigger asChild>
                            <div
                              data-chat-item
                              data-chat-index={globalIndex}
                              onClick={(e) => {
                                // On real mobile (touch devices), onTouchEnd handles the click
                                // In desktop app with narrow window, we still use mouse clicks
                                if (isMobileFullscreen && !isDesktop) return
                                handleChatClick(chat.id, e, globalIndex)
                              }}
                              onTouchEnd={(e) => {
                                // On real mobile touch devices, use touchEnd directly to bypass ContextMenu's click delay
                                if (isMobileFullscreen && !isDesktop) {
                                  e.preventDefault()
                                  handleChatClick(
                                    chat.id,
                                    undefined,
                                    globalIndex,
                                  )
                                }
                              }}
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault()
                                  handleChatClick(
                                    chat.id,
                                    undefined,
                                    globalIndex,
                                  )
                                }
                              }}
                              onMouseEnter={(e) => {
                                setHoveredChatIndex(globalIndex)
                                handleAgentMouseEnter(
                                  chat.id,
                                  chat.name,
                                  e.currentTarget,
                                )
                              }}
                              onMouseLeave={() => {
                                setHoveredChatIndex(-1)
                                handleAgentMouseLeave()
                              }}
                              className={cn(
                                "w-full text-left py-1.5 cursor-pointer group relative",
                                // Disable transitions on mobile for instant tap response
                                !isMobileFullscreen &&
                                  "transition-colors duration-150",
                                "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                                // In multi-select: px-3 compensates for removed container px-2, keeping text aligned
                                isMultiSelectMode ? "px-3" : "pl-2 pr-2",
                                !isMultiSelectMode && "rounded-md",
                                isSelected
                                  ? "bg-foreground/5 text-foreground"
                                  : isFocused
                                    ? "bg-foreground/5 text-foreground"
                                    : // On mobile, no hover effect to prevent double-tap issue
                                      isMobileFullscreen
                                      ? "text-muted-foreground"
                                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                                isChecked &&
                                  (isMobileFullscreen
                                    ? "bg-primary/10"
                                    : "bg-primary/10 hover:bg-primary/15"),
                              )}
                            >
                              <div className="flex items-start gap-2.5">
                                <div className="pt-0.5">
                                  <ChatIcon
                                    isSelected={isSelected}
                                    isLoading={isLoading}
                                    hasUnseenChanges={unseenChanges.has(
                                      chat.id,
                                    )}
                                    isMultiSelectMode={isMultiSelectMode}
                                    isChecked={isChecked}
                                    onCheckboxClick={(e) =>
                                      handleCheckboxClick(e, chat.id)
                                    }
                                    gitOwner={
                                      projectsMap.get(chat.projectId)?.gitOwner
                                    }
                                    gitProvider={
                                      projectsMap.get(chat.projectId)
                                        ?.gitProvider
                                    }
                                  />
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <span
                                      ref={(el) => {
                                        if (el)
                                          nameRefs.current.set(chat.id, el)
                                      }}
                                      className="truncate block text-sm leading-tight flex-1"
                                    >
                                      <TypewriterText
                                        text={chat.name || ""}
                                        placeholder="New workspace"
                                        id={chat.id}
                                        isJustCreated={justCreatedIds.has(
                                          chat.id,
                                        )}
                                        showPlaceholder={true}
                                      />
                                    </span>
                                    {/* Hide archive button on mobile - use context menu instead */}
                                    {!isMultiSelectMode &&
                                      !isMobileFullscreen && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            archiveChatMutation.mutate({
                                              id: chat.id,
                                            })
                                          }}
                                          tabIndex={-1}
                                          className="flex-shrink-0 text-muted-foreground hover:text-foreground active:text-foreground transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                                          aria-label="Archive workspace"
                                        >
                                          <ArchiveIcon className="h-3.5 w-3.5" />
                                        </button>
                                      )}
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
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-48">
                            {/* Multi-select context menu */}
                            {isMultiSelectMode &&
                            selectedChatIds.has(chat.id) ? (
                              <>
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
                                        ? `Unpin ${selectedChatIds.size} ${pluralize(selectedChatIds.size, "workspace")}`
                                        : `Pin ${selectedChatIds.size} ${pluralize(selectedChatIds.size, "workspace")}`}
                                    </ContextMenuItem>
                                    <ContextMenuSeparator />
                                  </>
                                )}
                                <ContextMenuItem
                                  onClick={handleBulkArchive}
                                  disabled={archiveChatsBatchMutation.isPending}
                                >
                                  {archiveChatsBatchMutation.isPending
                                    ? "Archiving..."
                                    : `Archive ${selectedChatIds.size} ${pluralize(selectedChatIds.size, "workspace")}`}
                                </ContextMenuItem>
                              </>
                            ) : (
                              <>
                                <ContextMenuItem
                                  onClick={() => handleTogglePin(chat.id)}
                                >
                                  {isPinned
                                    ? "Unpin workspace"
                                    : "Pin workspace"}
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onClick={() =>
                                    handleRenameClick({
                                      id: chat.id,
                                      name: chat.name,
                                    })
                                  }
                                >
                                  Rename workspace
                                </ContextMenuItem>
                                {branch && (
                                  <ContextMenuItem
                                    onClick={() => {
                                      navigator.clipboard.writeText(branch)
                                      toast.success(
                                        "Branch name copied",
                                        { description: branch },
                                      )
                                    }}
                                  >
                                    Copy branch name
                                  </ContextMenuItem>
                                )}
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  onClick={() =>
                                    archiveChatMutation.mutate({
                                      id: chat.id,
                                    })
                                  }
                                  className="justify-between"
                                >
                                  Archive workspace
                                  <Kbd>{getShortcutKey("archiveAgent")}</Kbd>
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onClick={() => handleArchiveAllBelow(chat.id)}
                                  disabled={
                                    filteredChats.findIndex(
                                      (c) => c.id === chat.id,
                                    ) ===
                                    filteredChats.length - 1
                                  }
                                >
                                  Archive all below
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onClick={() => handleArchiveOthers(chat.id)}
                                  disabled={filteredChats.length === 1}
                                >
                                  Archive others
                                </ContextMenuItem>
                              </>
                            )}
                          </ContextMenuContent>
                        </ContextMenu>
                      )
                    })}
                  </div>
                </>
              )}

              {/* Unpinned section */}
              {unpinnedAgents.length > 0 && (
                <>
                  <div
                    className={cn(
                      "flex items-center h-4 mb-1",
                      isMultiSelectMode ? "pl-3" : "pl-2",
                    )}
                  >
                    <h3 className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {pinnedAgents.length > 0 ? "Recent workspaces" : "Workspaces"}
                    </h3>
                  </div>
                  <div className="list-none p-0 m-0">
                    {unpinnedAgents.map((chat, index) => {
                      const isLoading = loadingChatIds.has(chat.id)
                      const isSelected = selectedChatId === chat.id
                      const isPinned = pinnedChatIds.has(chat.id)
                      const globalIndex = filteredChats.findIndex(
                        (c) => c.id === chat.id,
                      )
                      const isFocused =
                        focusedChatIndex === globalIndex &&
                        focusedChatIndex >= 0
                      // Desktop: use branch from chat and repo name from project
                      const branch = chat.branch
                      const project = projectsMap.get(chat.projectId)
                      const repoName = project?.gitRepo || project?.name
                      const displayText = branch
                        ? repoName
                          ? `${repoName} • ${branch}`
                          : branch
                        : repoName || "Local project"

                      const isChecked = selectedChatIds.has(chat.id)

                      return (
                        <ContextMenu key={chat.id}>
                          <ContextMenuTrigger asChild>
                            <div
                              data-chat-item
                              data-chat-index={globalIndex}
                              onClick={(e) => {
                                // On real mobile (touch devices), onTouchEnd handles the click
                                // In desktop app with narrow window, we still use mouse clicks
                                if (isMobileFullscreen && !isDesktop) return
                                handleChatClick(chat.id, e, globalIndex)
                              }}
                              onTouchEnd={(e) => {
                                // On real mobile touch devices, use touchEnd directly to bypass ContextMenu's click delay
                                if (isMobileFullscreen && !isDesktop) {
                                  e.preventDefault()
                                  handleChatClick(
                                    chat.id,
                                    undefined,
                                    globalIndex,
                                  )
                                }
                              }}
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault()
                                  handleChatClick(
                                    chat.id,
                                    undefined,
                                    globalIndex,
                                  )
                                }
                              }}
                              onMouseEnter={(e) => {
                                setHoveredChatIndex(globalIndex)
                                handleAgentMouseEnter(
                                  chat.id,
                                  chat.name,
                                  e.currentTarget,
                                )
                              }}
                              onMouseLeave={() => {
                                setHoveredChatIndex(-1)
                                handleAgentMouseLeave()
                              }}
                              className={cn(
                                "w-full text-left py-1.5 cursor-pointer group relative",
                                // Disable transitions on mobile for instant tap response
                                !isMobileFullscreen &&
                                  "transition-colors duration-150",
                                "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                                // In multi-select: px-3 compensates for removed container px-2, keeping text aligned
                                isMultiSelectMode ? "px-3" : "pl-2 pr-2",
                                !isMultiSelectMode && "rounded-md",
                                isSelected
                                  ? "bg-foreground/5 text-foreground"
                                  : isFocused
                                    ? "bg-foreground/5 text-foreground"
                                    : // On mobile, no hover effect to prevent double-tap issue
                                      isMobileFullscreen
                                      ? "text-muted-foreground"
                                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                                isChecked &&
                                  (isMobileFullscreen
                                    ? "bg-primary/10"
                                    : "bg-primary/10 hover:bg-primary/15"),
                              )}
                            >
                              <div className="flex items-start gap-2.5">
                                <div className="pt-0.5">
                                  <ChatIcon
                                    isSelected={isSelected}
                                    isLoading={isLoading}
                                    hasUnseenChanges={unseenChanges.has(
                                      chat.id,
                                    )}
                                    isMultiSelectMode={isMultiSelectMode}
                                    isChecked={isChecked}
                                    onCheckboxClick={(e) =>
                                      handleCheckboxClick(e, chat.id)
                                    }
                                    gitOwner={
                                      projectsMap.get(chat.projectId)?.gitOwner
                                    }
                                    gitProvider={
                                      projectsMap.get(chat.projectId)
                                        ?.gitProvider
                                    }
                                  />
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                  {/* Top line: Chat name + Archive button */}
                                  <div className="flex items-center gap-1">
                                    <span
                                      ref={(el) => {
                                        if (el)
                                          nameRefs.current.set(chat.id, el)
                                      }}
                                      className="truncate block text-sm leading-tight flex-1"
                                    >
                                      <TypewriterText
                                        text={chat.name || ""}
                                        placeholder="New workspace"
                                        id={chat.id}
                                        isJustCreated={justCreatedIds.has(
                                          chat.id,
                                        )}
                                        showPlaceholder={true}
                                      />
                                    </span>
                                    {/* Archive button - shown on group hover via CSS only, hidden in multi-select */}
                                    {/* Hide archive button on mobile - use context menu instead */}
                                    {!isMultiSelectMode &&
                                      !isMobileFullscreen && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            archiveChatMutation.mutate({
                                              id: chat.id,
                                            })
                                          }}
                                          tabIndex={-1}
                                          className="flex-shrink-0 text-muted-foreground hover:text-foreground active:text-foreground transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                                          aria-label="Archive workspace"
                                        >
                                          <ArchiveIcon className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                  </div>
                                  {/* Bottom line: Branch/Repository (left) and Time (right) */}
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
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-48">
                            {/* Multi-select context menu */}
                            {isMultiSelectMode &&
                            selectedChatIds.has(chat.id) ? (
                              <>
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
                                        ? `Unpin ${selectedChatIds.size} ${pluralize(selectedChatIds.size, "workspace")}`
                                        : `Pin ${selectedChatIds.size} ${pluralize(selectedChatIds.size, "workspace")}`}
                                    </ContextMenuItem>
                                    <ContextMenuSeparator />
                                  </>
                                )}
                                <ContextMenuItem
                                  onClick={handleBulkArchive}
                                  disabled={archiveChatsBatchMutation.isPending}
                                >
                                  {archiveChatsBatchMutation.isPending
                                    ? "Archiving..."
                                    : `Archive ${selectedChatIds.size} ${pluralize(selectedChatIds.size, "workspace")}`}
                                </ContextMenuItem>
                              </>
                            ) : (
                              <>
                                <ContextMenuItem
                                  onClick={() => handleTogglePin(chat.id)}
                                >
                                  {isPinned
                                    ? "Unpin workspace"
                                    : "Pin workspace"}
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onClick={() =>
                                    handleRenameClick({
                                      id: chat.id,
                                      name: chat.name,
                                    })
                                  }
                                >
                                  Rename workspace
                                </ContextMenuItem>
                                {branch && (
                                  <ContextMenuItem
                                    onClick={() => {
                                      navigator.clipboard.writeText(branch)
                                      toast.success(
                                        "Branch name copied",
                                        { description: branch },
                                      )
                                    }}
                                  >
                                    Copy branch name
                                  </ContextMenuItem>
                                )}
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  onClick={() =>
                                    archiveChatMutation.mutate({
                                      id: chat.id,
                                    })
                                  }
                                  className="justify-between"
                                >
                                  Archive workspace
                                  <Kbd>{getShortcutKey("archiveAgent")}</Kbd>
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onClick={() => handleArchiveAllBelow(chat.id)}
                                  disabled={
                                    filteredChats.findIndex(
                                      (c) => c.id === chat.id,
                                    ) ===
                                    filteredChats.length - 1
                                  }
                                >
                                  Archive all below
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onClick={() => handleArchiveOthers(chat.id)}
                                  disabled={filteredChats.length === 1}
                                >
                                  Archive others
                                </ContextMenuItem>
                              </>
                            )}
                          </ContextMenuContent>
                        </ContextMenu>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        {/* Top gradient fade (appears when scrolled down) */}
        <div
          className={cn(
            "absolute top-0 left-0 right-0 h-10 pointer-events-none bg-gradient-to-b from-tl-background via-tl-background/50 to-transparent transition-opacity duration-200",
            showTopGradient ? "opacity-100" : "opacity-0",
          )}
        />

        {/* Bottom gradient fade */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 h-12 pointer-events-none bg-gradient-to-t from-tl-background via-tl-background/50 to-transparent transition-opacity duration-200",
            showBottomGradient ? "opacity-100" : "opacity-0",
          )}
        />
      </div>

      {/* Workflows Section */}
      <WorkflowsSidebarSection />

      {/* MCP Servers Section */}
      <McpSidebarSection />

      {/* Footer - Multi-select toolbar or normal footer */}
      <AnimatePresence mode="wait">
        {isMultiSelectMode ? (
          <motion.div
            key="multi-select-footer"
            initial={hasFooterAnimated.current ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0 }}
            onAnimationComplete={() => {
              hasFooterAnimated.current = true
            }}
            className="p-2 flex flex-col gap-2"
          >
            {/* Selection info */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-muted-foreground">
                {selectedChatsCount} selected
              </span>
              <button
                onClick={clearChatSelection}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkArchive}
                disabled={archiveChatsBatchMutation.isPending}
                className="flex-1 h-8 gap-1.5 text-xs rounded-lg"
              >
                <ArchiveIcon className="h-3.5 w-3.5" />
                {archiveChatsBatchMutation.isPending
                  ? "Archiving..."
                  : "Archive"}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="normal-footer"
            initial={hasFooterAnimated.current ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0 }}
            onAnimationComplete={() => {
              hasFooterAnimated.current = true
            }}
            className="p-2 pt-2 flex flex-col gap-2"
          >
            <div className="flex items-center">
              <div className="flex items-center gap-1">
                {/* Settings Button */}
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsActiveTab("profile")
                        setSettingsDialogOpen(true)
                      }}
                      className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
                    >
                      <SettingsIcon className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Settings</TooltipContent>
                </Tooltip>

                <Tooltip
                  delayDuration={500}
                  open={helpPopoverOpen || blockHelpTooltip ? false : undefined}
                >
                  <TooltipTrigger asChild>
                    <div>
                      <AgentsHelpPopover
                        open={helpPopoverOpen}
                        onOpenChange={setHelpPopoverOpen}
                        isMobile={isMobileFullscreen}
                      >
                        <button
                          ref={helpButtonRef}
                          type="button"
                          className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
                          suppressHydrationWarning
                        >
                          <QuestionCircleIcon className="h-4 w-4" />
                        </button>
                      </AgentsHelpPopover>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Help</TooltipContent>
                </Tooltip>

                {/* Archive Button - shown only if there are archived chats */}
                {archivedChatsCount > 0 && (
                  <Tooltip
                    delayDuration={500}
                    open={
                      archivePopoverOpen || blockArchiveTooltip
                        ? false
                        : undefined
                    }
                  >
                    <TooltipTrigger asChild>
                      <div>
                        <ArchivePopover
                          trigger={
                            <button
                              ref={archiveButtonRef}
                              type="button"
                              className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
                            >
                              <ArchiveIcon className="h-4 w-4" />
                            </button>
                          }
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Archive</TooltipContent>
                  </Tooltip>
                )}
              </div>

              <div className="flex-1" />
            </div>

            {/* Feedback Button */}
            <ButtonCustom
              onClick={() => window.open(FEEDBACK_URL, "_blank")}
              variant="outline"
              size="sm"
              className={cn(
                "px-2 w-full hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground rounded-lg gap-1.5",
                isMobileFullscreen ? "h-10" : "h-7",
              )}
            >
              <span className="text-sm font-medium">Feedback</span>
            </ButtonCustom>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  return (
    <>
      {sidebarContent}

      {/* Agent name tooltip portal */}
      {agentTooltip?.visible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-[100000] max-w-xs px-2 py-1 text-xs bg-popover border border-border rounded-md shadow-lg dark pointer-events-none"
            style={{
              top: agentTooltip.position.top,
              left: agentTooltip.position.left,
              transform: "translateY(-50%)",
            }}
          >
            <div className="text-foreground/90 whitespace-nowrap">
              {agentTooltip.name}
            </div>
          </div>,
          document.body,
        )}

      {/* Auth Dialog */}
      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />

      {/* Rename Dialog */}
      <AgentsRenameSubChatDialog
        isOpen={renameDialogOpen}
        onClose={() => {
          setRenameDialogOpen(false)
          setRenamingChat(null)
        }}
        onSave={handleRenameSave}
        currentName={renamingChat?.name || ""}
        isLoading={renameLoading}
      />
    </>
  )
}
