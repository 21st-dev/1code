import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { desktopViewAtom as _desktopViewAtom } from "../../features/agents/atoms"

// ============================================
// RE-EXPORT FROM FEATURES/AGENTS/ATOMS (source of truth)
// ============================================

export {
  // Chat atoms
  selectedAgentChatIdAtom,
  subChatModeAtomFamily,
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
  type AgentMode,

  // Mode utilities
  AGENT_MODES,
  getNextMode,

  // Desktop view navigation (Automations / Inbox)
  desktopViewAtom,
  automationDetailIdAtom,
  automationTemplateParamsAtom,
  inboxSelectedChatIdAtom,
  agentsInboxSidebarWidthAtom,
  inboxMobileViewModeAtom,
  type DesktopView,
  type AutomationTemplateParams,
  type InboxMobileViewMode,
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
  | "plugins"
  | "worktrees"
  | "projects"
  | "debug"
  | "beta"
  | "keyboard"
export const agentsSettingsDialogActiveTabAtom = atom<SettingsTab>("preferences")
// Derived atom: maps settings open/close to desktopView navigation
export const agentsSettingsDialogOpenAtom = atom(
  (get) => get(_desktopViewAtom) === "settings",
  (_get, set, open: boolean) => {
    set(_desktopViewAtom, open ? "settings" : null)
  }
)

export type CustomClaudeConfig = {
  model: string
  token: string
  baseUrl: string
}

// Model profile system - support multiple configs
export type ModelProfile = {
  id: string
  name: string
  config: CustomClaudeConfig
  isOffline?: boolean // Mark as offline/Ollama profile
}

// Selected Ollama model for offline mode
export const selectedOllamaModelAtom = atomWithStorage<string | null>(
  "agents:selected-ollama-model",
  null, // null = use recommended model
  undefined,
  { getOnInit: true },
)

// Helper to get offline profile with selected model
export const getOfflineProfile = (modelName?: string | null): ModelProfile => ({
  id: 'offline-ollama',
  name: 'Offline (Ollama)',
  isOffline: true,
  config: {
    model: modelName || 'qwen2.5-coder:7b',
    token: 'ollama',
    baseUrl: 'http://localhost:11434',
  },
})

// Predefined offline profile for Ollama (legacy, uses default model)
export const OFFLINE_PROFILE: ModelProfile = {
  id: 'offline-ollama',
  name: 'Offline (Ollama)',
  isOffline: true,
  config: {
    model: 'qwen2.5-coder:7b',
    token: 'ollama',
    baseUrl: 'http://localhost:11434',
  },
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

// OpenAI API key for voice transcription (for users without paid subscription)
export const openaiApiKeyAtom = atomWithStorage<string>(
  "agents:openai-api-key",
  "",
  undefined,
  { getOnInit: true },
)

// New: Model profiles storage
export const modelProfilesAtom = atomWithStorage<ModelProfile[]>(
  "agents:model-profiles",
  [OFFLINE_PROFILE], // Start with offline profile
  undefined,
  { getOnInit: true },
)

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
  true,
  undefined,
  { getOnInit: true },
)

// Preferences - History (Rollback)
// When enabled, allow rollback to previous assistant messages
export const historyEnabledAtom = atomWithStorage<boolean>(
  "preferences:history-enabled",
  false, // Default OFF — beta feature
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

// Preferences - Notify When Focused
// When enabled, show desktop notifications even when the app window is focused
// (e.g. when working in a different chat). When disabled, only notify when the app is in the background.
export const notifyWhenFocusedAtom = atomWithStorage<boolean>(
  "preferences:notify-when-focused",
  false,
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

// Kanban board view
// When enabled, shows Kanban button in sidebar to view workspaces as a board
export const betaKanbanEnabledAtom = atomWithStorage<boolean>(
  "preferences:beta-kanban-enabled",
  true, // Default ON — graduated from beta
  undefined,
  { getOnInit: true },
)

// Beta: Enable Automations & Inbox
// When enabled, shows Automations and Inbox navigation in sidebar
export const betaAutomationsEnabledAtom = atomWithStorage<boolean>(
  "preferences:beta-automations-enabled",
  false, // Default OFF
  undefined,
  { getOnInit: true },
)

// Beta: Enable Tasks functionality in Claude Code SDK
// When enabled (default), the SDK exposes task-related tools (TodoWrite, Task agents)
export const enableTasksAtom = atomWithStorage<boolean>(
  "preferences:enable-tasks",
  true, // Default ON
  undefined,
  { getOnInit: true },
)

// Beta: Enable Early Access Updates
// When enabled, the app checks for beta releases in addition to stable releases
export const betaUpdatesEnabledAtom = atomWithStorage<boolean>(
  "preferences:beta-updates-enabled",
  false, // Default OFF - only stable releases
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

// Preferences - Auto-advance after archive
// Controls where to navigate after archiving a workspace
export type AutoAdvanceTarget = "next" | "previous" | "close"
export const autoAdvanceTargetAtom = atomWithStorage<AutoAdvanceTarget>(
  "preferences:auto-advance-target",
  "next", // Default: go to next workspace
  undefined,
  { getOnInit: true },
)

// Preferences - Default Agent Mode
// Controls what mode new chats/sub-chats start in (Plan = read-only, Agent = can edit)
// Re-using AgentMode type from features/agents/atoms
import { type AgentMode as AgentModeType } from "../../features/agents/atoms"

// Migration: convert old isPlanMode boolean to new defaultAgentMode string
// This runs once when the module loads
if (typeof window !== "undefined") {
  const oldKey = "agents:isPlanMode"
  const newKey = "preferences:default-agent-mode"
  const oldValue = localStorage.getItem(oldKey)
  if (oldValue !== null && localStorage.getItem(newKey) === null) {
    // Old value was JSON boolean, new value is JSON string
    const wasInPlanMode = oldValue === "true"
    localStorage.setItem(newKey, JSON.stringify(wasInPlanMode ? "plan" : "agent"))
    localStorage.removeItem(oldKey)
    console.log("[atoms] Migrated isPlanMode to defaultAgentMode:", wasInPlanMode ? "plan" : "agent")
  }
}

export const defaultAgentModeAtom = atomWithStorage<AgentModeType>(
  "preferences:default-agent-mode",
  "agent", // Default to agent mode
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
 * Always expand to-do list
 * When enabled, to-do lists are always shown expanded (full list view)
 * When disabled (default), to-do lists start collapsed and can be expanded manually
 */
export const alwaysExpandTodoListAtom = atomWithStorage<boolean>(
  "preferences:always-expand-todo-list",
  false, // Collapsed by default
  undefined,
  { getOnInit: true },
)

/**
 * Cached full theme data for the selected theme
 * This is populated when a theme is selected and used for applying CSS variables
 */
export const fullThemeDataAtom = atom<VSCodeFullTheme | null>(null)

/**
 * Imported themes from VS Code extensions
 * Persisted in localStorage, loaded on app start
 */
export const importedThemesAtom = atomWithStorage<VSCodeFullTheme[]>(
  "preferences:imported-themes",
  [],
  undefined,
  { getOnInit: true },
)

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

export type MCPServerIcon = {
  src: string
  mimeType?: string
  sizes?: string[]
  theme?: "light" | "dark"
}

export type MCPServer = {
  name: string
  status: MCPServerStatus
  serverInfo?: {
    name: string
    version: string
    icons?: MCPServerIcon[]
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
// CHAT SOURCE MODE (Local vs Sandbox)
// ============================================

// Chat source toggle: "local" = worktree chats (SQLite), "sandbox" = remote sandbox chats
export type ChatSourceMode = "local" | "sandbox"

export const chatSourceModeAtom = atomWithStorage<ChatSourceMode>(
  "agents:chat-source-mode",
  "local",
  undefined,
  { getOnInit: true },
)

// ============================================
// DEV TOOLS UNLOCK (Hidden feature)
// ============================================

// DevTools unlock state (hidden feature - click Beta tab 5 times to enable)
// Persisted per-session only (not in localStorage for security)
export const devToolsUnlockedAtom = atom<boolean>(false)

// ============================================
// PREFERRED EDITOR
// ============================================

import type { ExternalApp } from "../../../shared/external-apps"

export const preferredEditorAtom = atomWithStorage<ExternalApp>(
  "preferences:preferred-editor",
  "cursor",
  undefined,
  { getOnInit: true },
)

// ============================================
// MCP APPROVAL DIALOG ATOMS
// ============================================

export type PendingMcpApproval = {
  pluginSource: string
  serverName: string
  identifier: string
  config: Record<string, unknown>
}

// Whether the MCP approval dialog is open
export const mcpApprovalDialogOpenAtom = atom<boolean>(false)

// Pending MCP approvals to show in the dialog
export const pendingMcpApprovalsAtom = atom<PendingMcpApproval[]>([])
