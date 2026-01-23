/**
 * Built-in VS Code themes with full color definitions
 * 
 * These themes include both UI colors and are compatible with Shiki for syntax highlighting.
 * Each theme has been curated to work well with the app's design system.
 */

import type { VSCodeFullTheme } from "../atoms"
import { CURSOR_DARK, CURSOR_LIGHT, CURSOR_MIDNIGHT } from "./cursor-themes"

/**
 * kCode Dark - Default dark theme matching the app's original design
 * Uses the brand blue (#0034FF) as primary/accent color
 */
const KCODE_DARK: VSCodeFullTheme = {
  id: "kcode-dark",
  name: "kCode Dark",
  type: "dark",
  source: "builtin",
  colors: {
    "editor.background": "#0a0a0a", // 240 10% 3.9%
    "editor.foreground": "#f4f4f5", // 240 4.8% 95.9%
    "foreground": "#f4f4f5",
    "sideBar.background": "#121212", // original tl-background (0 0% 7%)
    "sideBar.foreground": "#f4f4f5",
    "sideBar.border": "#27272a", // 240 3.7% 15.9%
    "activityBar.background": "#0a0a0a",
    "activityBar.foreground": "#f4f4f5",
    "panel.background": "#121212", // match sidebar
    "panel.border": "#27272a",
    "tab.activeBackground": "#0a0a0a",
    "tab.inactiveBackground": "#18181b", // 240 5.9% 10%
    "tab.inactiveForeground": "#a1a1aa", // 240 4.4% 58%
    "editorGroupHeader.tabsBackground": "#18181b",
    "dropdown.background": "#171717", // popover
    "dropdown.foreground": "#fafafa",
    "input.background": "#121212", // same as sidebar/tl-background
    "input.border": "#27272a",
    "input.foreground": "#f4f4f5",
    "focusBorder": "#0034ff", // primary blue
    "textLink.foreground": "#0034ff",
    "textLink.activeForeground": "#3366ff",
    "list.activeSelectionBackground": "#27272a",
    "list.hoverBackground": "#18181b",
    "editor.selectionBackground": "#0034ff44",
    "editorLineNumber.foreground": "#52525b",
    "descriptionForeground": "#a1a1aa",
    "errorForeground": "#ef4444",
    "button.background": "#0034ff", // primary
    "button.foreground": "#ffffff",
    "button.secondaryBackground": "#27272a",
    "button.secondaryForeground": "#fafafa",
    // Terminal colors
    "terminal.background": "#0a0a0a",
    "terminal.foreground": "#f4f4f5",
    "terminal.ansiBlack": "#18181b",
    "terminal.ansiRed": "#ef4444",
    "terminal.ansiGreen": "#22c55e",
    "terminal.ansiYellow": "#eab308",
    "terminal.ansiBlue": "#3b82f6",
    "terminal.ansiMagenta": "#a855f7",
    "terminal.ansiCyan": "#06b6d4",
    "terminal.ansiWhite": "#f4f4f5",
    "terminal.ansiBrightBlack": "#71717a",
    "terminal.ansiBrightRed": "#f87171",
    "terminal.ansiBrightGreen": "#4ade80",
    "terminal.ansiBrightYellow": "#facc15",
    "terminal.ansiBrightBlue": "#60a5fa",
    "terminal.ansiBrightMagenta": "#c084fc",
    "terminal.ansiBrightCyan": "#22d3ee",
    "terminal.ansiBrightWhite": "#fafafa",
  },
}

/**
 * kCode Light - Default light theme matching the app's original design
 * Uses the brand blue (#0034FF) as primary/accent color
 */
