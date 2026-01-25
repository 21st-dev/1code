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
  Camera,
  Key,
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

// Expose the toggle start/stop function for hotkey access (cmd+R)
export const previewToggleDevServerFnAtom = atom<(() => void) | null>(null)

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
  onScreenshotCapture?: (imageData: { url: string; filename: string; blob: Blob }) => void
}

function getPaneId(chatId: string): string {
  return `${chatId}:preview:dev`
}

// React Grab injection script - loads and activates the element selector
// Uses React Grab's plugin API with hooks for onCopySuccess
const REACT_GRAB_INJECT_SCRIPT = `
(function() {
  // Handler for element selection - called when user copies with Cmd+C
  function handleElementCapture(element, content) {
    if (!element) return;

    // Try multiple property names for component info (API may vary)
    const grabData = element.__reactGrabData || element.__reactGrabInfo || {};

    const data = {
      html: (element.outerHTML || content || '').slice(0, 10000),
      componentName: grabData.componentName || grabData.name || null,
      filePath: grabData.filePath || grabData.source || null,
    };
    console.log('__ELEMENT_SELECTED__:' + JSON.stringify(data));
  }

  // Register our plugin with React Grab to get notified on copy
  function registerOurPlugin(api) {
    // Skip if already registered
    if (window.__CONDUCTOR_ELEMENT_PLUGIN_REGISTERED__) {
      // Still signal ready since plugin is registered
      console.log('__REACT_GRAB_READY__');
      return true;
    }

    // Only proceed if registerPlugin API is available
    if (typeof api.registerPlugin !== 'function') {
      console.log('__REACT_GRAB_UNAVAILABLE__');
      return false;
    }

    try {
      // React Grab plugin API: callbacks go inside 'hooks' object
      api.registerPlugin({
        name: 'conductor-element-capture',
        hooks: {
          onCopySuccess: function(elements, content) {
            if (elements && elements.length > 0) {
              handleElementCapture(elements[0], content);
            }
          }
        }
      });
      window.__CONDUCTOR_ELEMENT_PLUGIN_REGISTERED__ = true;
      console.log('__REACT_GRAB_READY__');
      return true;
    } catch (err) {
      console.error('[ReactGrab] Plugin registration failed:', err);
      console.log('__REACT_GRAB_UNAVAILABLE__');
      return false;
    }
  }

  // Activate React Grab and register our plugin
  function activateReactGrab() {
    const api = window.__REACT_GRAB__ || window.ReactGrab;
    if (api) {
      api.activate?.();
      registerOurPlugin(api);
    } else {
      console.log('__REACT_GRAB_UNAVAILABLE__');
    }
  }

  // If already loaded, just activate
  if (window.__REACT_GRAB__ || window.ReactGrab) {
    activateReactGrab();
    return;
  }

  // Load react-grab script
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/react-grab/dist/index.global.js';
  script.crossOrigin = 'anonymous';
  script.onload = function() {
    activateReactGrab();
  };
  script.onerror = function() {
    console.log('__REACT_GRAB_UNAVAILABLE__');
  };
  document.head.appendChild(script);
})();
`

const REACT_GRAB_DEACTIVATE_SCRIPT = `
(function() {
  const api = window.__REACT_GRAB__ || window.ReactGrab;
  if (api) {
    api.deactivate?.();
  }
})();
`

// Script to fill login form fields
const createFillLoginScript = (email: string, password: string) => `
(function() {
  // Common selectors for email/username fields
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[name="user"]',
    'input[id="email"]',
    'input[id="username"]',
    'input[autocomplete="email"]',
    'input[autocomplete="username"]',
    'input[placeholder*="email" i]',
    'input[placeholder*="username" i]',
  ];

  // Common selectors for password fields
  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[id="password"]',
    'input[autocomplete="current-password"]',
    'input[autocomplete="new-password"]',
  ];

  function findElement(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) { // Check if visible
        return el;
      }
    }
    return null;
  }

  function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (valueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter?.call(element, value);
    } else {
      valueSetter?.call(element, value);
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const emailField = findElement(emailSelectors);
  const passwordField = findElement(passwordSelectors);

  let filled = [];
  if (emailField) {
    setNativeValue(emailField, ${JSON.stringify(email)});
    emailField.focus();
    filled.push('email');
  }
  if (passwordField) {
    setNativeValue(passwordField, ${JSON.stringify(password)});
    filled.push('password');
  }

  if (filled.length === 0) {
    console.log('[FillLogin] No form fields found');
    return { success: false, message: 'No login form fields found' };
  }

  console.log('[FillLogin] Filled:', filled.join(', '));
  return { success: true, filled };
})();
`

