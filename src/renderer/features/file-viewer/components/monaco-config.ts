import { loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor/esm/vs/editor/editor.api"
import type { editor } from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker"
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker"
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"

// Configure Monaco workers for Vite
// @ts-ignore - Monaco's global window setup
self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "json") return new jsonWorker()
    if (label === "css" || label === "scss" || label === "less") return new cssWorker()
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker()
    if (label === "typescript" || label === "javascript") return new tsWorker()
    return new editorWorker()
  },
}

// Configure Monaco to use local package instead of CDN
// Required for Electron apps due to CSP restrictions
loader.config({ monaco })

// Default editor options for read-only file viewing
export const defaultEditorOptions: editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  minimap: { enabled: true },
  lineNumbers: "on",
  wordWrap: "off",
  automaticLayout: true,
  fontSize: 13,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  folding: true,
  foldingStrategy: "indentation",
  showFoldingControls: "mouseover",
  bracketPairColorization: { enabled: true },
  guides: {
    bracketPairs: true,
    indentation: true,
  },
  scrollBeyondLastLine: false,
  renderWhitespace: "selection",
  scrollbar: {
    vertical: "auto",
    horizontal: "auto",
    useShadows: false,
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
  padding: { top: 8, bottom: 8 },
  quickSuggestions: false,
  parameterHints: { enabled: false },
  suggestOnTriggerCharacters: false,
  acceptSuggestionOnEnter: "off",
  tabCompletion: "off",
  wordBasedSuggestions: "off",
  find: {
    addExtraSpaceOnTop: false,
    autoFindInSelection: "never",
    seedSearchStringFromSelection: "always",
  },
  smoothScrolling: true,
  cursorBlinking: "solid",
  cursorStyle: "line",
  renderLineHighlight: "line",
  contextmenu: false,
  mouseWheelZoom: true,
  "semanticHighlighting.enabled": true,
}

// Map app theme to Monaco base theme
export function getMonacoTheme(appTheme: string): string {
  const isDark = appTheme.includes("dark") ||
                 appTheme === "vesper" ||
                 appTheme === "min-dark" ||
                 appTheme === "vitesse-dark"

  return isDark ? "vs-dark" : "vs"
}

// Track which custom themes have been defined (with version hash to detect changes)
const definedThemes = new Map<string, string>()

/**
 * Normalize a hex color to 6-digit format for Monaco.
 * Monaco token rules require 6-digit hex without #.
 * Handles: #FFF -> FFFFFF, #FFFF -> FFFFFF, #FFC799 -> FFC799, #8b8b8b94 -> 8b8b8b
 */
function normalizeHex(color: string): string {
  let hex = color.replace("#", "")
  // 3-digit: RGB -> RRGGBB
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  // 4-digit: RGBA -> RRGGBB (drop alpha)
  else if (hex.length === 4) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  // 8-digit: RRGGBBAA -> RRGGBB (strip alpha, Monaco doesn't support it in token rules)
  else if (hex.length === 8) {
    hex = hex.slice(0, 6)
  }
  return hex
}

/**
 * Build Monarch-compatible token rules from theme tokenColors.
 *
 * Monaco's built-in Monarch tokenizer (for TS/JS/CSS/HTML etc.) produces
 * token names like "identifier", "keyword", "string", "number", "type.identifier",
 * "delimiter" — NOT TextMate scopes like "entity.name.function".
 *
 * This function extracts foreground colors from the TextMate tokenColors and
 * creates matching Monarch token rules so syntax highlighting works correctly.
 */
