import { atom } from "jotai"
import { atomFamily, atomWithStorage } from "jotai/utils"
import { atomWithWindowStorage } from "../../../lib/window-storage"

// Agent mode type - extensible for future modes like "debug"
export type AgentMode = "agent" | "plan"

// Ordered list of modes - Shift+Tab cycles through these
export const AGENT_MODES: AgentMode[] = ["agent", "plan"]

// Get next mode in cycle (for Shift+Tab toggle)
export function getNextMode(current: AgentMode): AgentMode {
  const idx = AGENT_MODES.indexOf(current)
  return AGENT_MODES[(idx + 1) % AGENT_MODES.length]
}

// Selected agent chat ID - null means "new chat" view (persisted to restore on reload)
// Uses window-scoped storage so each Electron window can have its own selected chat
export const selectedAgentChatIdAtom = atomWithWindowStorage<string | null>(
  "agents:selectedChatId",
  null,
  { getOnInit: true },
)

// Previous agent chat ID - used to navigate back after archiving current chat
// Not persisted - only tracks within current session
export const previousAgentChatIdAtom = atom<string | null>(null)

// Selected draft ID - when user clicks on a draft in sidebar, this is set
// NewChatForm uses this to restore the draft text
// Reset to null when "New Workspace" is clicked or chat is created
export const selectedDraftIdAtom = atom<string | null>(null)

// Show new chat form explicitly - set to true when "New Workspace" is clicked
// Cleared when a workspace is selected or a draft is selected
export const showNewChatFormAtom = atom<boolean>(false)

// Preview paths storage - stores all preview paths keyed by chatId
const previewPathsStorageAtom = atomWithStorage<Record<string, string>>(
  "agents:previewPaths",
  {},
  undefined,
  { getOnInit: true },
)

// atomFamily to get/set preview path per chatId
export const previewPathAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(previewPathsStorageAtom)[chatId] ?? "/",
    (get, set, newPath: string) => {
      const current = get(previewPathsStorageAtom)
      set(previewPathsStorageAtom, { ...current, [chatId]: newPath })
    },
  ),
)

// Preview viewport modes storage - stores viewport mode per chatId
const viewportModesStorageAtom = atomWithStorage<
  Record<string, "desktop" | "mobile">
>("agents:viewportModes", {}, undefined, { getOnInit: true })

// atomFamily to get/set viewport mode per chatId
export const viewportModeAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(viewportModesStorageAtom)[chatId] ?? "desktop",
    (get, set, newMode: "desktop" | "mobile") => {
      const current = get(viewportModesStorageAtom)
      set(viewportModesStorageAtom, { ...current, [chatId]: newMode })
    },
  ),
)

// Preview scales storage - stores scale per chatId
const previewScalesStorageAtom = atomWithStorage<Record<string, number>>(
  "agents:previewScales",
  {},
  undefined,
  { getOnInit: true },
)

// atomFamily to get/set preview scale per chatId
export const previewScaleAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(previewScalesStorageAtom)[chatId] ?? 100,
    (get, set, newScale: number) => {
      const current = get(previewScalesStorageAtom)
      set(previewScalesStorageAtom, { ...current, [chatId]: newScale })
    },
  ),
)

// Mobile device dimensions storage - stores device settings per chatId
type MobileDeviceSettings = {
  width: number
  height: number
  preset: string
}

const mobileDevicesStorageAtom = atomWithStorage<
  Record<string, MobileDeviceSettings>
>("agents:mobileDevices", {}, undefined, { getOnInit: true })

// atomFamily to get/set mobile device settings per chatId
export const mobileDeviceAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) =>
      get(mobileDevicesStorageAtom)[chatId] ?? {
        width: 393,
        height: 852,
        preset: "iPhone 16",
      },
    (get, set, newDevice: MobileDeviceSettings) => {
      const current = get(mobileDevicesStorageAtom)
      set(mobileDevicesStorageAtom, { ...current, [chatId]: newDevice })
    },
  ),
)

