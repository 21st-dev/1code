import { atom } from "jotai"
import { atomFamily, atomWithStorage } from "jotai/utils"

/**
 * File tree node structure
 */
export interface FileTreeNode {
  name: string
  path: string
  type: "file" | "folder"
  children?: FileTreeNode[]
}

/**
 * Active document structure
 */
export interface ActiveDocument {
  path: string
  content: string
  type: "markdown" | "code" | "text" | "todos"
}

// ============================================
// DOCUMENT VIEWER ATOMS
// ============================================

/**
 * Documents panel open state per chat
 */
export const documentsPanelOpenAtomFamily = atomFamily((chatId: string) =>
  atomWithStorage(`documents-panel-open-${chatId}`, false, undefined, {
    getOnInit: true,
  })
)

/**
 * Documents panel width (shared across all chats)
 */
export const documentsPanelWidthAtom = atomWithStorage(
  "documents-panel-width",
  600,
  undefined,
  { getOnInit: true }
)

/**
 * Currently viewed file per chat
 */
export const activeDocumentAtomFamily = atomFamily((chatId: string) =>
  atom<ActiveDocument | null>(null)
)

// ============================================
// FILE TREE ATOMS
// ============================================

/**
 * File tree height in sub-chats sidebar (shared across all chats)
 */
export const workspaceFileTreeHeightAtom = atomWithStorage(
  "workspace-file-tree-height",
  200,
  undefined,
  { getOnInit: true }
)

/**
 * File tree collapsed state (shared across all chats)
 */
export const workspaceFileTreeCollapsedAtom = atomWithStorage(
  "workspace-file-tree-collapsed",
  false,
  undefined,
  { getOnInit: true }
)

/**
 * Saved chat states collapsed state (shared across all chats)
 */
export const savedChatStatesCollapsedAtom = atomWithStorage(
  "saved-chat-states-collapsed",
  false,
  undefined,
  { getOnInit: true }
)

/**
 * Agents section collapsed state (shared across all chats)
 */
export const agentsSectionCollapsedAtom = atomWithStorage(
  "agents-section-collapsed",
  false,
  undefined,
  { getOnInit: true }
)

/**
 * Skills section collapsed state (shared across all chats)
 */
export const skillsSectionCollapsedAtom = atomWithStorage(
  "skills-section-collapsed",
  false,
  undefined,
  { getOnInit: true }
)

/**
 * Commands section collapsed state (shared across all chats)
 */
export const commandsSectionCollapsedAtom = atomWithStorage(
  "commands-section-collapsed",
  false,
  undefined,
  { getOnInit: true }
)

/**
 * File tree data per chat
 */
export const workspaceFileTreeAtomFamily = atomFamily((chatId: string) =>
  atom<FileTreeNode[]>([])
)

/**
 * Expanded folders per chat (Set of folder paths)
 */
export const expandedFoldersAtomFamily = atomFamily((chatId: string) => {
  // Custom storage handler for Set
  const storageKey = `workspace-expanded-folders-${chatId}`

  return atomWithStorage<Set<string>>(
    storageKey,
    new Set<string>(),
    {
      getItem: (key: string, initialValue: Set<string>) => {
        try {
          const storedValue = localStorage.getItem(key)
          if (storedValue) {
            const parsed = JSON.parse(storedValue)
            return new Set(parsed)
          }
        } catch (error) {
          console.error(`[atoms] Failed to parse ${key}:`, error)
        }
        return initialValue
      },
      setItem: (key: string, value: Set<string>) => {
        try {
          localStorage.setItem(key, JSON.stringify(Array.from(value)))
        } catch (error) {
          console.error(`[atoms] Failed to save ${key}:`, error)
        }
      },
      removeItem: (key: string) => {
        try {
          localStorage.removeItem(key)
        } catch (error) {
          console.error(`[atoms] Failed to remove ${key}:`, error)
        }
      },
    },
    { getOnInit: true }
  )
})
