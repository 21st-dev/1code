import { memo, useState, useEffect, useRef, useCallback } from "react"
import { useTheme } from "next-themes"
import { Copy, Check, Download, AlertTriangle, RotateCcw, Maximize2, X, ZoomIn, ZoomOut, RotateCcw as ResetZoom } from "lucide-react"
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch"
import { cn } from "../lib/utils"
import { useI18n } from "../lib/i18n"
import {
  Dialog,
  DialogContent,
  DialogPortal,
  DialogTitle,
} from "./ui/dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
import {
  MERMAID_SECURITY_LEVEL,
  sanitizeMermaidSvg,
} from "../lib/security/mermaid-svg-sanitizer"

// Lazy load mermaid to avoid bundle size impact (~500KB)
let mermaidPromise: Promise<typeof import("mermaid")> | null = null
const getMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid")
  }
  return mermaidPromise
}

// Clean up mermaid error SVGs that get added to the DOM
const cleanupMermaidErrors = () => {
  // Mermaid adds error SVGs with id starting with 'd' or 'mermaid-' to the body
  const errorSvgs = document.querySelectorAll('svg[id^="mermaid-"]')
  errorSvgs.forEach((svg) => {
    // Only remove if it's directly in body (error artifacts)
    if (svg.parentElement === document.body) {
      svg.remove()
    }
  })
  // Also clean up any container divs mermaid creates
  const containers = document.querySelectorAll('div[id^="dmermaid-"], div[id^="d"]')
  containers.forEach((div) => {
    if (div.parentElement === document.body && div.querySelector('svg')) {
      div.remove()
    }
  })
}

interface MermaidBlockProps {
  code: string
  size?: "sm" | "md" | "lg"
  isStreaming?: boolean
}

type RenderState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; svg: string }
  | { status: "error"; message: string }
  | { status: "parsing" } // Syntax not yet valid - show "Creating diagram..."

// Mermaid theme configuration based on app theme
const getMermaidConfig = (isDark: boolean): Record<string, unknown> => ({
  startOnLoad: false,
  theme: isDark ? "dark" : "default",
  themeVariables: isDark
    ? {
        // Dark theme variables matching the app's color scheme
        primaryColor: "#3b82f6",
        primaryTextColor: "#f4f4f5",
        primaryBorderColor: "#52525b",
        lineColor: "#71717a",
        secondaryColor: "#27272a",
        tertiaryColor: "#18181b",
        background: "#18181b",
        mainBkg: "#27272a",
        nodeBorder: "#52525b",
        clusterBkg: "#27272a",
        defaultLinkColor: "#71717a",
        titleColor: "#f4f4f5",
        edgeLabelBackground: "#27272a",
        actorTextColor: "#f4f4f5",
        actorBorder: "#52525b",
        actorBkg: "#27272a",
        signalColor: "#f4f4f5",
        signalTextColor: "#18181b",
        labelBoxBkgColor: "#27272a",
        labelBoxBorderColor: "#52525b",
        labelTextColor: "#f4f4f5",
        loopTextColor: "#f4f4f5",
        noteBorderColor: "#52525b",
        noteBkgColor: "#27272a",
        noteTextColor: "#f4f4f5",
        sectionBkgColor: "#27272a",
        altSectionBkgColor: "#18181b",
        sectionBkgColor2: "#27272a",
        taskBorderColor: "#52525b",
        taskBkgColor: "#3b82f6",
        taskTextColor: "#f4f4f5",
        taskTextLightColor: "#f4f4f5",
        taskTextOutsideColor: "#f4f4f5",
        activeTaskBorderColor: "#3b82f6",
        gridColor: "#52525b",
        doneTaskBkgColor: "#27272a",
        doneTaskBorderColor: "#52525b",
        critBkgColor: "#dc2626",
        critBorderColor: "#ef4444",
        todayLineColor: "#3b82f6",
        // Sequence diagram
        sequenceNumberColor: "#f4f4f5",
        // Class diagram
        classText: "#f4f4f5",
        // State diagram
        labelColor: "#f4f4f5",
        // ER diagram
        attributeBackgroundColorOdd: "#27272a",
        attributeBackgroundColorEven: "#18181b",
      }
    : {
        // Light theme variables
        primaryColor: "#3b82f6",
        primaryTextColor: "#18181b",
        primaryBorderColor: "#d4d4d8",
        lineColor: "#71717a",
        secondaryColor: "#f4f4f5",
        tertiaryColor: "#fafafa",
        background: "#ffffff",
        mainBkg: "#fafafa",
        nodeBorder: "#d4d4d8",
        clusterBkg: "#f4f4f5",
        defaultLinkColor: "#71717a",
        titleColor: "#18181b",
        edgeLabelBackground: "#fafafa",
      },
  securityLevel: MERMAID_SECURITY_LEVEL,
  fontFamily: "inherit",
})