// Loading sub-chats: Map<subChatId, parentChatId>
// Used to show loading indicators on tabs and sidebar
// Set when generation starts, cleared when onFinish fires
export const loadingSubChatsAtom = atom<Map<string, string>>(new Map())

// Helper to set loading state
export const setLoading = (
  setter: (fn: (prev: Map<string, string>) => Map<string, string>) => void,
  subChatId: string,
  parentChatId: string,
) => {
  setter((prev) => {
    // Only create new Map if value actually changed
    // This prevents unnecessary re-renders
    if (prev.get(subChatId) === parentChatId) return prev
    const next = new Map(prev)
    next.set(subChatId, parentChatId)
    return next
  })
}

// Helper to clear loading state
export const clearLoading = (
  setter: (fn: (prev: Map<string, string>) => Map<string, string>) => void,
  subChatId: string,
) => {
  setter((prev) => {
    // Only create new Map if subChatId was actually in loading state
    // This prevents unnecessary re-renders when switching between non-loading sub-chats
    if (!prev.has(subChatId)) return prev
    const next = new Map(prev)
    next.delete(subChatId)
    return next
  })
}

// Persisted preferences for agents page
export type SavedRepo = {
  id: string
  name: string
  full_name: string
  sandbox_status?: "not_setup" | "in_progress" | "ready" | "error"
  installation_id?: string
  isPublicImport?: boolean
} | null

export const lastSelectedRepoAtom = atomWithStorage<SavedRepo>(
  "agents:lastSelectedRepo",
  null,
  undefined,
  { getOnInit: true },
)

// Selected local project (persisted)
export type SelectedProject = {
  id: string
  name: string
  path: string
  gitRemoteUrl?: string | null
  gitProvider?: "github" | "gitlab" | "bitbucket" | null
  gitOwner?: string | null
  gitRepo?: string | null
} | null

// Selected local project - uses window-scoped storage so each window can work with different projects
export const selectedProjectAtom = atomWithWindowStorage<SelectedProject>(
  "agents:selectedProject",
  null,
  { getOnInit: true },
)

export const lastSelectedAgentIdAtom = atomWithStorage<string>(
  "agents:lastSelectedAgentId",
  "claude-code",
  undefined,
  { getOnInit: true },
)

export const lastSelectedModelIdAtom = atomWithStorage<string>(
  "agents:lastSelectedModelId",
  "sonnet",
  undefined,
  { getOnInit: true },
)

// Storage for all sub-chat modes (persisted per subChatId)
const subChatModesStorageAtom = atomWithStorage<Record<string, AgentMode>>(
  "agents:subChatModes",
  {},
  undefined,
  { getOnInit: true },
)

// atomFamily to get/set mode per subChatId
export const subChatModeAtomFamily = atomFamily((subChatId: string) =>
  atom(
    (get) => get(subChatModesStorageAtom)[subChatId] ?? "agent",
    (get, set, newMode: AgentMode) => {
      const current = get(subChatModesStorageAtom)
      set(subChatModesStorageAtom, { ...current, [subChatId]: newMode })
    },
  ),
)

// Model ID to full Claude model string mapping
export const MODEL_ID_MAP: Record<string, string> = {
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
}

// Sidebar state - window-scoped so each window has independent sidebar visibility
export const agentsSidebarOpenAtom = atomWithWindowStorage<boolean>(
  "agents-sidebar-open",
  true,
  { getOnInit: true },
)

// Sidebar width with localStorage persistence
export const agentsSidebarWidthAtom = atomWithStorage<number>(
  "agents-sidebar-width",
  224,
  undefined,
  { getOnInit: true },
)

// Preview sidebar (right) width and open state
export const agentsPreviewSidebarWidthAtom = atomWithStorage<number>(
  "agents-preview-sidebar-width",
  500,
  undefined,
  { getOnInit: true },
)

