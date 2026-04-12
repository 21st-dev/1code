import type { ITerminalOptions, ITheme } from "xterm"
import { extractTerminalTheme } from "@/lib/themes/terminal-theme-mapper"

// Nerd Fonts first for shell theme compatibility (Oh My Posh, Powerlevel10k, etc.)
// Geist Mono added for consistency with app font
const TERMINAL_FONT_FAMILY = [
  "Geist Mono",
  "MesloLGM Nerd Font",
  "MesloLGM NF",
  "MesloLGS NF",
  "MesloLGS Nerd Font",
  "Hack Nerd Font",
  "FiraCode Nerd Font",
  "JetBrainsMono Nerd Font",
  "CaskaydiaCove Nerd Font",
  "Menlo",
  "Monaco",
  '"Courier New"',
  "monospace",
].join(", ")

/**
 * Dark terminal theme synchronized with the app's design system.
 * Colors are based on Tailwind's zinc palette and CSS variables.
 * 
 * Dark theme values:
 * - --background: hsl(240, 10%, 3.9%) = #0a0a0a
 * - --foreground: hsl(240, 4.8%, 95.9%) = #f4f4f5
 * - --tl-background: hsl(0, 0%, 7%) = #121212
 * - --muted-foreground: hsl(240, 4.4%, 58%) = #8c8c94
 * - --primary: #0034FF
 */
export const TERMINAL_THEME_DARK: ITheme = {
  // Background matches --tl-background (timeline/content area)
  background: "#121212",
  foreground: "#f4f4f5",
  
  // Cursor matches foreground for clean look
  cursor: "#f4f4f5",
  cursorAccent: "#121212",
  
  // Selection - subtle highlight
  selectionBackground: "#3f3f46",
  selectionForeground: "#ffffff",
  
  // ANSI colors (zinc palette + Tailwind colors)
  black: "#18181b",          // zinc-900
  red: "#ef4444",            // red-500
  green: "#22c55e",          // green-500
  yellow: "#eab308",         // yellow-500
  blue: "#0034FF",           // --primary (brand blue)
  magenta: "#a855f7",        // purple-500
  cyan: "#06b6d4",           // cyan-500
  white: "#f4f4f5",          // zinc-100
  
  // Bright variants
  brightBlack: "#71717a",    // zinc-500 (matches --muted-foreground)
  brightRed: "#f87171",      // red-400
  brightGreen: "#4ade80",    // green-400
  brightYellow: "#facc15",   // yellow-400
  brightBlue: "#3b82f6",     // blue-500
  brightMagenta: "#c084fc",  // purple-400
  brightCyan: "#22d3ee",     // cyan-400
  brightWhite: "#fafafa",    // zinc-50
}

/**
 * Light terminal theme synchronized with the app's design system.
 * 
 * Light theme values:
 * - --background: hsl(0, 0%, 100%) = #ffffff
 * - --foreground: hsl(240, 10%, 3.9%) = #0a0a0a
 * - --tl-background: hsl(0, 0%, 98%) = #fafafa
 * - --muted-foreground: hsl(240, 3.8%, 46.1%) = #717179
 * - --primary: #0034FF
 */
export const TERMINAL_THEME_LIGHT: ITheme = {
  // Background matches --tl-background (timeline/content area)
  background: "#fafafa",
  foreground: "#0a0a0a",
  
  // Cursor matches foreground for clean look
  cursor: "#0a0a0a",
  cursorAccent: "#fafafa",
  
  // Selection - subtle highlight
  selectionBackground: "#d4d4d8",
  selectionForeground: "#0a0a0a",
  
  // ANSI colors (adjusted for light background)
  black: "#18181b",          // zinc-900
  red: "#dc2626",            // red-600 (darker for light bg)
  green: "#16a34a",          // green-600
  yellow: "#ca8a04",         // yellow-600
  blue: "#0034FF",           // --primary (brand blue)
  magenta: "#9333ea",        // purple-600
  cyan: "#0891b2",           // cyan-600
  white: "#f4f4f5",          // zinc-100
  
  // Bright variants (standard colors work well on light)
  brightBlack: "#52525b",    // zinc-600
  brightRed: "#ef4444",      // red-500
  brightGreen: "#22c55e",    // green-500
  brightYellow: "#eab308",   // yellow-500
  brightBlue: "#3b82f6",     // blue-500
  brightMagenta: "#a855f7",  // purple-500
  brightCyan: "#06b6d4",     // cyan-500
  brightWhite: "#fafafa",    // zinc-50
}

/** @deprecated Use TERMINAL_THEME_DARK instead */
export const TERMINAL_THEME = TERMINAL_THEME_DARK

/**
 * Get terminal theme based on current app theme
 */
export function getTerminalTheme(isDark: boolean): ITheme {
  return isDark ? TERMINAL_THEME_DARK : TERMINAL_THEME_LIGHT
}

/**
 * Get terminal theme from VS Code theme colors
 * Falls back to default themes if colors are not provided
 */
export function getTerminalThemeFromVSCode(
  themeColors: Record<string, string> | null | undefined,
  isDark: boolean,
): ITheme {
  if (!themeColors) {
    return getTerminalTheme(isDark)
  }
  return extractTerminalTheme(themeColors)
}

/**
 * Returns appropriate line height for a given font size.
 * Smaller fonts need tighter line height to avoid feeling overly spaced out;
 * larger fonts can breathe more. Values tuned for terminal readability.
 */
export function getTerminalLineHeight(fontSize: number): number {
  if (fontSize <= 11) return 1.3
  if (fontSize <= 13) return 1.35
  if (fontSize <= 16) return 1.4
  return 1.45
}

export const TERMINAL_OPTIONS: ITerminalOptions = {
  cursorBlink: true,
  // Font size matches app's compact UI (text-xs = 12px, text-sm = 14px)
  fontSize: 13,
  lineHeight: getTerminalLineHeight(13),
  fontFamily: TERMINAL_FONT_FAMILY,
  theme: TERMINAL_THEME_DARK, // Default, will be overridden dynamically
  allowProposedApi: true,
  scrollback: 10000,
  macOptionIsMeta: true,
  cursorStyle: "block",
  cursorInactiveStyle: "outline",
  fastScrollModifier: "alt",
  fastScrollSensitivity: 5,
  // Better letter spacing for code readability
  letterSpacing: 0,
}

export const RESIZE_DEBOUNCE_MS = 150
