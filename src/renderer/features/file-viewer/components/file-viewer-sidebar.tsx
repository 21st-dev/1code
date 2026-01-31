import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Editor, { type Monaco } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import { useAtom } from "jotai"
import { useAtomValue } from "jotai"
import { useTheme } from "next-themes"
import {
  Loader2,
  AlertCircle,
  FileWarning,
  MoreHorizontal,
  WrapText,
  Map,
  Check,
  X,
} from "lucide-react"
import { getFileIconByExtension } from "../../agents/mentions/agents-file-mention"
import {
  IconCloseSidebarRight,
  IconSidePeek,
  IconCenterPeek,
  IconFullPage,
  IconLineNumbers,
} from "@/components/ui/icons"
import { Kbd } from "@/components/ui/kbd"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { ViewerErrorBoundary } from "@/components/ui/error-boundary"
import { trpc } from "@/lib/trpc"
import { preferredEditorAtom } from "@/lib/atoms"
import { useResolvedHotkeyDisplay } from "@/lib/hotkeys"
import { APP_META } from "../../../../shared/external-apps"
import { CopyButton } from "../../agents/ui/message-action-buttons"
import { EDITOR_ICONS } from "@/lib/editor-icons"
import {
  fileViewerWordWrapAtom,
  fileViewerMinimapAtom,
  fileViewerLineNumbersAtom,
  fileViewerDisplayModeAtom,
  type FileViewerDisplayMode,
} from "../../agents/atoms"
import { useFileContent, getErrorMessage } from "../hooks/use-file-content"
import { getMonacoLanguage, getFileViewerType } from "../utils/language-map"
import { getFileName } from "../utils/file-utils"
import { defaultEditorOptions, getMonacoTheme, registerMonacoTheme } from "./monaco-config"
import { useVSCodeTheme } from "@/lib/themes"
import { ImageViewer } from "./image-viewer"
import { MarkdownViewer } from "./markdown-viewer"

interface FileViewerSidebarProps {
  filePath: string
  projectPath: string
  onClose: () => void
}

function FileIcon({ filePath }: { filePath: string }) {
  const Icon = getFileIconByExtension(filePath)
  return Icon ? <Icon className="h-3.5 w-3.5" /> : null
}

const FILE_VIEWER_MODES = [
  { value: "side-peek" as const, label: "Sidebar", Icon: IconSidePeek },
  { value: "center-peek" as const, label: "Dialog", Icon: IconCenterPeek },
  { value: "full-page" as const, label: "Fullscreen", Icon: IconFullPage },
]

function FileViewerModeSwitcher({
  mode,
  onModeChange,
}: {
  mode: FileViewerDisplayMode
  onModeChange: (mode: FileViewerDisplayMode) => void
}) {
  const currentMode = FILE_VIEWER_MODES.find((m) => m.value === mode) ?? FILE_VIEWER_MODES[0]
  const CurrentIcon = currentMode.Icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
        >
          <CurrentIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {FILE_VIEWER_MODES.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => onModeChange(value)}
            className="flex items-center gap-2"
          >
            <Icon className="size-4 text-muted-foreground" />
            <span className="flex-1">{label}</span>
            {mode === value && (
              <Check className="size-4 text-muted-foreground ml-auto" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">Loading file...</span>
      </div>
    </div>
  )
}

function ErrorDisplay({ error }: { error: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3 text-center max-w-[300px]">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium text-foreground">{error}</p>
      </div>
    </div>
  )
}

function UnsupportedViewer({
  filePath,
  onClose,
}: {
  filePath: string
  onClose: () => void
}) {
  const fileName = getFileName(filePath)
  const [displayMode, setDisplayMode] = useAtom(fileViewerDisplayModeAtom)

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-2 h-10 border-b border-border/50 bg-background flex-shrink-0">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {/* Close + mode switcher on the left */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
            onClick={onClose}
          >
            {displayMode === "side-peek" ? (
              <IconCloseSidebarRight className="size-4 text-muted-foreground" />
            ) : (
              <X className="size-4 text-muted-foreground" />
            )}
          </Button>
          <FileViewerModeSwitcher
            mode={displayMode}
            onModeChange={setDisplayMode}
          />
          <div className="flex items-center gap-2 min-w-0 flex-1 ml-1">
            <FileIcon filePath={filePath} />
            <span className="text-sm font-medium truncate" title={filePath}>
              {fileName}
            </span>
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-center max-w-[300px]">
          <FileWarning className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">Cannot view this file</p>
        </div>
      </div>
    </div>
  )
}

