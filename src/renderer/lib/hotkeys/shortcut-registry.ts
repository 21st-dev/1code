import type {
  ShortcutAction,
  ShortcutActionId,
  ShortcutCategory,
  CustomHotkeysConfig,
  ShortcutConflict,
} from "./types"

/**
 * Master registry of all configurable shortcut actions
 * This is the single source of truth for default shortcuts
 */
export const ALL_SHORTCUT_ACTIONS: ShortcutAction[] = [
  // ============================================
  // GENERAL
  // ============================================
  {
    id: "show-shortcuts",
    label: "Show shortcuts",
    category: "general",
    defaultKeys: ["?"],
  },
  {
    id: "open-settings",
    label: "Settings",
    category: "general",
    defaultKeys: ["cmd", ","],
  },
  {
    id: "toggle-sidebar",
    label: "Toggle sidebar",
    category: "general",
    defaultKeys: ["cmd", "\\"],
  },
  {
    id: "toggle-details",
    label: "Toggle details",
    category: "general",
    defaultKeys: ["cmd", "shift", "D"],
  },
  {
    id: "undo-archive",
    label: "Undo archive",
    category: "general",
    defaultKeys: ["cmd", "Z"],
  },

  // ============================================
  // WORKSPACES
  // ============================================
  {
    id: "new-workspace",
    label: "New workspace",
    category: "workspaces",
    defaultKeys: ["cmd", "N"],
  },
  {
    id: "search-workspaces",
    label: "Search workspaces",
    category: "workspaces",
    defaultKeys: ["cmd", "K"],
  },
  {
    id: "archive-workspace",
    label: "Archive current workspace",
    category: "workspaces",
    defaultKeys: ["cmd", "E"],
  },
  {
    id: "quick-switch-workspaces",
    label: "Quick switch workspaces",
    category: "workspaces",
    defaultKeys: ["ctrl", "Tab"],
    isDynamic: true,
    dynamicDescription: "Controlled by Ctrl+Tab preference",
  },

  // ============================================
  // AGENTS
  // ============================================
  {
    id: "new-agent",
    label: "Create new agent",
    category: "agents",
    defaultKeys: ["cmd", "T"],
  },
  {
    id: "search-chats",
    label: "Search chats",
    category: "agents",
    defaultKeys: ["/"],
  },
  {
    id: "search-in-chat",
    label: "Search text in current chat",
    category: "agents",
    defaultKeys: ["cmd", "F"],
  },
  {
    id: "archive-agent",
    label: "Archive current agent",
    category: "agents",
    defaultKeys: ["cmd", "W"],
  },
  {
    id: "quick-switch-agents",
    label: "Quick switch agents",
    category: "agents",
    defaultKeys: ["opt", "ctrl", "Tab"],
    isDynamic: true,
    dynamicDescription: "Controlled by Ctrl+Tab preference",
  },
  {
    id: "prev-agent",
    label: "Previous agent",
    category: "agents",
    defaultKeys: ["cmd", "["],
  },
  {
    id: "next-agent",
    label: "Next agent",
    category: "agents",
    defaultKeys: ["cmd", "]"],
  },
  {
    id: "focus-input",
    label: "Focus input",
    category: "agents",
    defaultKeys: ["Enter"],
  },
  {
    id: "toggle-focus",
    label: "Toggle focus",
    category: "agents",
    defaultKeys: ["cmd", "Esc"],
  },
  {
    id: "stop-generation",
    label: "Stop generation",
    category: "agents",
    defaultKeys: ["Esc"],
    altKeys: ["ctrl", "C"],
  },
  {
    id: "switch-model",
    label: "Switch model",
    category: "agents",
    defaultKeys: ["cmd", "/"],
  },
  {
    id: "toggle-terminal",
    label: "Toggle terminal",
    category: "agents",
    defaultKeys: ["cmd", "J"],
  },
  {
    id: "open-diff",
    label: "Open diff",
    category: "agents",
    defaultKeys: ["cmd", "D"],
  },
  {
    id: "create-pr",
    label: "Create PR",
    category: "agents",
    defaultKeys: ["cmd", "P"],
  },
]

/**
 * Get shortcuts grouped by category
 */
export function getShortcutsByCategory(): Record<ShortcutCategory, ShortcutAction[]> {
  return {
    general: ALL_SHORTCUT_ACTIONS.filter((a) => a.category === "general"),
    workspaces: ALL_SHORTCUT_ACTIONS.filter((a) => a.category === "workspaces"),
    agents: ALL_SHORTCUT_ACTIONS.filter((a) => a.category === "agents"),
  }
}

/**
 * Get a shortcut action by ID
 */
export function getShortcutAction(id: ShortcutActionId): ShortcutAction | undefined {
  return ALL_SHORTCUT_ACTIONS.find((a) => a.id === id)
}

/**
 * Convert keys array to hotkey string
 * e.g., ["cmd", "shift", "N"] -> "cmd+shift+n"
 */
export function keysToHotkeyString(keys: string[]): string {
  return keys.map((k) => k.toLowerCase()).join("+")
}

/**
 * Convert hotkey string to keys array
 * e.g., "cmd+shift+n" -> ["cmd", "shift", "N"]
 */