const KCODE_LIGHT: VSCodeFullTheme = {
  id: "kcode-light",
  name: "kCode Light",
  type: "light",
  source: "builtin",
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#0a0a0a", // 240 10% 3.9%
    "foreground": "#0a0a0a",
    "sideBar.background": "#FAFAFA", // original tl-background (0 0% 98%)
    "sideBar.foreground": "#0a0a0a",
    "sideBar.border": "#e4e4e7", // 240 5.9% 90%
    "activityBar.background": "#ffffff",
    "activityBar.foreground": "#0a0a0a",
    "panel.background": "#FAFAFA", // match sidebar
    "panel.border": "#e4e4e7",
    "tab.activeBackground": "#ffffff",
    "tab.inactiveBackground": "#f4f4f5", // 240 4.8% 95.9%
    "tab.inactiveForeground": "#71717a", // 240 3.8% 46.1%
    "editorGroupHeader.tabsBackground": "#f4f4f5",
    "dropdown.background": "#ffffff",
    "dropdown.foreground": "#0a0a0a",
    "input.background": "#FAFAFA", // same as sidebar/tl-background
    "input.border": "#e4e4e7",
    "input.foreground": "#0a0a0a",
    "focusBorder": "#0034ff", // primary blue
    "textLink.foreground": "#0034ff",
    "textLink.activeForeground": "#0028cc",
    "list.activeSelectionBackground": "#f4f4f5",
    "list.hoverBackground": "#f4f4f5",
    "editor.selectionBackground": "#0034ff33",
    "editorLineNumber.foreground": "#a1a1aa",
    "descriptionForeground": "#71717a",
    "errorForeground": "#dc2626",
    "button.background": "#0034ff", // primary
    "button.foreground": "#ffffff",
    "button.secondaryBackground": "#f4f4f5",
    "button.secondaryForeground": "#18181b",
    // Terminal colors
    "terminal.background": "#fafafa",
    "terminal.foreground": "#0a0a0a",
    "terminal.ansiBlack": "#18181b",
    "terminal.ansiRed": "#dc2626",
    "terminal.ansiGreen": "#16a34a",
    "terminal.ansiYellow": "#ca8a04",
    "terminal.ansiBlue": "#2563eb",
    "terminal.ansiMagenta": "#9333ea",
    "terminal.ansiCyan": "#0891b2",
    "terminal.ansiWhite": "#f4f4f5",
    "terminal.ansiBrightBlack": "#52525b",
    "terminal.ansiBrightRed": "#ef4444",
    "terminal.ansiBrightGreen": "#22c55e",
    "terminal.ansiBrightYellow": "#eab308",
    "terminal.ansiBrightBlue": "#3b82f6",
    "terminal.ansiBrightMagenta": "#a855f7",
    "terminal.ansiBrightCyan": "#06b6d4",
    "terminal.ansiBrightWhite": "#fafafa",
  },
}


/**
 * Vitesse Dark theme colors
 */
