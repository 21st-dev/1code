"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { atom, useAtom, useSetAtom } from "jotai"
import { atomWithStorage, atomFamily } from "jotai/utils"
import {
  Play,
  Square,
  ChevronDown,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Bug,
  Copy,
  MousePointer2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ResizableSidebar } from "@/components/ui/resizable-sidebar"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { IconDoubleChevronRight } from "@/components/ui/icons"
import { trpc } from "@/lib/trpc"
import { parseAndMergeUrls } from "./url-parser"
import { TerminalOutput } from "./terminal-output"
import type { DetectedUrl } from "./types"
import type { TerminalStreamEvent } from "../terminal/types"

// ============================================================================
// Helpers
// ============================================================================

const isLocalUrl = (url: string): boolean => {
  try {
    const { hostname } = new URL(url)
    return hostname === "localhost" || hostname === "127.0.0.1"
  } catch {
    return false
  }
}

// ============================================================================
// Atoms
// ============================================================================

export const previewSidebarOpenAtom = atomWithStorage<boolean>(
  "preview-sidebar-open",
  false,
  undefined,
  { getOnInit: true }
)

export const previewSidebarWidthAtom = atomWithStorage<number>(
  "preview-sidebar-width",
  500,
  undefined,
  { getOnInit: true }
)

export const previewSplitPositionAtom = atomWithStorage<number>(
  "preview-split-position",
  60,
  undefined,
  { getOnInit: true }
)

// Track which chats have running dev servers (for sidebar indicator)
export const runningDevServersAtom = atom<Set<string>>(new Set())

// Per-chat preview state (UI state only - backend is source of truth for running)
interface PreviewState {
  detectedUrls: DetectedUrl[]
  selectedUrl: string | null
  currentUrl: string | null // Tracks where user navigated to (persists across worktree switches)
  output: string[]
}

const initialPreviewState: PreviewState = {
  detectedUrls: [],
  selectedUrl: null,
  currentUrl: null,
  output: [],
}

export const previewStateFamily = atomFamily((chatId: string) =>
  atom<PreviewState>(initialPreviewState)
)

// ============================================================================
// Component
// ============================================================================

interface PreviewSidebarProps {
  chatId: string
  worktreePath: string | null
  onElementSelect?: (
    html: string,
    componentName: string | null,
    filePath: string | null
  ) => void
}

function getPaneId(chatId: string): string {
  return `${chatId}:preview:dev`
}

