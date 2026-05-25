type HastText = {
  type: "text"
  value: string
}

type HastElement = {
  type: "element"
  tagName: string
  properties: Record<string, unknown>
  children: Array<HastElement | HastText>
}

type PlainTheme = {
  name: string
  type: "light" | "dark"
  fg: string
  bg: string
  colors: Record<string, string>
}

type ShikiTransformer = {
  line?: (node: HastElement, line: number) => HastElement | void
  pre?: (node: HastElement) => HastElement | void
}

type CodeToHastOptions = {
  transformers?: ShikiTransformer[]
}

type CodeToTokensOptions = {
  grammarState?: unknown
}

const DEFAULT_DARK_THEME: PlainTheme = {
  name: "pierre-dark",
  type: "dark",
  fg: "#d4d4d4",
  bg: "transparent",
  colors: {
    "gitDecoration.addedResourceForeground": "#3fb950",
    "gitDecoration.deletedResourceForeground": "#f85149",
    "gitDecoration.modifiedResourceForeground": "#58a6ff",
  },
}

const DEFAULT_LIGHT_THEME: PlainTheme = {
  name: "pierre-light",
  type: "light",
  fg: "#24292f",
  bg: "transparent",
  colors: {
    "gitDecoration.addedResourceForeground": "#1a7f37",
    "gitDecoration.deletedResourceForeground": "#cf222e",
    "gitDecoration.modifiedResourceForeground": "#0969da",
  },
}

function makeTheme(name: string): PlainTheme {
  return name.includes("light") ? { ...DEFAULT_LIGHT_THEME, name } : { ...DEFAULT_DARK_THEME, name }
}

function makeLoader<T>(valueFactory: (name: string) => T): Record<string, () => Promise<{ default: T }>> {
  return new Proxy<Record<string, () => Promise<{ default: T }>>>(
    {},
    {
      get(_target, property) {
        const name = String(property)
        return () => Promise.resolve({ default: valueFactory(name) })
      },
    },
  )
}

const loadedLanguages = new Set<string>(["text"])
const loadedThemes = new Map<string, PlainTheme>([
  [DEFAULT_DARK_THEME.name, DEFAULT_DARK_THEME],
  [DEFAULT_LIGHT_THEME.name, DEFAULT_LIGHT_THEME],
])

function createLineElement(value: string, lineNumber: number, transformers: ShikiTransformer[]): HastElement {
  let line: HastElement = {
    type: "element",
    tagName: "span",
    properties: {},
    children: [{ type: "text", value }],
  }

  for (const transformer of transformers) {
    const transformed = transformer.line?.(line, lineNumber)
    if (transformed) {
      line = transformed
    }
  }

  return line
}

function createPlainHast(code: string, options: CodeToHastOptions = {}): HastElement {
  const transformers = options.transformers ?? []
  const lines = code.length > 0 ? code.split("\n") : [""]
  const codeElement: HastElement = {
    type: "element",
    tagName: "code",
    properties: {},
    children: lines.map((line, index) => {
      const value = index < lines.length - 1 ? `${line}\n` : line
      return createLineElement(value, index + 1, transformers)
    }),
  }

  let preElement: HastElement = {
    type: "element",
    tagName: "pre",
    properties: {},
    children: [codeElement],
  }

  for (const transformer of transformers) {
    const transformed = transformer.pre?.(preElement)
    if (transformed) {
      preElement = transformed
    }
  }

  return preElement
}

function createPlainHighlighter() {
  return {
    codeToHast: createPlainHast,
    codeToTokens(code: string, options: CodeToTokensOptions = {}) {
      return {
        grammarState: options.grammarState,
        tokens: [[{ content: code, offset: 0 }]],
      }
    },
    getTheme(name: string) {
      if (!loadedThemes.has(name)) {
        loadedThemes.set(name, makeTheme(name))
      }
      return loadedThemes.get(name)!
    },
    getLoadedLanguages() {
      return Array.from(loadedLanguages)
    },
    getLoadedThemes() {
      return Array.from(loadedThemes.keys())
    },
    loadLanguageSync(language: { name?: string } | string) {
      loadedLanguages.add(typeof language === "string" ? language : language.name ?? "text")
    },
    async loadLanguage(language: { name?: string } | string) {
      this.loadLanguageSync(language)
    },
    loadThemeSync(theme: PlainTheme | string) {
      const resolvedTheme = typeof theme === "string" ? makeTheme(theme) : theme
      loadedThemes.set(resolvedTheme.name, resolvedTheme)
    },
    async loadTheme(theme: PlainTheme | string) {
      this.loadThemeSync(theme)
    },
    dispose() {
      loadedLanguages.clear()
      loadedLanguages.add("text")
    },
  }
}

export const bundledLanguages = makeLoader((name) => ({ name }))
export const bundledThemes = makeLoader(makeTheme)

export function normalizeTheme(theme: PlainTheme): PlainTheme {
  return {
    ...makeTheme(theme.name),
    ...theme,
  }
}

export function createJavaScriptRegexEngine() {
  return {}
}

export function createHighlighter() {
  return Promise.resolve(createPlainHighlighter())
}

export function createHighlighterCoreSync() {
  return createPlainHighlighter()
}

export function createCssVariablesTheme({
  name,
  variableDefaults,
}: {
  name: string
  variableDefaults?: Record<string, string>
}): PlainTheme {
  return {
    ...makeTheme(name),
    colors: {
      ...makeTheme(name).colors,
      ...variableDefaults,
    },
  }
}

export function codeToHtml(code: string): string {
  return `<pre><code>${escapeHtml(code)}</code></pre>`
}

export function getTokenStyleObject(token: { htmlStyle?: Record<string, string> }) {
  return token.htmlStyle ?? {}
}

export function stringifyTokenStyle(style: Record<string, string>): string {
  return Object.entries(style)
    .map(([key, value]) => `${key}:${value}`)
    .join(";")
}

export function transformerStyleToClass() {
  return {}
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
