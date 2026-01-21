import * as shiki from "shiki"
import { isBuiltinTheme } from "../vscode-themes"
import { getBuiltinThemeById } from "./builtin-themes"
import type { VSCodeFullTheme } from "../atoms"

/**
 * Shared Shiki highlighter instance
 * Initialized with default themes, can load additional themes dynamically
 */
let highlighterPromise: Promise<shiki.Highlighter> | null = null

// ============================================================================
// LRU CACHE FOR HIGHLIGHT RESULTS
// ============================================================================
// Prevents re-highlighting the same code when switching tabs.
// Key: `${themeId}:${language}:${code}` -> Value: highlighted HTML
// Max 500 entries (~5MB assuming 10KB average per entry)
const HIGHLIGHT_CACHE_MAX_SIZE = 500

class LRUCache<K, V> {
  private cache = new Map<K, V>()
  private maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  set(key: K, value: V): void {
    // Delete first to ensure it's at the end
    this.cache.delete(key)
    this.cache.set(key, value)

    // Evict oldest entries if over capacity
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }
}

const highlightCache = new LRUCache<string, string>(HIGHLIGHT_CACHE_MAX_SIZE)

/**
 * Languages supported by the highlighter
 */
const SUPPORTED_LANGUAGES: shiki.BundledLanguage[] = [
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "html",
  "css",
  "json",
  "python",
  "go",
  "rust",
  "bash",
  "markdown",
]

/**
 * Default themes to load initially - include all shiki bundled themes we might need
 */
const DEFAULT_THEMES: shiki.BundledTheme[] = [
  "github-dark",
  "github-light",
  "vitesse-dark",
  "vitesse-light",
  "min-dark",
  "min-light",
  "vesper",
]

/**
 * Map our custom theme IDs to Shiki bundled themes for syntax highlighting
 * Only themes WITHOUT tokenColors need mapping - themes with tokenColors use their own
 */
const THEME_TO_SHIKI_MAP: Record<string, shiki.BundledTheme> = {
  // 21st themes use GitHub themes (no tokenColors)
  "21st-dark": "github-dark",
  "21st-light": "github-light",
  // Claude themes use GitHub themes (no tokenColors)
  "claude-dark": "github-dark",
  "claude-light": "github-light",
  // Vesper maps to shiki's vesper theme
  "vesper-dark": "vesper",
  // Vitesse themes map directly
  "vitesse-dark": "vitesse-dark",
  "vitesse-light": "vitesse-light",
  // Min themes map directly
  "min-dark": "min-dark",
  "min-light": "min-light",
  // Cursor themes have their own tokenColors - use them directly via loadFullTheme
  // (not in this map, so they'll use their own tokenColors)
}

/**
 * Get or create the Shiki highlighter instance
 */
export async function getHighlighter(): Promise<shiki.Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = shiki.createHighlighter({
      themes: DEFAULT_THEMES,
      langs: SUPPORTED_LANGUAGES,
    })
  }
  return highlighterPromise
}

// Cache for full themes (from the new full theme system)
const fullThemesCache = new Map<string, any>()

/**
 * Load a full VS Code theme into Shiki
 * This handles themes from the new full theme system (BUILTIN_THEMES, imported, discovered)
 */
export async function loadFullTheme(theme: VSCodeFullTheme): Promise<void> {
  // Skip if already loaded
  if (fullThemesCache.has(theme.id)) {
    return
  }

  const highlighter = await getHighlighter()

  try {
    // Create a Shiki-compatible theme object
    const shikiTheme = {
      name: theme.id,
      type: theme.type,
      colors: theme.colors,
      tokenColors: theme.tokenColors || [],
    }

    await highlighter.loadTheme(shikiTheme)
    fullThemesCache.set(theme.id, shikiTheme)
  } catch (error) {
    console.error(`Failed to load full theme ${theme.id}:`, error)
    // Don't throw - allow fallback to default theme
  }
}

/**
 * Check if a theme is a Shiki bundled theme (not our custom builtin themes)
 */
