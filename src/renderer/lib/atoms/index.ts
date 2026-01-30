import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { useEffect, useRef } from "react"
import { useAtom } from "jotai"

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
  selectedProjectAtom,
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
  agentsChangesPanelWidthAtom,
  agentsDiffSidebarOpenAtom,
  agentsFocusedDiffFileAtom,
  filteredDiffFilesAtom,
  subChatFilesAtom,

  // Archive atoms
  archivePopoverOpenAtom,
  archiveSearchQueryAtom,
  archiveRepositoryFilterAtom,

  // UI state
  agentsMobileViewModeAtom,

  // Debug mode
  agentsDebugModeAtom,

  // Todos
  currentTodosAtomFamily,

  // AskUserQuestion
  pendingUserQuestionsAtom,

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
  | "appearance"
  | "preferences"
  | "models"
  | "skills"
  | "agents"
  | "mcp"
  | "worktrees"
  | "debug"
  | "beta"
  | "keyboard"
  | `project-${string}` // Dynamic project tabs
export const agentsSettingsDialogActiveTabAtom = atom<SettingsTab>("profile")
export const agentsSettingsDialogOpenAtom = atom<boolean>(false)

export type CustomClaudeConfig = {
  model: string
  token: string
  baseUrl: string
}

// Model profile system - support multiple custom model configs with multiple model names
export type ModelProfile = {
  id: string
  name: string
  description?: string // User-facing description for this model profile
  config: CustomClaudeConfig
  models: string[] // Multiple model names available with this profile
  isOffline?: boolean // Mark as offline/Ollama profile
  createdAt?: number // Timestamp for sorting
  updatedAt?: number // Timestamp for updates
}

// Selected Ollama model for offline mode
export const selectedOllamaModelAtom = atomWithStorage<string | null>(
  "agents:selected-ollama-model",
  null, // null = use recommended model
  undefined,
  { getOnInit: true },
)

