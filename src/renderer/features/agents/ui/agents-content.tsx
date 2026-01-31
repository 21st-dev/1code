"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
// import { useSearchParams, useRouter } from "next/navigation" // Desktop doesn't use next/navigation
// Desktop: mock Next.js navigation hooks
const useSearchParams = () => ({ get: () => null })
const useRouter = () => ({ push: () => {}, replace: () => {} })
// Desktop: mock Clerk hooks
const useUser = () => ({ user: null })
const useClerk = () => ({ signOut: () => {} })
import {
  selectedAgentChatIdAtom,
  selectedChatIsRemoteAtom,
  previousAgentChatIdAtom,
  selectedDraftIdAtom,
  showNewChatFormAtom,
  agentsMobileViewModeAtom,
  agentsPreviewSidebarOpenAtom,
  agentsSidebarOpenAtom,
  agentsSubChatsSidebarModeAtom,
  agentsSubChatsSidebarWidthAtom,
  desktopViewAtom,
} from "../atoms"
import {
  selectedTeamIdAtom,
  agentsQuickSwitchOpenAtom,
  agentsQuickSwitchSelectedIndexAtom,
  subChatsQuickSwitchOpenAtom,
  subChatsQuickSwitchSelectedIndexAtom,
  ctrlTabTargetAtom,
  betaKanbanEnabledAtom,
  betaAutomationsEnabledAtom,
  chatSourceModeAtom,
} from "../../../lib/atoms"
import { NewChatForm } from "../main/new-chat-form"
import { KanbanView } from "../../kanban"
import { AutomationsView, AutomationsDetailView, InboxView } from "../../automations"
import { ChatView } from "../main/active-chat"
import { api } from "../../../lib/mock-api"
import { trpc } from "../../../lib/trpc"
import { useIsMobile } from "../../../lib/hooks/use-mobile"
import { AgentsSidebar } from "../../sidebar/agents-sidebar"
import { AgentsSubChatsSidebar } from "../../sidebar/agents-subchats-sidebar"
import { AgentPreview } from "./agent-preview"
import { AgentDiffView } from "./agent-diff-view"
import { TerminalSidebar, terminalSidebarOpenAtomFamily } from "../../terminal"
import {
  useAgentSubChatStore,
  type SubChatMeta,
} from "../stores/sub-chat-store"
import { useShallow } from "zustand/react/shallow"
import { motion, AnimatePresence } from "motion/react"
// import { ResizableSidebar } from "@/app/(alpha)/canvas/[id]/{components}/resizable-sidebar"
import { ResizableSidebar } from "../../../components/ui/resizable-sidebar"
// import { useClerk, useUser } from "@clerk/nextjs"
// import { useCombinedAuth } from "@/lib/hooks/use-combined-auth"
const useCombinedAuth = () => ({ userId: null }) // Desktop mock
import { Button } from "../../../components/ui/button"
import { AlignJustify } from "lucide-react"
import { AgentsQuickSwitchDialog } from "../components/agents-quick-switch-dialog"
import { SubChatsQuickSwitchDialog } from "../components/subchats-quick-switch-dialog"
import { isDesktopApp } from "../../../lib/utils/platform"
import { SettingsContent } from "../../settings/settings-content"
// Desktop mock
const useIsAdmin = () => false