// Zoom controls component for the fullscreen viewer
function ZoomControls() {
  const { t } = useI18n()
  const { zoomIn, zoomOut, resetTransform } = useControls()

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 rounded-full px-4 py-2 z-10">
      <button
        onClick={() => zoomOut()}
        className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-white"
        type="button"
        aria-label={t("mermaid.zoomOut")}
      >
        <ZoomOut className="size-5" />
      </button>
      <button
        onClick={() => zoomIn()}
        className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-white"
        type="button"
        aria-label={t("mermaid.zoomIn")}
      >
        <ZoomIn className="size-5" />
      </button>
      <div className="w-px h-5 bg-white/20 mx-1" />
      <button
        onClick={() => resetTransform()}
        className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-white"
        type="button"
        aria-label={t("mermaid.resetZoom")}
      >
        <ResetZoom className="size-5" />
      </button>
    </div>
  )
}

// Debounce delay before attempting to render
const RENDER_DEBOUNCE_MS = 600

// Global cache for rendered mermaid diagrams to persist across remounts
const mermaidCache = new Map<string, string>()

// Track which mermaid blocks have finished streaming (by first N chars of code as ID)
const finishedStreamingBlocks = new Set<string>()

// Streaming placeholder - simple static text, no spinner
const StreamingPlaceholder = memo(function StreamingPlaceholder() {
  const { t } = useI18n()

  return (
    <div className="relative mt-2 mb-4 rounded-[10px] bg-muted/50 overflow-hidden">
      <div className="p-4 min-h-[60px] flex items-center justify-center">
        <span className="text-muted-foreground text-sm">
          {t("mermaid.creating")}
        </span>
      </div>
    </div>
  )
})