// Preview sidebar open state - window-scoped
export const agentsPreviewSidebarOpenAtom = atomWithWindowStorage<boolean>(
  "agents-preview-sidebar-open",
  true,
  { getOnInit: true },
)

// Diff sidebar (right) width (global - same width for all chats)
export const agentsDiffSidebarWidthAtom = atomWithStorage<number>(
  "agents-diff-sidebar-width",
  800,
  undefined,
  { getOnInit: true },
)

// Changes panel (file list) width within the diff sidebar
export const agentsChangesPanelWidthAtom = atomWithStorage<number>(
  "agents-changes-panel-width",
  280,
  undefined,
  { getOnInit: true },
)

// Changes panel collapsed state in narrow view (collapsed by default)
export const agentsChangesPanelCollapsedAtom = atomWithStorage<boolean>(
  "agents-changes-panel-collapsed",
  true, // collapsed by default
  undefined,
  { getOnInit: true },
)

// Diff view display mode - sidebar (side peek), center dialog, or fullscreen
// Defined early because diffSidebarOpenAtomFamily depends on it
export type DiffViewDisplayMode = "side-peek" | "center-peek" | "full-page"

export const diffViewDisplayModeAtom = atomWithStorage<DiffViewDisplayMode>(
  "agents:diffViewDisplayMode",
  "center-peek", // default to dialog for new users
  undefined,
  { getOnInit: true },
)

// Diff sidebar open state storage - window-scoped, stores per chatId
const diffSidebarOpenStorageAtom = atomWithWindowStorage<Record<string, boolean>>(
  "agents:diffSidebarOpen",
  {},
  { getOnInit: true },
)

// Runtime open state - not persisted, used for dialog/fullscreen modes
const diffSidebarOpenRuntimeAtom = atom<Record<string, boolean>>({})

// atomFamily to get/set diff sidebar open state per chatId
// Only restores persisted state when display mode is "side-peek" (sidebar mode)
// For dialog/fullscreen modes, we use runtime state only (not auto-restored on page load)
export const diffSidebarOpenAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => {
      const displayMode = get(diffViewDisplayModeAtom)
      const runtimeOpen = get(diffSidebarOpenRuntimeAtom)[chatId]

      // If we have a runtime value, use it (user explicitly opened/closed)
      if (runtimeOpen !== undefined) {
        return runtimeOpen
      }

      // For initial load: only restore persisted state for sidebar mode
      // Dialog and fullscreen should not auto-open on page load
      if (displayMode !== "side-peek") {
        return false
      }
      return get(diffSidebarOpenStorageAtom)[chatId] ?? false
    },
    (get, set, isOpen: boolean) => {
      // Always update runtime state
      const currentRuntime = get(diffSidebarOpenRuntimeAtom)
      set(diffSidebarOpenRuntimeAtom, { ...currentRuntime, [chatId]: isOpen })

      // Also persist for sidebar mode
      const current = get(diffSidebarOpenStorageAtom)
      set(diffSidebarOpenStorageAtom, { ...current, [chatId]: isOpen })
    },
  ),
)

// Legacy global atom - kept for backwards compatibility, maps to empty string key
// TODO: Remove after migration
export const agentsDiffSidebarOpenAtom = atomWithWindowStorage<boolean>(
  "agents-diff-sidebar-open",
  false,
  { getOnInit: true },
)

// Focused file path in diff sidebar (for scroll-to-file feature)
// Set by AgentEditTool on click, consumed by AgentDiffView
export const agentsFocusedDiffFileAtom = atom<string | null>(null)

// Collapsed state for diff files per chat - preserved across narrow/wide layout changes
// Map<fileKey, isCollapsed>
const diffFilesCollapsedStorageAtom = atom<Record<string, Record<string, boolean>>>({})

export const diffFilesCollapsedAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(diffFilesCollapsedStorageAtom)[chatId] ?? {},
    (get, set, collapsed: Record<string, boolean>) => {
      const current = get(diffFilesCollapsedStorageAtom)
      set(diffFilesCollapsedStorageAtom, { ...current, [chatId]: collapsed })
    },
  ),
)