const VITESSE_DARK: VSCodeFullTheme = {
  id: "vitesse-dark",
  name: "Vitesse Dark",
  type: "dark",
  source: "builtin",
  colors: {
    "editor.background": "#121212",
    "editor.foreground": "#dbd7ca",
    "foreground": "#dbd7ca",
    "sideBar.background": "#121212",
    "sideBar.foreground": "#dbd7ca",
    "sideBar.border": "#1e1e1e",
    "activityBar.background": "#121212",
    "activityBar.foreground": "#dbd7ca",
    "panel.background": "#121212",
    "panel.border": "#1e1e1e",
    "tab.activeBackground": "#1e1e1e",
    "tab.inactiveBackground": "#121212",
    "tab.inactiveForeground": "#75715e",
    "editorGroupHeader.tabsBackground": "#121212",
    "dropdown.background": "#1e1e1e",
    "dropdown.foreground": "#dbd7ca",
    "input.background": "#1e1e1e",
    "input.border": "#2e2e2e",
    "input.foreground": "#dbd7ca",
    "focusBorder": "#4d9375",
    "textLink.foreground": "#4d9375",
    "textLink.activeForeground": "#5eaab5",
    "list.activeSelectionBackground": "#4d937530",
    "list.hoverBackground": "#1e1e1e",
    "editor.selectionBackground": "#4d937540",
    "editorLineNumber.foreground": "#444444",
    "descriptionForeground": "#75715e",
    "errorForeground": "#cb7676",
    "button.background": "#4d9375",
    "button.foreground": "#121212",
    "button.secondaryBackground": "#2e2e2e",
    "button.secondaryForeground": "#dbd7ca",
    // Terminal colors
    "terminal.background": "#121212",
    "terminal.foreground": "#dbd7ca",
    "terminal.ansiBlack": "#393a34",
    "terminal.ansiRed": "#cb7676",
    "terminal.ansiGreen": "#4d9375",
    "terminal.ansiYellow": "#e6cc77",
    "terminal.ansiBlue": "#6394bf",
    "terminal.ansiMagenta": "#d9739f",
    "terminal.ansiCyan": "#5eaab5",
    "terminal.ansiWhite": "#dbd7ca",
    "terminal.ansiBrightBlack": "#666666",
    "terminal.ansiBrightRed": "#cb7676",
    "terminal.ansiBrightGreen": "#4d9375",
    "terminal.ansiBrightYellow": "#e6cc77",
    "terminal.ansiBrightBlue": "#6394bf",
    "terminal.ansiBrightMagenta": "#d9739f",
    "terminal.ansiBrightCyan": "#5eaab5",
    "terminal.ansiBrightWhite": "#eeeeee",
  },
}

/**
 * Vitesse Light theme colors
 */
const VITESSE_LIGHT: VSCodeFullTheme = {
  id: "vitesse-light",
  name: "Vitesse Light",
  type: "light",
  source: "builtin",
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#393a34",
    "foreground": "#393a34",
    "sideBar.background": "#fafafa",
    "sideBar.foreground": "#393a34",
    "sideBar.border": "#eeeeee",
    "activityBar.background": "#fafafa",
    "activityBar.foreground": "#393a34",
    "panel.background": "#fafafa",
    "panel.border": "#eeeeee",
    "tab.activeBackground": "#ffffff",
    "tab.inactiveBackground": "#fafafa",
    "tab.inactiveForeground": "#999999",
    "editorGroupHeader.tabsBackground": "#fafafa",
    "dropdown.background": "#ffffff",
    "dropdown.foreground": "#393a34",
    "input.background": "#f5f5f5", // slightly gray for visibility
    "input.border": "#eeeeee",
    "input.foreground": "#393a34",
    "focusBorder": "#1e754f",
    "textLink.foreground": "#1e754f",
    "textLink.activeForeground": "#2993a3",
    "list.activeSelectionBackground": "#eeeeee66",
    "list.hoverBackground": "#f5f5f5",
    "editor.selectionBackground": "#22222215",
    "editorLineNumber.foreground": "#aaaaaa",
    "descriptionForeground": "#999999",
    "errorForeground": "#ab5959",
    "button.background": "#1e754f",
    "button.foreground": "#ffffff",
    "button.secondaryBackground": "#eeeeee",
    "button.secondaryForeground": "#393a34",
    // Terminal colors
    "terminal.background": "#fafafa", // match sidebar
    "terminal.foreground": "#393a34",
    "terminal.ansiBlack": "#393a34",
    "terminal.ansiRed": "#ab5959",
    "terminal.ansiGreen": "#1e754f",
    "terminal.ansiYellow": "#a65e2b",
    "terminal.ansiBlue": "#296aa3",
    "terminal.ansiMagenta": "#a13865",
    "terminal.ansiCyan": "#2993a3",
    "terminal.ansiWhite": "#b0b0b0",
    "terminal.ansiBrightBlack": "#777777",
    "terminal.ansiBrightRed": "#ab5959",
    "terminal.ansiBrightGreen": "#1e754f",
    "terminal.ansiBrightYellow": "#a65e2b",
    "terminal.ansiBrightBlue": "#296aa3",
    "terminal.ansiBrightMagenta": "#a13865",
    "terminal.ansiBrightCyan": "#2993a3",
    "terminal.ansiBrightWhite": "#393a34",
  },
}