export function PreviewSidebar({ chatId, worktreePath, onElementSelect, onScreenshotCapture }: PreviewSidebarProps) {
  const [isOpen, setIsOpen] = useAtom(previewSidebarOpenAtom)
  const [splitPosition, setSplitPosition] = useAtom(previewSplitPositionAtom)

  const stateAtom = useMemo(() => previewStateFamily(chatId), [chatId])
  const [state, setState] = useAtom(stateAtom)

  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const webviewContainerRef = useRef<HTMLDivElement>(null)
  const panelContainerRef = useRef<HTMLDivElement>(null)

  // Output buffering for performance (batches rapid terminal updates)
  const outputBufferRef = useRef<string[]>([])
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  // Fetch dev credentials for fill login dropdown
  const { data: credentials } = trpc.devCredentials.list.useQuery(undefined, {
    enabled: isOpen,
  })
  const getCredential = trpc.devCredentials.get.useMutation()

  // Track if any resize is happening (blocks webview pointer events)
  const [isSplitResizing, setIsSplitResizing] = useState(false)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const isAnyResizing = isSplitResizing || isSidebarResizing

  // Element selector state
  const [isSelectorActive, setIsSelectorActive] = useState(false)
  const [isReactGrabAvailable, setIsReactGrabAvailable] = useState<boolean | null>(null) // null = unknown, true = available, false = unavailable

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

  // Flush buffered output to state (batches rapid terminal updates for performance)
  const flushOutputBuffer = useCallback(() => {
    if (outputBufferRef.current.length === 0) return

    const buffer = outputBufferRef.current
    outputBufferRef.current = []

    setState(s => {
      const output = [...s.output, ...buffer].slice(-1000)
      let detectedUrls = s.detectedUrls
      let hasNew = false

      // Parse URLs from all buffered lines
      for (const line of buffer) {
        const result = parseAndMergeUrls(line, detectedUrls)
        if (result.hasNew) {
          detectedUrls = result.urls
          hasNew = true
        }
      }

      return {
        ...s,
        output,
        ...(hasNew && {
          detectedUrls,
          selectedUrl: s.selectedUrl || detectedUrls[0]?.url || null,
        }),
      }
    })
  }, [setState])

  // Handle terminal stream events (started, data, exit)
  const handleStream = useCallback(
    (event: TerminalStreamEvent) => {
      if (event.type === "started") {
        setIsRunning(true)
      } else if (event.type === "data" && event.data) {
        // Buffer output and debounce state updates for performance
        outputBufferRef.current.push(event.data)
        clearTimeout(flushTimeoutRef.current)
        flushTimeoutRef.current = setTimeout(flushOutputBuffer, 50)
      } else if (event.type === "exit") {
        // Flush any remaining output before exit message
        flushOutputBuffer()
        setIsRunning(false)
        setState(s => ({
          ...s,
          output: [...s.output, `\n[Exited with code ${event.exitCode}]`],
        }))
      }
    },
    [setState, flushOutputBuffer]
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

  // Toggle start/stop - exposed for hotkey (cmd+R)
  const handleToggleDevServer = useCallback(() => {
    if (isRunning) {
      handleStop()
    } else {
      handleStart()
    }
  }, [isRunning, handleStart, handleStop])

  // Register toggle function to global atom for hotkey access
  const setToggleDevServerFn = useSetAtom(previewToggleDevServerFnAtom)
  useEffect(() => {
    if (isOpen) {
      setToggleDevServerFn(() => handleToggleDevServer)
    }
    return () => {
      setToggleDevServerFn(null)
    }
  }, [isOpen, handleToggleDevServer, setToggleDevServerFn])

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
        // Ignore errors
      })
    } else {
      setIsSelectorActive(true)
      webviewRef.current.executeJavaScript(REACT_GRAB_INJECT_SCRIPT).catch((err) => {
        console.error("[PreviewSidebar] Failed to inject selector script:", err)
      })
    }
  }, [isSelectorActive])

  // Screenshot capture handler
  const handleScreenshotCapture = useCallback(async () => {
    if (!webviewReadyRef.current || !webviewRef.current) return

    try {
      const webview = webviewRef.current
      const nativeImage = await webview.capturePage()
      const pngBuffer = nativeImage.toPNG()
      const blob = new Blob([pngBuffer], { type: "image/png" })
      const url = URL.createObjectURL(blob)
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
      const filename = `preview-screenshot-${timestamp}.png`

      onScreenshotCapture?.({ url, filename, blob })
    } catch (err) {
      console.error("[PreviewSidebar] Screenshot capture error:", err)
    }
  }, [onScreenshotCapture])

  // Fill login form with saved credentials
  const handleFillLogin = useCallback(async (credentialId: string) => {
    if (!webviewReadyRef.current || !webviewRef.current) return

    try {
      const cred = await getCredential.mutateAsync({ id: credentialId })
      if (!cred) return

      const webview = webviewRef.current
      const script = createFillLoginScript(cred.email, cred.password)
      await webview.executeJavaScript(script)
    } catch (err) {
      console.error("[PreviewSidebar] Fill login error:", err)
    }
  }, [getCredential])

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

  // Ref to access setIsReactGrabAvailable in event handlers
  const setIsReactGrabAvailableRef = useRef(setIsReactGrabAvailable)
  setIsReactGrabAvailableRef.current = setIsReactGrabAvailable

  // Ref to access current URL in webview creation effect (prefer currentUrl over selectedUrl)
  const urlToLoadRef = useRef(state.currentUrl ?? state.selectedUrl)
  urlToLoadRef.current = state.currentUrl ?? state.selectedUrl

  // Track pending URL navigation (for when webview isn't ready yet)
  const pendingUrlRef = useRef<string | null>(null)

  // Create webview when sidebar opens (recreated each time sidebar reopens)
  useEffect(() => {
    // Only create webview when sidebar is open
    if (!isOpen) return

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
      // Skip about:blank (used for initialization)
      if (event.url === "about:blank") return
      if (!isLocalUrl(event.url)) {
        event.preventDefault()
        window.desktopApi?.openExternal(event.url)
      }
    }

    const handleDidNavigate = (e: Event) => {
      const event = e as unknown as { url: string }
      // Skip about:blank (used for initialization)
      if (event.url === "about:blank") return
      if (!isLocalUrl(event.url) && baseUrlRef.current) {
        window.desktopApi?.openExternal(event.url)
        webview.src = baseUrlRef.current
      } else if (isLocalUrl(event.url)) {
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

    // Handle console messages from webview (for React Grab element selection and status)
    const handleConsoleMessage = (e: Event) => {
      const event = e as unknown as { message: string; level: number }

      // React Grab ready signal
      if (event.message === "__REACT_GRAB_READY__") {
        console.log("[PreviewSidebar] React Grab is ready")
        setIsReactGrabAvailableRef.current?.(true)
        return
      }

      // React Grab unavailable signal
      if (event.message === "__REACT_GRAB_UNAVAILABLE__") {
        console.log("[PreviewSidebar] React Grab is unavailable")
        setIsReactGrabAvailableRef.current?.(false)
        // Deactivate selector if it was active
        setIsSelectorActiveRef.current?.(false)
        return
      }

      // Element selection
      if (event.message.startsWith("__ELEMENT_SELECTED__:")) {
        console.log("[PreviewSidebar] Element selected, parsing...")
        try {
          const jsonStr = event.message.slice("__ELEMENT_SELECTED__:".length)
          const data = JSON.parse(jsonStr) as {
            html: string
            componentName: string | null
            filePath: string | null
          }
          console.log("[PreviewSidebar] Parsed element:", {
            componentName: data.componentName,
            filePath: data.filePath,
            htmlLength: data.html?.length,
            hasCallback: !!onElementSelectRef.current,
          })

          // Call the element select callback
          const callback = onElementSelectRef.current
          if (callback) {
            console.log("[PreviewSidebar] Calling onElementSelect callback")
            callback(data.html, data.componentName, data.filePath)
          } else {
            console.warn("[PreviewSidebar] No onElementSelect callback available!")
          }

          // Deactivate selector mode after selection
          const setter = setIsSelectorActiveRef.current
          console.log("[PreviewSidebar] Deactivating selector mode, setter exists:", !!setter)
          if (setter) {
            setter(false)
          } else {
            console.warn("[PreviewSidebar] No setIsSelectorActive setter available!")
          }

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
  }, [isOpen]) // Recreate webview when sidebar opens

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
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  className="h-6 w-6 p-0 hover:bg-foreground/10 active:scale-[0.97] rounded-md"
                >
                  <IconDoubleChevronRight className="h-4 w-4" />
                </Button>
              </span>
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
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleBack}
                    disabled={!state.selectedUrl}
                    className="h-6 w-6 p-0 hover:bg-foreground/10"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Back</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleForward}
                    disabled={!state.selectedUrl}
                    className="h-6 w-6 p-0 hover:bg-foreground/10"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </span>
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
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRefresh}
                    disabled={!state.selectedUrl}
                    className="h-6 w-6 p-0 hover:bg-foreground/10"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleOpenExternal}
                    disabled={!state.selectedUrl}
                    className="h-6 w-6 p-0 hover:bg-foreground/10"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Open in browser</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDevTools}
                    disabled={!state.selectedUrl}
                    className="h-6 w-6 p-0 hover:bg-foreground/10"
                  >
                    <Bug className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Developer tools</TooltipContent>
            </Tooltip>

            {/* Select Element button - hidden if React Grab is unavailable */}
            {isReactGrabAvailable !== false && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
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
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {isSelectorActive ? "Cancel element selection" : "Select element"}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleScreenshotCapture}
                    disabled={!state.selectedUrl}
                    className="h-6 w-6 p-0 hover:bg-foreground/10"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Capture screenshot</TooltipContent>
            </Tooltip>

            {/* Fill Login dropdown */}
            {credentials && credentials.length > 0 && (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!state.selectedUrl}
                        className="h-6 w-6 p-0 hover:bg-foreground/10"
                      >
                        <Key className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Fill login form</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-48">
                  {credentials.map((cred) => (
                    <DropdownMenuItem
                      key={cred.id}
                      onClick={() => handleFillLogin(cred.id)}
                      className="text-xs"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-medium truncate">{cred.label}</span>
                        <span className="text-muted-foreground truncate">{cred.email}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCopyLogs}
                      disabled={state.output.length === 0}
                      className="h-6 w-6"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </span>
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
