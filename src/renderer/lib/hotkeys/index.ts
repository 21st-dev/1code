// Types
export type {
  ShortcutActionId,
  ShortcutCategory,
  ShortcutAction,
  CustomHotkeysConfig,
  ShortcutConflict,
} from "./types"

// Registry
export {
  ALL_SHORTCUT_ACTIONS,
  getShortcutsByCategory,
  getShortcutAction,
  keysToHotkeyString,
  hotkeyStringToKeys,
  getResolvedHotkey,
  getResolvedKeys,
  isCustomHotkey,
  normalizeHotkey,
  detectConflicts,
  keyToDisplay,
  hotkeyToDisplay,
  keysToDisplay,
  CATEGORY_LABELS,
} from "./shortcut-registry"

// Hooks
export { useHotkeyRecorder } from "./use-hotkey-recorder"
export type {
  UseHotkeyRecorderOptions,
  UseHotkeyRecorderResult,
} from "./use-hotkey-recorder"

export {
  useResolvedHotkeyDisplay,
  useResolvedHotkeyDisplayWithAlt,
} from "./use-resolved-hotkey-display"
