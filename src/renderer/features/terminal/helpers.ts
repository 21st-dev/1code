import { Terminal as XTerm } from "xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebglAddon } from "@xterm/addon-webgl"
import { CanvasAddon } from "@xterm/addon-canvas"
import { SerializeAddon } from "@xterm/addon-serialize"
import { WebLinksAddon } from "@xterm/addon-web-links"
import type { ITheme } from "xterm"
import { TERMINAL_OPTIONS, TERMINAL_THEME_DARK, TERMINAL_THEME_LIGHT, getTerminalTheme, getTerminalLineHeight, RESIZE_DEBOUNCE_MS } from "./config"
import { FilePathLinkProvider } from "./link-providers"
import { isMac, isModifierPressed, showLinkPopup, removeLinkPopup } from "./link-providers/link-popup"
import { suppressQueryResponses } from "./suppressQueryResponses"
import { debounce } from "./utils"

/**
 * Get the default terminal background color based on theme.
 */
export function getDefaultTerminalBg(isDark = true): string {
  const theme = isDark ? TERMINAL_THEME_DARK : TERMINAL_THEME_LIGHT
  return theme?.background ?? (isDark ? "#121212" : "#fafafa")
}

/**
 * Load GPU-accelerated renderer with automatic fallback.
 * Tries WebGL first, falls back to Canvas renderer if WebGL fails.
 */
function loadRenderer(xterm: XTerm): { dispose: () => void } {
  let renderer: WebglAddon | CanvasAddon | null = null

  console.log("[Terminal:loadRenderer] Attempting to load WebGL addon...")

  try {
    const webglAddon = new WebglAddon()
    console.log("[Terminal:loadRenderer] WebglAddon created")

    webglAddon.onContextLoss(() => {
      console.log("[Terminal:loadRenderer] WebGL context lost, switching to Canvas")
      webglAddon.dispose()
      try {
        renderer = new CanvasAddon()
        xterm.loadAddon(renderer)
        console.log("[Terminal:loadRenderer] Canvas fallback loaded after context loss")
      } catch {
        console.log("[Terminal:loadRenderer] Canvas fallback failed")
      }
    })

    xterm.loadAddon(webglAddon)
    renderer = webglAddon
    console.log("[Terminal:loadRenderer] WebGL addon loaded successfully")
  } catch (err) {
    console.log("[Terminal:loadRenderer] WebGL failed:", err)
    // WebGL not available, try Canvas
    try {
      renderer = new CanvasAddon()
      xterm.loadAddon(renderer)
      console.log("[Terminal:loadRenderer] Canvas addon loaded as fallback")
    } catch (canvasErr) {
      console.log("[Terminal:loadRenderer] Canvas addon also failed:", canvasErr)
      // Both failed, use xterm's default renderer
    }
  }

  return {
    dispose: () => renderer?.dispose(),
  }
}

export interface CreateTerminalOptions {
  cwd?: string
  initialTheme?: ITheme | null
  isDark?: boolean
  fontSize?: number
  onFileLinkClick?: (path: string, line?: number, column?: number) => void
  onUrlClick?: (url: string) => void
}

export interface TerminalInstance {
  xterm: XTerm
  fitAddon: FitAddon
  serializeAddon: SerializeAddon
  cleanup: () => void
}

/**
 * Creates and initializes an xterm instance with all addons.
 * Does: create → open → addons → fit
 * This ensures dimensions are ready before PTY creation.
 */
