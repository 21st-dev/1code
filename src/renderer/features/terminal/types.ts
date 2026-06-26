import type { TerminalInitialCommandIntent } from "../../../shared/terminal-initial-command-intents"

export interface TerminalDataEvent {
  type: "data"
  data: string
}

export interface TerminalExitEvent {
  type: "exit"
  exitCode: number
  signal?: number
}

export type TerminalEvent = TerminalDataEvent | TerminalExitEvent

export interface TerminalProps {
  paneId: string
  cwd: string
  workspaceId: string
  /** Terminal scope key for shared terminal support */
  scopeKey?: string
  tabId?: string
  initialCommandIntents?: TerminalInitialCommandIntent[]
  initialCwd?: string
}

export interface TerminalStreamEvent {
  type: "data" | "exit"
  data?: string
  exitCode?: number
  signal?: number
}

/**
 * Represents a terminal instance in the multi-terminal system.
 * Each chat can have multiple terminal instances.
 */
export interface TerminalInstance {
  /** Unique terminal id (nanoid) */
  id: string
  /** Full paneId for TerminalManager: `${chatId}:term:${id}` */
  paneId: string
  /** Display name: "Terminal 1", "Terminal 2", etc. */
  name: string
  /** Creation timestamp */
  createdAt: number
}