// Sub-chats display mode - tabs (horizontal) or sidebar (vertical list)
// Window-scoped so each window can have its own layout preference
export const agentsSubChatsSidebarModeAtom = atomWithWindowStorage<
  "tabs" | "sidebar"
>("agents-subchats-mode", "tabs", { getOnInit: true })

// Sub-chats sidebar width (left side of chat area)
export const agentsSubChatsSidebarWidthAtom = atomWithStorage<number>(
  "agents-subchats-sidebar-width",
  200,
  undefined,
  { getOnInit: true },
)

// Track chats with unseen changes (finished streaming but user hasn't opened them)
// Updated by onFinish callback in Chat instances
export const agentsUnseenChangesAtom = atom<Set<string>>(new Set<string>())

// Current todos state per sub-chat
// Syncs the first (creation) todo tool with subsequent updates
// Map structure: { [subChatId]: TodoState }
interface TodoItem {
  content: string
  status: "pending" | "in_progress" | "completed"
  activeForm?: string
}

interface TodoState {
  todos: TodoItem[]
  creationToolCallId: string | null // ID of the tool call that created the todos
}

const allTodosStorageAtom = atom<Record<string, TodoState>>({})

// atomFamily to get/set todos per subChatId
export const currentTodosAtomFamily = atomFamily((subChatId: string) =>
  atom(
    (get) => get(allTodosStorageAtom)[subChatId] ?? { todos: [], creationToolCallId: null },
    (get, set, newState: TodoState) => {
      const current = get(allTodosStorageAtom)
      set(allTodosStorageAtom, { ...current, [subChatId]: newState })
    },
  ),
)

// Track sub-chats with unseen changes (finished streaming but user hasn't viewed them)
// Updated by onFinish callback in Chat instances
export const agentsSubChatUnseenChangesAtom = atom<Set<string>>(
  new Set<string>(),
)

// Archive popover open state
export const archivePopoverOpenAtom = atom<boolean>(false)

// Search query for archive
export const archiveSearchQueryAtom = atom<string>("")

// Repository filter for archive (null = all repositories)
export const archiveRepositoryFilterAtom = atom<string | null>(null)

// Track last used mode (plan/agent) per chat
// Map<chatId, "plan" | "agent">
export const lastChatModesAtom = atom<Map<string, "plan" | "agent">>(
  new Map<string, "plan" | "agent">(),
)

// Mobile view mode - chat (default, shows NewChatForm), chats list, preview, diff, or terminal
export type AgentsMobileViewMode = "chats" | "chat" | "preview" | "diff" | "terminal"
export const agentsMobileViewModeAtom = atom<AgentsMobileViewMode>("chat")

// Debug mode for testing first-time user experience
// Only works in development mode
export interface AgentsDebugMode {
  enabled: boolean
  simulateNoTeams: boolean // Simulate no teams available
  simulateNoRepos: boolean // Simulate no repositories connected
  simulateNoReadyRepos: boolean // Simulate only non-ready repos (in_progress/error)
  resetOnboarding: boolean // Reset onboarding dialog on next load
  bypassConnections: boolean // Allow going through onboarding steps even if already connected
  forceStep:
    | "workspace"
    | "profile"
    | "claude-code"
    | "github"
    | "discord"
    | null // Force a specific onboarding step
  simulateCompleted: boolean // Simulate onboarding as completed
}

export const agentsDebugModeAtom = atomWithStorage<AgentsDebugMode>(
  "agents:debugMode",
  {
    enabled: false,
    simulateNoTeams: false,
    simulateNoRepos: false,
    simulateNoReadyRepos: false,
    resetOnboarding: false,
    bypassConnections: false,
    forceStep: null,
    simulateCompleted: false,
  },
  undefined,
  { getOnInit: true },
)

