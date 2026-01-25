import { useCallback, useEffect, useRef } from "react"
import Editor, { OnMount, OnChange, loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import { useAtom, useSetAtom } from "jotai"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import {
  editorDirtyAtom,
  editorOriginalContentAtom,
  editorContentAtom,
} from "../atoms"
import { Loader2 } from "lucide-react"

// LSP is optional - stub it out if not available
// TODO: Import real useLSPClient when LSP module is ported
const useLSPClient = (_opts: { filePath: string; language: string; enabled: boolean }): {
  isConnected: boolean
  sendDidOpen: (content: string) => Promise<void>
  sendDidChange: (content: string) => Promise<void>
  sendDidClose: () => Promise<void>
  registerProviders: (monaco: any, editor: any) => () => void
} => ({
  isConnected: false,
  sendDidOpen: async () => {},
  sendDidChange: async () => {},
  sendDidClose: async () => {},
  registerProviders: () => () => {},
})

// Configure Monaco workers for Electron environment
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker"
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker"
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"

// Set up Monaco environment for workers BEFORE loader.config
// @ts-ignore - Monaco global environment setup
self.MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === "json") {
      return new jsonWorker()
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker()
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker()
    }
    if (label === "typescript" || label === "javascript") {
      return new tsWorker()
    }
    return new editorWorker()
  },
}

// Configure @monaco-editor/react to use locally installed monaco-editor
// This prevents CDN loading which is blocked by CSP
loader.config({ monaco })

interface CodeEditorProps {
  filePath: string
  content: string
  language?: string
  className?: string
  onSave?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

// Map file extensions to Monaco language identifiers
function getLanguageFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || ""

  const langMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    mjs: "javascript",
    cjs: "javascript",

    // Web
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "scss",
    less: "less",
    vue: "html",
    svelte: "html",

    // Data formats
    json: "json",
    jsonc: "json",
    json5: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    csv: "plaintext",

    // Shell/Scripts
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    fish: "shell",
    ps1: "powershell",
    bat: "bat",
    cmd: "bat",

    // Python
    py: "python",
    pyw: "python",
    pyi: "python",

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
    lua: "lua",
    r: "r",
    dart: "dart",
    sql: "sql",
    graphql: "graphql",
    gql: "graphql",

    // Config files
    dockerfile: "dockerfile",
    makefile: "makefile",
    ini: "ini",
    conf: "ini",
    env: "shell",

    // Markdown/Docs
    md: "markdown",
    mdx: "markdown",

    // Misc
    diff: "diff",
    patch: "diff",
    log: "plaintext",
    txt: "plaintext",
  }

  // Handle special filenames - use cross-platform path split
  const baseName = fileName.split(/[\\/]/).pop() || fileName
  const specialFiles: Record<string, string> = {
    Dockerfile: "dockerfile",
    Makefile: "makefile",
    Gemfile: "ruby",
    Rakefile: "ruby",
    Podfile: "ruby",
  }

  if (specialFiles[baseName]) {
    return specialFiles[baseName]
  }

  return langMap[ext] || "plaintext"
}

/**
 * CodeEditor - Monaco Editor wrapper for code editing
 *
 * Features:
 * - Syntax highlighting for 50+ languages
 * - Cmd+S / Ctrl+S to save
 * - Dirty state tracking
 * - Dark theme matching the app
 * - LSP integration for TS/JS (completions, hover, diagnostics)
 */