/**
 * Min Dark theme colors (minimal dark theme)
 */
const MIN_DARK: VSCodeFullTheme = {
  id: "min-dark",
  name: "Min Dark",
  type: "dark",
  source: "builtin",
  colors: {
    "editor.background": "#1f1f1f",
    "editor.foreground": "#d4d4d4",
    "foreground": "#d4d4d4",
    "sideBar.background": "#181818",
    "sideBar.foreground": "#d4d4d4",
    "sideBar.border": "#252525",
    "activityBar.background": "#181818",
    "activityBar.foreground": "#d4d4d4",
    "panel.background": "#1f1f1f",
    "panel.border": "#252525",
    "tab.activeBackground": "#1f1f1f",
    "tab.inactiveBackground": "#181818",
    "tab.inactiveForeground": "#6e6e6e",
    "editorGroupHeader.tabsBackground": "#181818",
    "dropdown.background": "#252525",
    "dropdown.foreground": "#d4d4d4",
    "input.background": "#181818",
    "input.border": "#3c3c3c",
    "input.foreground": "#d4d4d4",
    "focusBorder": "#6ca1ef",
    "textLink.foreground": "#6ca1ef",
    "textLink.activeForeground": "#89b4fa",
    "list.activeSelectionBackground": "#2a2a2a",
    "list.hoverBackground": "#252525",
    "editor.selectionBackground": "#264f78",
    "editorLineNumber.foreground": "#5a5a5a",
    "descriptionForeground": "#6e6e6e",
    "errorForeground": "#f48771",
    "button.background": "#6ca1ef",
    "button.foreground": "#1f1f1f",
    "button.secondaryBackground": "#3c3c3c",
    "button.secondaryForeground": "#d4d4d4",
    // Terminal colors
    "terminal.background": "#1f1f1f",
    "terminal.foreground": "#d4d4d4",
    "terminal.ansiBlack": "#1f1f1f",
    "terminal.ansiRed": "#f48771",
    "terminal.ansiGreen": "#89d185",
    "terminal.ansiYellow": "#e5c07b",
    "terminal.ansiBlue": "#6ca1ef",
    "terminal.ansiMagenta": "#d38aea",
    "terminal.ansiCyan": "#4ec9b0",
    "terminal.ansiWhite": "#d4d4d4",
    "terminal.ansiBrightBlack": "#6e6e6e",
    "terminal.ansiBrightRed": "#f48771",
    "terminal.ansiBrightGreen": "#89d185",
    "terminal.ansiBrightYellow": "#e5c07b",
    "terminal.ansiBrightBlue": "#6ca1ef",
    "terminal.ansiBrightMagenta": "#d38aea",
    "terminal.ansiBrightCyan": "#4ec9b0",
    "terminal.ansiBrightWhite": "#e5e5e5",
  },
}

/**
 * Vesper Dark theme colors
 * By Rauno Freiberg - https://github.com/raunofreiberg/vesper
 */