export function createTerminalInstance(
  container: HTMLDivElement,
  options: CreateTerminalOptions = {}
): TerminalInstance {
  const { initialTheme, isDark = true, fontSize, onFileLinkClick, onUrlClick } = options

  // Debug: Check container dimensions
  const rect = container.getBoundingClientRect()
  console.log("[Terminal:create] Container dimensions:", {
    width: rect.width,
    height: rect.height,
    isConnected: container.isConnected,
  })

  // Use provided theme, or get theme based on isDark
  const theme = initialTheme ?? getTerminalTheme(isDark)
  // Merge options — fontSize override takes precedence over the default in TERMINAL_OPTIONS
  // Line height scales with font size so smaller sizes don't feel too spaced out
  const terminalOptions = {
    ...TERMINAL_OPTIONS,
    theme,
    ...(fontSize != null && { fontSize, lineHeight: getTerminalLineHeight(fontSize) }),
  }

  // 1. Create xterm instance
  console.log("[Terminal:create] Step 1: Creating XTerm instance")
  const xterm = new XTerm(terminalOptions)

  // 2. Open in DOM first
  console.log("[Terminal:create] Step 2: Opening in DOM")
  xterm.open(container)

  // Debug: Check _renderService after open
  const core = (xterm as unknown as { _core?: { _renderService?: unknown } })._core
  console.log("[Terminal:create] After open - _renderService exists:", !!core?._renderService)

  // 3. Load fit addon
  console.log("[Terminal:create] Step 3: Loading FitAddon")
  const fitAddon = new FitAddon()
  xterm.loadAddon(fitAddon)

  // 4. Load serialize addon for state persistence
  console.log("[Terminal:create] Step 4: Loading SerializeAddon")
  const serializeAddon = new SerializeAddon()
  xterm.loadAddon(serializeAddon)

  // 5. Load GPU-accelerated renderer
  console.log("[Terminal:create] Step 5: Loading renderer")
  const renderer = loadRenderer(xterm)

  // Debug: Check dimensions after renderer
  const coreAfter = (xterm as unknown as { _core?: { _renderService?: { dimensions?: unknown } } })._core
  console.log("[Terminal:create] After renderer - dimensions:", coreAfter?._renderService?.dimensions)

  // 6. Set up query response suppression
  console.log("[Terminal:create] Step 6: Setting up query suppression")
  const cleanupQuerySuppression = suppressQueryResponses(xterm)

  // 7. Set up URL link provider using official WebLinksAddon
  if (onUrlClick) {
    console.log("[Terminal:create] Step 7: Registering WebLinksAddon")
    const webLinksAddon = new WebLinksAddon(
      (event: MouseEvent, uri: string) => {
        // Require Cmd+Click (Mac) or Ctrl+Click (Windows/Linux)
        if (isModifierPressed(event)) {
          onUrlClick(uri)
        }
      },
      {
        hover: (event: MouseEvent, uri: string) => {
          showLinkPopup(event, uri, onUrlClick)
        },
        leave: () => {
          removeLinkPopup()
        },
      }
    )
    xterm.loadAddon(webLinksAddon)
  }

  // 8. Set up file path link provider
  if (onFileLinkClick) {
    console.log("[Terminal:create] Step 8: Registering file path link provider")
    const filePathLinkProvider = new FilePathLinkProvider(
      xterm,
      (_event, path, line, column) => {
        console.log("[Terminal:create] File path link clicked:", path, line, column)
        onFileLinkClick(path, line, column)
      }
    )
    xterm.registerLinkProvider(filePathLinkProvider)
  }

  // 9. Fit to get actual dimensions
  console.log("[Terminal:create] Step 9: Fitting terminal")
  try {
    fitAddon.fit()
    console.log("[Terminal:create] Fit successful - cols:", xterm.cols, "rows:", xterm.rows)
  } catch (err) {
    console.log("[Terminal:create] Fit failed:", err)
  }

  console.log("[Terminal:create] Complete!")

  return {
    xterm,
    fitAddon,
    serializeAddon,
    cleanup: () => {
      cleanupQuerySuppression()
      renderer.dispose()
    },
  }
}

export interface KeyboardHandlerOptions {
  /** Callback for Shift+Enter (sends ESC+CR for line continuation) */
  onShiftEnter?: () => void
  /** Callback for the clear terminal shortcut (Cmd+K) */
  onClear?: () => void
}

/**
 * Setup keyboard handling for xterm including:
 * - Shift+Enter: Sends ESC+CR sequence
 * - Cmd+K: Clear terminal
 * - Ctrl+V / Cmd+V: Intercept to allow browser paste event
 *
 * Returns a cleanup function to remove the handler.
 */