function CodeViewerHeader({
  fileName,
  filePath,
  onClose,
  content,
}: {
  fileName: string
  filePath: string
  onClose: () => void
  content?: string | null
}) {
  const [wordWrap, setWordWrap] = useAtom(fileViewerWordWrapAtom)
  const [minimap, setMinimap] = useAtom(fileViewerMinimapAtom)
  const [lineNumbers, setLineNumbers] = useAtom(fileViewerLineNumbersAtom)
  const [displayMode, setDisplayMode] = useAtom(fileViewerDisplayModeAtom)
  const preferredEditor = useAtomValue(preferredEditorAtom)
  const editorMeta = APP_META[preferredEditor]
  const openInAppMutation = trpc.external.openInApp.useMutation()
  const openInEditorHotkey = useResolvedHotkeyDisplay("open-file-in-editor")

  const handleOpenInEditor = useCallback(() => {
    const absolutePath = filePath.startsWith("/") ? filePath : undefined
    if (absolutePath) {
      openInAppMutation.mutate({ path: absolutePath, app: preferredEditor })
    }
  }, [filePath, preferredEditor, openInAppMutation])

  return (
    <div className="flex items-center justify-between px-2 h-10 border-b border-border/50 bg-background flex-shrink-0">
      {/* Left side: Close button + mode switcher + file info */}
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
          onClick={onClose}
        >
          {displayMode === "side-peek" ? (
            <IconCloseSidebarRight className="size-4 text-muted-foreground" />
          ) : (
            <X className="size-4 text-muted-foreground" />
          )}
        </Button>
        <FileViewerModeSwitcher
          mode={displayMode}
          onModeChange={setDisplayMode}
        />
        <div className="flex items-center gap-2 min-w-0 flex-1 ml-1">
          <FileIcon filePath={filePath} />
          <span className="text-sm font-medium truncate" title={filePath}>
            {fileName}
          </span>
        </div>
      </div>
      {/* Right side: Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Open in editor */}
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleOpenInEditor}
              className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer rounded-md px-1.5 py-1 hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {EDITOR_ICONS[preferredEditor] && (
                <img
                  src={EDITOR_ICONS[preferredEditor]}
                  alt=""
                  className="h-3.5 w-3.5 flex-shrink-0"
                />
              )}
              <span>Open in {editorMeta.label}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" showArrow={false}>
            Open in {editorMeta.label}
            {openInEditorHotkey && <Kbd className="normal-case font-sans">{openInEditorHotkey}</Kbd>}
          </TooltipContent>
        </Tooltip>

        {/* Copy button */}
        {content && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <CopyButton text={content} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" showArrow={false}>
              Copy file content
            </TooltipContent>
          </Tooltip>
        )}

        {/* Options menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0 hover:bg-foreground/10 text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuCheckboxItem
              checked={wordWrap}
              onCheckedChange={() => setWordWrap(!wordWrap)}
            >
              <WrapText className="mr-2 h-3.5 w-3.5" />
              Word Wrap
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={minimap}
              onCheckedChange={() => setMinimap(!minimap)}
            >
              <Map className="mr-2 h-3.5 w-3.5" />
              Minimap
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={lineNumbers}
              onCheckedChange={() => setLineNumbers(!lineNumbers)}
            >
              <IconLineNumbers className="mr-2 h-3.5 w-3.5" />
              Line Numbers
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

/**
 * FileViewerSidebar - Routes to appropriate viewer based on file type
 */
export function FileViewerSidebar({
  filePath,
  projectPath,
  onClose,
}: FileViewerSidebarProps) {
  const viewerType = getFileViewerType(filePath)

  switch (viewerType) {
    case "image":
      return (
        <ViewerErrorBoundary viewerType="image" onReset={onClose}>
          <ImageViewer filePath={filePath} projectPath={projectPath} onClose={onClose} />
        </ViewerErrorBoundary>
      )
    case "unsupported":
      return <UnsupportedViewer filePath={filePath} onClose={onClose} />
    case "markdown":
      return (
        <ViewerErrorBoundary viewerType="markdown" onReset={onClose}>
          <MarkdownViewer filePath={filePath} projectPath={projectPath} onClose={onClose} />
        </ViewerErrorBoundary>
      )
    default:
      return (
        <ViewerErrorBoundary viewerType="file" onReset={onClose}>
          <CodeViewer filePath={filePath} projectPath={projectPath} onClose={onClose} />
        </ViewerErrorBoundary>
      )
  }
}

/**
 * Custom context menu for the code viewer
 */
function EditorContextMenu({
  position,
  onClose,
  onEditorAction,
  onCopy,
  onFind,
  onAddToContext,
  hasSelection,
}: {
  position: { x: number; y: number }
  onClose: () => void
  onEditorAction: (actionId: string) => void
  onCopy: () => void
  onFind: () => void
  onAddToContext: () => void
  hasSelection: boolean
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("mousedown", handleClickOutside)
    window.addEventListener("keydown", handleEsc, true)
    return () => {
      window.removeEventListener("mousedown", handleClickOutside)
      window.removeEventListener("keydown", handleEsc, true)
    }
  }, [onClose])

  // Adjust position so menu doesn't overflow viewport
  const [adjustedPos, setAdjustedPos] = useState(position)
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const x = position.x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 4 : position.x
    const y = position.y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 4 : position.y
    setAdjustedPos({ x, y })
  }, [position])

  const itemClass =
    "flex items-center gap-1.5 min-h-[32px] py-[5px] px-1.5 mx-1 rounded-md text-sm cursor-default select-none outline-none transition-colors dark:hover:bg-neutral-800 hover:bg-accent hover:text-foreground"
  const disabledItemClass =
    "flex items-center gap-1.5 min-h-[32px] py-[5px] px-1.5 mx-1 rounded-md text-sm cursor-default select-none outline-none opacity-50 pointer-events-none"
  const shortcutClass = "ml-auto text-xs tracking-widest text-muted-foreground/60"
  const separatorClass = "my-1 h-px bg-border mx-1"

  const handleAction = (fn: () => void) => {
    fn()
    onClose()
  }

  const handleEditorAction = (actionId: string) => {
    onEditorAction(actionId)
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] py-1 rounded-[10px] border border-border bg-popover text-sm text-popover-foreground shadow-lg dark animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      <div className={itemClass} onClick={() => handleEditorAction("editor.action.revealDefinition")}>
        Go to Definition
        <span className={shortcutClass}>⌘F12</span>
      </div>
      <div className={itemClass} onClick={() => handleEditorAction("editor.action.goToReferences")}>
        Go to References
        <span className={shortcutClass}>⇧F12</span>
      </div>
      <div className={itemClass} onClick={() => handleEditorAction("editor.action.goToSymbol")}>
        Go to Symbol...
        <span className={shortcutClass}>⇧⌘O</span>
      </div>
      <div className={separatorClass} />
      <div className={itemClass} onClick={() => handleAction(onFind)}>
        Find
        <span className={shortcutClass}>⌘F</span>
      </div>
      <div className={separatorClass} />
      <div className={hasSelection ? itemClass : disabledItemClass} onClick={hasSelection ? () => handleAction(onAddToContext) : undefined}>
        Add to Context
      </div>
      <div className={separatorClass} />
      <div className={itemClass} onClick={() => handleAction(onCopy)}>
        Copy
        <span className={shortcutClass}>⌘C</span>
      </div>
      <div className={separatorClass} />
      <div className={itemClass} onClick={() => handleEditorAction("editor.action.quickCommand")}>
        Command Palette
        <span className={shortcutClass}>F1</span>
      </div>
    </div>
  )
}

