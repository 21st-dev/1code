import { useEffect, useCallback, useMemo, useRef, useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import { useTheme } from "next-themes"
import { fullThemeDataAtom } from "@/lib/atoms"
import { motion } from "motion/react"
import { ResizableSidebar } from "@/components/ui/resizable-sidebar"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  IconDoubleChevronRight,
  CustomTerminalIcon,
} from "@/components/ui/icons"
import { AlignJustify } from "lucide-react"
import { Kbd } from "@/components/ui/kbd"
import { useResolvedHotkeyDisplay } from "@/lib/hotkeys"
import { Terminal } from "./terminal"
import { TerminalTabs } from "./terminal-tabs"
import { getDefaultTerminalBg } from "./helpers"
import {
  terminalSidebarOpenAtomFamily,
  terminalSidebarWidthAtom,
  terminalsAtom,
  activeTerminalIdAtom,
  terminalCwdAtom,
} from "./atoms"
import { trpc } from "@/lib/trpc"
import type { TerminalInstance } from "./types"

// Animation constants - keep in sync with ResizableSidebar animationDuration
const SIDEBAR_ANIMATION_DURATION_SECONDS = 0 // Disabled for performance
const SIDEBAR_ANIMATION_DURATION_MS = 0
const ANIMATION_BUFFER_MS = 0

interface TerminalSidebarProps {
  /** Chat ID - used to scope terminals to this chat */
  chatId: string
  cwd: string
  workspaceId: string
  tabId?: string
  initialCommands?: string[]
  /** Mobile fullscreen mode - skip ResizableSidebar wrapper */
  isMobileFullscreen?: boolean
  /** Callback when closing in mobile mode */
  onClose?: () => void
}

/**
 * Generate a unique terminal ID
 */
function generateTerminalId(): string {
  return crypto.randomUUID().slice(0, 8)
}

/**
 * Generate a paneId for TerminalManager
 */
function generatePaneId(chatId: string, terminalId: string): string {
  return `${chatId}:term:${terminalId}`
}

/**
 * Get the next terminal name based on existing terminals
 */
function getNextTerminalName(terminals: TerminalInstance[]): string {
  const existingNumbers = terminals
    .map((t) => {
      const match = t.name.match(/^Terminal (\d+)$/)
      return match ? parseInt(match[1], 10) : 0
    })
    .filter((n) => n > 0)

  const maxNumber =
    existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0
  return `Terminal ${maxNumber + 1}`
}

