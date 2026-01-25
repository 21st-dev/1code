import { atom } from "jotai"
import { atomWithStorage, atomFamily } from "jotai/utils"

// ============================================================================
// Cowork Mode Toggle
// ============================================================================

// Master switch for Cowork mode (persisted)
// When true, CoworkLayout is used instead of AgentsLayout
export const isCoworkModeAtom = atomWithStorage<boolean>(
  "cowork:enabled",
  true, // Default to Cowork mode
  undefined,
  { getOnInit: true },
)

// ============================================================================
// Right Panel State (Tasks + Files)
// ============================================================================

// Right panel width (persisted)
export const coworkRightPanelWidthAtom = atomWithStorage<number>(
  "cowork:rightPanelWidth",
  320,
  undefined,
  { getOnInit: true },
)

// Right panel open state (persisted)
export const coworkRightPanelOpenAtom = atomWithStorage<boolean>(
  "cowork:rightPanelOpen",
  true,
  undefined,
  { getOnInit: true },
)

// Track if user has manually closed the right panel (persisted)
// Used to determine whether to auto-open panel when entering a chat
export const coworkRightPanelUserClosedAtom = atomWithStorage<boolean>(
  "cowork:rightPanelUserClosed",
  false,
  undefined,
  { getOnInit: true },
)

// ============================================================================
// Section Collapse State
// ============================================================================

// Task section expanded state (null = auto, true = expanded, false = collapsed)
// Auto mode: collapsed when no tasks, expanded when has tasks
export const taskSectionExpandedAtom = atom<boolean | null>(null)

// Artifacts section expanded state (null = auto, true = expanded, false = collapsed)
// Auto mode: collapsed when no artifacts, expanded when has artifacts
export const artifactsSectionExpandedAtom = atom<boolean | null>(null)

// ============================================================================
// File Tree State
// ============================================================================

// Expanded folder paths in file tree (not persisted - resets on reload)
export const fileTreeExpandedPathsAtom = atom<Set<string>>(new Set<string>())

// Selected file in file tree (for highlighting)
export const fileTreeSelectedPathAtom = atom<string | null>(null)

// Search query in file tree
export const fileTreeSearchQueryAtom = atom<string>("")

// Saved expanded paths before search (to restore after clearing search)
export const fileTreeSavedExpandedPathsAtom = atom<Set<string> | null>(null)

// ============================================================================
// Content Search State (Advanced Search)
// ============================================================================

// Whether advanced search (content search) mode is active
export const contentSearchActiveAtom = atom<boolean>(false)

// Content search query
export const contentSearchQueryAtom = atom<string>("")

// Content search file pattern filter (e.g., "*.ts", "*.{js,tsx}")
export const contentSearchPatternAtom = atom<string>("")

// Content search case sensitivity
export const contentSearchCaseSensitiveAtom = atom<boolean>(false)

// Content search loading state
export const contentSearchLoadingAtom = atom<boolean>(false)

// Content search result type
export interface ContentSearchResult {
  file: string
  line: number
  column: number
  text: string
  beforeContext?: string[]
  afterContext?: string[]
}

// Content search results
export const contentSearchResultsAtom = atom<ContentSearchResult[]>([])

// Content search tool used (ripgrep or grep)
export const contentSearchToolAtom = atom<string>("")

// ============================================================================
// Artifacts State (per chat - all sub-chats share the same artifacts)
// ============================================================================

// Context information for an artifact (files read, URLs visited)
export interface ArtifactContext {
  type: "file" | "url"
  // File context
  filePath?: string
  toolType?: "Read" | "Glob" | "Grep"
  // URL context
  url?: string
  title?: string
}

export interface Artifact {
  path: string
  description?: string
  status: "created" | "modified" | "deleted"
  timestamp: number
  contexts?: ArtifactContext[]
}

// All artifacts storage - keyed by chatId (persisted to localStorage)
const allArtifactsStorageAtom = atomWithStorage<Record<string, Artifact[]>>(
  "cowork:artifacts",
  {},
  undefined,
  { getOnInit: true }
)

// atomFamily to get/set artifacts per subChatId (session)
// Supports both direct value and updater function: setArtifacts(newArr) or setArtifacts(prev => newArr)
type ArtifactsSetter = Artifact[] | ((prev: Artifact[]) => Artifact[])

export const artifactsAtomFamily = atomFamily((subChatId: string) =>
  atom(
    (get) => get(allArtifactsStorageAtom)[subChatId] ?? [],
    (get, set, update: ArtifactsSetter) => {
      const current = get(allArtifactsStorageAtom)
      const prevArtifacts = current[subChatId] ?? []
      // Support both direct value and updater function
      const newArtifacts = typeof update === "function" ? update(prevArtifacts) : update
      console.log("[Artifacts] Setting artifacts for subChatId:", subChatId, "count:", newArtifacts.length)
      set(allArtifactsStorageAtom, { ...current, [subChatId]: newArtifacts })
    }
  )
)

// ============================================================================
// File Preview State
// ============================================================================

export type FilePreviewDisplayMode = "dialog" | "side-peek" | "full-page"

// Display mode for file preview (persisted)
export const filePreviewDisplayModeAtom = atomWithStorage<FilePreviewDisplayMode>(
  "cowork:filePreviewDisplayMode",
  "dialog",
  undefined,
  { getOnInit: true }
)

// Current preview file path (null = closed)
export const filePreviewPathAtom = atom<string | null>(null)

// Line number to scroll to in preview (null = no scroll)
export const filePreviewLineAtom = atom<number | null>(null)

// Search highlight keyword for preview (null = no highlight)
export const filePreviewHighlightAtom = atom<string | null>(null)

// ============================================================================
// File Reference Insertion (File Tree -> Chat Input)
// ============================================================================

// Pending file reference to insert into chat input
// When set, chat input components should insert this file as a mention and clear the atom
export interface PendingFileReference {
  path: string
  name: string
  type: "file" | "folder"
}

export const pendingFileReferenceAtom = atom<PendingFileReference | null>(null)

// File preview dialog open state (derived from path)
export const filePreviewOpenAtom = atom(
  (get) => get(filePreviewPathAtom) !== null,
  (get, set, open: boolean) => {
    if (!open) {
      set(filePreviewPathAtom, null)
    }
  }
)

// ============================================================================
// Code Editor State
// ============================================================================

// Editor mode: "view" for read-only preview, "edit" for Monaco editor
export type EditorMode = "view" | "edit"
export const editorModeAtom = atom<EditorMode>("view")

// Whether current file has unsaved changes
export const editorDirtyAtom = atom<boolean>(false)

// Original content for dirty comparison (set when entering edit mode)
export const editorOriginalContentAtom = atom<string>("")

// Current editor content (synced with Monaco)
export const editorContentAtom = atom<string>("")

// Computed: reset editor state when preview closes
export const resetEditorStateAtom = atom(null, (_get, set) => {
  set(editorModeAtom, "view")
  set(editorDirtyAtom, false)
  set(editorOriginalContentAtom, "")
  set(editorContentAtom, "")
})