export function setupKeyboardHandler(
  xterm: XTerm,
  options: KeyboardHandlerOptions = {}
): () => void {
  const handler = (event: KeyboardEvent): boolean => {
    // Shift+Enter - line continuation
    const isShiftEnter =
      event.key === "Enter" &&
      event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey

    if (isShiftEnter) {
      if (event.type === "keydown" && options.onShiftEnter) {
        options.onShiftEnter()
      }
      return false // Prevent xterm from processing
    }

    // Cmd+K - clear terminal (macOS)
    const isClearShortcut =
      event.key === "k" && event.metaKey && !event.shiftKey && !event.altKey

    if (isClearShortcut) {
      if (event.type === "keydown" && options.onClear) {
        options.onClear()
      }
      return false // Prevent xterm from processing
    }

    // Ctrl+V (Windows/Linux) or Cmd+V (macOS) - let Electron menu handle paste
    // Return false to prevent xterm from showing ^v character
    // The Electron menu's "paste" role will trigger a paste event on the textarea
    const isPasteShortcut =
      event.key === "v" &&
      !event.shiftKey &&
      !event.altKey &&
      (isMac() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)

    if (isPasteShortcut) {
      return false // Prevent xterm from showing ^v, let Electron menu handle it
    }

    return true // Let xterm process the key
  }

  xterm.attachCustomKeyEventHandler(handler)

  return () => {
    xterm.attachCustomKeyEventHandler(() => true)
  }
}

export interface PasteHandlerOptions {
  /** Callback when text is pasted */
  onPaste?: (text: string) => void
}

/**
 * Setup paste handler for xterm to ensure bracketed paste mode works correctly.
 *
 * This is required for TUI applications like vim that expect bracketed paste mode
 * to distinguish between typed and pasted content.
 *
 * Returns a cleanup function to remove the handler.
 */
export function setupPasteHandler(
  xterm: XTerm,
  options: PasteHandlerOptions = {}
): () => void {
  const textarea = xterm.textarea
  if (!textarea) return () => {}

  const handlePaste = (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData("text/plain")
    if (!text) return

    event.preventDefault()
    event.stopImmediatePropagation()

    options.onPaste?.(text)
    xterm.paste(text)
  }

  textarea.addEventListener("paste", handlePaste, { capture: true })

  return () => {
    textarea.removeEventListener("paste", handlePaste, { capture: true })
  }
}

/**
 * Setup focus listener for the terminal.
 *
 * Returns a cleanup function to remove the listener.
 */
export function setupFocusListener(
  xterm: XTerm,
  onFocus: () => void
): (() => void) | null {
  const textarea = xterm.textarea
  if (!textarea) return null

  textarea.addEventListener("focus", onFocus)

  return () => {
    textarea.removeEventListener("focus", onFocus)
  }
}

/**
 * Setup resize handlers for the terminal container.
 *
 * Returns a cleanup function to remove the handlers.
 */
export function setupResizeHandlers(
  container: HTMLDivElement,
  xterm: XTerm,
  fitAddon: FitAddon,
  onResize: (cols: number, rows: number) => void
): () => void {
  const debouncedHandleResize = debounce(() => {
    try {
      fitAddon.fit()
      onResize(xterm.cols, xterm.rows)
    } catch {
      // Ignore resize errors
    }
  }, RESIZE_DEBOUNCE_MS)

  const resizeObserver = new ResizeObserver(debouncedHandleResize)
  resizeObserver.observe(container)
  window.addEventListener("resize", debouncedHandleResize)

  return () => {
    window.removeEventListener("resize", debouncedHandleResize)
    resizeObserver.disconnect()
    debouncedHandleResize.cancel()
  }
}

export interface ClickToMoveOptions {
  /** Callback to write data to the terminal PTY */
  onWrite: (data: string) => void
}

/**
 * Convert mouse event coordinates to terminal cell coordinates.
 */
