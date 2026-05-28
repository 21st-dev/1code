"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Camera,
  ClipboardPlus,
  Code2,
  Globe2,
  Image as ImageIcon,
  MousePointerClick,
  RefreshCw,
  Send,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Textarea } from "../../../components/ui/textarea"
import { useI18n } from "../../../lib/i18n"
import { cn } from "../../../lib/utils"
import {
  AGENTS_PREVIEW_CONSTANTS,
  DEVICE_PRESETS,
  type DevicePreset,
} from "../constants"
import {
  buildLocalBrowserReport,
  createLocalBrowserClickTrackerScript,
  createLocalBrowserDomSummaryScript,
  normalizeLocalBrowserUrl,
  type LocalBrowserConsoleLevel,
  type LocalBrowserConsoleMessage,
  type LocalBrowserDomSummary,
  type LocalBrowserLoadFailure,
} from "../../../../shared/local-browser-workbench"
import { DevicePresetsBar } from "./device-presets-bar"
import { ScaleControl } from "./scale-control"
import { ViewportToggle } from "./viewport-toggle"

type WebviewElement = HTMLElement & {
  capturePage?: () => Promise<{ toDataURL?: () => string }>
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>
  reload?: () => void
  reloadIgnoringCache?: () => void
}

interface LocalBrowserWorkbenchProps {
  chatId: string
  worktreePath: string
  onClose: () => void
  onInsertReport: (report: string) => void
}

const MAX_CONSOLE_MESSAGES = 30
const MAX_LOAD_FAILURES = 20
const DESKTOP_VIEWPORT = { width: 1280, height: 800 }