// Main Component
export function AgentsContent() {
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const desktopView = useAtomValue(desktopViewAtom)
  const setSelectedChatIsRemote = useSetAtom(selectedChatIsRemoteAtom)
  const setChatSourceMode = useSetAtom(chatSourceModeAtom)
  const chatSourceMode = useAtomValue(chatSourceModeAtom)
  const selectedDraftId = useAtomValue(selectedDraftIdAtom)
  const showNewChatForm = useAtomValue(showNewChatFormAtom)
  const betaKanbanEnabled = useAtomValue(betaKanbanEnabledAtom)
  const betaAutomationsEnabled = useAtomValue(betaAutomationsEnabledAtom)
  const [selectedTeamId] = useAtom(selectedTeamIdAtom)
  const [sidebarOpen, setSidebarOpen] = useAtom(agentsSidebarOpenAtom)
  const [previewSidebarOpen, setPreviewSidebarOpen] = useAtom(
    agentsPreviewSidebarOpenAtom,
  )
  const [mobileViewMode, setMobileViewMode] = useAtom(agentsMobileViewModeAtom)
  const [subChatsSidebarMode, setSubChatsSidebarMode] = useAtom(
    agentsSubChatsSidebarModeAtom,
  )
  // Per-chat terminal sidebar state
  const terminalSidebarAtom = useMemo(
    () => terminalSidebarOpenAtomFamily(selectedChatId || ""),
    [selectedChatId],
  )
  const setTerminalSidebarOpen = useSetAtom(terminalSidebarAtom)

  const hasOpenedSubChatsSidebar = useRef(false)
  const wasSubChatsSidebarOpen = useRef(false)
  const [shouldAnimateSubChatsSidebar, setShouldAnimateSubChatsSidebar] =
    useState(subChatsSidebarMode !== "sidebar")
  const searchParams = useSearchParams()
  const router = useRouter()
  const isInitialized = useRef(false)
  const isFirstRenderRef = useRef(true) // Skip URL sync on first render to avoid race condition
  const isNavigatingRef = useRef(false)
  const newChatFormKeyRef = useRef(0)
  const isMobile = useIsMobile()
  const [isHydrated, setIsHydrated] = useState(false)
  const { userId } = useCombinedAuth()
  const { user } = useUser()
  const { signOut } = useClerk()
  const isAdmin = useIsAdmin()

  // Quick-switch dialog state - Agents (Opt+Ctrl+Tab)
  const [quickSwitchOpen, setQuickSwitchOpen] = useAtom(
    agentsQuickSwitchOpenAtom,
  )
  const [quickSwitchSelectedIndex, setQuickSwitchSelectedIndex] = useAtom(
    agentsQuickSwitchSelectedIndexAtom,
  )
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null)
  const modifierKeysHeldRef = useRef(false)
  const wasShiftPressedRef = useRef(false)
  const isQuickSwitchingRef = useRef(false)
  const frozenRecentChatsRef = useRef<typeof agentChats>([]) // Frozen snapshot for dialog

  // Ctrl+Tab target preference
  const ctrlTabTarget = useAtomValue(ctrlTabTargetAtom)

  // Quick-switch dialog state - Sub-chats (Ctrl+Tab)
  const [subChatQuickSwitchOpen, setSubChatQuickSwitchOpen] = useAtom(
    subChatsQuickSwitchOpenAtom,
  )
  const [subChatQuickSwitchSelectedIndex, setSubChatQuickSwitchSelectedIndex] =
    useAtom(subChatsQuickSwitchSelectedIndexAtom)
  const subChatHoldTimerRef = useRef<NodeJS.Timeout | null>(null)
  const subChatModifierKeysHeldRef = useRef(false)
  const subChatWasShiftPressedRef = useRef(false)
  const frozenSubChatsRef = useRef<SubChatMeta[]>([])
  // Refs to avoid effect re-running when dialog state changes (prevents keyup event loss)
  const subChatQuickSwitchOpenRef = useRef(subChatQuickSwitchOpen)
  const subChatQuickSwitchSelectedIndexRef = useRef(
    subChatQuickSwitchSelectedIndex,
  )
  subChatQuickSwitchOpenRef.current = subChatQuickSwitchOpen
  subChatQuickSwitchSelectedIndexRef.current = subChatQuickSwitchSelectedIndex

  // Get sub-chats from store with shallow comparison
  const { allSubChats, openSubChatIds, activeSubChatId, setActiveSubChat } = useAgentSubChatStore(
    useShallow((state) => ({
      allSubChats: state.allSubChats,
      openSubChatIds: state.openSubChatIds,
      activeSubChatId: state.activeSubChatId,
      setActiveSubChat: state.setActiveSubChat,
    }))
  )

  // Update window title when active sub-chat changes
  const activeSubChatName = useMemo(() => {
    if (!activeSubChatId) return null
    const subChat = allSubChats.find((sc) => sc.id === activeSubChatId)
    return subChat?.name ?? null
  }, [activeSubChatId, allSubChats])

  useEffect(() => {
    if (typeof window !== "undefined" && window.desktopApi?.setWindowTitle) {
      window.desktopApi.setWindowTitle(activeSubChatName || "")
    }
  }, [activeSubChatName])

  // Fetch teams for header
  const { data: teams } = api.teams.getUserTeams.useQuery(undefined, {
    enabled: !!selectedTeamId,
  })
  const selectedTeam = teams?.find((t: any) => t.id === selectedTeamId) as any

  // Fetch agent chats for keyboard navigation and mobile view
  const { data: agentChats } = api.agents.getAgentChats.useQuery(
    { teamId: selectedTeamId! },
    { enabled: !!selectedTeamId },
  )

  // Fetch all projects for git info (like sidebar does)
  const { data: projects } = trpc.projects.list.useQuery()

  // Create map for quick project lookup by id
  const projectsMap = useMemo(() => {
    if (!projects) return new Map()
    return new Map(projects.map((p) => [p.id, p]))
  }, [projects])

  // Fetch current chat data for preview info
  const { data: chatData } = api.agents.getAgentChat.useQuery(
    { chatId: selectedChatId! },
    { enabled: !!selectedChatId },
  )

  // Track previous chat ID for navigation after archive
  const [previousChatId, setPreviousChatId] = useAtom(previousAgentChatIdAtom)
  const prevSelectedChatIdRef = useRef<string | null>(null)

  // Update previousChatId when selectedChatId changes
  useEffect(() => {
    // Only update if we're switching from one chat to another
    if (prevSelectedChatIdRef.current && prevSelectedChatIdRef.current !== selectedChatId) {
      setPreviousChatId(prevSelectedChatIdRef.current)
    }
    prevSelectedChatIdRef.current = selectedChatId
  }, [selectedChatId, setPreviousChatId])

  // Note: Archive mutations moved to AgentsSidebar to share undo stack with Cmd+Z

  // Track hydration
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // On mount: read URL → set atom
  useEffect(() => {
    if (isInitialized.current) return
    isInitialized.current = true

    const chatIdFromUrl = searchParams.get("chat")
    if (chatIdFromUrl) {
      setSelectedChatId(chatIdFromUrl)
    }
  }, [searchParams, setSelectedChatId])

  // When atom changes: update URL and increment NewChatForm key when returning to new chat view
  useEffect(() => {
    // Skip the first render - let the URL read effect set the initial value first
    // This prevents a race condition where this effect would clear the chat param
    // before the atom has been updated from the URL
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }

    const currentChatId = searchParams.get("chat")
    if (selectedChatId !== currentChatId) {
      const url = new URL(window.location.href)
      if (selectedChatId) {
        url.searchParams.set("chat", selectedChatId)
      } else {
        url.searchParams.delete("chat")
        // Increment key to force NewChatForm remount and trigger focus
        newChatFormKeyRef.current += 1
      }
      router.replace(url.pathname + url.search, { scroll: false })
    }
  }, [selectedChatId, searchParams, router, quickSwitchOpen])

  // Auto-close sidebars on mobile devices
  useEffect(() => {
    if (isMobile && isHydrated) {
      setSidebarOpen(false)
      setPreviewSidebarOpen(false)
    }
  }, [isMobile, isHydrated, setSidebarOpen, setPreviewSidebarOpen])

  // On mobile: when chat is selected, switch to chat mode
  useEffect(() => {
    if (isMobile && selectedChatId && mobileViewMode === "chats") {
      setMobileViewMode("chat")
    }
  }, [isMobile, selectedChatId, mobileViewMode, setMobileViewMode])

  // On mobile: when in terminal mode, sync with terminal sidebar close
  const terminalSidebarOpen = useAtomValue(terminalSidebarAtom)
  useEffect(() => {
    // If terminal sidebar closed while in terminal mode, go back to chat
    if (isMobile && mobileViewMode === "terminal" && !terminalSidebarOpen) {
      setMobileViewMode("chat")
    }
  }, [isMobile, mobileViewMode, terminalSidebarOpen, setMobileViewMode])

  // On mobile: show/hide native traffic lights based on view mode
  useEffect(() => {
    if (!isMobile) return
    if (
      typeof window === "undefined" ||
      !window.desktopApi?.setTrafficLightVisibility
    )
      return

    window.desktopApi.setTrafficLightVisibility(mobileViewMode === "chats")
  }, [isMobile, mobileViewMode])

  // Get recent chats for quick-switch dialog
  // Order: current chat first (left), then previous chats by last updated
  // IMPORTANT: Only recalculate when dialog is closed to prevent flickering
  const sortedChats = agentChats
    ? [...agentChats].sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      )
    : []

  let recentChats: typeof sortedChats = []
  // Use frozen chats when dialog is open to prevent recalculation
  if (
    quickSwitchOpen &&
    frozenRecentChatsRef.current &&
    frozenRecentChatsRef.current.length > 0
  ) {
    recentChats = frozenRecentChatsRef.current ?? []
  } else if (selectedChatId) {
    // Put current chat first, then take next 4
    const currentChat = sortedChats.find((c) => c.id === selectedChatId)
    const otherChats = sortedChats
      .filter((c) => c.id !== selectedChatId)
      .slice(0, 4)
    recentChats = currentChat ? [currentChat, ...otherChats] : otherChats
  } else {
    recentChats = sortedChats.slice(0, 5)
  }

  // Keyboard navigation: Quick switch between workspaces
  // Shortcut depends on ctrlTabTarget preference:
  // - "workspaces" (default): Ctrl+Tab switches workspaces
  // - "agents": Opt+Ctrl+Tab switches workspaces
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Determine shortcut based on preference
      const isCtrlTabOnly =
        e.ctrlKey && e.key === "Tab" && !e.altKey && !e.metaKey
      const isOptCtrlTab =
        e.altKey && e.ctrlKey && e.key === "Tab" && !e.metaKey

      // Workspace switch: Ctrl+Tab by default, or Opt+Ctrl+Tab when ctrlTabTarget is "agents"
      const isWorkspaceSwitchShortcut =
        ctrlTabTarget === "workspaces" ? isCtrlTabOnly : isOptCtrlTab

      if (isWorkspaceSwitchShortcut) {
        e.preventDefault()
        wasShiftPressedRef.current = e.shiftKey

        if (recentChats.length === 0) return

        // If dialog is open, navigate through chats
        if (quickSwitchOpen) {
          let nextIndex: number
          if (e.shiftKey) {
            // Shift + Tab = Previous
            nextIndex = quickSwitchSelectedIndex - 1
            if (nextIndex < 0) {
              nextIndex = (frozenRecentChatsRef.current?.length ?? 1) - 1
            }
          } else {
            // Tab = Next
            nextIndex =
              (quickSwitchSelectedIndex + 1) %
              (frozenRecentChatsRef.current?.length ?? 1)
          }
          setQuickSwitchSelectedIndex(nextIndex)
          return
        }

        // If dialog is not open yet, start hold timer
        if (!quickSwitchOpen && !holdTimerRef.current) {
          modifierKeysHeldRef.current = true

          // Freeze current recentChats snapshot for this dialog session
          frozenRecentChatsRef.current = [...recentChats]

          // Start timer to show dialog after 30ms (almost instant)
          holdTimerRef.current = setTimeout(() => {
            // Clear timer ref AFTER it fires - this is critical for close detection
            holdTimerRef.current = null
            if (modifierKeysHeldRef.current) {
              // Show dialog
              setQuickSwitchOpen(true)

              // Current chat is always at index 0 (left), select next chat (index 1)
              // For Shift+Tab, select last chat
              if (wasShiftPressedRef.current) {
                // Shift: go to last chat
                setQuickSwitchSelectedIndex(
                  (frozenRecentChatsRef.current?.length ?? 1) - 1,
                )
              } else {
                // Tab: go to next chat (index 1), or wrap to 0 if only one chat
                setQuickSwitchSelectedIndex(
                  (frozenRecentChatsRef.current?.length ?? 1) > 1 ? 1 : 0,
                )
              }
            }
          }, 30)

          return
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      // ESC to close dialog without navigating
      if (e.key === "Escape" && quickSwitchOpen) {
        e.preventDefault()
        modifierKeysHeldRef.current = false
        isQuickSwitchingRef.current = false // Unblock selectedChatId changes

        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current)
          holdTimerRef.current = null
        }

        setQuickSwitchOpen(false)
        setQuickSwitchSelectedIndex(0)
        return
      }

      // When modifier key is released
      // For workspaces mode (Ctrl+Tab only): react to Control release
      // For agents mode (Opt+Ctrl+Tab): react to Alt or Control release
      const isRelevantKeyRelease =
        ctrlTabTarget === "workspaces"
          ? e.key === "Control"
          : e.key === "Alt" || e.key === "Control"

      if (isRelevantKeyRelease) {
        modifierKeysHeldRef.current = false

        // If timer is still running (quick press - dialog not shown yet)
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current)
          holdTimerRef.current = null
          isQuickSwitchingRef.current = false // Unblock

          // Do quick switch without showing dialog
          if (!isNavigatingRef.current && agentChats && agentChats.length > 0) {
            // Get sorted chat list
            const sortedChats = [...agentChats].sort(
              (a, b) =>
                new Date(b.updated_at).getTime() -
                new Date(a.updated_at).getTime(),
            )
            isNavigatingRef.current = true
            setTimeout(() => {
              isNavigatingRef.current = false
            }, 300)

            // If no chat selected, select first one
            if (!selectedChatId) {
              setSelectedChatId(sortedChats[0].id)
              // agentChats are local chats only, so always set isRemote to false
              setSelectedChatIsRemote(false)
              setChatSourceMode("local")
              return
            }

            // Find current index
            const currentIndex = sortedChats.findIndex(
              (chat) => chat.id === selectedChatId,
            )

            if (currentIndex === -1) {
              setSelectedChatId(sortedChats[0].id)
              setSelectedChatIsRemote(false)
              setChatSourceMode("local")
              return
            }

            // Navigate forward or backward
            let nextIndex: number
            if (wasShiftPressedRef.current) {
              nextIndex = currentIndex - 1
              if (nextIndex < 0) {
                nextIndex = sortedChats.length - 1
              }
            } else {
              nextIndex = currentIndex + 1
              if (nextIndex >= sortedChats.length) {
                nextIndex = 0
              }
            }

            setSelectedChatId(sortedChats[nextIndex].id)
            setSelectedChatIsRemote(false)
            setChatSourceMode("local")
          }
          return
        }

        // If dialog is open, navigate to selected chat and close
        if (quickSwitchOpen) {
          const selectedChat =
            frozenRecentChatsRef.current?.[quickSwitchSelectedIndex]

          if (selectedChat) {
            setSelectedChatId(selectedChat.id)
            // agentChats are local chats only
            setSelectedChatIsRemote(false)
            setChatSourceMode("local")
          }

          setQuickSwitchOpen(false)
          setQuickSwitchSelectedIndex(0)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current)
      }
    }
  }, [
    agentChats,
    selectedChatId,
    setSelectedChatId,
    quickSwitchOpen,
    setQuickSwitchOpen,
    quickSwitchSelectedIndex,
    setQuickSwitchSelectedIndex,
    ctrlTabTarget,
    // Note: recentChats removed - we use frozenRecentChatsRef instead
  ])

  // Get open sub-chats for quick-switch (only tabs that are open in the selector)
  // Sorted by position in openSubChatIds, with active first
  // Limited to 5 items for quick-switch dialog
  const recentSubChats = useMemo(() => {
    if (!openSubChatIds || openSubChatIds.length === 0) return []

    // Get sub-chat metadata for open tabs
    const openSubChats = openSubChatIds
      .map((id) => allSubChats.find((c) => c.id === id))
      .filter((c): c is SubChatMeta => c !== undefined)

    if (openSubChats.length === 0) return []

    // Put active sub-chat first, keep rest in tab order, limit to 5
    if (activeSubChatId) {
      const activeChat = openSubChats.find((c) => c.id === activeSubChatId)
      const otherChats = openSubChats.filter((c) => c.id !== activeSubChatId).slice(0, 4)
      return activeChat ? [activeChat, ...otherChats] : openSubChats.slice(0, 5)
    }
    return openSubChats.slice(0, 5)
  }, [openSubChatIds, allSubChats, activeSubChatId])

  // Keyboard navigation: Quick switch between agents (sub-chats within workspace)
  // Shortcut depends on ctrlTabTarget preference:
  // - "workspaces" (default): Opt+Ctrl+Tab switches agents
  // - "agents": Ctrl+Tab switches agents
  // Uses refs for dialog state to avoid effect re-running and losing keyup events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Determine shortcut based on preference
      const isCtrlTabOnly =
        e.ctrlKey && e.key === "Tab" && !e.altKey && !e.metaKey
      const isOptCtrlTab =
        e.altKey && e.ctrlKey && e.key === "Tab" && !e.metaKey

      // Agent switch: Opt+Ctrl+Tab by default, or Ctrl+Tab when ctrlTabTarget is "agents"
      const isAgentSwitchShortcut =
        ctrlTabTarget === "agents" ? isCtrlTabOnly : isOptCtrlTab

      if (isAgentSwitchShortcut) {
        e.preventDefault()
        subChatWasShiftPressedRef.current = e.shiftKey

        // If dialog is open, navigate through sub-chats
        if (subChatQuickSwitchOpenRef.current) {
          let nextIndex: number
          if (e.shiftKey) {
            nextIndex = subChatQuickSwitchSelectedIndexRef.current - 1
            if (nextIndex < 0) {
              nextIndex = (frozenSubChatsRef.current?.length ?? 1) - 1
            }
          } else {
            nextIndex =
              (subChatQuickSwitchSelectedIndexRef.current + 1) %
              (frozenSubChatsRef.current?.length ?? 1)
          }
          setSubChatQuickSwitchSelectedIndex(nextIndex)
          return
        }

        // If dialog is not open yet, start hold timer
        if (
          !subChatQuickSwitchOpenRef.current &&
          !subChatHoldTimerRef.current
        ) {
          // Get fresh data from store for snapshot
          const store = useAgentSubChatStore.getState()
          const currentOpenIds = store.openSubChatIds
          const currentAllSubChats = store.allSubChats
          const currentActiveId = store.activeSubChatId

          if (currentOpenIds.length === 0) return

          subChatModifierKeysHeldRef.current = true

          // Build frozen snapshot from current store state
          const openSubChats = currentOpenIds
            .map((id) => currentAllSubChats.find((c) => c.id === id))
            .filter((c): c is SubChatMeta => c !== undefined)

          if (openSubChats.length === 0) return

          // Put active sub-chat first, limit to 5
          if (currentActiveId) {
            const activeChat = openSubChats.find(
              (c) => c.id === currentActiveId,
            )
            const otherChats = openSubChats.filter(
              (c) => c.id !== currentActiveId,
            ).slice(0, 4)
            frozenSubChatsRef.current = activeChat
              ? [activeChat, ...otherChats]
              : openSubChats.slice(0, 5)
          } else {
            frozenSubChatsRef.current = openSubChats.slice(0, 5)
          }

          subChatHoldTimerRef.current = setTimeout(() => {
            // Clear timer ref AFTER it fires - this is critical for close detection
            subChatHoldTimerRef.current = null
            if (subChatModifierKeysHeldRef.current) {
              // Update ref immediately so keyUp can detect dialog is open
              // (before React re-renders and updates the ref from state)
              subChatQuickSwitchOpenRef.current = true
              setSubChatQuickSwitchOpen(true)
              if (subChatWasShiftPressedRef.current) {
                setSubChatQuickSwitchSelectedIndex(
                  (frozenSubChatsRef.current?.length ?? 1) - 1,
                )
              } else {
                setSubChatQuickSwitchSelectedIndex(
                  (frozenSubChatsRef.current?.length ?? 1) > 1 ? 1 : 0,
                )
              }
            }
          }, 30)

          return
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      // ESC to close dialog without navigating
      if (e.key === "Escape" && subChatQuickSwitchOpenRef.current) {
        e.preventDefault()
        subChatModifierKeysHeldRef.current = false

        if (subChatHoldTimerRef.current) {
          clearTimeout(subChatHoldTimerRef.current)
          subChatHoldTimerRef.current = null
        }

        setSubChatQuickSwitchOpen(false)
        setSubChatQuickSwitchSelectedIndex(0)
        return
      }

      // When modifier key is released
      // For agents mode (Ctrl+Tab): react to Control release
      // For workspaces mode (Opt+Ctrl+Tab): react to Alt or Control release
      const isRelevantKeyRelease =
        ctrlTabTarget === "agents"
          ? e.key === "Control"
          : e.key === "Alt" || e.key === "Control"

      if (isRelevantKeyRelease) {
        subChatModifierKeysHeldRef.current = false

        // If timer is still running (quick press - dialog not shown yet)
        if (subChatHoldTimerRef.current) {
          clearTimeout(subChatHoldTimerRef.current)
          subChatHoldTimerRef.current = null

          // Do quick switch without showing dialog (only between open tabs)
          const store = useAgentSubChatStore.getState()
          const currentOpenIds = store.openSubChatIds
          const currentActiveId = store.activeSubChatId

          if (currentOpenIds && currentOpenIds.length > 1) {
            if (!currentActiveId) {
              store.setActiveSubChat(currentOpenIds[0])
              return
            }

            const currentIndex = currentOpenIds.indexOf(currentActiveId)
            if (currentIndex === -1) {
              store.setActiveSubChat(currentOpenIds[0])
              return
            }

            let nextIndex: number
            if (subChatWasShiftPressedRef.current) {
              nextIndex = currentIndex - 1
              if (nextIndex < 0) nextIndex = currentOpenIds.length - 1
            } else {
              nextIndex = currentIndex + 1
              if (nextIndex >= currentOpenIds.length) nextIndex = 0
            }

            store.setActiveSubChat(currentOpenIds[nextIndex])
          }
          return
        }

        // If dialog is open, navigate to selected sub-chat and close
        if (subChatQuickSwitchOpenRef.current) {
          const selectedSubChat =
            frozenSubChatsRef.current?.[
              subChatQuickSwitchSelectedIndexRef.current
            ]

          if (selectedSubChat) {
            useAgentSubChatStore.getState().setActiveSubChat(selectedSubChat.id)
          }

          setSubChatQuickSwitchOpen(false)
          setSubChatQuickSwitchSelectedIndex(0)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      if (subChatHoldTimerRef.current) {
        clearTimeout(subChatHoldTimerRef.current)
      }
    }
  }, [setSubChatQuickSwitchOpen, setSubChatQuickSwitchSelectedIndex, ctrlTabTarget])

  // Note: Cmd+E archive hotkey is handled in AgentsSidebar to share undo stack

  const handleSignOut = async () => {
    // Check if running in Electron desktop app
    if (typeof window !== "undefined" && window.desktopApi) {
      // Use desktop logout which clears the token and shows login page
      await window.desktopApi.logout()
    } else {
      // Web: use Clerk sign out
      await signOut({ redirectUrl: window.location.pathname })
    }
  }

  // Check if sub-chats data is loaded (use separate selectors to avoid object creation)
  const subChatsStoreChatId = useAgentSubChatStore((state) => state.chatId)
  const subChatsCount = useAgentSubChatStore(
    (state) => state.allSubChats.length,
  )

  // Check if sub-chats are still loading (store not yet initialized for this chat)
  const isLoadingSubChats =
    selectedChatId !== null &&
    (subChatsStoreChatId !== selectedChatId || subChatsCount === 0)

  // Track sub-chats sidebar open state for animation control
  // Now renders even while loading to show spinner (mobile always uses tabs)
  const isSubChatsSidebarOpen =
    selectedChatId && subChatsSidebarMode === "sidebar" && !isMobile

  useEffect(() => {
    // When sidebar closes, reset for animation on next open
    if (!isSubChatsSidebarOpen && wasSubChatsSidebarOpen.current) {
      hasOpenedSubChatsSidebar.current = false
      setShouldAnimateSubChatsSidebar(true)
    }
    wasSubChatsSidebarOpen.current = !!isSubChatsSidebarOpen

    // Mark as opened after animation completes
    if (isSubChatsSidebarOpen && !hasOpenedSubChatsSidebar.current) {
      const timer = setTimeout(() => {
        hasOpenedSubChatsSidebar.current = true
        setShouldAnimateSubChatsSidebar(false)
      }, 150 + 50) // 150ms duration + 50ms buffer
      return () => clearTimeout(timer)
    } else if (isSubChatsSidebarOpen && hasOpenedSubChatsSidebar.current) {
      setShouldAnimateSubChatsSidebar(false)
    }
  }, [isSubChatsSidebarOpen])

  // Check if chat has sandbox with port for preview
  const chatMeta = chatData?.meta as
    | {
        sandboxConfig?: { port?: number }
        isQuickSetup?: boolean
        repository?: string
      }
    | undefined
  const isQuickSetup = chatMeta?.isQuickSetup === true
  const canShowPreview = !!(
    chatData?.sandbox_id &&
    !isQuickSetup &&
    chatMeta?.sandboxConfig?.port
  )
  // Check if diff can be shown (sandbox exists)
  const canShowDiff = !!chatData?.sandbox_id

  // Check if terminal can be shown (worktree exists - desktop only)
  const worktreePath = (chatData as any)?.worktreePath as string | undefined
  const canShowTerminal = !!worktreePath

  // Mobile layout - completely different structure
  if (isMobile) {
    return (
      <div
        className="flex h-full bg-background"
        data-agents-page
        data-mobile-view
      >
        {/* Mobile: Settings/Automations/Inbox fullscreen views */}
        {desktopView === "settings" ? (
          <SettingsContent />
        ) : betaAutomationsEnabled && desktopView === "automations" ? (
          <AutomationsView />
        ) : betaAutomationsEnabled && desktopView === "automations-detail" ? (
          <AutomationsDetailView />
        ) : betaAutomationsEnabled && desktopView === "inbox" ? (
          <InboxView />
        ) : mobileViewMode === "chats" ? (
          // Chats List Mode (default) - uses AgentsSidebar in fullscreen
          <AgentsSidebar
            userId={userId}
            clerkUser={user}
            onSignOut={handleSignOut}
            onToggleSidebar={() => {}}
            isMobileFullscreen={true}
            onChatSelect={() => setMobileViewMode("chat")}
          />
        ) : mobileViewMode === "preview" && selectedChatId && canShowPreview ? (
          // Preview Mode
          <AgentPreview
            chatId={selectedChatId}
            sandboxId={chatData!.sandbox_id!}
            port={chatMeta?.sandboxConfig?.port!}
            isMobile={true}
            onClose={() => setMobileViewMode("chat")}
          />
        ) : mobileViewMode === "diff" && selectedChatId && canShowDiff ? (
          // Diff Mode - fullscreen diff view
          <AgentDiffView
            chatId={selectedChatId}
            sandboxId={chatData!.sandbox_id!}
            worktreePath={worktreePath}
            repository={chatMeta?.repository}
            showFooter={true}
            isMobile={true}
            onClose={() => setMobileViewMode("chat")}
          />
        ) : mobileViewMode === "terminal" &&
          selectedChatId &&
          canShowTerminal ? (
          // Terminal Mode - fullscreen terminal
          <TerminalSidebar
            chatId={selectedChatId}
            cwd={worktreePath!}
            workspaceId={selectedChatId}
            isMobileFullscreen={true}
            onClose={() => setMobileViewMode("chat")}
          />
        ) : (
          // Chat Mode - shows either ChatView or NewChatForm
          <div
            className="h-full w-full flex flex-col overflow-hidden select-text"
            data-mobile-chat-mode
          >
            {selectedChatId ? (
              <ChatView
                key={`${chatSourceMode}-${selectedChatId}`}
                chatId={selectedChatId}
                isSidebarOpen={false}
                onToggleSidebar={() => {}}
                selectedTeamName={selectedTeam?.name}
                selectedTeamImageUrl={selectedTeam?.image_url}
                isMobileFullscreen={true}
                onBackToChats={() => {
                  setMobileViewMode("chats")
                  setSelectedChatId(null)
                }}
                onOpenPreview={
                  canShowPreview
                    ? () => setMobileViewMode("preview")
                    : undefined
                }
                onOpenDiff={
                  canShowDiff ? () => setMobileViewMode("diff") : undefined
                }
                onOpenTerminal={
                  canShowTerminal
                    ? () => {
                        setTerminalSidebarOpen(true)
                        setMobileViewMode("terminal")
                      }
                    : undefined
                }
              />
            ) : (
              // NewChatForm for creating new agent
              <div className="h-full flex flex-col relative overflow-hidden">
                <NewChatForm
                  isMobileFullscreen={true}
                  onBackToChats={() => setMobileViewMode("chats")}
                />
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Desktop layout
  return (
    <>
      <div className="flex h-full">
        {/* Sub-chats sidebar - only show in sidebar mode when viewing a chat */}
        <ResizableSidebar
          isOpen={!!isSubChatsSidebarOpen}
          onClose={() => {
            setShouldAnimateSubChatsSidebar(true)
            setSubChatsSidebarMode("tabs")
          }}
          widthAtom={agentsSubChatsSidebarWidthAtom}
          minWidth={160}
          maxWidth={300}
          side="left"
          animationDuration={0}
          initialWidth={0}
          exitWidth={0}
          disableClickToClose={true}
        >
          <AgentsSubChatsSidebar
            onClose={() => {
              setShouldAnimateSubChatsSidebar(true)
              setSubChatsSidebarMode("tabs")
            }}
            isMobile={isMobile}
            isSidebarOpen={sidebarOpen}
            onBackToChats={() => setSidebarOpen((prev) => !prev)}
            isLoading={isLoadingSubChats}
            agentName={chatData?.name}
          />
        </ResizableSidebar>

        {/* Main content */}
        <div
          className="flex-1 min-w-0 overflow-hidden"
          style={{ minWidth: "350px" }}
        >
          {desktopView === "settings" ? (
            <SettingsContent />
          ) : betaAutomationsEnabled && desktopView === "automations" ? (
            <AutomationsView />
          ) : betaAutomationsEnabled && desktopView === "automations-detail" ? (
            <AutomationsDetailView />
          ) : betaAutomationsEnabled && desktopView === "inbox" ? (
            <InboxView />
          ) : selectedChatId ? (
            <div className="h-full flex flex-col relative overflow-hidden">
              <ChatView
                key={`${chatSourceMode}-${selectedChatId}`}
                chatId={selectedChatId}
                isSidebarOpen={sidebarOpen}
                onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
                selectedTeamName={selectedTeam?.name}
                selectedTeamImageUrl={selectedTeam?.image_url}
              />
            </div>
          ) : selectedDraftId || showNewChatForm ? (
            <div className="h-full flex flex-col relative overflow-hidden">
              <NewChatForm key={`new-chat-${newChatFormKeyRef.current}`} />
            </div>
          ) : betaKanbanEnabled ? (
            <KanbanView />
          ) : (
            <div className="h-full flex flex-col relative overflow-hidden">
              <NewChatForm key={`new-chat-${newChatFormKeyRef.current}`} />
            </div>
          )}
        </div>
      </div>

      {/* Quick-switch dialog - Agents (Opt+Ctrl+Tab) */}
      <AgentsQuickSwitchDialog
        isOpen={quickSwitchOpen}
        chats={
          quickSwitchOpen ? (frozenRecentChatsRef.current ?? []) : recentChats
        }
        selectedIndex={quickSwitchSelectedIndex}
        projectsMap={projectsMap}
        onHover={setQuickSwitchSelectedIndex}
      />

      {/* Quick-switch dialog - Sub-chats (Ctrl+Tab) */}
      <SubChatsQuickSwitchDialog
        isOpen={subChatQuickSwitchOpen}
        subChats={
          subChatQuickSwitchOpen
            ? (frozenSubChatsRef.current ?? [])
            : recentSubChats
        }
        selectedIndex={subChatQuickSwitchSelectedIndex}
        onHover={setSubChatQuickSwitchSelectedIndex}
      />

      {/* Dev mode / Admin sandbox debugger */}
      {(process.env.NODE_ENV === "development" || isAdmin) &&
        chatData?.sandbox_id && (
          <a
            href={`https://codesandbox.io/p/devbox/${chatData.sandbox_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-4 right-4 z-50 bg-zinc-900 text-zinc-300 px-3 py-1.5 rounded-md text-xs font-mono opacity-70 hover:opacity-100 hover:bg-zinc-800 transition-all cursor-pointer"
          >
            sandbox: {chatData.sandbox_id}
          </a>
        )}
    </>
  )
}
