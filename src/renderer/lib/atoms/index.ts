import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// ============================================
// RE-EXPORT FROM FEATURES/AGENTS/ATOMS (source of truth)
// ============================================

export {
  // Chat atoms
  selectedAgentChatIdAtom,
  isPlanModeAtom,
  lastSelectedModelIdAtom,
  lastSelectedAgentIdAtom,
  lastSelectedRepoAtom,
  agentsUnseenChangesAtom,
  agentsSubChatUnseenChangesAtom,
  loadingSubChatsAtom,
  setLoading,
  clearLoading,
  MODEL_ID_MAP,
  lastChatModesAtom,

  // Sidebar atoms
  agentsSidebarOpenAtom,
  agentsSidebarWidthAtom,
  agentsSubChatsSidebarModeAtom,
  agentsSubChatsSidebarWidthAtom,

  // Preview atoms
  previewPathAtomFamily,
  viewportModeAtomFamily,
  previewScaleAtomFamily,
  mobileDeviceAtomFamily,
  agentsPreviewSidebarWidthAtom,
  agentsPreviewSidebarOpenAtom,

  // Diff atoms
  agentsDiffSidebarWidthAtom,
  agentsDiffSidebarOpenAtom,
  agentsFocusedDiffFileAtom,
  filteredDiffFilesAtom,
  subChatFilesAtom,

  // Archive atoms
  archivePopoverOpenAtom,
  archiveSearchQueryAtom,
  archiveRepositoryFilterAtom,

  // Scroll & UI state
  agentsScrollPositionsAtom,
  agentsMobileViewModeAtom,

  // Debug mode
  agentsDebugModeAtom,

  // Todos
  currentTodosAtomFamily,

  // AskUserQuestion
  pendingUserQuestionsAtom,

  // Git panel
  gitPanelOpenAtom,
  gitPanelHeightAtom,

  // Types
  type SavedRepo,
  type SelectedProject,
  type AgentsMobileViewMode,
  type AgentsDebugMode,
  type SubChatFileChange,
} from "../../features/agents/atoms"

// ============================================
// TEAM ATOMS (unique to lib/atoms)
// ============================================

export const selectedTeamIdAtom = atomWithStorage<string | null>(
  "agents:selectedTeamId",
  null,
  undefined,
  { getOnInit: true },
)

export const createTeamDialogOpenAtom = atom<boolean>(false)

// ============================================
// LOCAL PROFILE (desktop-only)
// ============================================

export const localProfileNameAtom = atomWithStorage<string>(
  "profile:local-name",
  "",
  undefined,
  { getOnInit: true },
)

// ============================================
// MULTI-SELECT ATOMS - Chats (unique to lib/atoms)
// ============================================

export const selectedAgentChatIdsAtom = atom<Set<string>>(new Set<string>())

export const isAgentMultiSelectModeAtom = atom((get) => {
  return get(selectedAgentChatIdsAtom).size > 0
})

export const selectedAgentChatsCountAtom = atom((get) => {
  return get(selectedAgentChatIdsAtom).size
})

export const toggleAgentChatSelectionAtom = atom(
  null,
  (get, set, chatId: string) => {
    const currentSet = get(selectedAgentChatIdsAtom)
    const newSet = new Set(currentSet)
    if (newSet.has(chatId)) {
      newSet.delete(chatId)
    } else {
      newSet.add(chatId)
    }
    set(selectedAgentChatIdsAtom, newSet)
  },
)

export const selectAllAgentChatsAtom = atom(
  null,
  (_get, set, chatIds: string[]) => {
    set(selectedAgentChatIdsAtom, new Set(chatIds))
  },
)

export const clearAgentChatSelectionAtom = atom(null, (_get, set) => {
  set(selectedAgentChatIdsAtom, new Set())
})

// ============================================
// MULTI-SELECT ATOMS - Sub-Chats (unique to lib/atoms)
// ============================================

export const selectedSubChatIdsAtom = atom<Set<string>>(new Set<string>())

export const isSubChatMultiSelectModeAtom = atom((get) => {
  return get(selectedSubChatIdsAtom).size > 0
})