// Changed files per sub-chat for tracking edits/writes
// Map<subChatId, FileChange[]>
export interface SubChatFileChange {
  filePath: string
  displayPath: string
  additions: number
  deletions: number
}

export const subChatFilesAtom = atom<Map<string, SubChatFileChange[]>>(
  new Map(),
)

// Mapping from subChatId to chatId (workspace ID) for aggregating stats
// Map<subChatId, chatId>
export const subChatToChatMapAtom = atom<Map<string, string>>(new Map())

// Filter files for diff sidebar (null = show all files)
// When set, AgentDiffView will only show files matching these paths
export const filteredDiffFilesAtom = atom<string[] | null>(null)

// Selected file path in diff sidebar (for highlighting in file list and showing in diff view)
// Using atom instead of useState to prevent re-renders of unrelated components
export const selectedDiffFilePathAtom = atom<string | null>(null)

// PR creation loading state - atom to allow ChatViewInner to reset it after sending message
export const isCreatingPrAtom = atom<boolean>(false)

// Filter by subchat ID for diff sidebar and changes panel (null = show all)
// When set by Review button, both diff view and file list filter to this subchat's files
export const filteredSubChatIdAtom = atom<string | null>(null)

// Selected commit for viewing in diff view
// null = show working tree diff (current behavior)
// When set, diff view shows files from this commit instead of working tree
export type SelectedCommit = {
	hash: string
	shortHash: string
	message: string
	description?: string
	author?: string
	date?: Date
} | null
export const selectedCommitAtom = atom<SelectedCommit>(null)

// Pending PR message to send to chat
// Set by ChatView when "Create PR" is clicked, consumed by ChatViewInner
export const pendingPrMessageAtom = atom<string | null>(null)

// Pending Review message to send to chat
// Set by ChatView when "Review" is clicked, consumed by ChatViewInner
export const pendingReviewMessageAtom = atom<string | null>(null)

// Pending merge conflict resolution message to send to chat
// Set when user clicks "Fix Conflicts" button, consumed by ChatViewInner
export const pendingConflictResolutionMessageAtom = atom<string | null>(null)

// Pending auth retry - stores failed message when auth-error occurs
// After successful OAuth flow, this triggers automatic retry of the message
export type PendingAuthRetryMessage = {
  subChatId: string  // Required: only retry in the correct chat
  prompt: string
  images?: Array<{
    base64Data: string
    mediaType: string
    filename?: string
  }>
  readyToRetry: boolean  // Only retry when this is true (set by modal on OAuth success)
}
export const pendingAuthRetryMessageAtom = atom<PendingAuthRetryMessage | null>(null)

// Work mode preference (local = work in project dir, worktree = create isolated worktree)
export type WorkMode = "local" | "worktree"
export const lastSelectedWorkModeAtom = atomWithStorage<WorkMode>(
  "agents:lastSelectedWorkMode",
  "worktree", // default to worktree for current behavior
  undefined,
  { getOnInit: true },
)

// Last selected branch per project (persisted)
// Maps projectId -> { name: string, type: "local" | "remote" }
// Custom storage with migration from old string format
const lastSelectedBranchesStorage = {
  getItem: (key: string, initialValue: Record<string, { name: string; type: "local" | "remote" }>) => {
    const storedValue = localStorage.getItem(key)
    if (!storedValue) return initialValue

    try {
      const parsed = JSON.parse(storedValue)

      // Migrate old format: Record<string, string> -> Record<string, { name, type }>
      const migrated: Record<string, { name: string; type: "local" | "remote" }> = {}
      for (const [projectId, value] of Object.entries(parsed)) {
        if (typeof value === "string") {
          // Old format: string branch name -> assume "local" type
          migrated[projectId] = { name: value, type: "local" }
        } else if (value && typeof value === "object" && "name" in value && "type" in value) {
          // New format: already migrated
          migrated[projectId] = value as { name: string; type: "local" | "remote" }
        }
      }

      // Save migrated data back to localStorage
      if (Object.keys(migrated).length > 0) {
        localStorage.setItem(key, JSON.stringify(migrated))
      }

      return migrated
    } catch {
      return initialValue
    }
  },
  setItem: (key: string, value: Record<string, { name: string; type: "local" | "remote" }>) => {
    localStorage.setItem(key, JSON.stringify(value))
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key)
  },
}