const VESPER_DARK: VSCodeFullTheme = {
  id: "vesper-dark",
  name: "Vesper",
  type: "dark",
  source: "builtin",
  colors: {
    "editor.background": "#101010",
    "editorPane.background": "#101010",
    "editor.foreground": "#FFFFFF",
    "foreground": "#FFFFFF",
    "sideBar.background": "#101010",
    "sideBar.foreground": "#A0A0A0",
    "sideBar.border": "#232323",
    "activityBar.background": "#101010",
    "activityBar.foreground": "#A0A0A0",
    "activityBarBadge.background": "#FFC799",
    "activityBarBadge.foreground": "#000000",
    "panel.background": "#101010",
    "panel.border": "#232323",
    "tab.activeBackground": "#161616",
    "tab.inactiveBackground": "#101010",
    "tab.inactiveForeground": "#505050",
    "editorGroupHeader.tabsBackground": "#101010",
    "dropdown.background": "#161616",
    "dropdown.foreground": "#FFFFFF",
    "input.background": "#1B1B1B",
    "input.border": "#282828",
    "input.foreground": "#FFFFFF",
    "focusBorder": "#FFC799",
    "textLink.foreground": "#FFC799",
    "textLink.activeForeground": "#FFCFA8",
    "list.activeSelectionBackground": "#232323",
    "list.hoverBackground": "#282828",
    "editor.selectionBackground": "#FFFFFF25",
    "editorLineNumber.foreground": "#505050",
    "descriptionForeground": "#A0A0A0",
    "errorForeground": "#FF8080",
    "button.background": "#FFC799",
    "button.foreground": "#000000",
    "button.secondaryBackground": "#232323",
    "button.secondaryForeground": "#FFFFFF",
    // Terminal colors
    "terminal.background": "#101010",
    "terminal.foreground": "#FFFFFF",
    "terminal.ansiBlack": "#1C1C1C",
    "terminal.ansiRed": "#FF8080",
    "terminal.ansiGreen": "#99FFE4",
    "terminal.ansiYellow": "#FFC799",
    "terminal.ansiBlue": "#A0A0A0",
    "terminal.ansiMagenta": "#FFC799",
    "terminal.ansiCyan": "#99FFE4",
    "terminal.ansiWhite": "#FFFFFF",
    "terminal.ansiBrightBlack": "#505050",
    "terminal.ansiBrightRed": "#FF8080",
    "terminal.ansiBrightGreen": "#99FFE4",
    "terminal.ansiBrightYellow": "#FFC799",
    "terminal.ansiBrightBlue": "#A0A0A0",
    "terminal.ansiBrightMagenta": "#FFC799",
    "terminal.ansiBrightCyan": "#99FFE4",
    "terminal.ansiBrightWhite": "#FFFFFF",
  },
}

/**
 * Min Light theme colors (minimal light theme)
 */
const MIN_LIGHT: VSCodeFullTheme = {
  id: "min-light",
  name: "Min Light",
  type: "light",
  source: "builtin",
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#1f1f1f",
    "foreground": "#1f1f1f",
    "sideBar.background": "#f3f3f3",
    "sideBar.foreground": "#1f1f1f",
    "sideBar.border": "#e0e0e0",
    "activityBar.background": "#f3f3f3",
    "activityBar.foreground": "#1f1f1f",
    "panel.background": "#f3f3f3", // match sidebar
    "panel.border": "#e0e0e0",
    "tab.activeBackground": "#ffffff",
    "tab.inactiveBackground": "#f3f3f3",
    "tab.inactiveForeground": "#717171",
    "editorGroupHeader.tabsBackground": "#f3f3f3",
    "dropdown.background": "#ffffff",
    "dropdown.foreground": "#1f1f1f",
    "input.background": "#f3f3f3", // match sidebar for visibility
    "input.border": "#cecece",
    "input.foreground": "#1f1f1f",
    "focusBorder": "#0451a5",
    "textLink.foreground": "#0451a5",
    "textLink.activeForeground": "#0066cc",
    "list.activeSelectionBackground": "#e8e8e8",
    "list.hoverBackground": "#f3f3f3",
    "editor.selectionBackground": "#add6ff",
    "editorLineNumber.foreground": "#6e7681",
    "descriptionForeground": "#717171",
    "errorForeground": "#d32f2f",
    "button.background": "#0451a5",
    "button.foreground": "#ffffff",
    "button.secondaryBackground": "#e0e0e0",
    "button.secondaryForeground": "#1f1f1f",
    // Terminal colors
    "terminal.background": "#f3f3f3", // match sidebar
    "terminal.foreground": "#1f1f1f",
    "terminal.ansiBlack": "#1f1f1f",
    "terminal.ansiRed": "#cd3131",
    "terminal.ansiGreen": "#14ce14",
    "terminal.ansiYellow": "#949800",
    "terminal.ansiBlue": "#0451a5",
    "terminal.ansiMagenta": "#bc05bc",
    "terminal.ansiCyan": "#0598bc",
    "terminal.ansiWhite": "#a5a5a5",
    "terminal.ansiBrightBlack": "#717171",
    "terminal.ansiBrightRed": "#cd3131",
    "terminal.ansiBrightGreen": "#14ce14",
    "terminal.ansiBrightYellow": "#b5ba00",
    "terminal.ansiBrightBlue": "#0451a5",
    "terminal.ansiBrightMagenta": "#bc05bc",
    "terminal.ansiBrightCyan": "#0598bc",
    "terminal.ansiBrightWhite": "#1f1f1f",
  },
}

