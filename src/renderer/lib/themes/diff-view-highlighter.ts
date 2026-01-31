/**
 * Custom Diff View Highlighter Integration
 * 
 * Creates a custom DiffHighlighter that uses our shiki theme mapping
 * instead of the hardcoded github-dark/github-light themes
 */

import { getHighlighter } from "./shiki-theme-loader"
import type { BundledTheme, Highlighter } from "shiki"
import type { Root } from "hast"

// Shiki themes we load
const SHIKI_THEMES: BundledTheme[] = [
  "github-dark",
  "github-light",
  "vitesse-dark",
  "vitesse-light",
  "min-dark",
  "min-light",
  "vesper",
]

/**
 * Map our custom theme IDs to Shiki bundled themes
 */
const THEME_TO_SHIKI_MAP: Record<string, BundledTheme> = {
  "21st-dark": "github-dark",
  "21st-light": "github-light",
  "claude-dark": "github-dark",
  "claude-light": "github-light",
  "vesper-dark": "vesper",
  "vitesse-dark": "vitesse-dark",
  "vitesse-light": "vitesse-light",
  "min-dark": "min-dark",
  "min-light": "min-light",
}

/**
 * Get the Shiki bundled theme for a given theme ID
 */
export function getShikiTheme(themeId: string, isDark: boolean): BundledTheme {
  if (themeId in THEME_TO_SHIKI_MAP) {
    return THEME_TO_SHIKI_MAP[themeId]
  }
  return isDark ? "github-dark" : "github-light"
}

// Type for syntax line
type SyntaxNode = {
  type: string
  value: string
  lineNumber: number
  startIndex: number
  endIndex: number
  properties?: {
    className?: string[]
    [key: string]: unknown
  }
  children?: SyntaxNode[]
}

type SyntaxLine = {
  value: string
  lineNumber: number
  valueLength: number
  nodeList: {
    node: SyntaxNode
    wrapper?: SyntaxNode
  }[]
}

// DiffHighlighter type matching @git-diff-view/react expectations
export type DiffHighlighter = {
  name: string
  type: "class" | "style" | string
  maxLineToIgnoreSyntax: number
  setMaxLineToIgnoreSyntax: (v: number) => void
  ignoreSyntaxHighlightList: (string | RegExp)[]
  setIgnoreSyntaxHighlightList: (v: (string | RegExp)[]) => void
  getAST: (raw: string, fileName?: string, lang?: string, theme?: "light" | "dark") => Root | undefined
  processAST: (ast: Root) => {
    syntaxFileObject: Record<number, SyntaxLine>
    syntaxFileLineNumber: number
  }
  hasRegisteredCurrentLang: (lang: string) => boolean
  getHighlighterEngine: () => Highlighter | null
}

// Current theme state - updated by the component
let currentThemeId: string = "21st-dark"

/**
 * Set the current theme ID for highlighting
 */
export function setDiffViewTheme(themeId: string): void {
  currentThemeId = themeId
}

/**
 * Process AST into syntax lines for diff view
 */
function processAST(ast: Root): { syntaxFileObject: Record<number, SyntaxLine>; syntaxFileLineNumber: number } {
  let lineNumber = 1
  const syntaxObj: Record<number, SyntaxLine> = {}
  
  const loopAST = (nodes: SyntaxNode[], wrapper?: SyntaxNode) => {
    nodes.forEach((node) => {
      if (node.type === "text") {
        if (node.value.indexOf("\n") === -1) {
          const valueLength = node.value.length
          if (!syntaxObj[lineNumber]) {
            node.startIndex = 0
            node.endIndex = valueLength - 1
            syntaxObj[lineNumber] = {
              value: node.value,
              lineNumber,
              valueLength,
              nodeList: [{ node, wrapper }],
            }
          } else {
            node.startIndex = syntaxObj[lineNumber].valueLength
            node.endIndex = node.startIndex + valueLength - 1
            syntaxObj[lineNumber].value += node.value
            syntaxObj[lineNumber].valueLength += valueLength
            syntaxObj[lineNumber].nodeList.push({ node, wrapper })
          }
          node.lineNumber = lineNumber
          return
        }
        const lines = node.value.split("\n")
        node.children = node.children || []
        for (let i = 0; i < lines.length; i++) {
          const _value = i === lines.length - 1 ? lines[i] : lines[i] + "\n"
          const _lineNumber = i === 0 ? lineNumber : ++lineNumber
          const _valueLength = _value.length
          const _node: SyntaxNode = {
            type: "text",
            value: _value,
            startIndex: Infinity,
            endIndex: Infinity,
            lineNumber: _lineNumber,
          }
          if (!syntaxObj[_lineNumber]) {
            _node.startIndex = 0
            _node.endIndex = _valueLength - 1
            syntaxObj[_lineNumber] = {
              value: _value,
              lineNumber: _lineNumber,
              valueLength: _valueLength,
              nodeList: [{ node: _node, wrapper }],
            }
          } else {
            _node.startIndex = syntaxObj[_lineNumber].valueLength
            _node.endIndex = _node.startIndex + _valueLength - 1
            syntaxObj[_lineNumber].value += _value
            syntaxObj[_lineNumber].valueLength += _valueLength
            syntaxObj[_lineNumber].nodeList.push({ node: _node, wrapper })
          }
          node.children.push(_node)
        }
        node.lineNumber = lineNumber
        return
      }
      if (node.children) {
        loopAST(node.children, node)
        node.lineNumber = lineNumber
      }
    })
  }
  
  loopAST(ast.children as SyntaxNode[])
  return { syntaxFileObject: syntaxObj, syntaxFileLineNumber: lineNumber }
}