/**
 * CodeViewer - Monaco Editor-based code viewer (default)
 */
function CodeViewer({
  filePath,
  projectPath,
  onClose,
}: {
  filePath: string
  projectPath: string
  onClose: () => void
}) {
  const fileName = getFileName(filePath)
  const language = getMonacoLanguage(filePath)
  const { resolvedTheme } = useTheme()
  const { currentTheme } = useVSCodeTheme()
  const fallbackTheme = getMonacoTheme(resolvedTheme || "dark")

  const [wordWrap] = useAtom(fileViewerWordWrapAtom)
  const [minimap] = useAtom(fileViewerMinimapAtom)
  const [lineNumbers] = useAtom(fileViewerLineNumbersAtom)

  const preferredEditor = useAtomValue(preferredEditorAtom)
  const openInAppMutation = trpc.external.openInApp.useMutation()

  const monacoRef = useRef<Monaco | null>(null)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [hasSelection, setHasSelection] = useState(false)

  // Handle ⌘⇧O hotkey to open current file in external editor
  useEffect(() => {
    const handler = () => {
      const absolutePath = filePath.startsWith("/") ? filePath : undefined
      if (absolutePath) {
        openInAppMutation.mutate({ path: absolutePath, app: preferredEditor })
      }
    }
    window.addEventListener("open-file-in-editor", handler)
    return () => window.removeEventListener("open-file-in-editor", handler)
  }, [filePath, preferredEditor, openInAppMutation])

  // Compute Monaco theme: use custom user theme if available, otherwise fallback
  const monacoTheme = useMemo(() => {
    if (currentTheme && monacoRef.current) {
      return registerMonacoTheme(monacoRef.current, currentTheme)
    }
    return fallbackTheme
  }, [currentTheme, fallbackTheme])

  // Re-register theme when user switches themes after editor is mounted
  useEffect(() => {
    if (currentTheme && monacoRef.current) {
      const themeName = registerMonacoTheme(monacoRef.current, currentTheme)
      monacoRef.current.editor.setTheme(themeName)
    }
  }, [currentTheme])

  const { content, isLoading, error } = useFileContent(projectPath, filePath)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (contextMenu) {
          setContextMenu(null)
          return
        }
        // Don't close viewer if Monaco's find widget is open — let Monaco handle Escape
        const findWidget = containerRef.current?.querySelector(".find-widget.visible")
        if (findWidget) return

        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, contextMenu])

  // Custom context menu handler for Monaco
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const isInsideContainerRect = (x: number, y: number) => {
      const rect = container.getBoundingClientRect()
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    }

    // Check if target is inside a Monaco UI widget (find widget, hover, etc.)
    const isMonacoUIElement = (target: HTMLElement) => {
      return !!target.closest?.(".editor-widget, .monaco-hover, .monaco-menu")
    }

    const handleContextMenu = (e: MouseEvent) => {
      // Don't intercept right-clicks on Monaco UI widgets (find widget buttons, etc.)
      if (isMonacoUIElement(e.target as HTMLElement)) return
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY })
    }

    // Window-level handler for Monaco overlay elements rendered outside our container
    const handleWindowContextMenu = (e: MouseEvent) => {
      if (isMonacoUIElement(e.target as HTMLElement)) return
      const containsTarget = container.contains(e.target as Node)
      const insideRect = isInsideContainerRect(e.clientX, e.clientY)
      if (!containsTarget && insideRect) {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({ x: e.clientX, y: e.clientY })
      }
    }

    container.addEventListener("contextmenu", handleContextMenu)
    window.addEventListener("contextmenu", handleWindowContextMenu, true)
    return () => {
      container.removeEventListener("contextmenu", handleContextMenu)
      window.removeEventListener("contextmenu", handleWindowContextMenu, true)
    }
  }, [])

  const handleEditorMount = useCallback((monacoEditor: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
    editorRef.current = monacoEditor
    monacoRef.current = monacoInstance

    // Register and apply user's custom theme if available
    if (currentTheme) {
      const themeName = registerMonacoTheme(monacoInstance, currentTheme)
      monacoInstance.editor.setTheme(themeName)
    }

    // Suppress tooltips on find widget buttons by stripping title attributes.
    // Monaco re-adds them, so we use a MutationObserver.
    const editorContainer = monacoEditor.getDomNode()?.closest(".monaco-editor")
    if (editorContainer) {
      const obs = new MutationObserver(() => {
        const findWidget = editorContainer.querySelector(".find-widget")
        if (findWidget) {
          findWidget.querySelectorAll("[title]").forEach((el) => el.removeAttribute("title"))
        }
      })
      obs.observe(editorContainer, { childList: true, subtree: true, attributes: true, attributeFilter: ["title", "class"] })
    }

    // Track selection state for context menu
    monacoEditor.onDidChangeCursorSelection(() => {
      const selection = monacoEditor.getSelection()
      const hasText = !!(selection && !selection.isEmpty() && monacoEditor.getModel()?.getValueInRange(selection)?.trim())
      setHasSelection(hasText)
    })
  }, [currentTheme])

  const handleCopy = useCallback(() => {
    const ed = editorRef.current
    if (ed) {
      const selection = ed.getSelection()
      if (selection && !selection.isEmpty()) {
        const text = ed.getModel()?.getValueInRange(selection) || ""
        navigator.clipboard.writeText(text)
        return
      }
    }
    // Fallback: copy all content
    if (content) navigator.clipboard.writeText(content)
  }, [content])

  const handleFind = useCallback(() => {
    const ed = editorRef.current
    if (ed) {
      ed.focus()
      ed.trigger("contextmenu", "actions.find", null)
    }
  }, [])

  const handleAddToContext = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const selection = ed.getSelection()
    if (!selection || selection.isEmpty()) return
    const text = ed.getModel()?.getValueInRange(selection)?.trim()
    if (!text) return

    // Dispatch event for active-chat to add the selected text to context
    window.dispatchEvent(new CustomEvent("file-viewer-add-to-context", {
      detail: {
        text,
        source: { type: "file-viewer", filePath },
      },
    }))
  }, [filePath])

  const handleEditorAction = useCallback((actionId: string) => {
    const ed = editorRef.current
    if (ed) {
      ed.focus()
      ed.trigger("contextmenu", actionId, null)
    }
  }, [])

  const editorOptions = useMemo(
    () => ({
      ...defaultEditorOptions,
      wordWrap: wordWrap ? ("on" as const) : ("off" as const),
      minimap: { enabled: minimap },
      lineNumbers: lineNumbers ? ("on" as const) : ("off" as const),
    }),
    [wordWrap, minimap, lineNumbers],
  )

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-background">
        <CodeViewerHeader
          fileName={fileName}
          filePath={filePath}

          onClose={onClose}
        />
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col h-full bg-background">
        <CodeViewerHeader
          fileName={fileName}
          filePath={filePath}

          onClose={onClose}
        />
        <ErrorDisplay error={getErrorMessage(error)} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Custom find widget styles to match chat search bar */}
      <style>{`
        /* Fix: Monaco hover tooltip overlaps find widget buttons causing flicker.
           Hide all Monaco hover tooltips in file viewer — we don't need type hovers in read-only mode. */
        .monaco-hover {
          display: none !important;
        }

        /* Restyle Monaco find widget to match app's search bar */
        .monaco-editor .find-widget {
          background: hsl(var(--popover)) !important;
          border: 1px solid hsl(var(--border)) !important;
          border-radius: 8px !important;
          box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1) !important;
          padding: 6px 8px !important;
          top: 16px !important;
          right: 12px !important;
          max-width: calc(100% - 24px) !important;
          min-width: 420px !important;
          width: auto !important;
          height: auto !important;
          overflow: visible !important;
          display: flex !important;
          align-items: center !important;
          gap: 4px !important;
        }

        /* Hide the replace toggle button (read-only editor) */
        .monaco-editor .find-widget .button.toggle {
          display: none !important;
        }

        /* Hide replace section entirely */
        .monaco-editor .find-widget .replace-part {
          display: none !important;
        }

        /* Hide the resize sash */
        .monaco-editor .find-widget .monaco-sash {
          display: none !important;
        }

        /* Find part — flex layout */
        .monaco-editor .find-widget .find-part {
          display: flex !important;
          align-items: center !important;
          gap: 2px !important;
          flex: 1 !important;
          margin: 0 !important;
        }

        /* Monaco findInput container — override absolute positioning of controls */
        .monaco-editor .find-widget .find-part > .monaco-findInput {
          flex: 1 !important;
          display: flex !important;
          align-items: center !important;
          position: relative !important;
        }
        .monaco-editor .find-widget .find-part > .monaco-findInput > .controls {
          position: static !important;
          top: auto !important;
          right: auto !important;
        }
        .monaco-editor .find-widget .find-part > .monaco-findInput > .monaco-scrollable-element {
          flex: 1 !important;
        }

        /* Input wrapper */
        .monaco-editor .find-widget .monaco-inputbox {
          background: transparent !important;
          border: none !important;
          border-radius: 6px !important;
          font-size: 13px !important;
          overflow: hidden !important;
          outline: none !important;
        }
        .monaco-editor .find-widget .monaco-inputbox.synthetic-focus {
          outline: none !important;
        }
        .monaco-editor .find-widget .monaco-inputbox .input {
          color: hsl(var(--foreground)) !important;
          background-color: transparent !important;
          font-size: 13px !important;
          padding: 4px 8px !important;
          border: none !important;
          line-height: normal !important;
          display: flex !important;
          align-items: center !important;
        }
        .monaco-editor .find-widget .monaco-inputbox .input::placeholder {
          color: hsl(var(--muted-foreground) / 0.6) !important;
        }

        /* Toggle buttons (Aa, ab, .*) */
        .monaco-editor .find-widget .controls {
          display: flex !important;
          align-items: center !important;
          gap: 1px !important;
        }
        .monaco-editor .find-widget .monaco-custom-toggle {
          border-radius: 4px !important;
          width: 24px !important;
          height: 24px !important;
          color: hsl(var(--muted-foreground)) !important;
          font: normal normal normal 16px/24px codicon !important;
          text-align: center !important;
        }
        .monaco-editor .find-widget .monaco-custom-toggle:hover {
          background: hsl(var(--muted)) !important;
          color: hsl(var(--foreground)) !important;
        }
        .monaco-editor .find-widget .monaco-custom-toggle[aria-checked="true"],
        .monaco-editor .find-widget .monaco-custom-toggle.checked {
          color: hsl(var(--foreground)) !important;
          background: hsl(var(--muted)) !important;
          border-color: transparent !important;
        }

        /* Find actions (count + nav buttons) */
        .monaco-editor .find-widget .find-actions {
          display: flex !important;
          align-items: center !important;
          gap: 1px !important;
        }

        /* Match count text */
        .monaco-editor .find-widget .matchesCount {
          color: hsl(var(--muted-foreground)) !important;
          font-size: 12px !important;
          min-width: auto !important;
          padding: 0 6px !important;
          line-height: 24px !important;
          display: flex !important;
          align-items: center !important;
        }

        /* Navigation & close buttons */
        .monaco-editor .find-widget .button {
          width: 24px !important;
          height: 24px !important;
          border-radius: 6px !important;
          color: hsl(var(--muted-foreground)) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .monaco-editor .find-widget .button:hover:not(.disabled) {
          background: hsl(var(--muted)) !important;
          color: hsl(var(--foreground)) !important;
        }
        .monaco-editor .find-widget .button:active:not(.disabled) {
          transform: scale(0.95);
        }
        .monaco-editor .find-widget .button.disabled {
          opacity: 0.4 !important;
          cursor: default !important;
        }

        /* Close button — sits as direct child of .find-widget */
        .monaco-editor .find-widget > .codicon-widget-close {
          position: static !important;
          flex-shrink: 0 !important;
        }

        /* Selection toggle in find actions — hide */
        .monaco-editor .find-widget .find-actions .codicon-find-selection {
          display: none !important;
        }
      `}</style>
      <CodeViewerHeader
        fileName={fileName}
        filePath={filePath}

        onClose={onClose}
        content={content}
      />
      <div
        ref={containerRef}
        className="flex-1 min-h-0 allow-text-selection"
        data-file-viewer-path={filePath}
      >
        <Editor
          height="100%"
          language={language}
          value={content || ""}
          theme={monacoTheme}
          options={editorOptions}
          loading={<LoadingSpinner />}
          onMount={handleEditorMount}
        />
      </div>
      {contextMenu && (
        <EditorContextMenu
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          onEditorAction={handleEditorAction}
          onCopy={handleCopy}
          onFind={handleFind}
          onAddToContext={handleAddToContext}
          hasSelection={hasSelection}
        />
      )}
    </div>
  )
}