function buildMonarchRules(
  tokenColors: any[],
): editor.ITokenThemeRule[] {
  const rules: editor.ITokenThemeRule[] = []

  // Build a scope-to-color map from tokenColors
  const scopeColorMap = new Map<string, { foreground?: string; fontStyle?: string }>()
  for (const tc of tokenColors) {
    if (!tc.settings) continue
    const scopes = typeof tc.scope === "string"
      ? tc.scope.split(",").map((s: string) => s.trim())
      : Array.isArray(tc.scope)
        ? tc.scope
        : []
    for (const scope of scopes) {
      scopeColorMap.set(scope, tc.settings)
    }
  }

  // Helper to find the color for a TextMate scope
  const getColor = (...scopes: string[]): string | undefined => {
    for (const scope of scopes) {
      const settings = scopeColorMap.get(scope)
      if (settings?.foreground) return normalizeHex(settings.foreground)
    }
    return undefined
  }

  const getFontStyle = (...scopes: string[]): string | undefined => {
    for (const scope of scopes) {
      const settings = scopeColorMap.get(scope)
      if (settings?.fontStyle) return settings.fontStyle
    }
    return undefined
  }

  // Map Monarch token names to TextMate scopes
  // These are the tokens produced by Monaco's built-in language tokenizers
  const monarchMappings: Array<{ token: string; scopes: string[] }> = [
    // Keywords (if, else, return, const, let, var, function, class, etc.)
    { token: "keyword", scopes: ["keyword", "keyword.control", "storage.type", "storage.modifier"] },
    // Identifiers (variable names — Monaco's Monarch doesn't distinguish function calls)
    { token: "identifier", scopes: ["variable"] },
    // Type identifiers (type names, class names, interface names)
    { token: "type.identifier", scopes: ["entity.name", "support.type", "support.class"] },
    // Strings
    { token: "string", scopes: ["string"] },
    // Numbers
    { token: "number", scopes: ["constant.numeric"] },
    // Regular expressions
    { token: "regexp", scopes: ["string.regexp"] },
    // Comments
    { token: "comment", scopes: ["comment", "punctuation.definition.comment"] },
    // Delimiters and operators
    { token: "delimiter", scopes: ["keyword.operator", "punctuation"] },
    { token: "delimiter.bracket", scopes: ["punctuation.definition.tag"] },
    { token: "delimiter.parenthesis", scopes: ["punctuation"] },
    { token: "delimiter.square", scopes: ["punctuation"] },
    { token: "delimiter.angle", scopes: ["punctuation.definition.tag"] },
    // Operators
    { token: "operator", scopes: ["keyword.operator"] },
    // Tags (HTML/JSX)
    { token: "tag", scopes: ["entity.name.tag"] },
    { token: "metatag", scopes: ["entity.name.tag"] },
    { token: "metatag.content.html", scopes: ["entity.name.tag"] },
    // Attributes (HTML/JSX)
    { token: "attribute.name", scopes: ["entity.other.attribute-name"] },
    { token: "attribute.value", scopes: ["string"] },
    // JSON-specific
    { token: "string.key.json", scopes: ["support.type.property-name.json"] },
    { token: "string.value.json", scopes: ["string"] },
    { token: "number.json", scopes: ["constant.numeric"] },
    { token: "keyword.json", scopes: ["constant.language.boolean"] },
    // CSS-specific
    { token: "attribute.name.css", scopes: ["support.type.property-name"] },
    { token: "attribute.value.css", scopes: ["string"] },
    { token: "tag.css", scopes: ["entity.name.tag"] },
    { token: "attribute.value.number.css", scopes: ["constant.numeric"] },
    { token: "attribute.value.unit.css", scopes: ["keyword.other.unit"] },
  ]

  for (const { token, scopes } of monarchMappings) {
    const foreground = getColor(...scopes)
    const fontStyle = getFontStyle(...scopes)
    if (foreground || fontStyle) {
      const rule: editor.ITokenThemeRule = { token }
      if (foreground) rule.foreground = foreground
      if (fontStyle) rule.fontStyle = fontStyle
      rules.push(rule)
    }
  }

  // Monaco's TypeScript/JavaScript semantic tokens use names like "function",
  // "variable", "class", "method", "parameter", "property", "type", "interface".
  // These are resolved by Monaco when semanticHighlighting is enabled.
  const semanticMappings: Array<{ token: string; scopes: string[] }> = [
    { token: "function", scopes: ["entity.name.function", "support.function"] },
    { token: "method", scopes: ["entity.name.function", "support.function"] },
    { token: "variable", scopes: ["variable"] },
    { token: "parameter", scopes: ["variable"] },
    { token: "property", scopes: ["variable"] },
    { token: "class", scopes: ["entity.name", "support.class"] },
    { token: "interface", scopes: ["entity.name", "support.type"] },
    { token: "type", scopes: ["entity.name", "support.type"] },
    { token: "enum", scopes: ["entity.name", "support.type"] },
    { token: "enumMember", scopes: ["constant.numeric", "support.constant"] },
    { token: "namespace", scopes: ["entity.name"] },
  ]

  for (const { token, scopes } of semanticMappings) {
    const foreground = getColor(...scopes)
    if (foreground) {
      rules.push({ token, foreground })
    }
  }

  return rules
}

/**
 * Register a custom Monaco theme from VSCodeFullTheme data.
 * Converts the theme's colors and tokenColors into monaco.editor.defineTheme format.
 * Also generates Monarch-compatible token rules for proper syntax highlighting.
 * Returns the theme name to pass to Monaco's `theme` prop.
 */
export function registerMonacoTheme(
  monacoInstance: typeof monaco,
  theme: { id: string; type: "light" | "dark"; colors: Record<string, string>; tokenColors?: any[] },
): string {
  const themeName = `custom-${theme.id}`

  // Simple version key to detect theme content changes
  const versionKey = `${theme.type}-${theme.tokenColors?.length ?? 0}-${Object.keys(theme.colors).length}`
  if (definedThemes.get(themeName) === versionKey) {
    return themeName
  }

  const base = theme.type === "dark" ? "vs-dark" : "vs"
  const colors: Record<string, string> = {}

  // Map VS Code color keys to Monaco editor color keys
  for (const [key, value] of Object.entries(theme.colors)) {
    if (value) {
      colors[key] = value
    }
  }

  // Convert tokenColors to Monaco ITokenThemeRule[] (TextMate scopes)
  const rules: editor.ITokenThemeRule[] = []
  if (theme.tokenColors) {
    for (const tc of theme.tokenColors) {
      if (!tc.settings) continue
      const scopes = typeof tc.scope === "string"
        ? tc.scope.split(",").map((s: string) => s.trim())
        : Array.isArray(tc.scope)
          ? tc.scope
          : [""]

      for (const scope of scopes) {
        const rule: editor.ITokenThemeRule = { token: scope }
        if (tc.settings.foreground) rule.foreground = normalizeHex(tc.settings.foreground)
        if (tc.settings.background) rule.background = normalizeHex(tc.settings.background)
        if (tc.settings.fontStyle) rule.fontStyle = tc.settings.fontStyle
        rules.push(rule)
      }
    }

    // Add Monarch-compatible token rules for Monaco's built-in tokenizers
    const monarchRules = buildMonarchRules(theme.tokenColors)
    rules.push(...monarchRules)
  }

  monacoInstance.editor.defineTheme(themeName, {
    base: base as "vs" | "vs-dark" | "hc-black",
    inherit: true,
    rules,
    colors,
  })

  definedThemes.set(themeName, versionKey)
  return themeName
}