// Main mermaid block - handles actual rendering when not streaming
const MermaidBlockInner = memo(function MermaidBlockInner({
  code,
}: {
  code: string
}) {
  const { t } = useI18n()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const [renderState, setRenderState] = useState<RenderState>(() => {
    // Check cache on initial render
    const cacheKey = `${code}-${isDark ? 'dark' : 'light'}`
    const cached = mermaidCache.get(cacheKey)
    if (cached) {
      return { status: "success", svg: cached }
    }
    return { status: "idle" }
  })
  const [copied, setCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const renderIdRef = useRef(0)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Track the last successfully rendered code to avoid re-rendering same content
  const lastRenderedCodeRef = useRef<string>("")
  const lastRenderedThemeRef = useRef<boolean | null>(null)

  const doRender = useCallback(async () => {
    // Increment render ID to handle race conditions
    renderIdRef.current += 1
    const currentRenderId = renderIdRef.current

    setRenderState({ status: "loading" })

    try {
      const mermaidModule = await getMermaid()
      const mermaid = mermaidModule.default

      // Check if this render is still current
      if (currentRenderId !== renderIdRef.current) return

      // Initialize/reinitialize mermaid with current theme
      mermaid.initialize(getMermaidConfig(isDark))

      // Generate unique ID for this render
      const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

      const { svg } = await mermaid.render(id, code)
      const sanitizedSvg = sanitizeMermaidSvg(svg)

      // Check again if this render is still current
      if (currentRenderId !== renderIdRef.current) return

      // Cache the result for future remounts
      const cacheKey = `${code}-${isDark ? 'dark' : 'light'}`
      mermaidCache.set(cacheKey, sanitizedSvg)

      setRenderState({ status: "success", svg: sanitizedSvg })
      lastRenderedCodeRef.current = code
      lastRenderedThemeRef.current = isDark

      // Clean up any error artifacts mermaid left in DOM
      cleanupMermaidErrors()
    } catch (error) {
      if (currentRenderId !== renderIdRef.current) return

      const message =
        error instanceof Error ? error.message : "Failed to render diagram"

      // Clean up error SVGs that mermaid adds to DOM
      cleanupMermaidErrors()

      // Check if this is a parse/syntax error (incomplete diagram)
      const isParseError = message.toLowerCase().includes("parse error") ||
        message.toLowerCase().includes("syntax error") ||
        message.toLowerCase().includes("expecting") ||
        message.toLowerCase().includes("unexpected") ||
        message.toLowerCase().includes("no diagram type detected") ||
        message.toLowerCase().includes("lexical error")

      if (isParseError && !lastRenderedCodeRef.current) {
        // Show "Creating diagram..." only if we haven't successfully rendered before
        setRenderState({ status: "parsing" })
      } else {
        setRenderState({ status: "error", message })
      }
    }
  }, [code, isDark])

  const renderDiagram = useCallback(() => {
    // Skip if code is too short
    if (code.trim().length < 10) {
      setRenderState({ status: "idle" })
      return
    }

    // Check for obviously incomplete syntax
    const hasUnclosedBrackets = (str: string) => {
      const opens = (str.match(/\[/g) || []).length
      const closes = (str.match(/\]/g) || []).length
      return opens > closes
    }
    const hasUnclosedBraces = (str: string) => {
      const opens = (str.match(/\{/g) || []).length
      const closes = (str.match(/\}/g) || []).length
      return opens > closes
    }
    const hasUnclosedParens = (str: string) => {
      const opens = (str.match(/\(/g) || []).length
      const closes = (str.match(/\)/g) || []).length
      return opens > closes
    }
    const hasUnclosedQuotes = (str: string) => {
      const quotes = (str.match(/"/g) || []).length
      return quotes % 2 !== 0
    }

    const looksIncomplete = hasUnclosedBrackets(code) ||
                           hasUnclosedBraces(code) ||
                           hasUnclosedParens(code) ||
                           hasUnclosedQuotes(code)

    if (looksIncomplete) {
      setRenderState({ status: "parsing" })
      return
    }

    // Debounce: wait for code to stabilize before rendering
    // This prevents rapid-fire render attempts during streaming
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    // Show loading state while waiting
    setRenderState({ status: "parsing" })

    debounceTimeoutRef.current = setTimeout(() => {
      doRender()
    }, RENDER_DEBOUNCE_MS)
  }, [code, doRender])

  // Render on mount and when code/theme changes
  useEffect(() => {
    // Check if we have a cached result
    const cacheKey = `${code}-${isDark ? 'dark' : 'light'}`
    const cached = mermaidCache.get(cacheKey)
    if (cached) {
      setRenderState({ status: "success", svg: cached })
      lastRenderedCodeRef.current = code
      lastRenderedThemeRef.current = isDark
      return
    }

    // Only re-render if code or theme actually changed
    if (code === lastRenderedCodeRef.current && isDark === lastRenderedThemeRef.current) {
      return
    }
    renderDiagram()
  }, [code, isDark, renderDiagram])

  // Cleanup mermaid artifacts and debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
      cleanupMermaidErrors()
    }
  }, [])

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  const handleDownload = useCallback(async () => {
    if (renderState.status !== "success") return

    const blob = new Blob([renderState.svg], { type: "image/svg+xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "diagram.svg"
    a.click()
    URL.revokeObjectURL(url)
  }, [renderState])

  const openFullscreen = useCallback(() => {
    setIsFullscreen(true)
  }, [])

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false)
  }, [])

  return (
    <>
      <div className="relative mt-2 mb-4 rounded-[10px] bg-muted/50 overflow-hidden">
        {/* Toolbar */}
        <div className="absolute top-[6px] right-[6px] flex gap-1 z-[2]">
          <button
            onClick={handleCopy}
            tabIndex={-1}
            className="p-1"
            title={copied ? t("mermaid.copied") : t("mermaid.copyCode")}
          >
            <div className="relative w-3.5 h-3.5">
              <Copy
                className={cn(
                  "absolute inset-0 w-3 h-3 text-muted-foreground transition-[opacity,transform] duration-200 ease-out hover:text-foreground",
                  copied ? "opacity-0 scale-50" : "opacity-100 scale-100",
                )}
              />
              <Check
                className={cn(
                  "absolute inset-0 w-3 h-3 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                  copied ? "opacity-100 scale-100" : "opacity-0 scale-50",
                )}
              />
            </div>
          </button>
          {renderState.status === "success" && (
            <>
              <button
                onClick={handleDownload}
                tabIndex={-1}
                className="p-1"
                title={t("mermaid.downloadSvg")}
              >
                <Download className="w-3 h-3 text-muted-foreground hover:text-foreground transition-colors" />
              </button>
              <button
                onClick={openFullscreen}
                tabIndex={-1}
                className="p-1"
                title={t("mermaid.viewFullscreen")}
              >
                <Maximize2 className="w-3 h-3 text-muted-foreground hover:text-foreground transition-colors" />
              </button>
            </>
          )}
        </div>

        {/* Content */}
        <div className="p-4 min-h-[60px] flex items-center justify-center">
          {renderState.status === "idle" && (
            <div className="text-muted-foreground text-sm">
              {t("mermaid.waiting")}
            </div>
          )}

          {(renderState.status === "loading" || renderState.status === "parsing") && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span>{t("mermaid.creating")}</span>
            </div>
          )}

          {renderState.status === "success" && (
            <div
              className={cn(
                "mermaid-diagram w-full overflow-x-auto cursor-pointer",
                "[&_svg]:max-w-full [&_svg]:h-auto [&_svg]:mx-auto",
              )}
              onClick={openFullscreen}
              dangerouslySetInnerHTML={{ __html: renderState.svg }}
            />
          )}

          {renderState.status === "error" && (
            <div className="w-full">
              <div className="flex items-start gap-2 text-destructive text-sm mb-3">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="break-words">{renderState.message}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={renderDiagram}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-accent transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  {t("common.retry")}
                </button>
              </div>
              <details className="mt-3">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  {t("mermaid.showDiagramCode")}
                </summary>
                <pre className="mt-2 p-2 rounded bg-muted text-xs overflow-x-auto whitespace-pre-wrap break-words font-mono">
                  {code}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen dialog with zoom/pan using react-zoom-pan-pinch */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogPortal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className="fixed inset-0 z-50 flex items-center justify-center outline-none overflow-hidden"
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <VisuallyHidden.Root>
              <DialogTitle>{t("mermaid.viewerTitle")}</DialogTitle>
            </VisuallyHidden.Root>

            {/* Close button */}
            <button
              onClick={closeFullscreen}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors text-white z-20"
              type="button"
              aria-label={t("mermaid.closeFullscreen")}
            >
              <X className="size-6" />
            </button>

            {/* Diagram viewer with zoom/pan */}
            {renderState.status === "success" && (
              <div className="w-full h-full overflow-hidden">
                <TransformWrapper
                  initialScale={1}
                  minScale={0.1}
                  maxScale={8}
                  centerOnInit
                  limitToBounds={false}
                  wheel={{ smoothStep: 0.1 }}
                  panning={{ velocityDisabled: true }}
                >
                  <ZoomControls />
                  <TransformComponent
                    wrapperClass="!w-full !h-full"
                    contentClass="!w-full !h-full flex items-center justify-center"
                  >
                    <div
                      className={cn(
                        "mermaid-diagram-fullscreen p-8",
                        "[&_svg]:max-w-none [&_svg]:h-auto",
                        isDark ? "" : "[&_svg]:filter [&_svg]:drop-shadow-lg"
                      )}
                      dangerouslySetInnerHTML={{ __html: renderState.svg }}
                    />
                  </TransformComponent>
                </TransformWrapper>
              </div>
            )}

            {/* Keyboard hints */}
            <div className="absolute bottom-6 right-4 text-white/50 text-xs z-10">
              Scroll to zoom | Drag to pan | Esc to close
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </>
  )
})