export function TerminalSidebar({
  chatId,
  cwd,
  workspaceId,
  tabId,
  initialCommands,
  isMobileFullscreen = false,
  onClose,
}: TerminalSidebarProps) {
  // Per-chat terminal sidebar state
  const terminalSidebarAtom = useMemo(
    () => terminalSidebarOpenAtomFamily(chatId),
    [chatId],
  )
  const [isOpen, setIsOpen] = useAtom(terminalSidebarAtom)
  const [allTerminals, setAllTerminals] = useAtom(terminalsAtom)
  const [allActiveIds, setAllActiveIds] = useAtom(activeTerminalIdAtom)
  const terminalCwds = useAtomValue(terminalCwdAtom)

  // Theme detection for terminal background
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  // Resolved hotkey for tooltip
  const toggleTerminalHotkey = useResolvedHotkeyDisplay("toggle-terminal")
  const fullThemeData = useAtomValue(fullThemeDataAtom)

  const terminalBg = useMemo(() => {
    // Use VS Code theme terminal background if available
    if (fullThemeData?.colors?.["terminal.background"]) {
      return fullThemeData.colors["terminal.background"]
    }
    if (fullThemeData?.colors?.["editor.background"]) {
      return fullThemeData.colors["editor.background"]
    }
    return getDefaultTerminalBg(isDark)
  }, [isDark, fullThemeData])

  // Get terminals for this chat
  const terminals = useMemo(
    () => allTerminals[chatId] || [],
    [allTerminals, chatId],
  )

  // Get active terminal ID for this chat
  const activeTerminalId = useMemo(
    () => allActiveIds[chatId] || null,
    [allActiveIds, chatId],
  )

  // Get the active terminal instance
  const activeTerminal = useMemo(
    () => terminals.find((t) => t.id === activeTerminalId) || null,
    [terminals, activeTerminalId],
  )

  // tRPC mutation for killing terminal sessions
  const killMutation = trpc.terminal.kill.useMutation()

  // Refs to avoid callback recreation
  const chatIdRef = useRef(chatId)
  chatIdRef.current = chatId
  const terminalsRef = useRef(terminals)
  terminalsRef.current = terminals
  const activeTerminalIdRef = useRef(activeTerminalId)
  activeTerminalIdRef.current = activeTerminalId

  // Create a new terminal - stable callback
  const createTerminal = useCallback(() => {
    const currentChatId = chatIdRef.current
    const currentTerminals = terminalsRef.current

    const id = generateTerminalId()
    const paneId = generatePaneId(currentChatId, id)
    const name = getNextTerminalName(currentTerminals)

    const newTerminal: TerminalInstance = {
      id,
      paneId,
      name,
      createdAt: Date.now(),
    }

    setAllTerminals((prev) => ({
      ...prev,
      [currentChatId]: [...(prev[currentChatId] || []), newTerminal],
    }))

    // Set as active
    setAllActiveIds((prev) => ({
      ...prev,
      [currentChatId]: id,
    }))
  }, [setAllTerminals, setAllActiveIds])

  // Select a terminal - stable callback
  const selectTerminal = useCallback(
    (id: string) => {
      const currentChatId = chatIdRef.current
      setAllActiveIds((prev) => ({
        ...prev,
        [currentChatId]: id,
      }))
    },
    [setAllActiveIds],
  )

  // Close a terminal - stable callback
  const closeTerminal = useCallback(
    (id: string) => {
      const currentChatId = chatIdRef.current
      const currentTerminals = terminalsRef.current
      const currentActiveId = activeTerminalIdRef.current

      const terminal = currentTerminals.find((t) => t.id === id)
      if (!terminal) return

      // Kill the session on the backend
      killMutation.mutate({ paneId: terminal.paneId })

      // Remove from state
      const newTerminals = currentTerminals.filter((t) => t.id !== id)
      setAllTerminals((prev) => ({
        ...prev,
        [currentChatId]: newTerminals,
      }))

      // If we closed the active terminal, switch to another
      if (currentActiveId === id) {
        const newActive = newTerminals[newTerminals.length - 1]?.id || null
        setAllActiveIds((prev) => ({
          ...prev,
          [currentChatId]: newActive,
        }))
      }
    },
    [setAllTerminals, setAllActiveIds, killMutation],
  )

  // Rename a terminal - stable callback
  const renameTerminal = useCallback(
    (id: string, name: string) => {
      const currentChatId = chatIdRef.current
      setAllTerminals((prev) => ({
        ...prev,
        [currentChatId]: (prev[currentChatId] || []).map((t) =>
          t.id === id ? { ...t, name } : t,
        ),
      }))
    },
    [setAllTerminals],
  )

  // Close other terminals - stable callback
  const closeOtherTerminals = useCallback(
    (id: string) => {
      const currentChatId = chatIdRef.current
      const currentTerminals = terminalsRef.current

      // Kill all terminals except the one with the given id
      currentTerminals.forEach((terminal) => {
        if (terminal.id !== id) {
          killMutation.mutate({ paneId: terminal.paneId })
        }
      })

      // Keep only the terminal with the given id
      const remainingTerminal = currentTerminals.find((t) => t.id === id)
      setAllTerminals((prev) => ({
        ...prev,
        [currentChatId]: remainingTerminal ? [remainingTerminal] : [],
      }))

      // Set the remaining terminal as active
      setAllActiveIds((prev) => ({
        ...prev,
        [currentChatId]: id,
      }))
    },
    [setAllTerminals, setAllActiveIds, killMutation],
  )

  // Close terminals to the right - stable callback
  const closeTerminalsToRight = useCallback(
    (id: string) => {
      const currentChatId = chatIdRef.current
      const currentTerminals = terminalsRef.current

      const index = currentTerminals.findIndex((t) => t.id === id)
      if (index === -1) return

      // Kill terminals to the right
      const terminalsToClose = currentTerminals.slice(index + 1)
      terminalsToClose.forEach((terminal) => {
        killMutation.mutate({ paneId: terminal.paneId })
      })

      // Keep only terminals up to and including the one with the given id
      const remainingTerminals = currentTerminals.slice(0, index + 1)
      setAllTerminals((prev) => ({
        ...prev,
        [currentChatId]: remainingTerminals,
      }))

      // If active terminal was closed, switch to the last remaining one
      const currentActiveId = activeTerminalIdRef.current
      if (
        currentActiveId &&
        !remainingTerminals.find((t) => t.id === currentActiveId)
      ) {
        setAllActiveIds((prev) => ({
          ...prev,
          [currentChatId]:
            remainingTerminals[remainingTerminals.length - 1]?.id || null,
        }))
      }
    },
    [setAllTerminals, setAllActiveIds, killMutation],
  )

  // Close sidebar callback - stable
  const closeSidebar = useCallback(() => {
    setIsOpen(false)
  }, [setIsOpen])

  // Delay terminal rendering until animation completes to avoid xterm.js sizing issues
  const [canRenderTerminal, setCanRenderTerminal] = useState(false)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      // Sidebar just opened - delay terminal render until animation completes
      setCanRenderTerminal(false)
      const timer = setTimeout(() => {
        setCanRenderTerminal(true)
      }, SIDEBAR_ANIMATION_DURATION_MS + ANIMATION_BUFFER_MS)
      wasOpenRef.current = true
      return () => clearTimeout(timer)
    } else if (!isOpen) {
      // Sidebar closed - reset state
      wasOpenRef.current = false
      setCanRenderTerminal(false)
    }
  }, [isOpen])

  // Auto-create first terminal when sidebar opens and no terminals exist
  useEffect(() => {
    if (isOpen && terminals.length === 0) {
      createTerminal()
    }
  }, [isOpen, terminals.length, createTerminal])

  // Keyboard shortcut: Cmd+J to toggle terminal sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        !e.ctrlKey &&
        e.code === "KeyJ"
      ) {
        e.preventDefault()
        e.stopPropagation()
        setIsOpen((prev) => !prev)
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [setIsOpen])

  // Handle mobile close - also close the sidebar atom to prevent re-opening as desktop sidebar
  const handleMobileClose = useCallback(() => {
    setIsOpen(false) // Close the sidebar atom first
    onClose?.() // Then call the onClose callback
  }, [setIsOpen, onClose])

  // Mobile fullscreen layout
  if (isMobileFullscreen) {
    return (
      <div className="flex flex-col h-full w-full bg-background">
        {/* Mobile header with back button and tabs */}
        <div
          className="flex items-center gap-1.5 px-2 py-2 flex-shrink-0 border-b"
          style={{
            backgroundColor: terminalBg,
            // @ts-expect-error - WebKit-specific property for Electron window dragging
            WebkitAppRegion: "drag",
            borderBottomWidth: "0.5px",
          }}
        >
          {/* Back button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleMobileClose}
            className="h-7 w-7 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 rounded-md"
            aria-label="Back to chat"
            style={{
              // @ts-expect-error - WebKit-specific property
              WebkitAppRegion: "no-drag",
            }}
          >
            <AlignJustify className="h-4 w-4" />
          </Button>

          {/* Terminal Tabs - directly after back button, inherits drag from parent */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {terminals.length > 0 && (
              <TerminalTabs
                terminals={terminals}
                activeTerminalId={activeTerminalId}
                cwds={terminalCwds}
                initialCwd={cwd}
                terminalBg={terminalBg}
                onSelectTerminal={selectTerminal}
                onCloseTerminal={closeTerminal}
                onCloseOtherTerminals={closeOtherTerminals}
                onCloseTerminalsToRight={closeTerminalsToRight}
                onCreateTerminal={createTerminal}
                onRenameTerminal={renameTerminal}
              />
            )}
          </div>
        </div>

        {/* Terminal Content */}
        <div
          className="flex-1 min-h-0 min-w-0 overflow-hidden"
          style={{ backgroundColor: terminalBg }}
        >
          {activeTerminal && canRenderTerminal ? (
            <motion.div
              key={activeTerminal.paneId}
              className="h-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0 }}
            >
              <Terminal
                paneId={activeTerminal.paneId}
                cwd={cwd}
                workspaceId={workspaceId}
                tabId={tabId}
                initialCommands={initialCommands}
                initialCwd={cwd}
              />
            </motion.div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {!canRenderTerminal ? "" : "No terminal open"}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Desktop sidebar layout
  return (
    <ResizableSidebar
      isOpen={isOpen}
      onClose={closeSidebar}
      widthAtom={terminalSidebarWidthAtom}
      side="right"
      minWidth={300}
      maxWidth={800}
      animationDuration={SIDEBAR_ANIMATION_DURATION_SECONDS}
      initialWidth={0}
      exitWidth={0}
      showResizeTooltip={true}
      className="bg-background border-l"
      style={{ borderLeftWidth: "0.5px", overflow: "hidden" }}
    >
      <div className="flex flex-col h-full min-w-0 overflow-hidden">
        {/* Header with tabs */}
        <div
          className="flex items-center gap-1 pl-1 pr-2 py-1.5 flex-shrink-0"
          style={{ backgroundColor: terminalBg }}
        >
          {/* Close button - on the left */}
          <div className="flex items-center flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeSidebar}
                  className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
                  aria-label="Close terminal"
                >
                  <IconDoubleChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Close terminal
                {toggleTerminalHotkey && <Kbd>{toggleTerminalHotkey}</Kbd>}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Terminal Tabs */}
          {terminals.length > 0 && (
            <TerminalTabs
              terminals={terminals}
              activeTerminalId={activeTerminalId}
              cwds={terminalCwds}
              initialCwd={cwd}
              terminalBg={terminalBg}
              onSelectTerminal={selectTerminal}
              onCloseTerminal={closeTerminal}
              onCloseOtherTerminals={closeOtherTerminals}
              onCloseTerminalsToRight={closeTerminalsToRight}
              onCreateTerminal={createTerminal}
              onRenameTerminal={renameTerminal}
            />
          )}
        </div>

        {/* Terminal Content */}
        <div
          className="flex-1 min-h-0 min-w-0 overflow-hidden"
          style={{ backgroundColor: terminalBg }}
        >
          {activeTerminal && canRenderTerminal ? (
            <motion.div
              key={activeTerminal.paneId}
              className="h-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0 }}
            >
              <Terminal
                paneId={activeTerminal.paneId}
                cwd={cwd}
                workspaceId={workspaceId}
                tabId={tabId}
                initialCommands={initialCommands}
                initialCwd={cwd}
              />
            </motion.div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {!canRenderTerminal ? "" : "No terminal open"}
            </div>
          )}
        </div>
      </div>
    </ResizableSidebar>
  )
}
