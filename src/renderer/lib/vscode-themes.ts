/**
 * VS Code built-in themes available in Shiki
 * These themes are bundled with Shiki and can be used directly
 */

export interface VSCodeTheme {
  id: string
  name: string
  type: "light" | "dark"
  description?: string
  source: "builtin" | "vscode-extensions" | "imported"
}

/**
 * Built-in VS Code themes available in Shiki
 * These are the themes that come pre-bundled with Shiki
 */
export const VSCODE_BUILTIN_THEMES: VSCodeTheme[] = [
  { id: "github-dark", name: "GitHub Dark", type: "dark", source: "builtin" },
  { id: "github-light", name: "GitHub Light", type: "light", source: "builtin" },
  { id: "dark-plus", name: "Dark+ (default dark)", type: "dark", source: "builtin" },
  { id: "light-plus", name: "Light+ (default light)", type: "light", source: "builtin" },
  { id: "min-dark", name: "Min Dark", type: "dark", source: "builtin" },
  { id: "min-light", name: "Min Light", type: "light", source: "builtin" },
  { id: "slack-dark", name: "Slack Dark", type: "dark", source: "builtin" },
  { id: "slack-ochin", name: "Slack Ochin", type: "light", source: "builtin" },
  { id: "vitesse-dark", name: "Vitesse Dark", type: "dark", source: "builtin" },
  { id: "vitesse-light", name: "Vitesse Light", type: "light", source: "builtin" },
  { id: "material-theme-darker", name: "Material Theme Darker", type: "dark", source: "builtin" },
  { id: "material-theme", name: "Material Theme Default", type: "dark", source: "builtin" },
  { id: "material-theme-lighter", name: "Material Theme Lighter", type: "light", source: "builtin" },
  { id: "material-theme-ocean", name: "Material Theme Ocean", type: "dark", source: "builtin" },
  { id: "material-theme-palenight", name: "Material Theme Palenight", type: "dark", source: "builtin" },
  { id: "poimandres", name: "Poimandres", type: "dark", source: "builtin" },
  { id: "vesper", name: "Vesper", type: "dark", source: "builtin" },
]

/**
 * Get all themes filtered by type
 */
export function getThemesByType(type: "light" | "dark"): VSCodeTheme[] {
  return VSCODE_BUILTIN_THEMES.filter((theme) => theme.type === type)
}

/**
 * Get theme by ID
 */
export function getThemeById(id: string): VSCodeTheme | undefined {
  return VSCODE_BUILTIN_THEMES.find((theme) => theme.id === id)
}

/**
 * Check if theme ID is a built-in theme
 */
export function isBuiltinTheme(themeId: string): boolean {
  return VSCODE_BUILTIN_THEMES.some((theme) => theme.id === themeId)
}
