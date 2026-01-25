import { useEffect, useState, useRef, memo, lazy, Suspense, useCallback } from "react"
import { codeToHtml } from "shiki"
import { cn } from "../../../lib/utils"
import { Loader2 } from "lucide-react"

// Lazy load Monaco Editor to reduce initial bundle size
const CodeEditor = lazy(() =>
  import("./code-editor").then((m) => ({ default: m.CodeEditor }))
)

// ReviewComment type for optional comment support
interface ReviewComment {
  id: string
  content: string
  lineRange: { startLine: number; endLine: number }
}

interface TextPreviewProps {
  content: string
  fileName: string
  className?: string
  /** Enable edit mode with Monaco Editor */
  editable?: boolean
  /** File path for saving (required when editable is true) */
  filePath?: string
  /** Callback when file is saved */
  onSave?: () => void
  /** Callback when dirty state changes */
  onDirtyChange?: (dirty: boolean) => void
  /** Enable comment mode with line numbers and comment controls */
  enableComments?: boolean
  /** Chat ID for comment storage (required when enableComments is true) */
  chatId?: string
  /** Existing comments for this file */
  comments?: ReviewComment[]
  /** Callback when a comment is added */
  onCommentAdded?: (comment: ReviewComment) => void
  /** Line number to scroll to */
  scrollToLine?: number | null
  /** Text to highlight in the content */
  highlightText?: string | null
}

// Map file extensions to Shiki language identifiers
function getLanguageFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || ""

  const langMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    mjs: "javascript",
    cjs: "javascript",

    // Web
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    vue: "vue",
    svelte: "svelte",

    // Data formats
    json: "json",
    jsonc: "jsonc",
    json5: "json5",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    csv: "csv",

    // Shell/Scripts
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "fish",
    ps1: "powershell",
    bat: "batch",
    cmd: "batch",

    // Python
    py: "python",
    pyw: "python",
    pyi: "python",
    ipynb: "python",

    // Other languages
    rb: "ruby",
    php: "php",
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    swift: "swift",
    go: "go",
    rs: "rust",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    cs: "csharp",
    fs: "fsharp",
    scala: "scala",
    clj: "clojure",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    hs: "haskell",
    lua: "lua",
    r: "r",
    jl: "julia",
    dart: "dart",
    zig: "zig",
    nim: "nim",
    v: "v",
    d: "d",
    ml: "ocaml",
    sql: "sql",
    graphql: "graphql",
    gql: "graphql",

    // Config files
    dockerfile: "dockerfile",
    makefile: "makefile",
    cmake: "cmake",
    gradle: "groovy",
    tf: "hcl",
    hcl: "hcl",
    ini: "ini",
    conf: "ini",
    env: "shell",
    gitignore: "gitignore",
    editorconfig: "ini",

    // Markdown/Docs
    md: "markdown",
    mdx: "mdx",
    rst: "rst",
    tex: "latex",
    adoc: "asciidoc",

    // Misc
    diff: "diff",
    patch: "diff",
    log: "log",
    txt: "text",
  }

  // Handle special filenames - use cross-platform path split
  const specialFiles: Record<string, string> = {
    Dockerfile: "dockerfile",
    Makefile: "makefile",
    CMakeLists: "cmake",
    Gemfile: "ruby",
    Rakefile: "ruby",
    Podfile: "ruby",
    Fastfile: "ruby",
    Vagrantfile: "ruby",
    Brewfile: "ruby",
  }

  const baseName = fileName.split(/[\\/]/).pop() || fileName
  if (specialFiles[baseName]) {
    return specialFiles[baseName]
  }

  return langMap[ext] || "text"
}

/**
 * TextPreview - Code file preview with optional edit mode and comment support
 *
 * Modes:
 * - `editable=true`: Monaco Editor with full editing capabilities
 * - `enableComments=true`: Shiki preview with line numbers and comment controls
 * - Default: Basic Shiki syntax highlighted code (read-only)
 */