export function CodeEditor({
  filePath,
  content: initialContent,
  language: explicitLanguage,
  className,
  onSave,
  onDirtyChange,
}: CodeEditorProps) {
  const editorRef = useRef<MonacoTypes.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof MonacoTypes | null>(null)
  const lspCleanupRef = useRef<(() => void) | null>(null)

  const [isDirty, setIsDirty] = useAtom(editorDirtyAtom)
  const setOriginalContent = useSetAtom(editorOriginalContentAtom)
  const [editorContent, setEditorContent] = useAtom(editorContentAtom)

  // File save mutation
  const saveFileMutation = trpc.files.writeFile.useMutation()

  // Determine language from file extension or explicit prop
  // Use cross-platform path split
  const fileName = filePath.split(/[\\/]/).pop() || filePath
  const language = explicitLanguage || getLanguageFromFileName(fileName)

  // LSP client for TypeScript/JavaScript
  const {
    isConnected: lspConnected,
    sendDidOpen,
    sendDidChange,
    sendDidClose,
    registerProviders,
  } = useLSPClient({
    filePath,
    language,
    enabled: true,
  })

  // Initialize original content when component mounts or file changes
  const initialContentRef = useRef(initialContent)
  useEffect(() => {
    // Only reset if content actually changed (new file)
    if (initialContentRef.current !== initialContent) {
      initialContentRef.current = initialContent
      setOriginalContent(initialContent)
      setEditorContent(initialContent)
      setIsDirty(false)
    }
  }, [initialContent, setOriginalContent, setEditorContent, setIsDirty])

  // Set initial content on mount
  useEffect(() => {
    setOriginalContent(initialContent)
    setEditorContent(initialContent)
    setIsDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle editor mount
  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco

      // Register Cmd+S / Ctrl+S save command
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        handleSave()
      })

      // Register LSP providers if connected
      if (lspConnected) {
        // Clean up previous providers
        if (lspCleanupRef.current) {
          lspCleanupRef.current()
        }
        // Register new providers
        lspCleanupRef.current = registerProviders(monaco, editor)
        // Notify LSP server that file is open
        sendDidOpen(initialContent)
      }

      // Focus the editor
      editor.focus()
    },
    [filePath, lspConnected, registerProviders, sendDidOpen, initialContent]
  )

  // Update LSP providers when connection state changes
  const lspInitializedRef = useRef(false)
  // Reset LSP initialized state when file changes
  const prevFilePathRef = useRef(filePath)
  useEffect(() => {
    if (prevFilePathRef.current !== filePath) {
      prevFilePathRef.current = filePath
      lspInitializedRef.current = false
    }
  }, [filePath])

  useEffect(() => {
    if (editorRef.current && monacoRef.current && lspConnected && !lspInitializedRef.current) {
      lspInitializedRef.current = true
      // Clean up previous providers
      if (lspCleanupRef.current) {
        lspCleanupRef.current()
      }
      // Register new providers
      lspCleanupRef.current = registerProviders(monacoRef.current, editorRef.current)
      // Notify LSP server that file is open
      sendDidOpen(initialContentRef.current)
    }

    return () => {
      // Clean up providers on unmount
      if (lspCleanupRef.current) {
        lspCleanupRef.current()
        lspCleanupRef.current = null
      }
      // Reset initialized flag so it can reinitialize on next mount
      lspInitializedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lspConnected])

  // Notify LSP on content change (debounced)
  const lspUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sendDidChangeRef = useRef(sendDidChange)
  sendDidChangeRef.current = sendDidChange

  useEffect(() => {
    if (!lspConnected || !editorContent) return

    // Clear previous timeout
    if (lspUpdateTimeoutRef.current) {
      clearTimeout(lspUpdateTimeoutRef.current)
    }

    // Debounce LSP updates
    lspUpdateTimeoutRef.current = setTimeout(() => {
      sendDidChangeRef.current(editorContent)
    }, 300)

    return () => {
      if (lspUpdateTimeoutRef.current) {
        clearTimeout(lspUpdateTimeoutRef.current)
      }
    }
  }, [editorContent, lspConnected])

  // Clean up LSP on unmount
  const sendDidCloseRef = useRef(sendDidClose)
  sendDidCloseRef.current = sendDidClose

  useEffect(() => {
    return () => {
      sendDidCloseRef.current()
    }
  }, [])

  // Handle content changes
  const handleChange: OnChange = useCallback(
    (value) => {
      if (value !== undefined) {
        setEditorContent(value)
        const dirty = value !== initialContent
        setIsDirty(dirty)
        onDirtyChange?.(dirty)
      }
    },
    [initialContent, setEditorContent, setIsDirty, onDirtyChange]
  )

  // Handle save
  const handleSave = useCallback(async () => {
    if (!isDirty || !editorContent) return

    try {
      await saveFileMutation.mutateAsync({
        path: filePath,
        content: editorContent,
      })

      // Update original content to current content
      setOriginalContent(editorContent)
      setIsDirty(false)
      onDirtyChange?.(false)
      onSave?.()

      console.log("[CodeEditor] File saved:", filePath)
    } catch (error) {
      console.error("[CodeEditor] Failed to save file:", error)
      // TODO: Show error toast
    }
  }, [
    filePath,
    editorContent,
    isDirty,
    saveFileMutation,
    setOriginalContent,
    setIsDirty,
    onDirtyChange,
    onSave,
  ])

  // Expose save function for external use
  useEffect(() => {
    // Store save function on window for dialog to call
    ;(window as any).__codeEditorSave = handleSave
    return () => {
      delete (window as any).__codeEditorSave
    }
  }, [handleSave])

  return (
    <div className={cn("h-full w-full", className)}>
      <Editor
        height="100%"
        language={language}
        value={editorContent || initialContent}
        theme="vs-dark"
        onMount={handleEditorMount}
        onChange={handleChange}
        loading={
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          tabSize: 2,
          insertSpaces: true,
          padding: { top: 16, bottom: 16 },
          renderWhitespace: "selection",
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          // Accessibility
          accessibilitySupport: "auto",
          // Performance
          renderValidationDecorations: "on",
          // Scroll
          scrollbar: {
            vertical: "auto",
            horizontal: "auto",
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
      />
    </div>
  )
}

// Export language detection helper for use elsewhere
export { getLanguageFromFileName }