// Helper to generate unique profile ID
export const generateProfileId = (): string => {
  return `profile-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// Helper to get offline profile with selected model
export const getOfflineProfile = (modelName?: string | null): ModelProfile => ({
  id: 'offline-ollama',
  name: 'Offline (Ollama)',
  description: 'Local Ollama models for offline use',
  isOffline: true,
  config: {
    model: modelName || 'qwen2.5-coder:7b',
    token: 'ollama',
    baseUrl: 'http://localhost:11434',
  },
  models: [], // Ollama models are dynamic
})

// Predefined offline profile for Ollama (legacy, uses default model)
export const OFFLINE_PROFILE: ModelProfile = {
  id: 'offline-ollama',
  name: 'Offline (Ollama)',
  description: 'Local Ollama models for offline use',
  isOffline: true,
  config: {
    model: 'qwen2.5-coder:7b',
    token: 'ollama',
    baseUrl: 'http://localhost:11434',
  },
  models: [], // Ollama models are dynamic, populated at runtime
}

// Legacy single config (deprecated, kept for backwards compatibility)
export const customClaudeConfigAtom = atomWithStorage<CustomClaudeConfig>(
  "agents:claude-custom-config",
  {
    model: "",
    token: "",
    baseUrl: "",
  },
  undefined,
  { getOnInit: true },
)

// New: Model profiles storage with DB sync
// The actual storage is in localStorage, but we initialize from DB on first load
const LOCAL_STORAGE_KEY = "agents:model-profiles"
const INITIAL_OFFLINE_PROFILE: ModelProfile = {
  id: 'offline-ollama',
  name: 'Offline (Ollama)',
  description: 'Local Ollama models for offline use',
  isOffline: true,
  config: {
    model: 'qwen2.5-coder:7b',
    token: 'ollama',
    baseUrl: 'http://localhost:11434',
  },
  models: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

/**
 * Create a model profiles atom that syncs with the database
 * On first load, it checks DB for profiles and migrates localStorage if needed
 */
function createModelProfilesAtom() {
  const baseAtom = atomWithStorage<ModelProfile[]>(
    LOCAL_STORAGE_KEY,
    [INITIAL_OFFLINE_PROFILE],
    undefined,
    { getOnInit: true },
  )

  // Track if we've initialized from DB
  let initializedFromDb = false

  return atom(
    (get) => {
      const profiles = get(baseAtom as any) as ModelProfile[]
      return profiles
    },
    async (get, set, newProfiles: ModelProfile[]) => {
      // Update localStorage
      set(baseAtom as any, newProfiles)

      // Sync to database
      await syncProfilesToDb(newProfiles)
    },
  )
}

export const modelProfilesAtom = createModelProfilesAtom()

/**
 * Hook to initialize model profiles from database
 * Call this in a component to ensure profiles are loaded from DB
 */
export function useInitializeModelProfiles() {
  const [profiles, setProfiles] = useAtom(modelProfilesAtom)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    // Only initialize if we have the default offline profile and no other profiles
    // This suggests first load
    const hasOnlyOffline = profiles.length === 1 && profiles[0]?.id === 'offline-ollama'

    if (hasOnlyOffline) {
      initializeModelProfiles().then((dbProfiles) => {
        if (dbProfiles.length > 0) {
          setProfiles(dbProfiles)
        }
      })
    }
  }, [profiles, setProfiles])

  return profiles
}

// Active profile ID (null = use Claude Code default)
export const activeProfileIdAtom = atomWithStorage<string | null>(
  "agents:active-profile-id",
  null,
  undefined,
  { getOnInit: true },
)

// Auto-fallback to offline mode when internet is unavailable
export const autoOfflineModeAtom = atomWithStorage<boolean>(
  "agents:auto-offline-mode",
  true, // Enabled by default
  undefined,
  { getOnInit: true },
)

// Simulate offline mode for testing (debug feature)
export const simulateOfflineAtom = atomWithStorage<boolean>(
  "agents:simulate-offline",
  false, // Disabled by default
  undefined,
  { getOnInit: true },
)

// Show offline mode UI (debug feature - enables offline functionality visibility)
export const showOfflineModeFeaturesAtom = atomWithStorage<boolean>(
  "agents:show-offline-mode-features",
  false, // Hidden by default
  undefined,
  { getOnInit: true },
)

// Network status (updated from main process)
export const networkOnlineAtom = atom<boolean>(true)

export function normalizeCustomClaudeConfig(
  config: CustomClaudeConfig,
): CustomClaudeConfig | undefined {
  const model = config.model.trim()
  const token = config.token.trim()
  const baseUrl = config.baseUrl.trim()

  if (!model || !token || !baseUrl) return undefined

  return { model, token, baseUrl }
}

// Validate a model profile
export function validateModelProfile(profile: Partial<ModelProfile>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!profile.name?.trim()) {
    errors.push("Profile name is required")
  }

  if (!profile.models || profile.models.length === 0) {
    errors.push("At least one model name is required")
  }

  if (!profile.config?.baseUrl?.trim()) {
    errors.push("Base URL is required")
  }

  if (!profile.config?.token?.trim()) {
    errors.push("API token is required")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// Selected custom model ID (tracks which specific model within a profile is selected)
export const selectedCustomModelIdAtom = atomWithStorage<string | null>(
  "agents:selected-custom-model-id",
  null,
  undefined,
  { getOnInit: true },
)

// Get active config (considering network status and auto-fallback)
export const activeConfigAtom = atom((get) => {
  const activeProfileId = get(activeProfileIdAtom)
  const profiles = get(modelProfilesAtom)
  const legacyConfig = get(customClaudeConfigAtom)
  const networkOnline = get(networkOnlineAtom)
  const autoOffline = get(autoOfflineModeAtom)

  // If auto-offline enabled and no internet, use offline profile
  if (!networkOnline && autoOffline) {
    const offlineProfile = profiles.find(p => p.isOffline)
    if (offlineProfile) {
      return offlineProfile.config
    }
  }

  // If specific profile is selected, use it
  if (activeProfileId) {
    const profile = profiles.find(p => p.id === activeProfileId)
    if (profile) {
      return profile.config
    }
  }

  // Fallback to legacy config if set
  const normalized = normalizeCustomClaudeConfig(legacyConfig)
  if (normalized) {
    return normalized
  }

  // No custom config
  return undefined
})

// Preferences - Extended Thinking
// When enabled, Claude will use extended thinking for deeper reasoning (128K tokens)
// Note: Extended thinking disables response streaming
export const extendedThinkingEnabledAtom = atomWithStorage<boolean>(
  "preferences:extended-thinking-enabled",
  false,
  undefined,
  { getOnInit: true },
)

// Preferences - History (Rollback)
// When enabled, allow rollback to previous assistant messages
export const historyEnabledAtom = atomWithStorage<boolean>(
  "preferences:history-enabled",
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

// Preferences - Desktop Notifications (Windows)
// When enabled, show Windows desktop notification when agent completes work
export const desktopNotificationsEnabledAtom = atomWithStorage<boolean>(
  "preferences:desktop-notifications-enabled",
  true,
  undefined,
  { getOnInit: true },
)

// Preferences - Windows Window Frame Style
// When true, uses native frame (standard Windows title bar)
// When false, uses frameless window (dark custom title bar)
// Only applies on Windows, requires app restart to take effect
export const useNativeFrameAtom = atomWithStorage<boolean>(
  "preferences:windows-use-native-frame",
  false, // Default: frameless (dark title bar)
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

// Beta: Enable git features in diff sidebar (commit, staging, file selection)
// When enabled, shows checkboxes for file selection and commit UI in diff sidebar
// When disabled, shows simple file list with "Create PR" button
export const betaGitFeaturesEnabledAtom = atomWithStorage<boolean>(
  "preferences:beta-git-features-enabled",
  false, // Default OFF
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
 * Show workspace icon in sidebar
 * When disabled, hides the project icon and moves loader/status indicators to the right of the name
 */
export const showWorkspaceIconAtom = atomWithStorage<boolean>(
  "preferences:show-workspace-icon",
  false, // Hidden by default
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

// ============================================
// CUSTOM HOTKEYS CONFIGURATION
// ============================================

import type { CustomHotkeysConfig } from "../hotkeys/types"
export type { CustomHotkeysConfig }

/**
 * Custom hotkey overrides storage
 * Maps action IDs to custom hotkey strings (or null for default)
 */
export const customHotkeysAtom = atomWithStorage<CustomHotkeysConfig>(
  "preferences:custom-hotkeys",
  { version: 1, bindings: {} },
  undefined,
  { getOnInit: true },
)

/**
 * Currently recording hotkey for action (UI state)
 * null when not recording
 */
export const recordingHotkeyForActionAtom = atom<string | null>(null)

// Login modal (shown when Claude Code auth fails)
export const agentsLoginModalOpenAtom = atom<boolean>(false)

// Help popover
export const agentsHelpPopoverOpenAtom = atom<boolean>(false)

// Feedback dialog
export const feedbackDialogOpenAtom = atom<boolean>(false)

// Feedback list dialog
export const feedbackListDialogOpenAtom = atom<boolean>(false)

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
// ONBOARDING ATOMS
// ============================================

// Billing method selected during onboarding
// "claude-subscription" = use Claude Pro/Max via OAuth
// "api-key" = use Anthropic API key directly
// "custom-model" = use custom base URL and model (e.g. for proxies or alternative providers)
// null = not yet selected (show billing method selection screen)
export type BillingMethod = "claude-subscription" | "api-key" | "custom-model" | null

export const billingMethodAtom = atomWithStorage<BillingMethod>(
  "onboarding:billing-method",
  null,
  undefined,
  { getOnInit: true },
)

// Whether user has completed Anthropic OAuth during onboarding
// This is used to show the onboarding screen after 21st.dev sign-in
// Reset on logout
export const anthropicOnboardingCompletedAtom = atomWithStorage<boolean>(
  "onboarding:anthropic-completed",
  false,
  undefined,
  { getOnInit: true },
)

// Whether user has completed API key configuration during onboarding
// Only relevant when billingMethod is "api-key"
export const apiKeyOnboardingCompletedAtom = atomWithStorage<boolean>(
  "onboarding:api-key-completed",
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
// DOCUMENT VIEWER ATOMS
// ============================================

export {
  documentsPanelOpenAtomFamily,
  documentsPanelWidthAtom,
  activeDocumentAtomFamily,
  workspaceFileTreeHeightAtom,
  workspaceFileTreeCollapsedAtom,
  savedChatStatesCollapsedAtom,
  agentsSectionCollapsedAtom,
  skillsSectionCollapsedAtom,
  commandsSectionCollapsedAtom,
  mcpSectionCollapsedAtom,
  workspaceFileTreeAtomFamily,
  expandedFoldersAtomFamily,
  type FileTreeNode,
  type ActiveDocument,
} from "./documents"

// ============================================
// TASKS PANEL ATOMS
// ============================================

export {
  tasksAtom,
  tasksPanelOpenAtom,
  tasksPanelWidthAtom,
  type Task,
} from "../../features/tasks/index"

// ============================================
// AGENT BUILDER ATOMS
// ============================================

export {
  agentBuilderModalOpenAtom,
  agentBuilderSubChatIdAtom,
  agentBuilderEditingAgentAtom,
  agentBuilderModeAtom,
  agentBuilderPhaseAtom,
  agentBuilderDraftAtom,
  agentBuilderSourceAtom,
  type AgentBuilderPhase,
  type AgentDraft,
} from "./agent-builder"

// ============================================
// RIGHT SIDEBAR ATOMS
// ============================================

export {
  rightSidebarPanelAtom,
  rightSidebarDrawerWidthAtom,
  RIGHT_ACTION_BAR_WIDTH,
  type RightSidebarPanel,
} from "./right-sidebar"

// ============================================
// MODEL PROFILES DATABASE SYNC
// ============================================

/**
 * Convert DB profile format to frontend ModelProfile format
 */
export function dbProfileToModelProfile(dbProfile: {
  id: string
  name: string
  description: string | null
  config: string
  models: string
  isOffline: number
  createdAt: Date
  updatedAt: Date
}): ModelProfile {
  return {
    id: dbProfile.id,
    name: dbProfile.name,
    description: dbProfile.description || undefined,
    config: JSON.parse(dbProfile.config) as CustomClaudeConfig,
    models: JSON.parse(dbProfile.models) as string[],
    isOffline: dbProfile.isOffline === 1,
    createdAt: dbProfile.createdAt.getTime(),
    updatedAt: dbProfile.updatedAt.getTime(),
  }
}

/**
 * Convert frontend ModelProfile to DB format
 */
export function modelProfileToDbProfile(profile: ModelProfile): {
  id: string
  name: string
  description: string | null
  config: string
  models: string
  isOffline: number
  createdAt: number
  updatedAt: number
} {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description || null,
    config: JSON.stringify(profile.config),
    models: JSON.stringify(profile.models),
    isOffline: profile.isOffline ? 1 : 0,
    createdAt: profile.createdAt || Date.now(),
    updatedAt: profile.updatedAt || Date.now(),
  }
}

/**
 * Migrate localStorage profiles to database
 * Call this on app startup to ensure persistence
 */
export async function migrateLocalProfilesToDb(): Promise<void> {
  try {
    // Get profiles from localStorage
    const saved = localStorage.getItem("agents:model-profiles")
    if (!saved) return

    const profiles = JSON.parse(saved) as ModelProfile[]
    if (!Array.isArray(profiles) || profiles.length === 0) return

    // Import to database via tRPC
    const { trpc } = await import("../trpc")
    await trpc.modelProfiles.importFromLocalStorage.mutate(profiles)

    console.log(`[model-profiles] Migrated ${profiles.length} profiles to database`)
  } catch (error) {
    console.error("[model-profiles] Migration failed:", error)
  }
}

/**
 * Check if database has profiles and localStorage doesn't
 * If so, populate localStorage from database
 */
export async function syncProfilesFromDbToLocal(): Promise<ModelProfile[]> {
  try {
    const { trpcClient } = await import("../trpc")
    const dbProfiles = await trpcClient.modelProfiles.list.query()

    if (!dbProfiles || dbProfiles.length === 0) {
      return []
    }

    const profiles = dbProfiles.map(dbProfileToModelProfile)

    // Update localStorage
    localStorage.setItem("agents:model-profiles", JSON.stringify(profiles))

    console.log(`[model-profiles] Synced ${profiles.length} profiles from database to localStorage`)
    return profiles
  } catch (error) {
    console.error("[model-profiles] Sync from DB failed:", error)
    return []
  }
}

/**
 * Sync profiles to database (called after local changes)
 */
export async function syncProfilesToDb(profiles: ModelProfile[]): Promise<void> {
  try {
    const { trpcClient } = await import("../trpc")

    // Use bulk upsert to sync all profiles
    const dbProfiles = profiles.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      config: p.config,
      models: p.models,
      isOffline: p.isOffline,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))

    await trpcClient.modelProfiles.bulkUpsert.mutate(dbProfiles)
    console.log(`[model-profiles] Synced ${profiles.length} profiles to database`)
  } catch (error) {
    console.error("[model-profiles] Sync to DB failed:", error)
  }
}

/**
 * Initialize model profiles - checks if DB has profiles and syncs if needed
 * Returns the profiles to use (from DB if available, otherwise from localStorage)
 */
export async function initializeModelProfiles(): Promise<ModelProfile[]> {
  try {
    const { trpcClient } = await import("../trpc")

    // First try to get profiles from DB
    const dbProfiles = await trpcClient.modelProfiles.list.query()

    if (dbProfiles && dbProfiles.length > 0) {
      // DB has profiles - sync to localStorage and return
      const profiles = dbProfiles.map(dbProfileToModelProfile)
      localStorage.setItem("agents:model-profiles", JSON.stringify(profiles))
      console.log(`[model-profiles] Loaded ${profiles.length} profiles from database`)
      return profiles
    }

    // DB is empty - check localStorage for migration
    const saved = localStorage.getItem("agents:model-profiles")
    if (saved) {
      const localProfiles = JSON.parse(saved) as ModelProfile[]
      if (Array.isArray(localProfiles) && localProfiles.length > 0) {
        // Migrate local profiles to DB
        await migrateLocalProfilesToDb()
        console.log(`[model-profiles] Migrated ${localProfiles.length} profiles from localStorage`)
        return localProfiles
      }
    }

    // Neither has profiles - return empty (no custom profiles)
    return []
  } catch (error) {
    console.error("[model-profiles] Initialization failed:", error)
    // Fallback to localStorage
    try {
      const saved = localStorage.getItem("agents:model-profiles")
      if (saved) {
        return JSON.parse(saved) as ModelProfile[]
      }
    } catch {
      // Ignore
    }
    return []
  }
}