// Check if mermaid code looks complete (basic heuristics)
function looksComplete(code: string): boolean {
  if (code.trim().length < 20) return false

  // Check for balanced brackets/braces/parens
  const opens = {
    '[': (code.match(/\[/g) || []).length,
    '{': (code.match(/\{/g) || []).length,
    '(': (code.match(/\(/g) || []).length,
  }
  const closes = {
    ']': (code.match(/\]/g) || []).length,
    '}': (code.match(/\}/g) || []).length,
    ')': (code.match(/\)/g) || []).length,
  }

  if (opens['['] > closes[']']) return false
  if (opens['{'] > closes['}']) return false
  if (opens['('] > closes[')']) return false

  // Check for incomplete statements at end
  const trimmed = code.trim()
  if (trimmed.endsWith('--') || trimmed.endsWith('->') || trimmed.endsWith('->>')) return false
  if (trimmed.endsWith(':')) return false

  // Looks complete enough to try rendering
  return true
}

// Generate a stable ID for a mermaid block based on its content
function getBlockId(code: string): string {
  // Use first line (diagram type declaration) as stable ID
  const firstLine = code.split('\n')[0] || ''
  return firstLine.slice(0, 50)
}

// Exported component that handles streaming state
// When streaming, shows placeholder. When done, renders the diagram.
export function MermaidBlock({
  code,
  isStreaming = false,
}: MermaidBlockProps) {
  const blockId = getBlockId(code)
  const codeComplete = looksComplete(code)

  // Once streaming ends for this block, mark it as finished globally
  useEffect(() => {
    if (!isStreaming && codeComplete) {
      finishedStreamingBlocks.add(blockId)
    }
  }, [isStreaming, blockId, codeComplete])

  // Check if this block has finished streaming before (survives remounts)
  const hasFinishedBefore = finishedStreamingBlocks.has(blockId)

  // Show placeholder if:
  // 1. We're streaming AND
  // 2. Block hasn't finished before AND
  // 3. Code doesn't look complete yet
  if (isStreaming && !hasFinishedBefore && !codeComplete) {
    return <StreamingPlaceholder />
  }

  // Otherwise try to render the diagram
  return <MermaidBlockInner code={code} />
}

MermaidBlock.displayName = "MermaidBlock"