export const lastSelectedBranchesAtom = atomWithStorage<
  Record<string, { name: string; type: "local" | "remote" }>
>(
  "agents:lastSelectedBranches",
  {},
  lastSelectedBranchesStorage,
  { getOnInit: true },
)

// Compacting status per sub-chat
// Set<subChatId> - subChats currently being compacted
export const compactingSubChatsAtom = atom<Set<string>>(new Set())

// Track IDs of chats/subchats created in this browser session (NOT persisted - resets on reload)
// Used to determine whether to show placeholder + typewriter effect
export const justCreatedIdsAtom = atom<Set<string>>(new Set())

// Pending user questions from AskUserQuestion tool
// Set when Claude requests user input, cleared when answered or skipped
export const QUESTIONS_SKIPPED_MESSAGE = "User skipped questions - proceed with defaults"
export const QUESTIONS_TIMED_OUT_MESSAGE = "Timed out"

export type PendingUserQuestion = {
  subChatId: string
  parentChatId: string
  toolUseId: string
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    multiSelect: boolean
  }>
}
// Map<subChatId, PendingUserQuestion> - supports multiple pending questions across workspaces
export const pendingUserQuestionsAtom = atom<Map<string, PendingUserQuestion>>(new Map())

// Legacy type alias for backwards compatibility
export type PendingUserQuestions = PendingUserQuestion

// Track sub-chats with pending plan approval (plan ready but not yet implemented)
// Map<subChatId, parentChatId> - allows filtering by workspace
export const pendingPlanApprovalsAtom = atom<Map<string, string>>(new Map())

// Pending "Build plan" trigger - set by ChatView sidebar, consumed by ChatViewInner
// Contains subChatId to approve, null when no pending approval
export const pendingBuildPlanSubChatIdAtom = atom<string | null>(null)

// Store AskUserQuestion results by toolUseId for real-time updates
// Map<toolUseId, result>
export const askUserQuestionResultsAtom = atom<Map<string, unknown>>(new Map())

// Unified undo stack for workspace and sub-chat archivation
// Supports Cmd+Z to restore the last archived item (workspace or sub-chat)
export type UndoItem =
  | { type: "workspace"; chatId: string; timeoutId: ReturnType<typeof setTimeout> }
  | { type: "subchat"; subChatId: string; chatId: string; timeoutId: ReturnType<typeof setTimeout> }

export const undoStackAtom = atom<UndoItem[]>([])

// Viewed files state for diff review (GitHub-style "Viewed" checkbox)
// Tracks which files have been reviewed with content hash to detect changes
export type ViewedFileState = {
  viewed: boolean
  contentHash: string // Hash of diffText when marked as viewed
}

// Storage atom for viewed files per chat
// Structure: { [chatId]: { [fileKey]: ViewedFileState } }
const viewedFilesStorageAtom = atomWithStorage<
  Record<string, Record<string, ViewedFileState>>
>(
  "agents:viewedFiles",
  {},
  undefined,
  { getOnInit: true },
)

// atomFamily to get/set viewed files per chatId
export const viewedFilesAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(viewedFilesStorageAtom)[chatId] ?? {},
    (get, set, newState: Record<string, ViewedFileState>) => {
      const current = get(viewedFilesStorageAtom)
      set(viewedFilesStorageAtom, { ...current, [chatId]: newState })
    },
  ),
)

// Plan sidebar state atoms

// Plan sidebar width (global, persisted)
export const agentsPlanSidebarWidthAtom = atomWithStorage<number>(
  "agents-plan-sidebar-width",
  500,
  undefined,
  { getOnInit: true },
)