function getTerminalCoordsFromEvent(
  xterm: XTerm,
  event: MouseEvent
): { col: number; row: number } | null {
  const element = xterm.element
  if (!element) return null

  const rect = element.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  // Access internal render service for cell dimensions
  const dimensions = (
    xterm as unknown as {
      _core?: {
        _renderService?: {
          dimensions?: { css: { cell: { width: number; height: number } } }
        }
      }
    }
  )._core?._renderService?.dimensions

  if (!dimensions?.css?.cell) return null

  const cellWidth = dimensions.css.cell.width
  const cellHeight = dimensions.css.cell.height

  if (cellWidth <= 0 || cellHeight <= 0) return null

  const col = Math.max(0, Math.min(xterm.cols - 1, Math.floor(x / cellWidth)))
  const row = Math.max(0, Math.min(xterm.rows - 1, Math.floor(y / cellHeight)))

  return { col, row }
}

/**
 * Setup click-to-move cursor functionality.
 * Allows clicking on the current prompt line to move the cursor.
 *
 * Returns a cleanup function to remove the handler.
 */
export function setupClickToMoveCursor(
  xterm: XTerm,
  options: ClickToMoveOptions
): () => void {
  const handleClick = (event: MouseEvent) => {
    // Don't interfere with full-screen apps (vim, less, etc.)
    if (xterm.buffer.active !== xterm.buffer.normal) return
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    if (xterm.hasSelection()) return

    const coords = getTerminalCoordsFromEvent(xterm, event)
    if (!coords) return

    const buffer = xterm.buffer.active
    const clickBufferRow = coords.row + buffer.viewportY

    // Only move cursor on the same line (editable prompt area)
    if (clickBufferRow !== buffer.cursorY + buffer.viewportY) return

    const delta = coords.col - buffer.cursorX
    if (delta === 0) return

    // Right arrow: \x1b[C, Left arrow: \x1b[D
    const arrowKey = delta > 0 ? "\x1b[C" : "\x1b[D"
    options.onWrite(arrowKey.repeat(Math.abs(delta)))
  }

  xterm.element?.addEventListener("click", handleClick)

  return () => {
    xterm.element?.removeEventListener("click", handleClick)
  }
}

export interface ContextMenuHandlerOptions {
  /** Callback when text is copied via context menu */
  onCopy?: (text: string) => void
  /** Callback when text is pasted via context menu */
  onPaste?: (text: string) => void
  /** Callback when copy fails */
  onCopyError?: (error: unknown) => void
  /** Callback when paste fails */
  onPasteError?: (error: unknown) => void
}

/**
 * Setup right-click context menu for terminal with copy/paste support.
 * - If text is selected: copies to clipboard
 * - If no selection: pastes from clipboard
 *
 * Returns a cleanup function to remove the handler.
 */
export function setupContextMenuHandler(
  xterm: XTerm,
  options: ContextMenuHandlerOptions = {}
): () => void {
  const element = xterm.element
  if (!element) {
    return () => {} // noop cleanup if element not available
  }

  const handleContextMenu = async (event: MouseEvent) => {
    event.preventDefault()

    const selection = xterm.getSelection()

    if (selection) {
      // Has selection - copy to clipboard
      try {
        await navigator.clipboard.writeText(selection)
        options.onCopy?.(selection)
        // Clear selection after copy (optional, mimics typical terminal behavior)
        xterm.clearSelection()
      } catch (err) {
        console.warn("[Terminal] Failed to copy to clipboard:", err)
        options.onCopyError?.(err)
      }
    } else {
      // No selection - paste from clipboard
      try {
        const text = await navigator.clipboard.readText()
        if (text) {
          options.onPaste?.(text)
          xterm.paste(text)
        }
      } catch (err) {
        console.warn("[Terminal] Failed to paste from clipboard:", err)
        options.onPasteError?.(err)
      }
    }
  }

  element.addEventListener("contextmenu", handleContextMenu)

  return () => {
    element.removeEventListener("contextmenu", handleContextMenu)
  }
}
