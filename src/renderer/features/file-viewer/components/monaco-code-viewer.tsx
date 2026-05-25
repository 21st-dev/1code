import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Editor, { type Monaco } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import { useTheme } from "next-themes"
import { Loader2 } from "lucide-react"
import { defaultEditorOptions, getMonacoTheme, registerMonacoTheme } from "./monaco-config"
import { useVSCodeTheme } from "@/lib/themes"

type ContextMenuPosition = { x: number; y: number }
const FIND_ACTION_ID = "actions.find"

function isFindHotkey(e: KeyboardEvent): boolean {
  return (
    e.key.toLowerCase() === "f" &&
    (e.metaKey || e.ctrlKey) &&
    !e.altKey &&
    !e.shiftKey
  )
}

export function MonacoCodeViewer({
  filePath,
  content,
  language,
  wordWrap,
  minimap,
  lineNumbers,
  onClose,
}: {
  filePath: string
  content: string
  language: string
  wordWrap: boolean
  minimap: boolean
  lineNumbers: boolean
  onClose: () => void
}) {
  const { resolvedTheme } = useTheme()
  const { currentTheme } = useVSCodeTheme()
  const fallbackTheme = getMonacoTheme(resolvedTheme || "dark")
  const monacoRef = useRef<Monaco | null>(null)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeViewerRef = useRef(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null)
  const [hasSelection, setHasSelection] = useState(false)

  const setActiveViewer = useCallback((active: boolean) => {
    activeViewerRef.current = active
    const container = containerRef.current
    if (container) {
      container.dataset.fileViewerActive = active ? "true" : "false"
    }
  }, [])

  const openFind = useCallback(() => {
    const monacoEditor = editorRef.current
    if (monacoEditor) {
      monacoEditor.focus()
      const triggerFindCommand = () => {
        try {
          monacoEditor.trigger("keyboard", FIND_ACTION_ID, {})
        } catch {
          // Monaco contributions can be tree-shaken; keep the viewer stable if find is unavailable.
        }
      }
      const focusFindInput = () => {
        window.setTimeout(() => {
          const input = containerRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            [
              ".find-widget.visible textarea[aria-label='Find']",
              ".find-widget.visible input[aria-label='Find']",
              ".find-widget.visible textarea.input",
              ".find-widget.visible input",
            ].join(", "),
          )
          input?.focus()
          input?.select()
        }, 0)
      }

      const findAction = monacoEditor.getAction(FIND_ACTION_ID)
      if (findAction) {
        try {
          void Promise.resolve(findAction.run()).then(() => {
            window.setTimeout(() => {
              if (!containerRef.current?.querySelector(".find-widget.visible")) {
                triggerFindCommand()
              }
              focusFindInput()
            }, 0)
          }).catch(() => {
            triggerFindCommand()
            focusFindInput()
          })
        } catch {
          triggerFindCommand()
        }
        focusFindInput()
        return
      }
      triggerFindCommand()
      focusFindInput()
    }
  }, [])

  const monacoTheme = useMemo(() => {
    if (currentTheme && monacoRef.current) {
      return registerMonacoTheme(monacoRef.current, currentTheme)
    }
    return fallbackTheme
  }, [currentTheme, fallbackTheme])

  useEffect(() => {
    if (currentTheme && monacoRef.current) {
      const themeName = registerMonacoTheme(monacoRef.current, currentTheme)
      monacoRef.current.editor.setTheme(themeName)
    }
  }, [currentTheme])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let animationFrame = 0
    const layoutEditor = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        const monacoEditor = editorRef.current
        if (!monacoEditor) return

        const rect = container.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          monacoEditor.layout({ width: rect.width, height: rect.height })
        }
      })
    }

    layoutEditor()
    const resizeObserver = new ResizeObserver(layoutEditor)
    resizeObserver.observe(container)
    window.addEventListener("resize", layoutEditor)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      window.removeEventListener("resize", layoutEditor)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (contextMenu) {
        setContextMenu(null)
        return
      }

      const findWidget = containerRef.current?.querySelector(".find-widget.visible")
      if (findWidget) return

      e.preventDefault()
      onClose()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [contextMenu, onClose])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const isInsideContainerRect = (x: number, y: number) => {
      const rect = container.getBoundingClientRect()
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    }

    const isMonacoUIElement = (target: HTMLElement) => {
      return !!target.closest?.(".editor-widget, .monaco-hover, .monaco-menu")
    }

    const handleContextMenu = (e: MouseEvent) => {
      if (isMonacoUIElement(e.target as HTMLElement)) return
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY })
    }

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

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handlePointerDown = (e: PointerEvent) => {
      setActiveViewer(container.contains(e.target as Node))
    }

    window.addEventListener("pointerdown", handlePointerDown, true)
    return () => window.removeEventListener("pointerdown", handlePointerDown, true)
  }, [setActiveViewer])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const isActiveFileViewer = () => {
      const activeElement = document.activeElement
      return Boolean(
        activeViewerRef.current ||
        activeElement && container.contains(activeElement) ||
        container.querySelector(".monaco-editor.focused"),
      )
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isFindHotkey(e)) return
      if (!isActiveFileViewer()) return

      const monacoEditor = editorRef.current
      if (!monacoEditor) return

      e.preventDefault()
      e.stopPropagation()
      openFind()
    }

    const handleFileViewerFind = () => {
      if (isActiveFileViewer()) {
        openFind()
      }
    }

    container.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("file-viewer:find", handleFileViewerFind)
    return () => {
      container.removeEventListener("keydown", handleKeyDown, true)
      window.removeEventListener("keydown", handleKeyDown, true)
      window.removeEventListener("file-viewer:find", handleFileViewerFind)
    }
  }, [openFind])

  const handleEditorMount = useCallback((monacoEditor: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
    editorRef.current = monacoEditor
    monacoRef.current = monacoInstance
    setActiveViewer(true)
    const layoutMountedEditor = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect && rect.width > 0 && rect.height > 0) {
        monacoEditor.layout({ width: rect.width, height: rect.height })
      } else {
        monacoEditor.layout()
      }
    }
    window.requestAnimationFrame(layoutMountedEditor)
    window.setTimeout(layoutMountedEditor, 0)
    window.setTimeout(layoutMountedEditor, 100)

    if (currentTheme) {
      const themeName = registerMonacoTheme(monacoInstance, currentTheme)
      monacoInstance.editor.setTheme(themeName)
    }

    const editorContainer = monacoEditor.getDomNode()?.closest(".monaco-editor")
    if (editorContainer) {
      const observer = new MutationObserver(() => {
        const findWidget = editorContainer.querySelector(".find-widget")
        if (findWidget) {
          findWidget.querySelectorAll("[title]").forEach((el) => el.removeAttribute("title"))
        }
      })
      observer.observe(editorContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["title", "class"],
      })
      monacoEditor.onDidDispose(() => observer.disconnect())
    }

    const focusTextDisposable = monacoEditor.onDidFocusEditorText(() => setActiveViewer(true))
    const focusWidgetDisposable = monacoEditor.onDidFocusEditorWidget(() => setActiveViewer(true))
    monacoEditor.onDidDispose(() => {
      focusTextDisposable.dispose()
      focusWidgetDisposable.dispose()
    })

    const selectionDisposable = monacoEditor.onDidChangeCursorSelection(() => {
      const selection = monacoEditor.getSelection()
      const hasText = !!(
        selection &&
        !selection.isEmpty() &&
        monacoEditor.getModel()?.getValueInRange(selection)?.trim()
      )
      setHasSelection(hasText)
    })
    monacoEditor.onDidDispose(() => selectionDisposable.dispose())
  }, [currentTheme, setActiveViewer])

  const handleCopy = useCallback(() => {
    const monacoEditor = editorRef.current
    if (monacoEditor) {
      const selection = monacoEditor.getSelection()
      if (selection && !selection.isEmpty()) {
        const selectedText = monacoEditor.getModel()?.getValueInRange(selection) || ""
        navigator.clipboard.writeText(selectedText)
        return
      }
    }
    navigator.clipboard.writeText(content)
  }, [content])

  const handleFind = useCallback(() => {
    openFind()
  }, [openFind])

  const handleAddToContext = useCallback(() => {
    const monacoEditor = editorRef.current
    if (!monacoEditor) return

    const selection = monacoEditor.getSelection()
    if (!selection || selection.isEmpty()) return

    const selectedText = monacoEditor.getModel()?.getValueInRange(selection)?.trim()
    if (!selectedText) return

    window.dispatchEvent(new CustomEvent("file-viewer-add-to-context", {
      detail: {
        text: selectedText,
        source: { type: "file-viewer", filePath },
      },
    }))
  }, [filePath])

  const handleEditorAction = useCallback((actionId: string) => {
    const monacoEditor = editorRef.current
    if (monacoEditor) {
      monacoEditor.focus()
      monacoEditor.trigger("contextmenu", actionId, null)
    }
  }, [])

  const editorOptions = useMemo(
    () => ({
      ...defaultEditorOptions,
      wordWrap: wordWrap ? ("on" as const) : ("off" as const),
      minimap: { enabled: minimap },
      lineNumbers: lineNumbers ? ("on" as const) : ("off" as const),
    }),
    [lineNumbers, minimap, wordWrap],
  )

  return (
    <>
      <MonacoViewerStyles />
      <div
        ref={containerRef}
        className="h-full min-h-0 allow-text-selection"
        data-file-viewer-path={filePath}
      >
        <Editor
          height="100%"
          language={language}
          value={content}
          theme={monacoTheme}
          options={editorOptions}
          loading={<LoadingSpinner />}
          onMount={handleEditorMount}
        />
      </div>
      {contextMenu && createPortal(
        <EditorContextMenu
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          onEditorAction={handleEditorAction}
          onCopy={handleCopy}
          onFind={handleFind}
          onAddToContext={handleAddToContext}
          hasSelection={hasSelection}
        />,
        document.body,
      )}
    </>
  )
}