export function hotkeyStringToKeys(hotkey: string): string[] {
  return hotkey.split("+").map((part) => {
    const lower = part.toLowerCase()
    // Capitalize non-modifier keys
    if (!["cmd", "ctrl", "opt", "alt", "shift", "meta"].includes(lower)) {
      return part.toUpperCase()
    }
    return lower
  })
}

/**
 * Get the resolved hotkey for an action considering custom overrides
 */
export function getResolvedHotkey(
  actionId: ShortcutActionId,
  config: CustomHotkeysConfig
): string | null {
  const customHotkey = config.bindings[actionId]

  // If explicitly set (including to a custom value), use it
  if (customHotkey !== undefined) {
    return customHotkey
  }

  // Otherwise use default
  const action = getShortcutAction(actionId)
  if (!action) return null

  return keysToHotkeyString(action.defaultKeys)
}

/**
 * Get the resolved keys array for an action
 */
export function getResolvedKeys(
  actionId: ShortcutActionId,
  config: CustomHotkeysConfig
): string[] | null {
  const hotkey = getResolvedHotkey(actionId, config)
  if (!hotkey) return null
  return hotkeyStringToKeys(hotkey)
}

/**
 * Check if an action has a custom (non-default) hotkey
 */
export function isCustomHotkey(
  actionId: ShortcutActionId,
  config: CustomHotkeysConfig
): boolean {
  return config.bindings[actionId] !== undefined
}

/**
 * Normalize a hotkey string for comparison
 * Handles modifier order and case
 */
export function normalizeHotkey(hotkey: string): string {
  const parts = hotkey.toLowerCase().split("+")

  // Define modifier order
  const modifierOrder = ["cmd", "meta", "ctrl", "opt", "alt", "shift"]

  const modifiers = parts.filter((p) =>
    ["cmd", "meta", "ctrl", "opt", "alt", "shift"].includes(p)
  )
  const key = parts.filter(
    (p) => !["cmd", "meta", "ctrl", "opt", "alt", "shift"].includes(p)
  )[0]

  // Sort modifiers
  modifiers.sort(
    (a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b)
  )

  // Normalize alt/opt
  const normalizedMods = modifiers.map((m) => (m === "alt" ? "opt" : m))
  // Normalize meta to cmd
  const finalMods = normalizedMods.map((m) => (m === "meta" ? "cmd" : m))

  return [...finalMods, key].join("+")
}

/**
 * Detect conflicts in hotkey configuration
 * Returns a map of actionId to array of conflicting actionIds
 */
export function detectConflicts(
  config: CustomHotkeysConfig
): Map<ShortcutActionId, ShortcutConflict> {
  const conflicts = new Map<ShortcutActionId, ShortcutConflict>()
  const hotkeyToActions = new Map<string, ShortcutActionId[]>()

  // Build map of normalized hotkey -> action IDs
  for (const action of ALL_SHORTCUT_ACTIONS) {
    const hotkey = getResolvedHotkey(action.id, config)
    if (!hotkey) continue

    const normalized = normalizeHotkey(hotkey)
    const existing = hotkeyToActions.get(normalized) || []
    existing.push(action.id)
    hotkeyToActions.set(normalized, existing)

    // Also check altKeys if they exist and not customized
    if (action.altKeys && !isCustomHotkey(action.id, config)) {
      const altNormalized = normalizeHotkey(keysToHotkeyString(action.altKeys))
      const altExisting = hotkeyToActions.get(altNormalized) || []
      altExisting.push(action.id)
      hotkeyToActions.set(altNormalized, altExisting)
    }
  }

  // Find conflicts (hotkeys with multiple actions)
  for (const [hotkey, actionIds] of hotkeyToActions) {
    if (actionIds.length > 1) {
      for (const actionId of actionIds) {
        conflicts.set(actionId, {
          actionId,
          conflictingActionIds: actionIds.filter((id) => id !== actionId),
          hotkey,
        })
      }
    }
  }

  return conflicts
}

/**
 * Display mapping for special keys
 */
const KEY_DISPLAY_MAP: Record<string, string> = {
  cmd: "⌘",
  meta: "⌘",
  ctrl: "⌃",
  opt: "⌥",
  alt: "⌥",
  shift: "⇧",
  enter: "↵",
  backspace: "⌫",
  delete: "⌦",
  escape: "Esc",
  esc: "Esc",
  tab: "Tab",
  space: "Space",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
}

/**
 * Convert a key to its display format
 */
export function keyToDisplay(key: string): string {
  const lower = key.toLowerCase()
  return KEY_DISPLAY_MAP[lower] || key.toUpperCase()
}

/**
 * Convert a hotkey string to display format
 * e.g., "cmd+shift+n" -> "⌘⇧N"
 */
export function hotkeyToDisplay(hotkey: string): string {
  return hotkey
    .split("+")
    .map((part) => keyToDisplay(part))
    .join("")
}

/**
 * Convert keys array to display format
 * e.g., ["cmd", "shift", "N"] -> "⌘⇧N"
 */
export function keysToDisplay(keys: string[]): string {
  return keys.map((k) => keyToDisplay(k)).join("")
}

/**
 * Category labels for UI
 */
export const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  general: "General",
  workspaces: "Workspaces",
  agents: "Agents",
}