/**
 * Claude Light theme colors
 * Warm, beige tones with orange accent (Claude's signature color)
 */
const CLAUDE_LIGHT: VSCodeFullTheme = {
  id: "claude-light",
  name: "Claude Light",
  type: "light",
  source: "builtin",
  colors: {
    "editor.background": "#FAF9F5",
    "editorPane.background": "#FAF9F5",
    "editor.foreground": "#4a4538",
    "foreground": "#4a4538",
    "sideBar.background": "#FAF9F5",
    "sideBar.foreground": "#4a4538",
    "sideBar.border": "#e5e3de",
    "activityBar.background": "#FAF9F5",
    "activityBar.foreground": "#4a4538",
    "panel.background": "#FAF9F5",
    "panel.border": "#e5e3de",
    "tab.activeBackground": "#FAF9F5",
    "tab.inactiveBackground": "#f5f4f1",
    "tab.inactiveForeground": "#8b8578",
    "editorGroupHeader.tabsBackground": "#f5f4f1",
    "dropdown.background": "#ffffff",
    "dropdown.foreground": "#4a4538",
    "input.background": "#ffffff",
    "input.border": "#d5d3ce",
    "input.foreground": "#4a4538",
    "focusBorder": "#D97857",
    "textLink.foreground": "#D97857",
    "textLink.activeForeground": "#C4684A",
    "list.activeSelectionBackground": "#e8e5dd",
    "list.hoverBackground": "#f0ede7",
    "editor.selectionBackground": "#D9785733",
    "editorLineNumber.foreground": "#a5a193",
    "descriptionForeground": "#8b8578",
    "errorForeground": "#dc2626",
    "button.background": "#D97857",
    "button.foreground": "#ffffff",
    "button.secondaryBackground": "#e8e5dd",
    "button.secondaryForeground": "#4a4538",
    // Terminal colors
    "terminal.background": "#FAF9F5",
    "terminal.foreground": "#4a4538",
    "terminal.ansiBlack": "#4a4538",
    "terminal.ansiRed": "#dc2626",
    "terminal.ansiGreen": "#16a34a",
    "terminal.ansiYellow": "#D97857",
    "terminal.ansiBlue": "#2563eb",
    "terminal.ansiMagenta": "#9333ea",
    "terminal.ansiCyan": "#0891b2",
    "terminal.ansiWhite": "#e5e3de",
    "terminal.ansiBrightBlack": "#8b8578",
    "terminal.ansiBrightRed": "#ef4444",
    "terminal.ansiBrightGreen": "#22c55e",
    "terminal.ansiBrightYellow": "#f59e0b",
    "terminal.ansiBrightBlue": "#3b82f6",
    "terminal.ansiBrightMagenta": "#a855f7",
    "terminal.ansiBrightCyan": "#06b6d4",
    "terminal.ansiBrightWhite": "#FAF9F5",
  },
}

/**
 * Claude Dark theme colors
 * Warm dark tones with orange accent (Claude's signature color)
 */