export const selectedSubChatsCountAtom = atom((get) => {
  return get(selectedSubChatIdsAtom).size
})

export const toggleSubChatSelectionAtom = atom(
  null,
  (get, set, subChatId: string) => {
    const currentSet = get(selectedSubChatIdsAtom)
    const newSet = new Set(currentSet)
    if (newSet.has(subChatId)) {
      newSet.delete(subChatId)
    } else {
      newSet.add(subChatId)
    }
    set(selectedSubChatIdsAtom, newSet)
  },
)

export const selectAllSubChatsAtom = atom(
  null,
  (_get, set, subChatIds: string[]) => {
    set(selectedSubChatIdsAtom, new Set(subChatIds))
  },
)

export const clearSubChatSelectionAtom = atom(null, (_get, set) => {
  set(selectedSubChatIdsAtom, new Set())
})

// ============================================
// DIALOG ATOMS (unique to lib/atoms)
// ============================================

// Settings dialog
export type SettingsTab =
  | "profile"
  | "claudeCode"
  | "appearance"
  | "preferences"
  | "skills"
  | "agents"
  | "mcp"
  | "debug"
export const agentsSettingsDialogActiveTabAtom = atom<SettingsTab>("profile")
export const agentsSettingsDialogOpenAtom = atom<boolean>(false)

// Preferences - Extended Thinking
// When enabled, Claude will use extended thinking for deeper reasoning (128K tokens)
// Note: Extended thinking disables response streaming
export const extendedThinkingEnabledAtom = atomWithStorage<boolean>(
  "preferences:extended-thinking-enabled",
  false,
  undefined,
  { getOnInit: true },
)

// Preferences - Sound Notifications
// When enabled, play a sound when agent completes work (if not viewing the chat)
export const soundNotificationsEnabledAtom = atomWithStorage<boolean>(
  "preferences:sound-notifications-enabled",
  true,
  undefined,
  { getOnInit: true },
)

// Preferences - Analytics Opt-out
// When true, user has opted out of analytics tracking
export const analyticsOptOutAtom = atomWithStorage<boolean>(
  "preferences:analytics-opt-out",
  false, // Default to opt-in (false means not opted out)
  undefined,
  { getOnInit: true },
)

// Preferences - Ctrl+Tab Quick Switch Target
// When "workspaces" (default), Ctrl+Tab switches between workspaces, and Opt+Ctrl+Tab switches between agents
// When "agents", Ctrl+Tab switches between agents, and Opt+Ctrl+Tab switches between workspaces
export type CtrlTabTarget = "workspaces" | "agents"
export const ctrlTabTargetAtom = atomWithStorage<CtrlTabTarget>(
  "preferences:ctrl-tab-target",
  "workspaces", // Default: Ctrl+Tab switches workspaces, Opt+Ctrl+Tab switches agents
  undefined,
  { getOnInit: true },
)

// Preferences - VS Code Code Themes
// Selected themes for code syntax highlighting (separate for light/dark UI themes)
export const vscodeCodeThemeLightAtom = atomWithStorage<string>(
  "preferences:vscode-code-theme-light",
  "github-light",
  undefined,
  { getOnInit: true },
)

export const vscodeCodeThemeDarkAtom = atomWithStorage<string>(
  "preferences:vscode-code-theme-dark",
  "github-dark",
  undefined,
  { getOnInit: true },
)

// ============================================
// FULL VS CODE THEME ATOMS
// ============================================

/**
 * Full VS Code theme data type
 * Contains colors for UI, terminal, and tokenColors for syntax highlighting
 */
export type VSCodeFullTheme = {
  id: string
  name: string
  type: "light" | "dark"
  colors: Record<string, string> // UI and terminal colors
  tokenColors?: any[] // Syntax highlighting rules
  semanticHighlighting?: boolean // Enable semantic highlighting
  semanticTokenColors?: Record<string, any> // Semantic token color overrides
  source: "builtin" | "imported" | "discovered"
  path?: string // File path for imported/discovered themes
}