function EditorContextMenu({
  position,
  onClose,
  onEditorAction,
  onCopy,
  onFind,
  onAddToContext,
  hasSelection,
}: {
  position: ContextMenuPosition
  onClose: () => void
  onEditorAction: (actionId: string) => void
  onCopy: () => void
  onFind: () => void
  onAddToContext: () => void
  hasSelection: boolean
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [adjustedPosition, setAdjustedPosition] = useState(position)

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

  useEffect(() => {
    if (!menuRef.current) return

    const rect = menuRef.current.getBoundingClientRect()
    const x = position.x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 4 : position.x
    const y = position.y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 4 : position.y
    setAdjustedPosition({ x, y })
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
      className="fixed z-[1000] min-w-[200px] py-1 rounded-[10px] border border-border bg-popover text-sm text-popover-foreground shadow-lg dark pointer-events-auto animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      <div className={itemClass} onClick={() => handleEditorAction("editor.action.revealDefinition")}>
        Go to Definition
        <span className={shortcutClass}>Cmd F12</span>
      </div>
      <div className={itemClass} onClick={() => handleEditorAction("editor.action.goToReferences")}>
        Go to References
        <span className={shortcutClass}>Shift F12</span>
      </div>
      <div className={itemClass} onClick={() => handleEditorAction("editor.action.goToSymbol")}>
        Go to Symbol...
        <span className={shortcutClass}>Shift Cmd O</span>
      </div>
      <div className={separatorClass} />
      <div className={itemClass} onClick={() => handleAction(onFind)}>
        Find
        <span className={shortcutClass}>Cmd F</span>
      </div>
      <div className={separatorClass} />
      <div
        className={hasSelection ? itemClass : disabledItemClass}
        onClick={hasSelection ? () => handleAction(onAddToContext) : undefined}
      >
        Add to Context
      </div>
      <div className={separatorClass} />
      <div className={itemClass} onClick={() => handleAction(onCopy)}>
        Copy
        <span className={shortcutClass}>Cmd C</span>
      </div>
      <div className={separatorClass} />
      <div className={itemClass} onClick={() => handleEditorAction("editor.action.quickCommand")}>
        Command Palette
        <span className={shortcutClass}>F1</span>
      </div>
    </div>
  )
}

function MonacoViewerStyles() {
  return (
    <style>{`
      .monaco-hover {
        display: none !important;
      }

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

      .monaco-editor .find-widget .button.toggle,
      .monaco-editor .find-widget .replace-part,
      .monaco-editor .find-widget .monaco-sash,
      .monaco-editor .find-widget .find-actions .codicon-find-selection {
        display: none !important;
      }

      .monaco-editor .find-widget .find-part {
        display: flex !important;
        align-items: center !important;
        gap: 2px !important;
        flex: 1 !important;
        margin: 0 !important;
      }

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

      .monaco-editor .find-widget .controls,
      .monaco-editor .find-widget .find-actions {
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

      .monaco-editor .find-widget .monaco-custom-toggle:hover,
      .monaco-editor .find-widget .monaco-custom-toggle[aria-checked="true"],
      .monaco-editor .find-widget .monaco-custom-toggle.checked {
        background: hsl(var(--muted)) !important;
        color: hsl(var(--foreground)) !important;
      }

      .monaco-editor .find-widget .matchesCount {
        color: hsl(var(--muted-foreground)) !important;
        font-size: 12px !important;
        min-width: auto !important;
        padding: 0 6px !important;
        line-height: 24px !important;
        display: flex !important;
        align-items: center !important;
      }

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

      .monaco-editor .find-widget > .codicon-widget-close {
        position: static !important;
        flex-shrink: 0 !important;
      }
    `}</style>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}
