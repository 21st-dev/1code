import { atom } from "jotai"
import { atomFamily, atomWithStorage } from "jotai/utils"
import { atomWithWindowStorage } from "../../lib/window-storage"
import type { TerminalInstance } from "./types"

// Storage atom for persisting per-chat terminal sidebar state - window-scoped
const terminalSidebarOpenStorageAtom = atomWithWindowStorage<Record<string, boolean>>(
  "terminal-sidebar-open-by-chat",
  {},
  { getOnInit: true },
)

// Per-chat terminal sidebar open state (like diffSidebarOpenAtomFamily)
export const terminalSidebarOpenAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(terminalSidebarOpenStorageAtom)[chatId] ?? false,
    (get, set, isOpen: boolean) => {
      const current = get(terminalSidebarOpenStorageAtom)
      set(terminalSidebarOpenStorageAtom, { ...current, [chatId]: isOpen })
    },
  ),
)

// Terminal cwd tracking - window-scoped, maps paneId to current working directory
export const terminalCwdAtom = atomWithWindowStorage<Record<string, string>>(
  "terminal-cwds",
  {},
  { getOnInit: true },
)

// Terminal display mode: Details-owned terminal widget or bottom panel.
export type TerminalDisplayMode = "details" | "bottom"
type LegacyTerminalDisplayMode = "side-peek"

export function normalizeTerminalDisplayMode(
  mode: TerminalDisplayMode | LegacyTerminalDisplayMode | string | null | undefined,
): TerminalDisplayMode {
  return mode === "details" ? "details" : "bottom"
}

const terminalDisplayModeStorageAtom = atomWithStorage<
  TerminalDisplayMode | LegacyTerminalDisplayMode
>(
  "terminal-display-mode",
  "bottom",
  undefined,
  { getOnInit: true },
)

export const terminalDisplayModeAtom = atom(
  (get) => normalizeTerminalDisplayMode(get(terminalDisplayModeStorageAtom)),
  (_get, set, mode: TerminalDisplayMode) => {
    set(terminalDisplayModeStorageAtom, normalizeTerminalDisplayMode(mode))
  },
)

export const terminalBottomHeightAtom = atomWithStorage<number>(
  "terminal-bottom-height",
  300,
  undefined,
  { getOnInit: true },
)

// Terminal search open state - maps paneId to search visibility
export const terminalSearchOpenAtom = atom<Record<string, boolean>>({})

// ============================================================================
// Multi-Terminal State Management
// ============================================================================

/**
 * Map of scopeKey -> terminal instances.
 * Window-scoped so each window manages its own terminal instances.
 * Key is scopeKey: "path:<dir>" for shared (local mode) or "ws:<chatId>" for isolated (worktree).
 */
export const terminalsAtom = atomWithWindowStorage<
  Record<string, TerminalInstance[]>
>("terminals-by-scope", {}, { getOnInit: true })

/**
 * Map of scopeKey -> active terminal id.
 * Window-scoped - tracks which terminal is currently active for each scope in this window.
 * Key is scopeKey: "path:<dir>" for shared (local mode) or "ws:<chatId>" for isolated (worktree).
 */
export const activeTerminalIdAtom = atomWithWindowStorage<
  Record<string, string | null>
>("active-terminal-by-scope", {}, { getOnInit: true })