/**
 * Selected full theme ID
 * When null, uses system light/dark mode with the themes specified in systemLightThemeIdAtom/systemDarkThemeIdAtom
 */
export const selectedFullThemeIdAtom = atomWithStorage<string | null>(
  "preferences:selected-full-theme-id",
  null, // null means use system default
  undefined,
  { getOnInit: true },
)

/**
 * Theme to use when system is in light mode (only used when selectedFullThemeIdAtom is null)
 */
export const systemLightThemeIdAtom = atomWithStorage<string>(
  "preferences:system-light-theme-id",
  "21st-light", // Default light theme
  undefined,
  { getOnInit: true },
)

/**
 * Theme to use when system is in dark mode (only used when selectedFullThemeIdAtom is null)
 */
export const systemDarkThemeIdAtom = atomWithStorage<string>(
  "preferences:system-dark-theme-id",
  "21st-dark", // Default dark theme
  undefined,
  { getOnInit: true },
)

/**
 * Cached full theme data for the selected theme
 * This is populated when a theme is selected and used for applying CSS variables
 */
export const fullThemeDataAtom = atom<VSCodeFullTheme | null>(null)

/**
 * All available full themes (built-in + imported + discovered)
 * This is a derived atom that combines all theme sources
 */
export const allFullThemesAtom = atom<VSCodeFullTheme[]>((get) => {
  // This will be populated by the theme provider
  // For now, return empty - will be set imperatively
  return []
})

// Shortcuts dialog
export const agentsShortcutsDialogOpenAtom = atom<boolean>(false)

// Login modal (shown when Claude Code auth fails)
export const agentsLoginModalOpenAtom = atom<boolean>(false)

// Help popover
export const agentsHelpPopoverOpenAtom = atom<boolean>(false)

// Quick switch dialog - Agents
export const agentsQuickSwitchOpenAtom = atom<boolean>(false)
export const agentsQuickSwitchSelectedIndexAtom = atom<number>(0)

// Quick switch dialog - Sub-chats
export const subChatsQuickSwitchOpenAtom = atom<boolean>(false)
export const subChatsQuickSwitchSelectedIndexAtom = atom<number>(0)

// ============================================
// UPDATE ATOMS
// ============================================

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error"

export type UpdateState = {
  status: UpdateStatus
  version?: string
  progress?: number // 0-100
  bytesPerSecond?: number
  transferred?: number
  total?: number
  error?: string
}

export const updateStateAtom = atom<UpdateState>({ status: "idle" })

// Track if app was just updated (to show "What's New" banner)
// This is set to true when app launches with a new version, reset when user dismisses
export const justUpdatedAtom = atom<boolean>(false)

// Store the version that triggered the "just updated" state
export const justUpdatedVersionAtom = atom<string | null>(null)

// Legacy atom for backwards compatibility (deprecated)
export type UpdateInfo = {
  version: string
  downloadUrl: string
  releaseNotes?: string
}

export const updateInfoAtom = atom<UpdateInfo | null>(null)

// ============================================
// DESKTOP/FULLSCREEN STATE ATOMS
// ============================================

// Whether app is running in Electron desktop environment
export const isDesktopAtom = atom<boolean>(false)

// Fullscreen state - null means not initialized yet
// null = not yet loaded, false = not fullscreen, true = fullscreen
export const isFullscreenAtom = atom<boolean | null>(null)

// ============================================
// ANTHROPIC ONBOARDING ATOMS
// ============================================

// Whether user has completed Anthropic OAuth during onboarding
// This is used to show the onboarding screen after 21st.dev sign-in
// Reset on logout
export const anthropicOnboardingCompletedAtom = atomWithStorage<boolean>(
  "onboarding:anthropic-completed",
  false,
  undefined,
  { getOnInit: true },
)

// ============================================
// SESSION INFO ATOMS (MCP, Plugins, Tools)
// ============================================

export type MCPServerStatus = "connected" | "failed" | "pending" | "needs-auth"

export type MCPServer = {
  name: string
  status: MCPServerStatus
  serverInfo?: {
    name: string
    version: string
  }
  error?: string
}