// Cached highlighter instance
let cachedHighlighter: Highlighter | null = null

// Configuration
// Set very high limit (100k lines) to effectively enable syntax highlighting for all files
// Only extremely large files will skip highlighting for performance
let maxLineToIgnoreSyntax = 100000
const ignoreSyntaxHighlightList: (string | RegExp)[] = []

/**
 * Create a custom DiffHighlighter that uses our theme mapping
 */
export async function createCustomDiffHighlighter(): Promise<DiffHighlighter> {
  // Get our shared shiki highlighter
  const highlighter = await getHighlighter()
  
  // Load additional themes if not already loaded
  const loadedThemes = highlighter.getLoadedThemes()
  for (const theme of SHIKI_THEMES) {
    if (!loadedThemes.includes(theme)) {
      try {
        await highlighter.loadTheme(theme)
      } catch {
        // Theme might already be loaded or not available
      }
    }
  }
  
  cachedHighlighter = highlighter
  
  const diffHighlighter: DiffHighlighter = {
    name: "shiki-custom",
    type: "class",
    
    get maxLineToIgnoreSyntax() {
      return maxLineToIgnoreSyntax
    },
    
    setMaxLineToIgnoreSyntax(v: number) {
      maxLineToIgnoreSyntax = v
    },
    
    get ignoreSyntaxHighlightList() {
      return ignoreSyntaxHighlightList
    },
    
    setIgnoreSyntaxHighlightList(v: (string | RegExp)[]) {
      ignoreSyntaxHighlightList.length = 0
      ignoreSyntaxHighlightList.push(...v)
    },
    
    getAST(raw: string, fileName?: string, lang?: string, theme?: "light" | "dark"): Root | undefined {
      // Check if file should be ignored
      if (fileName && ignoreSyntaxHighlightList.some((item) => 
        item instanceof RegExp ? item.test(fileName) : fileName === item
      )) {
        return undefined
      }
      
      try {
        const isDark = theme === "dark"
        const shikiTheme = getShikiTheme(currentThemeId, isDark)
        
        return highlighter.codeToHast(raw, {
          lang: lang || "plaintext",
          themes: {
            dark: shikiTheme,
            light: shikiTheme,
          },
          cssVariablePrefix: "--diff-view-",
          defaultColor: false,
          mergeWhitespaces: false,
        })
      } catch (e) {
        console.error("Diff highlighter error:", e)
        return undefined
      }
    },
    
    processAST,
    
    hasRegisteredCurrentLang(lang: string): boolean {
      return highlighter.getLoadedLanguages().includes(lang)
    },
    
    getHighlighterEngine(): Highlighter | null {
      return cachedHighlighter
    },
  }
  
  return diffHighlighter
}

// Cached promise
let highlighterPromise: Promise<DiffHighlighter> | null = null

/**
 * Get or create the custom diff highlighter
 */
export async function getDiffHighlighter(): Promise<DiffHighlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createCustomDiffHighlighter()
  }
  return highlighterPromise
}

/**
 * Preload the diff highlighter on app start
 * This prevents the delay when opening the diff view for the first time
 */
export function preloadDiffHighlighter(): void {
  // Start loading in background, don't block
  getDiffHighlighter().catch((err) => {
    console.warn("[preloadDiffHighlighter] Failed to preload:", err)
  })
}