export const TextPreview = memo(function TextPreview({
  content,
  fileName,
  className,
  editable = false,
  filePath,
  onSave,
  onDirtyChange,
  enableComments = false,
  chatId,
  comments = [],
  onCommentAdded,
  scrollToLine,
  highlightText,
}: TextPreviewProps) {
  // Edit mode: Use Monaco Editor
  if (editable && filePath) {
    return (
      <Suspense
        fallback={
          <div className={cn("flex items-center justify-center h-full", className)}>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <CodeEditor
          filePath={filePath}
          content={content}
          className={className}
          onSave={onSave}
          onDirtyChange={onDirtyChange}
        />
      </Suspense>
    )
  }

  // Comment mode: Currently disabled (requires comments module)
  // TODO: Enable when comments module is ported
  // if (enableComments && chatId && filePath) {
  //   return <CodeWithLineNumbers ... />
  // }

  // Default: Basic syntax highlighted preview (no comments)
  return (
    <BasicTextPreview
      content={content}
      fileName={fileName}
      className={className}
      scrollToLine={scrollToLine}
      highlightText={highlightText}
    />
  )
})

/**
 * BasicTextPreview - Simple syntax highlighted code with line numbers, scroll-to-line and highlight support
 */
const BasicTextPreview = memo(function BasicTextPreview({
  content,
  fileName,
  className,
  scrollToLine,
  highlightText,
}: {
  content: string
  fileName: string
  className?: string
  scrollToLine?: number | null
  highlightText?: string | null
}) {
  const [highlightedLines, setHighlightedLines] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasScrolledRef = useRef(false)

  // Split content into lines
  const lines = content.split("\n")

  // Highlight code using Shiki
  useEffect(() => {
    let cancelled = false
    hasScrolledRef.current = false // Reset scroll flag when content changes

    async function highlight() {
      setIsLoading(true)
      setError(null)

      try {
        const lang = getLanguageFromFileName(fileName)

        // Highlight full content then split
        const result = await codeToHtml(content, {
          lang,
          theme: "github-dark-default",
        })

        if (!cancelled) {
          // Parse the HTML and extract line contents
          // Shiki outputs a single <code> block, we need to split by lines
          const codeMatch = result.match(/<code[^>]*>([\s\S]*?)<\/code>/i)
          if (codeMatch) {
            // Split the inner HTML by newline, preserving HTML tags
            const innerHtml = codeMatch[1]
            const lineHtmls = innerHtml.split("\n")
            setHighlightedLines(lineHtmls)
          } else {
            // Fallback: split plain content
            setHighlightedLines(
              lines.map((line) =>
                line
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;") || "&nbsp;"
              )
            )
          }
        }
      } catch (err) {
        console.error("Syntax highlighting error:", err)
        if (!cancelled) {
          // Fallback to plain text
          setHighlightedLines(
            lines.map((line) =>
              line
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;") || "&nbsp;"
            )
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    highlight()

    return () => {
      cancelled = true
    }
  }, [content, fileName])

  // Scroll to line when specified
  useEffect(() => {
    if (scrollToLine && !isLoading && containerRef.current && !hasScrolledRef.current) {
      const lineElement = containerRef.current.querySelector(`[data-line="${scrollToLine}"]`)
      if (lineElement) {
        // Wait a tick for DOM to settle
        requestAnimationFrame(() => {
          lineElement.scrollIntoView({ behavior: "smooth", block: "center" })
          hasScrolledRef.current = true
        })
      }
    }
  }, [scrollToLine, isLoading, highlightedLines])

  // Function to highlight text within a line
  const highlightLineText = useCallback((lineHtml: string, searchText: string | null | undefined): string => {
    if (!searchText) return lineHtml

    // Escape special regex characters
    const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    // Case insensitive search
    const regex = new RegExp(`(${escaped})`, "gi")

    // We need to be careful not to replace text inside HTML tags
    // Split by HTML tags, process text parts only
    const parts = lineHtml.split(/(<[^>]+>)/g)
    const result = parts.map((part) => {
      // If it's an HTML tag, leave it unchanged
      if (part.startsWith("<")) return part
      // Replace matches in text content
      return part.replace(regex, '<mark class="bg-yellow-400/60 text-inherit rounded px-0.5">$1</mark>')
    })
    return result.join("")
  }, [])

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn("flex items-center justify-center h-full text-destructive", className)}>
        {error}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "h-full overflow-auto font-mono text-[13px] leading-relaxed",
        className
      )}
    >
      <table className="w-full border-collapse">
        <tbody>
          {highlightedLines.map((lineHtml, index) => {
            const lineNumber = index + 1
            const isTargetLine = scrollToLine === lineNumber
            const processedHtml = highlightLineText(lineHtml, highlightText)

            return (
              <tr
                key={lineNumber}
                data-line={lineNumber}
                className={cn(
                  "group/line",
                  isTargetLine && "bg-yellow-500/20"
                )}
              >
                {/* Line number */}
                <td className="w-12 text-right pr-3 select-none align-top text-muted-foreground/60 border-r border-border/40">
                  <span className="text-xs tabular-nums">{lineNumber}</span>
                </td>

                {/* Code content */}
                <td
                  className="pl-4 whitespace-pre"
                  dangerouslySetInnerHTML={{ __html: processedHtml || "&nbsp;" }}
                />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
})