function isShikiBundledTheme(themeId: string): boolean {
  // These are the Shiki bundled themes that we load
  return DEFAULT_THEMES.includes(themeId as shiki.BundledTheme)
}

/**
 * Get the theme to use for syntax highlighting
 * Returns the theme ID (either bundled or custom loaded)
 */
function getShikiThemeForHighlighting(themeId: string): string {
  // If there's a direct mapping to a bundled theme, use it
  if (themeId in THEME_TO_SHIKI_MAP) {
    return THEME_TO_SHIKI_MAP[themeId]
  }
  
  // If it's already a shiki bundled theme, use it directly
  if (isShikiBundledTheme(themeId)) {
    return themeId
  }
  
  // If the theme is loaded in our cache (has tokenColors), use it directly
  if (fullThemesCache.has(themeId)) {
    return themeId
  }
  
  // Check the theme type and use appropriate default
  const builtinTheme = getBuiltinThemeById(themeId)
  if (builtinTheme) {
    // If the theme has tokenColors, load it and use it
    if (builtinTheme.tokenColors && builtinTheme.tokenColors.length > 0) {
      return themeId // Will be loaded by ensureThemeLoaded
    }
    return builtinTheme.type === "light" ? "github-light" : "github-dark"
  }
  
  // Default to github-dark
  return "github-dark"
}

/**
 * Ensure a theme is loaded (built-in or bundled)
 * This should be called before using a theme for highlighting
 */
export async function ensureThemeLoaded(themeId: string): Promise<void> {
  // Check if it's a Shiki bundled theme (always available)
  if (isShikiBundledTheme(themeId)) {
    return
  }

  // Check if already loaded in our cache
  if (fullThemesCache.has(themeId)) {
    return
  }

  // Check if it's one of our builtin full themes
  const builtinFullTheme = getBuiltinThemeById(themeId)
  if (builtinFullTheme) {
    await loadFullTheme(builtinFullTheme)
    return
  }

  // Check if it's a legacy builtin theme (from vscode-themes.ts)
  if (isBuiltinTheme(themeId)) {
    // These should also be Shiki bundled, but just in case
    return
  }

  // Theme not found - this is an error case
  console.warn(`Theme ${themeId} not found, falling back to github-dark`)
}

/**
 * Check if a theme is available (loaded or can be loaded)
 */
function isThemeAvailable(themeId: string): boolean {
  return (
    isShikiBundledTheme(themeId) ||
    fullThemesCache.has(themeId) ||
    !!getBuiltinThemeById(themeId) ||
    isBuiltinTheme(themeId)
  )
}

/**
 * Highlight code with a specific theme
 * Uses custom themes with tokenColors when available, otherwise maps to bundled themes
 * Results are cached to prevent re-highlighting when switching tabs
 */
export async function highlightCode(
  code: string,
  language: string,
  themeId: string,
): Promise<string> {
  // Check cache first - O(1) lookup
  const cacheKey = `${themeId}:${language}:${code}`
  const cached = highlightCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const highlighter = await getHighlighter()

  // Ensure the theme is loaded (if it's a custom theme with tokenColors)
  await ensureThemeLoaded(themeId)

  // Get the theme to use for highlighting
  const shikiTheme = getShikiThemeForHighlighting(themeId)

  const loadedLangs = highlighter.getLoadedLanguages()
  const lang = loadedLangs.includes(language as shiki.BundledLanguage)
    ? (language as shiki.BundledLanguage)
    : "plaintext"

  const html = highlighter.codeToHtml(code, {
    lang,
    theme: shikiTheme,
  })

  // Extract just the code content from shiki's output (remove wrapper)
  const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)
  const result = match ? match[1] : code

  // Cache the result
  highlightCache.set(cacheKey, result)

  return result
}

/**
 * Get all loaded theme IDs
 */
export async function getLoadedThemes(): Promise<string[]> {
  const highlighter = await getHighlighter()
  return highlighter.getLoadedThemes()
}