export function LocalBrowserWorkbench({
  chatId,
  worktreePath,
  onClose,
  onInsertReport,
}: LocalBrowserWorkbenchProps) {
  const { t } = useI18n()
  const webviewRef = useRef<WebviewElement | null>(null)
  const [urlInput, setUrlInput] = useState("localhost:3000")
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [pageTitle, setPageTitle] = useState("")
  const [viewportMode, setViewportMode] = useState<"desktop" | "mobile">("desktop")
  const [selectedPreset, setSelectedPreset] = useState("iPhone 16")
  const [viewportWidth, setViewportWidth] = useState(DESKTOP_VIEWPORT.width)
  const [viewportHeight, setViewportHeight] = useState(DESKTOP_VIEWPORT.height)
  const [scale, setScale] = useState(75)
  const [consoleMessages, setConsoleMessages] = useState<LocalBrowserConsoleMessage[]>([])
  const [loadFailures, setLoadFailures] = useState<LocalBrowserLoadFailure[]>([])
  const [domSummary, setDomSummary] = useState<LocalBrowserDomSummary | null>(null)
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null)
  const [lastClickedElement, setLastClickedElement] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [lastReport, setLastReport] = useState<string | null>(null)

  const webviewPartition = useMemo(() => {
    const safeId = chatId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "default"
    return `local-browser-${safeId}`
  }, [chatId])

  const previewWidth = viewportMode === "desktop" ? DESKTOP_VIEWPORT.width : viewportWidth
  const previewHeight = viewportMode === "desktop" ? DESKTOP_VIEWPORT.height : viewportHeight
  const scaledWidth = Math.round(previewWidth * (scale / 100))
  const scaledHeight = Math.round(previewHeight * (scale / 100))

  const pushConsoleMessage = useCallback((message: LocalBrowserConsoleMessage) => {
    setConsoleMessages((prev) => [...prev, message].slice(-MAX_CONSOLE_MESSAGES))
  }, [])

  const pushLoadFailure = useCallback((failure: LocalBrowserLoadFailure) => {
    setLoadFailures((prev) => [...prev, failure].slice(-MAX_LOAD_FAILURES))
  }, [])

  const installClickTracker = useCallback(async () => {
    const webview = webviewRef.current
    if (!webview?.executeJavaScript) return
    try {
      await webview.executeJavaScript(createLocalBrowserClickTrackerScript(), true)
    } catch {
      // Some pages can reject script execution during early load. Capture still works without click selection.
    }
  }, [])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview || !currentUrl) return

    const handleStartLoading = () => setIsLoading(true)
    const handleStopLoading = () => {
      setIsLoading(false)
      void installClickTracker()
    }
    const handleDomReady = () => {
      void installClickTracker()
    }
    const handleTitle = (event: any) => {
      if (typeof event.title === "string") setPageTitle(event.title)
    }
    const handleConsole = (event: any) => {
      const text = String(event.message ?? "").trim()
      if (!text) return
      pushConsoleMessage({
        level: normalizeConsoleLevel(event.level),
        text,
        source: event.sourceId ? String(event.sourceId) : undefined,
        line: typeof event.line === "number" ? event.line : undefined,
        timestamp: new Date().toISOString(),
      })
    }
    const handleFailure = (event: any) => {
      if (event.errorCode === -3) return
      pushLoadFailure({
        url: String(event.validatedURL || event.url || currentUrl),
        reason: String(event.errorDescription || event.reason || "Load failed"),
        code: typeof event.errorCode === "number" ? event.errorCode : undefined,
        timestamp: new Date().toISOString(),
      })
      setIsLoading(false)
    }
    const handleNavigate = (event: any) => {
      const nextUrl = String(event.url || "")
      const result = normalizeLocalBrowserUrl(nextUrl)
      if (!result.ok) {
        event.preventDefault?.()
        setUrlError(result.message)
        pushLoadFailure({
          url: nextUrl,
          reason: result.message,
          timestamp: new Date().toISOString(),
        })
        return
      }
      setCurrentUrl(result.url)
      setUrlInput(result.url)
      setUrlError(null)
    }
    const handleNavigated = (event: any) => {
      const nextUrl = String(event.url || "")
      const result = normalizeLocalBrowserUrl(nextUrl)
      if (!result.ok) return
      setCurrentUrl(result.url)
      setUrlInput(result.url)
    }

    webview.addEventListener("did-start-loading", handleStartLoading)
    webview.addEventListener("did-stop-loading", handleStopLoading)
    webview.addEventListener("dom-ready", handleDomReady)
    webview.addEventListener("page-title-updated", handleTitle)
    webview.addEventListener("console-message", handleConsole)
    webview.addEventListener("did-fail-load", handleFailure)
    webview.addEventListener("did-fail-provisional-load", handleFailure)
    webview.addEventListener("will-navigate", handleNavigate)
    webview.addEventListener("did-navigate", handleNavigated)
    webview.addEventListener("did-navigate-in-page", handleNavigated)

    return () => {
      webview.removeEventListener("did-start-loading", handleStartLoading)
      webview.removeEventListener("did-stop-loading", handleStopLoading)
      webview.removeEventListener("dom-ready", handleDomReady)
      webview.removeEventListener("page-title-updated", handleTitle)
      webview.removeEventListener("console-message", handleConsole)
      webview.removeEventListener("did-fail-load", handleFailure)
      webview.removeEventListener("did-fail-provisional-load", handleFailure)
      webview.removeEventListener("will-navigate", handleNavigate)
      webview.removeEventListener("did-navigate", handleNavigated)
      webview.removeEventListener("did-navigate-in-page", handleNavigated)
    }
  }, [currentUrl, installClickTracker, pushConsoleMessage, pushLoadFailure])

  const handleViewportModeChange = useCallback((mode: "desktop" | "mobile") => {
    setViewportMode(mode)
    if (mode === "desktop") {
      setScale(75)
      return
    }
    const preset = findPreset(selectedPreset)
    setViewportWidth(preset.width)
    setViewportHeight(preset.height)
    setScale(75)
  }, [selectedPreset])

  const handlePresetChange = useCallback((presetName: string) => {
    const preset = findPreset(presetName)
    setSelectedPreset(presetName)
    setViewportWidth(preset.width)
    setViewportHeight(preset.height)
  }, [])

  const handleWidthChange = useCallback((width: number) => {
    setSelectedPreset("Custom")
    setViewportWidth(width)
  }, [])

  const handleNavigateSubmit = useCallback((event?: React.FormEvent) => {
    event?.preventDefault()
    const result = normalizeLocalBrowserUrl(urlInput)
    if (!result.ok) {
      setUrlError(result.message)
      return
    }
    setUrlError(null)
    setPageTitle("")
    setDomSummary(null)
    setScreenshotDataUrl(null)
    setLastClickedElement(null)
    setLastReport(null)
    setCurrentUrl(result.url)
    setUrlInput(result.url)
  }, [urlInput])

  const handleReload = useCallback(() => {
    const webview = webviewRef.current
    if (!webview) return
    if (webview.reloadIgnoringCache) {
      webview.reloadIgnoringCache()
    } else {
      webview.reload?.()
    }
  }, [])

  const captureDiagnostics = useCallback(async () => {
    const webview = webviewRef.current
    if (!webview || !currentUrl) return null

    setIsCapturing(true)
    let screenshotCaptured = false
    let nextDomSummary: LocalBrowserDomSummary | null = null
    let selectedElement: string | null = null

    try {
      const image = await webview.capturePage?.()
      const dataUrl = image?.toDataURL?.()
      if (dataUrl) {
        setScreenshotDataUrl(dataUrl)
        screenshotCaptured = true
      }
    } catch {
      toast.error(t("localBrowser.captureFailed"))
    }

    try {
      const result = await webview.executeJavaScript?.(
        createLocalBrowserDomSummaryScript(),
        true,
      )
      nextDomSummary = normalizeDomSummary(result)
      setDomSummary(nextDomSummary)
      if (nextDomSummary?.title) setPageTitle(nextDomSummary.title)
    } catch {
      setDomSummary(null)
    }

    try {
      const result = await webview.executeJavaScript?.(
        "window.__LOCUS_LAST_CLICKED_ELEMENT__ || null",
        true,
      )
      selectedElement = typeof result === "string" ? result : null
      setLastClickedElement(selectedElement)
    } catch {
      selectedElement = null
    }

    const report = buildLocalBrowserReport({
      url: currentUrl,
      title: nextDomSummary?.title || pageTitle,
      viewport: {
        mode: viewportMode,
        width: previewWidth,
        height: previewHeight,
        scale,
      },
      capturedAt: new Date().toISOString(),
      screenshotCaptured,
      note,
      selectedElement,
      domSummary: nextDomSummary,
      consoleMessages,
      loadFailures,
    })
    setLastReport(report)
    setIsCapturing(false)
    toast.success(t("localBrowser.captured"))
    return report
  }, [
    consoleMessages,
    currentUrl,
    loadFailures,
    note,
    pageTitle,
    previewHeight,
    previewWidth,
    scale,
    t,
    viewportMode,
  ])

  const handleCapture = useCallback(() => {
    void captureDiagnostics()
  }, [captureDiagnostics])

  const handleInsertReport = useCallback(async () => {
    const report = lastReport ?? await captureDiagnostics()
    if (!report) return
    onInsertReport(report)
    toast.success(t("localBrowser.reportInserted"))
  }, [captureDiagnostics, lastReport, onInsertReport, t])

  return (
    <div
      data-testid="local-browser-workbench"
      className="flex h-full min-w-0 flex-col bg-background text-foreground"
    >
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-border/50 px-2">
        <div className="flex min-w-0 items-center gap-2">
          <Globe2 className="h-4 w-4 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">{t("localBrowser.title")}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {pageTitle || currentUrl || t("localBrowser.localOnly")}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-6 w-6 rounded-md"
          aria-label={t("common.close")}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <form
        onSubmit={handleNavigateSubmit}
        className="flex flex-shrink-0 items-center gap-1.5 border-b border-border/50 px-2 py-1.5"
      >
        <Input
          value={urlInput}
          onChange={(event) => setUrlInput(event.target.value)}
          placeholder={t("localBrowser.urlPlaceholder")}
          className="h-7 min-w-0 flex-1 rounded-md px-2 py-1 font-mono text-xs"
          spellCheck={false}
          data-testid="local-browser-url-input"
        />
        <Button
          type="submit"
          size="sm"
          className="h-7 gap-1.5 px-2"
          data-testid="local-browser-open-button"
        >
          <Globe2 className="h-3.5 w-3.5" />
          <span className="text-xs">{t("common.open")}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleReload}
          disabled={!currentUrl}
          className="h-7 w-7 rounded-md"
          aria-label={t("localBrowser.reload")}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
      </form>

      {urlError && (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="min-w-0 truncate">{urlError}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/50 px-2 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <ViewportToggle value={viewportMode} onChange={handleViewportModeChange} />
              <ScaleControl value={scale} onChange={setScale} />
            </div>
            {viewportMode === "mobile" && (
              <DevicePresetsBar
                selectedPreset={selectedPreset}
                width={viewportWidth}
                height={viewportHeight}
                onPresetChange={handlePresetChange}
                onWidthChange={handleWidthChange}
                maxWidth={AGENTS_PREVIEW_CONSTANTS.MAX_WIDTH}
                className="min-w-0"
              />
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-3">
            {currentUrl ? (
              <div
                className="origin-top-left overflow-hidden rounded-md border border-border bg-background shadow-sm"
                style={{ width: scaledWidth, height: scaledHeight }}
              >
                <webview
                  key={currentUrl}
                  ref={(element) => {
                    webviewRef.current = element as WebviewElement | null
                  }}
                  src={currentUrl}
                  partition={webviewPartition}
                  className="block bg-background"
                  style={{
                    width: previewWidth,
                    height: previewHeight,
                    transform: `scale(${scale / 100})`,
                    transformOrigin: "top left",
                  }}
                  data-testid="local-browser-webview"
                />
              </div>
            ) : (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <Globe2 className="h-8 w-8" />
                <div>
                  <div className="text-sm font-medium text-foreground">{t("localBrowser.emptyTitle")}</div>
                  <div className="mt-1 max-w-[360px] text-xs">{t("localBrowser.emptyDescription")}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="flex w-[286px] flex-shrink-0 flex-col border-l border-border/50 bg-tl-background">
          <div className="flex flex-shrink-0 items-center gap-1 border-b border-border/50 px-2 py-1.5">
            <Button
              type="button"
              size="sm"
              onClick={handleCapture}
              disabled={!currentUrl || isCapturing}
              className="h-7 flex-1 gap-1.5 px-2"
              data-testid="local-browser-capture-button"
            >
              <Camera className="h-3.5 w-3.5" />
              <span className="text-xs">
                {isCapturing ? t("localBrowser.capturing") : t("localBrowser.capture")}
              </span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => void handleInsertReport()}
              disabled={!currentUrl || isCapturing}
              className="h-7 w-7 rounded-md"
              aria-label={t("localBrowser.insertReport")}
              data-testid="local-browser-insert-report-button"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2 text-xs">
            <section className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium">
                <ClipboardPlus className="h-3.5 w-3.5 text-muted-foreground" />
                {t("localBrowser.annotation")}
              </div>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("localBrowser.notePlaceholder")}
                className="min-h-[74px] resize-none rounded-md text-xs"
                data-testid="local-browser-note"
              />
              <div className="flex items-start gap-1.5 rounded-md bg-muted/50 p-2 text-muted-foreground">
                <MousePointerClick className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span className="min-w-0 break-words">
                  {lastClickedElement || t("localBrowser.noClickedElement")}
                </span>
              </div>
            </section>

            <section className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium">
                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                {t("localBrowser.screenshot")}
              </div>
              {screenshotDataUrl ? (
                <img
                  src={screenshotDataUrl}
                  alt={t("localBrowser.screenshot")}
                  className="aspect-video w-full rounded-md border border-border object-contain bg-background"
                  data-testid="local-browser-screenshot"
                />
              ) : (
                <div className="rounded-md border border-dashed border-border p-3 text-muted-foreground">
                  {t("localBrowser.noScreenshot")}
                </div>
              )}
            </section>

            <DiagnosticsSection
              title={t("localBrowser.domSummary")}
              icon={<Code2 className="h-3.5 w-3.5 text-muted-foreground" />}
              empty={t("localBrowser.noDomSummary")}
              items={formatDomSummary(domSummary)}
            />
            <DiagnosticsSection
              title={t("localBrowser.console")}
              icon={<Code2 className="h-3.5 w-3.5 text-muted-foreground" />}
              empty={t("localBrowser.noConsole")}
              items={consoleMessages.slice(-6).map((message) => `${message.level}: ${message.text}`)}
              itemClassName={(item) => item.startsWith("error") ? "text-destructive" : undefined}
            />
            <DiagnosticsSection
              title={t("localBrowser.failures")}
              icon={<AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />}
              empty={t("localBrowser.noFailures")}
              items={loadFailures.slice(-5).map((failure) => `${failure.reason} - ${failure.url}`)}
              itemClassName={() => "text-destructive"}
            />

            <div className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
              {t("localBrowser.worktree", { path: worktreePath })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function DiagnosticsSection({
  title,
  icon,
  empty,
  items,
  itemClassName,
}: {
  title: string
  icon: React.ReactNode
  empty: string
  items: string[]
  itemClassName?: (item: string) => string | undefined
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-1.5 font-medium">
        {icon}
        {title}
      </div>
      {items.length > 0 ? (
        <div className="space-y-1">
          {items.map((item, index) => (
            <div
              key={`${item}-${index}`}
              className={cn("break-words rounded-md bg-muted/50 p-1.5 text-muted-foreground", itemClassName?.(item))}
            >
              {item}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-2 text-muted-foreground">
          {empty}
        </div>
      )}
    </section>
  )
}

function findPreset(presetName: string): DevicePreset {
  return DEVICE_PRESETS.find((preset) => preset.name === presetName) ?? DEVICE_PRESETS[1]!
}

function normalizeConsoleLevel(level: unknown): LocalBrowserConsoleLevel {
  if (typeof level === "string") {
    if (level === "error" || level === "warning" || level === "info" || level === "debug") return level
    return "log"
  }
  if (level === 3) return "error"
  if (level === 2) return "warning"
  if (level === 1) return "info"
  if (level === 0) return "debug"
  return "log"
}

function normalizeDomSummary(value: unknown): LocalBrowserDomSummary | null {
  if (!value || typeof value !== "object") return null
  const source = value as Partial<LocalBrowserDomSummary>
  return {
    title: typeof source.title === "string" ? source.title : "",
    url: typeof source.url === "string" ? source.url : "",
    activeElement: typeof source.activeElement === "string" ? source.activeElement : null,
    headings: normalizeStringList(source.headings),
    buttons: normalizeStringList(source.buttons),
    links: normalizeStringList(source.links),
    inputs: normalizeStringList(source.inputs),
    textSample: typeof source.textSample === "string" ? source.textSample : "",
  }
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 12)
    : []
}

function formatDomSummary(summary: LocalBrowserDomSummary | null): string[] {
  if (!summary) return []
  const items: string[] = []
  if (summary.headings.length) items.push(`Headings: ${summary.headings.join(" | ")}`)
  if (summary.buttons.length) items.push(`Buttons: ${summary.buttons.join(" | ")}`)
  if (summary.inputs.length) items.push(`Inputs: ${summary.inputs.join(" | ")}`)
  if (summary.links.length) items.push(`Links: ${summary.links.join(" | ")}`)
  if (summary.activeElement) items.push(`Active: ${summary.activeElement}`)
  if (summary.textSample) items.push(`Text: ${summary.textSample.slice(0, 220)}`)
  return items
}