// React Grab injection script
// Uses window.__REACT_GRAB__ which is the auto-initialized API from the library
const REACT_GRAB_INJECT_SCRIPT = `
(function() {
  // If already loaded and API available, just activate
  if (window.__REACT_GRAB__) {
    console.log('[ReactGrab] Already loaded, activating...');
    if (window.__REACT_GRAB__.activate) {
      window.__REACT_GRAB__.activate();
    }
    // Register our plugin if not already registered
    if (!window.__ELEMENT_CAPTURE_REGISTERED__ && window.__REACT_GRAB__.registerPlugin) {
      window.__ELEMENT_CAPTURE_REGISTERED__ = true;
      window.__REACT_GRAB__.registerPlugin({
        name: 'element-capture',
        hooks: {
          onCopySuccess: function(elements, content) {
            if (elements && elements.length > 0) {
              const el = elements[0];
              const data = {
                html: el.outerHTML ? el.outerHTML.slice(0, 10000) : content.slice(0, 10000),
                componentName: el.__reactGrabInfo?.componentName || el.__reactGrabInfo?.name || null,
                filePath: el.__reactGrabInfo?.filePath || el.__reactGrabInfo?.source || null,
              };
              console.log('__ELEMENT_SELECTED__:' + JSON.stringify(data));
            }
          }
        }
      });
    }
    return;
  }

  console.log('[ReactGrab] Loading script...');
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/react-grab/dist/index.global.js';
  script.crossOrigin = 'anonymous';

  // Listen for the custom init event that react-grab dispatches
  window.addEventListener('react-grab:init', function(e) {
    console.log('[ReactGrab] Init event received', e.detail);
    const api = e.detail || window.__REACT_GRAB__;
    if (api) {
      // Register our plugin
      if (api.registerPlugin && !window.__ELEMENT_CAPTURE_REGISTERED__) {
        window.__ELEMENT_CAPTURE_REGISTERED__ = true;
        api.registerPlugin({
          name: 'element-capture',
          hooks: {
            onCopySuccess: function(elements, content) {
              if (elements && elements.length > 0) {
                const el = elements[0];
                const data = {
                  html: el.outerHTML ? el.outerHTML.slice(0, 10000) : content.slice(0, 10000),
                  componentName: el.__reactGrabInfo?.componentName || el.__reactGrabInfo?.name || null,
                  filePath: el.__reactGrabInfo?.filePath || el.__reactGrabInfo?.source || null,
                };
                console.log('__ELEMENT_SELECTED__:' + JSON.stringify(data));
              }
            }
          }
        });
      }
      // Activate selection mode
      if (api.activate) {
        console.log('[ReactGrab] Activating...');
        api.activate();
      }
    }
  }, { once: true });

  script.onload = function() {
    console.log('[ReactGrab] Script loaded');
    // The react-grab:init event should fire, but fallback just in case
    setTimeout(function() {
      if (window.__REACT_GRAB__ && !window.__ELEMENT_CAPTURE_REGISTERED__) {
        console.log('[ReactGrab] Fallback initialization');
        const api = window.__REACT_GRAB__;
        if (api.registerPlugin) {
          window.__ELEMENT_CAPTURE_REGISTERED__ = true;
          api.registerPlugin({
            name: 'element-capture',
            hooks: {
              onCopySuccess: function(elements, content) {
                if (elements && elements.length > 0) {
                  const el = elements[0];
                  const data = {
                    html: el.outerHTML ? el.outerHTML.slice(0, 10000) : content.slice(0, 10000),
                    componentName: el.__reactGrabInfo?.componentName || el.__reactGrabInfo?.name || null,
                    filePath: el.__reactGrabInfo?.filePath || el.__reactGrabInfo?.source || null,
                  };
                  console.log('__ELEMENT_SELECTED__:' + JSON.stringify(data));
                }
              }
            }
          });
        }
        if (api.activate) {
          api.activate();
        }
      }
    }, 200);
  };

  script.onerror = function(err) {
    console.error('[ReactGrab] Failed to load:', err);
  };

  document.head.appendChild(script);
})();
`

const REACT_GRAB_DEACTIVATE_SCRIPT = `
(function() {
  if (window.__REACT_GRAB__ && window.__REACT_GRAB__.deactivate) {
    console.log('[ReactGrab] Deactivating...');
    window.__REACT_GRAB__.deactivate();
  }
})();
`

