import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import type { TerminalInstance } from "./types"

export const terminalSidebarOpenAtom = atomWithStorage<boolean>(
  "terminal-sidebar-open",
  false,
  undefined,
  { getOnInit: true },
)

export const terminalSidebarWidthAtom = atomWithStorage<number>(
  "terminal-sidebar-width",
  500,
  undefined,
  { getOnInit: true },
)

// Terminal cwd tracking - maps paneId to current working directory
export const terminalCwdAtom = atomWithStorage<Record<string, string>>(
  "terminal-cwds",
  {},
  undefined,
  { getOnInit: true },
)

// Terminal search open state - maps paneId to search visibility
export const terminalSearchOpenAtom = atom<Record<string, boolean>>({})

// ============================================================================
// Multi-Terminal State Management
// ============================================================================

/**
 * Map of chatId -> terminal instances.
 * Each chat can have multiple terminal instances.
 */
export const terminalsAtom = atomWithStorage<
  Record<string, TerminalInstance[]>
>("terminals-by-chat", {}, undefined, { getOnInit: true })

/**
 * Map of chatId -> active terminal id.
 * Tracks which terminal is currently active for each chat.
 */
export const activeTerminalIdAtom = atomWithStorage<
  Record<string, string | null>
>("active-terminal-by-chat", {}, undefined, { getOnInit: true })

/**
 * Signal to open Claude Code in terminal with specific session.
 * Set by chat input area, consumed by TerminalSidebar.
 * null = no pending request, object = request to open Claude Code
 */
export const openClaudeCodeAtom = atom<{
  subChatId: string
  sessionId: string
  chatId: string
} | null>(null)