const CLAUDE_DARK: VSCodeFullTheme = {
  id: "claude-dark",
  name: "Claude Dark",
  type: "dark",
  source: "builtin",
  colors: {
    "editor.background": "#262624",
    "editorPane.background": "#262624",
    "editor.foreground": "#c9c5bc",
    "foreground": "#c9c5bc",
    "sideBar.background": "#262624",
    "sideBar.foreground": "#c9c5bc",
    "sideBar.border": "#3a3937",
    "activityBar.background": "#262624",
    "activityBar.foreground": "#c9c5bc",
    "panel.background": "#262624",
    "panel.border": "#3d3a36",
    "tab.activeBackground": "#262624",
    "tab.inactiveBackground": "#262624",
    "tab.inactiveForeground": "#8a857c",
    "editorGroupHeader.tabsBackground": "#232120",
    "dropdown.background": "#383633",
    "dropdown.foreground": "#c9c5bc",
    "input.background": "#232120",
    "input.border": "#4a4742",
    "input.foreground": "#c9c5bc",
    "focusBorder": "#D97857",
    "textLink.foreground": "#D97857",
    "textLink.activeForeground": "#E8917A",
    "list.activeSelectionBackground": "#3d3a36",
    "list.hoverBackground": "#353230",
    "editor.selectionBackground": "#D9785744",
    "editorLineNumber.foreground": "#6b6660",
    "descriptionForeground": "#8a857c",
    "errorForeground": "#ef4444",
    "button.background": "#D97857",
    "button.foreground": "#ffffff",
    "button.secondaryBackground": "#3d3a36",
    "button.secondaryForeground": "#c9c5bc",
    // Terminal colors
    "terminal.background": "#262624",
    "terminal.foreground": "#c9c5bc",
    "terminal.ansiBlack": "#232120",
    "terminal.ansiRed": "#ef4444",
    "terminal.ansiGreen": "#22c55e",
    "terminal.ansiYellow": "#D97857",
    "terminal.ansiBlue": "#3b82f6",
    "terminal.ansiMagenta": "#a855f7",
    "terminal.ansiCyan": "#06b6d4",
    "terminal.ansiWhite": "#c9c5bc",
    "terminal.ansiBrightBlack": "#6b6660",
    "terminal.ansiBrightRed": "#f87171",
    "terminal.ansiBrightGreen": "#4ade80",
    "terminal.ansiBrightYellow": "#fbbf24",
    "terminal.ansiBrightBlue": "#60a5fa",
    "terminal.ansiBrightMagenta": "#c084fc",
    "terminal.ansiBrightCyan": "#22d3ee",
    "terminal.ansiBrightWhite": "#e5e3de",
  },
}

/**
 * All built-in themes
 */
export const BUILTIN_THEMES: VSCodeFullTheme[] = [
  // kCode Default themes (first)
  KCODE_DARK,
  KCODE_LIGHT,
  // Cursor themes
  CURSOR_DARK,
  CURSOR_LIGHT,
  CURSOR_MIDNIGHT,
  // Dark themes
  CLAUDE_DARK,
  VESPER_DARK,
  VITESSE_DARK,
  MIN_DARK,
  // Light themes
  CLAUDE_LIGHT,
  VITESSE_LIGHT,
  MIN_LIGHT,
]

/**
 * Get theme by ID
 */
export function getBuiltinThemeById(id: string): VSCodeFullTheme | undefined {
  return BUILTIN_THEMES.find((theme) => theme.id === id)
}

/**
 * Get themes by type
 */
export function getBuiltinThemesByType(type: "light" | "dark"): VSCodeFullTheme[] {
  return BUILTIN_THEMES.filter((theme) => theme.type === type)
}

/**
 * Default theme IDs for light/dark modes
 */
export const DEFAULT_LIGHT_THEME_ID = "kcode-light"
export const DEFAULT_DARK_THEME_ID = "kcode-dark"