export type SessionInfo = {
  tools: string[]
  mcpServers: MCPServer[]
  plugins: { name: string; path: string }[]
  skills: string[]
}

// Session info from SDK init message
// Contains MCP servers, plugins, available tools, and skills
// Persisted to localStorage so MCP tools are visible after page refresh
// Updated when a new chat session starts
export const sessionInfoAtom = atomWithStorage<SessionInfo | null>(
  "21st-session-info",
  null,
  undefined,
  { getOnInit: true },
)

// ============================================
// NOTIFICATION SYSTEM ATOMS
// ============================================

// Notification mode preference
// "always" - notify regardless of window focus
// "unfocused" - only notify when app is not focused (default)
// "never" - disable all notifications
export type NotificationMode = "always" | "unfocused" | "never"

export const notificationModeAtom = atomWithStorage<NotificationMode>(
  "preferences:notification-mode",
  "unfocused",
  undefined,
  { getOnInit: true },
)

// Toast notifications for tool events
// When enabled, shows toast when tools start/complete
export const toastNotificationsEnabledAtom = atomWithStorage<boolean>(
  "preferences:toast-notifications-enabled",
  true,
  undefined,
  { getOnInit: true },
)

// Activity feed panel
// When enabled, shows the activity feed sidebar panel
export const activityFeedEnabledAtom = atomWithStorage<boolean>(
  "preferences:activity-feed-enabled",
  true,
  undefined,
  { getOnInit: true },
)

// Activity feed state (in-memory cache, persisted to DB)
export interface ToolActivity {
  id: string
  subChatId: string
  chatName: string
  toolName: string
  summary: string // "package.json", "npm install", "*.tsx"
  state: "running" | "complete" | "error"
  input: string | null // JSON string
  output: string | null // JSON string
  errorText: string | null
  isPinned: boolean
  createdAt: Date // From DB (mode: "timestamp")
}

export const toolActivityAtom = atom<ToolActivity[]>([])
export const MAX_ACTIVITY_ITEMS = 50

// Selected activity for viewer modal
export const selectedActivityIdAtom = atom<string | null>(null)

// Helper to add activity (returns the new activity with generated ID)
export const addToolActivityAtom = atom(
  null,
  (
    get,
    set,
    activity: Omit<
      ToolActivity,
      "id" | "createdAt" | "output" | "errorText" | "isPinned"
    >,
  ) => {
    const prev = get(toolActivityAtom)
    const newActivity: ToolActivity = {
      ...activity,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      output: null,
      errorText: null,
      isPinned: false,
      createdAt: new Date(),
    }
    set(toolActivityAtom, [newActivity, ...prev].slice(0, MAX_ACTIVITY_ITEMS))
    return newActivity
  },
)

// Helper to update activity state with output/error
export const updateToolActivityAtom = atom(
  null,
  (
    get,
    set,
    update: {
      id: string
      state: ToolActivity["state"]
      output?: string | null
      errorText?: string | null
    },
  ) => {
    const prev = get(toolActivityAtom)
    set(
      toolActivityAtom,
      prev.map((a) =>
        a.id === update.id
          ? {
              ...a,
              state: update.state,
              output: update.output ?? a.output,
              errorText: update.errorText ?? a.errorText,
            }
          : a,
      ),
    )
  },
)

// Helper to set activities (for loading from DB)
export const setToolActivitiesAtom = atom(
  null,
  (_get, set, activities: ToolActivity[]) => {
    set(toolActivityAtom, activities.slice(0, MAX_ACTIVITY_ITEMS))
  },
)

// Helper to clear activities
export const clearToolActivityAtom = atom(null, (_get, set) => {
  set(toolActivityAtom, [])
})

// Helper to toggle pin status
export const toggleActivityPinAtom = atom(
  null,
  (get, set, { id, isPinned }: { id: string; isPinned: boolean }) => {
    const prev = get(toolActivityAtom)
    set(
      toolActivityAtom,
      prev.map((a) => (a.id === id ? { ...a, isPinned } : a)),
    )
  },
)