// Plan sidebar open state storage - stores per chatId (persisted)
// Uses window-scoped storage so each window can have independent plan sidebar states
const planSidebarOpenStorageAtom = atomWithWindowStorage<Record<string, boolean>>(
  "agents:planSidebarOpen",
  {},
  { getOnInit: true },
)

// atomFamily to get/set plan sidebar open state per chatId
export const planSidebarOpenAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(planSidebarOpenStorageAtom)[chatId] ?? false,
    (get, set, isOpen: boolean) => {
      const current = get(planSidebarOpenStorageAtom)
      set(planSidebarOpenStorageAtom, { ...current, [chatId]: isOpen })
    },
  ),
)

// Current plan path storage - stores per chatId (runtime only, not persisted)
const currentPlanPathStorageAtom = atom<Record<string, string | null>>({})

// atomFamily to get/set current plan path per chatId
export const currentPlanPathAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(currentPlanPathStorageAtom)[chatId] ?? null,
    (get, set, planPath: string | null) => {
      const current = get(currentPlanPathStorageAtom)
      set(currentPlanPathStorageAtom, { ...current, [chatId]: planPath })
    },
  ),
)

// Per-chat plan edit refetch trigger - incremented when an Edit on a plan file completes
// Used to trigger sidebar refetch when plan content changes
const planEditRefetchTriggerStorageAtom = atom<Record<string, number>>({})

export const planEditRefetchTriggerAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(planEditRefetchTriggerStorageAtom)[chatId] ?? 0,
    (get, set) => {
      const current = get(planEditRefetchTriggerStorageAtom)
      const currentValue = current[chatId] ?? 0
      set(planEditRefetchTriggerStorageAtom, { ...current, [chatId]: currentValue + 1 })
    },
  ),
)

// ============================================================================
// Diff Data Cache (per workspace) - prevents data loss when switching workspaces
// ============================================================================

// ParsedDiffFile type (same as in shared/changes-types.ts but avoiding import cycle)
export interface CachedParsedDiffFile {
  key: string
  oldPath: string
  newPath: string
  diffText: string
  isBinary: boolean
  additions: number
  deletions: number
  isValid: boolean
  fileLang: string | null
  isNewFile: boolean
  isDeletedFile: boolean
}

export interface DiffStatsCache {
  fileCount: number
  additions: number
  deletions: number
  isLoading: boolean
  hasChanges: boolean
}

export interface WorkspaceDiffCache {
  parsedFileDiffs: CachedParsedDiffFile[] | null
  diffStats: DiffStatsCache
  prefetchedFileContents: Record<string, string>
  diffContent: string | null
}

// Default stats for loading state
const DEFAULT_DIFF_STATS: DiffStatsCache = {
  fileCount: 0,
  additions: 0,
  deletions: 0,
  isLoading: true,
  hasChanges: false,
}

// Runtime cache for diff data per workspace (not persisted)
const workspaceDiffCacheStorageAtom = atom<Record<string, WorkspaceDiffCache>>({})

// Default cache value
const DEFAULT_DIFF_CACHE: WorkspaceDiffCache = {
  parsedFileDiffs: null,
  diffStats: DEFAULT_DIFF_STATS,
  prefetchedFileContents: {},
  diffContent: null,
}

export const workspaceDiffCacheAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(workspaceDiffCacheStorageAtom)[chatId] ?? DEFAULT_DIFF_CACHE,
    (get, set, update: WorkspaceDiffCache | ((prev: WorkspaceDiffCache) => WorkspaceDiffCache)) => {
      const current = get(workspaceDiffCacheStorageAtom)
      const prevCache = current[chatId] ?? DEFAULT_DIFF_CACHE
      const newCache = typeof update === 'function' ? update(prevCache) : update
      set(workspaceDiffCacheStorageAtom, {
        ...current,
        [chatId]: newCache,
      })
    },
  ),
)