export function PreviewSidebar({ chatId, worktreePath, onElementSelect }: PreviewSidebarProps) {
  const [isOpen, setIsOpen] = useAtom(previewSidebarOpenAtom)
  const [splitPosition, setSplitPosition] = useAtom(previewSplitPositionAtom)

  const stateAtom = useMemo(() => previewStateFamily(chatId), [chatId])
  const [state, setState] = useAtom(stateAtom)

  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const webviewContainerRef = useRef<HTMLDivElement>(null)
  const panelContainerRef = useRef<HTMLDivElement>(null)

  // Track if any resize is happening (blocks webview pointer events)
  const [isSplitResizing, setIsSplitResizing] = useState(false)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const isAnyResizing = isSplitResizing || isSidebarResizing

  // Element selector state
  const [isSelectorActive, setIsSelectorActive] = useState(false)

  const paneId = useMemo(() => getPaneId(chatId), [chatId])

  // tRPC mutations
  const createOrAttach = trpc.terminal.createOrAttach.useMutation()
  const write = trpc.terminal.write.useMutation()
  const kill = trpc.terminal.kill.useMutation()
  const signal = trpc.terminal.signal.useMutation()

  // Running state derived from subscription events (no polling needed)
  const [isRunning, setIsRunning] = useState(false)

  // Sync running state to global atom for sidebar indicator
  const setRunningDevServers = useSetAtom(runningDevServersAtom)
  useEffect(() => {
    setRunningDevServers(prev => {
      const next = new Set(prev)
      if (isRunning) {
        next.add(chatId)
      } else {
        next.delete(chatId)
      }
      return next
    })
  }, [isRunning, chatId, setRunningDevServers])

  // Track webview readiness via ref (avoids re-renders)
  const webviewReadyRef = useRef(false)

  // Check for existing session on mount (handles sidebar reopen while process running)
  const { data: initialSession } = trpc.terminal.getSession.useQuery(paneId, {
    enabled: isOpen,
    staleTime: Infinity, // Only fetch once
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Sync initial session state (handles sidebar reopen after process exited)
  useEffect(() => {
    if (initialSession !== undefined) {
      setIsRunning(initialSession?.isAlive ?? false)
    }
  }, [initialSession])

  // Handle terminal stream events (started, data, exit)
  const handleStream = useCallback(
    (event: TerminalStreamEvent) => {
      if (event.type === "started") {
        setIsRunning(true)
      } else if (event.type === "data" && event.data) {
        setState(s => {
          const output = [...s.output, event.data!].slice(-1000)
          const { urls, hasNew } = parseAndMergeUrls(event.data!, s.detectedUrls)

          return {
            ...s,
            output,
            ...(hasNew && {
              detectedUrls: urls,
              selectedUrl: s.selectedUrl || urls[0]?.url || null,
            }),
          }
        })
      } else if (event.type === "exit") {
        setIsRunning(false)
        setState(s => ({
          ...s,
          output: [...s.output, `\n[Exited with code ${event.exitCode}]`],
        }))
      }
    },
    [setState]
  )

  // Always subscribe when sidebar is open - subscription receives lifecycle events
  trpc.terminal.stream.useSubscription(paneId, {
    onData: handleStream,
    onError: (err) => {
      console.error("[PreviewSidebar] Stream error:", err)
      setIsRunning(false)
      setState(s => ({ ...s, output: [...s.output, `\n[Error: ${err.message}]`] }))
    },
    enabled: isOpen,
  })

  // Actions
  const handleStart = useCallback(async () => {
    if (!worktreePath) return

    setState(s => ({
      ...s,
      output: [],
      detectedUrls: [],
      selectedUrl: null,
    }))

    try {
      const result = await createOrAttach.mutateAsync({
        paneId,
        cwd: worktreePath,
        cols: 120,
        rows: 30,
      })

      if (result.isNew) {
        write.mutate({ paneId, data: "bun run dev\r" })
      }
      // isRunning will be set by 'started' event from subscription
    } catch (err) {
      console.error("[PreviewSidebar] Start failed:", err)
      setState(s => ({
        ...s,
        output: [...s.output, `[Failed: ${err instanceof Error ? err.message : "Unknown"}]`],
      }))
    }
  }, [worktreePath, paneId, createOrAttach, write, setState])

  const handleStop = useCallback(async () => {
    if (!isRunning) return

    // Optimistically update UI immediately for responsiveness
    setIsRunning(false)

    try {
      // Send SIGTERM first (more reliable than SIGINT for dev servers)
      await signal.mutateAsync({ paneId, signal: "SIGTERM" })

      // Give process time to terminate gracefully
      await new Promise(r => setTimeout(r, 1000))

      // Force kill if still running
      await kill.mutateAsync({ paneId })
    } catch {
      // Session might already be dead, that's ok
    }
    // Final isRunning state will be confirmed by 'exit' event from subscription
  }, [isRunning, paneId, signal, kill])

  const handleRefresh = useCallback(() => {
    if (webviewReadyRef.current && webviewRef.current) {
      webviewRef.current.reload()
    }
  }, [])

  const handleOpenExternal = useCallback(() => {
    if (state.selectedUrl) {
      window.desktopApi?.openExternal(state.selectedUrl)
    }
  }, [state.selectedUrl])

  const handleBack = useCallback(() => {
    if (webviewReadyRef.current && webviewRef.current) {
      webviewRef.current.goBack()
    }
  }, [])

  const handleForward = useCallback(() => {
    if (webviewReadyRef.current && webviewRef.current) {
      webviewRef.current.goForward()
    }
  }, [])

  const handleDevTools = useCallback(() => {
    const webview = webviewRef.current
    if (!webview) {
      console.warn("[PreviewSidebar] DevTools: webview ref is null")
      return
    }

    try {
      if (webview.isDevToolsOpened()) {
        webview.closeDevTools()
      } else {
        // Webview DevTools must open in detached mode (separate window)
        webview.openDevTools()
      }
    } catch (err) {
      console.error("[PreviewSidebar] DevTools error:", err)
    }
  }, [])

  const handleSelectUrl = useCallback(
    (url: string) => setState(s => ({ ...s, selectedUrl: url })),
    [setState]
  )

  const handleCopyLogs = useCallback(() => {
    const logs = state.output.join("")
    window.desktopApi?.clipboardWrite(logs)
  }, [state.output])

  const handleToggleSelector = useCallback(() => {
    if (!webviewReadyRef.current || !webviewRef.current) return

    if (isSelectorActive) {
      setIsSelectorActive(false)
      webviewRef.current.executeJavaScript(REACT_GRAB_DEACTIVATE_SCRIPT).catch(() => {
        // Ignore errors if webview is not ready
      })
    } else {
      setIsSelectorActive(true)
      webviewRef.current.executeJavaScript(REACT_GRAB_INJECT_SCRIPT).catch(() => {
        // Ignore errors if webview is not ready
      })
    }
  }, [isSelectorActive])

  // Track the base URL for redirect handling
  const baseUrlRef = useRef<string | null>(null)

  // Ref to access onElementSelect in event handlers without re-creating useEffect
  const onElementSelectRef = useRef(onElementSelect)
  onElementSelectRef.current = onElementSelect

  // Ref to access setIsSelectorActive in event handlers
  const setIsSelectorActiveRef = useRef(setIsSelectorActive)
  setIsSelectorActiveRef.current = setIsSelectorActive

  // Ref to access setState in event handlers (for persisting currentUrl)
  const setStateRef = useRef(setState)
  setStateRef.current = setState

  // Ref to access current URL in webview creation effect (prefer currentUrl over selectedUrl)
  const urlToLoadRef = useRef(state.currentUrl ?? state.selectedUrl)
  urlToLoadRef.current = state.currentUrl ?? state.selectedUrl

  // Track pending URL navigation (for when webview isn't ready yet)
  const pendingUrlRef = useRef<string | null>(null)

  // Create webview once when sidebar opens (stable instance)
  useEffect(() => {
    const container = webviewContainerRef.current
    if (!container) return

    // Create webview element
    const webview = document.createElement("webview") as Electron.WebviewTag
    webview.setAttribute("allowpopups", "")
    webview.setAttribute("partition", "persist:preview")
    webview.setAttribute("webpreferences", "devTools=yes")
    webview.style.cssText = "flex: 1 1 auto; border: none; min-width: 0; min-height: 0;"

    // Set ref immediately so methods work right away
    webviewRef.current = webview
    webviewReadyRef.current = false

    const handleDomReady = () => {
      webviewReadyRef.current = true

      // If there's a pending URL to navigate to, do it now
      // Prefer currentUrl (where user navigated) over selectedUrl (base URL from dropdown)
      const urlToLoad = pendingUrlRef.current || urlToLoadRef.current
      if (urlToLoad && webview.src !== urlToLoad) {
        baseUrlRef.current = urlToLoad
        pendingUrlRef.current = null
        webview.src = urlToLoad
      }
    }

    const handleWillNavigate = (e: Event) => {
      const event = e as unknown as { url: string; preventDefault: () => void }
      if (!isLocalUrl(event.url)) {
        event.preventDefault()
        window.desktopApi?.openExternal(event.url)
      }
    }

    const handleDidNavigate = (e: Event) => {
      const event = e as unknown as { url: string }
      if (!isLocalUrl(event.url) && baseUrlRef.current) {
        window.desktopApi?.openExternal(event.url)
        webview.src = baseUrlRef.current
      } else if (isLocalUrl(event.url) && event.url !== "about:blank") {
        // Persist the current URL so it's restored when switching worktrees
        setStateRef.current(s => ({ ...s, currentUrl: event.url }))
      }
    }

    // Handle in-page navigation (hash changes, pushState for SPAs)
    const handleDidNavigateInPage = (e: Event) => {
      const event = e as unknown as { url: string; isMainFrame: boolean }
      if (event.isMainFrame && isLocalUrl(event.url)) {
        setStateRef.current(s => ({ ...s, currentUrl: event.url }))
      }
    }

    const handleNewWindow = (e: Event) => {
      const event = e as unknown as { url: string; preventDefault: () => void }
      event.preventDefault()
      if (isLocalUrl(event.url)) {
        webview.src = event.url
      } else {
        window.desktopApi?.openExternal(event.url)
      }
    }

    // Handle console messages from webview (for React Grab element selection)
    const handleConsoleMessage = (e: Event) => {
      const event = e as unknown as { message: string; level: number }
      if (event.message.startsWith("__ELEMENT_SELECTED__:")) {
        try {
          const jsonStr = event.message.slice("__ELEMENT_SELECTED__:".length)
          const data = JSON.parse(jsonStr) as {
            html: string
            componentName: string | null
            filePath: string | null
          }
          onElementSelectRef.current?.(data.html, data.componentName, data.filePath)
          // Deactivate selector mode after selection
          setIsSelectorActiveRef.current(false)
          webview.executeJavaScript(REACT_GRAB_DEACTIVATE_SCRIPT).catch(() => {
            // Ignore errors
          })
        } catch (err) {
          console.error("[PreviewSidebar] Failed to parse element selection:", err)
        }
      }
    }

    webview.addEventListener("dom-ready", handleDomReady)
    webview.addEventListener("will-navigate", handleWillNavigate)
    webview.addEventListener("did-navigate", handleDidNavigate)
    webview.addEventListener("did-navigate-in-page", handleDidNavigateInPage)
    webview.addEventListener("new-window", handleNewWindow)
    webview.addEventListener("console-message", handleConsoleMessage)

    // Start with about:blank to trigger initial dom-ready
    webview.src = "about:blank"
    container.appendChild(webview)

    return () => {
      webview.removeEventListener("dom-ready", handleDomReady)
      webview.removeEventListener("will-navigate", handleWillNavigate)
      webview.removeEventListener("did-navigate", handleDidNavigate)
      webview.removeEventListener("did-navigate-in-page", handleDidNavigateInPage)
      webview.removeEventListener("new-window", handleNewWindow)
      webview.removeEventListener("console-message", handleConsoleMessage)
      if (container.contains(webview)) {
        container.removeChild(webview)
      }
      webviewRef.current = null
      webviewReadyRef.current = false
      pendingUrlRef.current = null
    }
  }, []) // Empty deps - create once

  // Navigate when selectedUrl changes from dropdown (resets to base URL)
  useEffect(() => {
    if (!state.selectedUrl) return

    const webview = webviewRef.current
    if (!webview) return

    // Clear currentUrl when user explicitly selects a new base URL
    setState(s => ({ ...s, currentUrl: null }))

    // If webview is ready, navigate immediately
    if (webviewReadyRef.current) {
      baseUrlRef.current = state.selectedUrl
      webview.src = state.selectedUrl
    } else {
      // Otherwise queue it for when dom-ready fires
      pendingUrlRef.current = state.selectedUrl
    }
  }, [state.selectedUrl, setState])

  // Resize handling for split position
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const startY = e.clientY
      const startPos = splitPosition
      const pointerId = e.pointerId
      const target = e.currentTarget as HTMLElement

      // Capture pointer to ensure we get all events
      target.setPointerCapture(pointerId)
      setIsSplitResizing(true)

      const onMove = (e: PointerEvent) => {
        if (!panelContainerRef.current) return
        const rect = panelContainerRef.current.getBoundingClientRect()
        const delta = ((e.clientY - startY) / rect.height) * 100
        setSplitPosition(Math.min(Math.max(startPos + delta, 20), 80))
      }

      const onUp = () => {
        target.releasePointerCapture(pointerId)
        setIsSplitResizing(false)
        document.removeEventListener("pointermove", onMove)
        document.removeEventListener("pointerup", onUp)
        document.removeEventListener("pointercancel", onUp)
      }

      document.addEventListener("pointermove", onMove)
      document.addEventListener("pointerup", onUp)
      document.addEventListener("pointercancel", onUp)
    },
    [splitPosition, setSplitPosition]
  )

  if (!worktreePath) return null

  return (
    <ResizableSidebar
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      widthAtom={previewSidebarWidthAtom}
      minWidth={400}
      maxWidth={1200}
      side="right"
      animationDuration={0}
      initialWidth={0}
      exitWidth={0}
      showResizeTooltip
      className="bg-tl-background border-l"
      style={{ borderLeftWidth: "0.5px", overflow: "hidden" }}
      onResizeChange={setIsSidebarResizing}
    >
      <div ref={panelContainerRef} className="flex flex-col h-full min-w-0 overflow-hidden relative">
        {/* Resize overlay - blocks webview from capturing events during resize */}
        {isAnyResizing && (
          <div
            className="absolute inset-0 z-50"
            style={{ cursor: isSplitResizing ? "ns-resize" : "col-resize" }}
          />
        )}

        {/* Header */}
        <div className="flex items-center gap-2 px-3 h-10 bg-tl-background border-b border-border/50">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-6 w-6 p-0 hover:bg-foreground/10 active:scale-[0.97] rounded-md"
              >
                <IconDoubleChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close preview</TooltipContent>
          </Tooltip>
          <span className="text-sm font-medium">Preview</span>
        </div>

        {/* Browser Panel */}
        <div
          className="flex-shrink-0 border-b border-border/50 bg-background overflow-hidden"
          style={{ height: `${splitPosition}%` }}
        >
          {/* Toolbar */}
          <div className="flex items-center gap-1.5 px-3 h-10 bg-tl-background border-b border-border/50">
            {/* Navigation */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBack}
                  disabled={!state.selectedUrl}
                  className="h-6 w-6 p-0 hover:bg-foreground/10"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleForward}
                  disabled={!state.selectedUrl}
                  className="h-6 w-6 p-0 hover:bg-foreground/10"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Forward</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 gap-1 text-xs font-mono flex-1 justify-start overflow-hidden"
                  disabled={state.detectedUrls.length === 0}
                >
                  <span className="truncate">{state.selectedUrl || "No URL detected"}</span>
                  {state.detectedUrls.length > 0 && (
                    <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-50" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {state.detectedUrls.map((u) => (
                  <DropdownMenuItem
                    key={u.port}
                    onClick={() => handleSelectUrl(u.url)}
                    className="font-mono text-xs"
                  >
                    {u.url}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={!state.selectedUrl}
                  className="h-6 w-6 p-0 hover:bg-foreground/10"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleOpenExternal}
                  disabled={!state.selectedUrl}
                  className="h-6 w-6 p-0 hover:bg-foreground/10"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in browser</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDevTools}
                  disabled={!state.selectedUrl}
                  className="h-6 w-6 p-0 hover:bg-foreground/10"
                >
                  <Bug className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Developer tools</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleToggleSelector}
                  disabled={!state.selectedUrl}
                  className={cn(
                    "h-6 w-6 p-0 hover:bg-foreground/10",
                    isSelectorActive && "bg-primary/20 text-primary"
                  )}
                >
                  <MousePointer2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isSelectorActive ? "Cancel element selection" : "Select element"}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Preview - webview always mounted, visibility controlled */}
          <div className="flex flex-col h-[calc(100%-40px)] bg-white overflow-hidden">
            <div
              ref={webviewContainerRef}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
              style={{ display: state.selectedUrl ? "flex" : "none" }}
            />
            {!state.selectedUrl && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                {isRunning ? "Waiting for dev server..." : "Start the dev server to preview"}
              </div>
            )}
          </div>
        </div>

        {/* Resize Handle */}
        <div
          onPointerDown={handleResizeStart}
          className="h-1.5 bg-border/50 hover:bg-primary/50 cursor-ns-resize flex-shrink-0 transition-colors touch-none"
        />

        {/* Terminal Panel */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-3 h-10 bg-tl-background border-b border-border/50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Output</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyLogs}
                    disabled={state.output.length === 0}
                    className="h-6 w-6"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy logs</TooltipContent>
              </Tooltip>
            </div>

            <Button
              variant={isRunning ? "destructive" : "default"}
              size="sm"
              onClick={isRunning ? handleStop : handleStart}
              className="gap-1.5"
            >
              {isRunning ? (
                <>
                  <Square className="h-3 w-3" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Start
                </>
              )}
            </Button>
          </div>

          <div className="flex-1 overflow-hidden">
            {state.output.length === 0 ? (
              <div className="flex items-center justify-center h-full bg-[#1e1e1e] text-muted-foreground text-sm">
                Click "Start" to run `bun run dev`
              </div>
            ) : (
              <TerminalOutput
                data={state.output}
                onUrlClick={(url) => window.desktopApi?.openExternal(url)}
              />
            )}
          </div>
        </div>
      </div>
    </ResizableSidebar>
  )
}
