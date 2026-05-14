import {
  memo,
  useRef,
  useCallback,
  useEffect,
  useState,
  forwardRef,
} from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PlusIcon, CustomTerminalIcon } from "@/components/ui/icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { TerminalInstance } from "./types"
import { useI18n } from "@/lib/i18n"

/**
 * Get the shortened path (last folder name) from a full path
 */
function getShortPath(fullPath: string | undefined): string | null {
  if (!fullPath) return null
  const parts = fullPath.split("/").filter(Boolean)
  return parts[parts.length - 1] || null
}

interface TerminalTabProps {
  terminal: TerminalInstance
  isActive: boolean
  isOnly: boolean
  isTruncated: boolean
  cwd: string | undefined
  initialCwd: string
  isEditing: boolean
  hasTabsToRight: boolean
  canCloseOthers: boolean
  /** Use smaller text size for widget mode */
  small?: boolean
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCloseOthers: () => void
  onCloseToRight: () => void
  onRename: (id: string, name: string) => void
  onEditingChange: (isEditing: boolean) => void
  onStartRename: () => void
  textRef: (el: HTMLSpanElement | null) => void
}

const TerminalTab = memo(
  forwardRef<HTMLButtonElement, TerminalTabProps>(function TerminalTab(
    {
      terminal,
      isActive,
      isOnly,
      isTruncated,
      cwd,
      initialCwd,
      isEditing,
      hasTabsToRight,
      canCloseOthers,
      small,
      onSelect,
      onClose,
      onCloseOthers,
      onCloseToRight,
      onRename,
      onEditingChange,
      onStartRename,
      textRef,
    },
    ref,
  ) {
    const { t } = useI18n()
    // Only show path if it's different from initial cwd
    const isDifferentFromInitial = cwd && cwd !== initialCwd
    const shortPath = isDifferentFromInitial ? getShortPath(cwd) : null

    const [editValue, setEditValue] = useState(terminal.name)
    const inputRef = useRef<HTMLInputElement>(null)

    const handleClick = useCallback(() => {
      if (!isEditing) {
        onSelect(terminal.id)
      }
    }, [onSelect, terminal.id, isEditing])

    const handleDoubleClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        onStartRename()
      },
      [onStartRename],
    )

    const handleCloseClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        onClose(terminal.id)
      },
      [onClose, terminal.id],
    )

    const handleSave = useCallback(() => {
      const trimmed = editValue.trim()
      if (trimmed && trimmed !== terminal.name) {
        onRename(terminal.id, trimmed)
      }
      onEditingChange(false)
    }, [editValue, terminal.id, terminal.name, onRename, onEditingChange])

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault()
          handleSave()
        } else if (e.key === "Escape") {
          e.preventDefault()
          setEditValue(terminal.name)
          onEditingChange(false)
        }
      },
      [handleSave, terminal.name, onEditingChange],
    )

    // Track when editing starts to ignore immediate blur events
    // caused by context menu focus restoration
    const editStartTimeRef = useRef(0)

    const handleBlur = useCallback(() => {
      // Ignore blur events that happen within 200ms of editing start.
      // When "Rename terminal" is clicked from the context menu, Radix UI
      // restores focus to the trigger element after the menu closes,
      // which steals focus from the input and fires an immediate blur.
      const elapsed = Date.now() - editStartTimeRef.current
      if (elapsed < 200) {
        // Re-focus the input after the context menu focus restoration settles
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
          }
        })
        return
      }
      handleSave()
    }, [handleSave])

    // Focus input when editing starts
    useEffect(() => {
      if (isEditing && inputRef.current) {
        editStartTimeRef.current = Date.now()
        setEditValue(terminal.name)
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
          }
        })
      }
    }, [isEditing, terminal.name])

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            ref={ref}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            className={cn(
              "group relative flex items-center rounded-md transition-colors h-6 flex-shrink-0 select-none",
              small ? "text-xs" : "text-sm",
              !isOnly ? "cursor-pointer" : "cursor-default",
              "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
              "overflow-hidden px-1.5 py-0.5 whitespace-nowrap min-w-[50px] gap-1.5",
              isActive
                ? "bg-muted text-foreground max-w-[180px]"
                : "hover:bg-muted/80 max-w-[150px]",
            )}
          >
            {/* Terminal icon */}
            <div className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">
              <CustomTerminalIcon className="w-3.5 h-3.5 text-muted-foreground" />
            </div>

            {/* Terminal name or input */}
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "relative z-0 text-left flex-1 min-w-0 pr-1 bg-transparent outline-none border-none",
                  small ? "text-xs" : "text-sm",
                )}
              />
            ) : (
              <span
                ref={textRef}
                className="relative z-0 text-left flex-1 min-w-0 pr-1 overflow-hidden flex items-center gap-1.5 whitespace-nowrap select-none cursor-[inherit]"
              >
                <span>{terminal.name}</span>
                {shortPath && (
                  <span className="text-muted-foreground">{shortPath}</span>
                )}
              </span>
            )}

            {/* Gradient fade on the right when text is truncated */}
            {isTruncated && !isEditing && (
              <div
                className={cn(
                  "absolute right-0 top-0 bottom-0 w-6 pointer-events-none z-[1] rounded-r-md opacity-100 group-hover:opacity-0 transition-opacity duration-200",
                  isActive
                    ? "bg-gradient-to-l from-muted to-transparent"
                    : "bg-gradient-to-l from-background to-transparent",
                )}
              />
            )}

            {/* Close button - only show when hovered and multiple tabs */}
            {!isOnly && !isEditing && (
              <div className="absolute right-0 top-0 bottom-0 flex items-center justify-end pr-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                <div
                  className={cn(
                    "absolute right-0 top-0 bottom-0 w-9 flex items-center justify-center rounded-r-md",
                    isActive
                      ? "bg-[linear-gradient(to_left,hsl(var(--muted))_0%,hsl(var(--muted))_60%,transparent_100%)]"
                      : "bg-[linear-gradient(to_left,color-mix(in_srgb,hsl(var(--muted))_80%,hsl(var(--background)))_0%,color-mix(in_srgb,hsl(var(--muted))_80%,hsl(var(--background)))_60%,transparent_100%)]",
                  )}
                />
                <button
                  type="button"
                  onClick={handleCloseClick}
                  className="relative z-20 hover:text-foreground rounded p-0.5 transition-[color,transform] duration-150 ease-out active:scale-[0.97]"
                  aria-label={t("terminal.close")}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={onStartRename}>
            {t("terminal.rename")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => onClose(terminal.id)}
            disabled={isOnly}
          >
            {t("terminal.close")}
          </ContextMenuItem>
          <ContextMenuItem onClick={onCloseOthers} disabled={!canCloseOthers}>
            {t("terminal.closeOther")}
          </ContextMenuItem>
          <ContextMenuItem onClick={onCloseToRight} disabled={!hasTabsToRight}>
            {t("terminal.closeToRight")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }),
)

interface TerminalTabsProps {
  terminals: TerminalInstance[]
  activeTerminalId: string | null
  cwds: Record<string, string>
  initialCwd: string
  /** Background color for gradients - should match terminal background */
  terminalBg?: string
  /** Hide the plus button (when it's rendered externally) */
  hidePlusButton?: boolean
  /** Use smaller text size for widget mode */
  small?: boolean
  onSelectTerminal: (id: string) => void
  onCloseTerminal: (id: string) => void
  onCloseOtherTerminals: (id: string) => void
  onCloseTerminalsToRight: (id: string) => void
  onCreateTerminal: () => void
  onRenameTerminal: (id: string, name: string) => void
}

export const TerminalTabs = memo(function TerminalTabs({
  terminals,
  activeTerminalId,
  cwds,
  initialCwd,
  terminalBg,
  hidePlusButton = false,
  small = false,
  onSelectTerminal,
  onCloseTerminal,
  onCloseOtherTerminals,
  onCloseTerminalsToRight,
  onCreateTerminal,
  onRenameTerminal,
}: TerminalTabsProps) {
  const { t } = useI18n()
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const textRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const [truncatedTabs, setTruncatedTabs] = useState<Set<string>>(new Set())
  const [showLeftGradient, setShowLeftGradient] = useState(false)
  const [showRightGradient, setShowRightGradient] = useState(false)
  const [editingTerminalId, setEditingTerminalId] = useState<string | null>(
    null,
  )

  const isOnly = terminals.length === 1

  const handleStartRename = useCallback((terminalId: string) => {
    setEditingTerminalId(terminalId)
  }, [])

  const handleEditingChange = useCallback(
    (terminalId: string, isEditing: boolean) => {
      setEditingTerminalId(isEditing ? terminalId : null)
    },
    [],
  )

  // Check scroll position for gradients
  const checkScrollPosition = useCallback(() => {
    const container = tabsContainerRef.current
    if (!container) return

    const { scrollLeft, scrollWidth, clientWidth } = container
    const isScrollable = scrollWidth > clientWidth

    setShowLeftGradient(isScrollable && scrollLeft > 0)
    setShowRightGradient(
      isScrollable && scrollLeft < scrollWidth - clientWidth - 1,
    )
  }, [])

  // Update gradients on scroll
  useEffect(() => {
    const container = tabsContainerRef.current
    if (!container) return

    checkScrollPosition()

    container.addEventListener("scroll", checkScrollPosition, { passive: true })
    return () => container.removeEventListener("scroll", checkScrollPosition)
  }, [checkScrollPosition])

  // Update gradients when tabs change
  useEffect(() => {
    checkScrollPosition()
  }, [terminals, checkScrollPosition])

  // Update gradients on window resize
  useEffect(() => {
    const handleResize = () => checkScrollPosition()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [checkScrollPosition])

  // Scroll to active tab when it changes
  useEffect(() => {
    if (!activeTerminalId || !tabsContainerRef.current) return

    const container = tabsContainerRef.current
    const activeTabElement = tabRefs.current.get(activeTerminalId)

    if (activeTabElement) {
      setTimeout(() => {
        const containerRect = container.getBoundingClientRect()
        const tabRect = activeTabElement.getBoundingClientRect()

        const isTabLeftOfView = tabRect.left < containerRect.left
        const isTabRightOfView = tabRect.right > containerRect.right

        if (isTabLeftOfView || isTabRightOfView) {
          const tabCenter =
            activeTabElement.offsetLeft + activeTabElement.offsetWidth / 2
          const containerCenter = container.offsetWidth / 2
          const targetScroll = tabCenter - containerCenter
          const maxScroll = container.scrollWidth - container.offsetWidth
          const clampedScroll = Math.max(0, Math.min(targetScroll, maxScroll))

          container.scrollTo({
            left: clampedScroll,
            behavior: "smooth",
          })
        }
      }, 0)
    }
  }, [activeTerminalId, terminals])

  // Check if text is truncated for each tab
  useEffect(() => {
    const checkTruncation = () => {
      const newTruncated = new Set<string>()
      textRefs.current.forEach((el, terminalId) => {
        if (el && el.scrollWidth > el.clientWidth) {
          newTruncated.add(terminalId)
        }
      })
      setTruncatedTabs(newTruncated)
    }

    checkTruncation()

    const resizeObserver = new ResizeObserver(() => checkTruncation())
    textRefs.current.forEach((el) => el && resizeObserver.observe(el))

    return () => resizeObserver.disconnect()
  }, [terminals, activeTerminalId])

  // Cleanup refs for closed tabs to prevent memory leaks
  useEffect(() => {
    const openIds = new Set(terminals.map((t) => t.id))

    tabRefs.current.forEach((_, id) => {
      if (!openIds.has(id)) {
        tabRefs.current.delete(id)
        textRefs.current.delete(id)
      }
    })
  }, [terminals])

  return (
    <div className="relative flex-1 min-w-0 flex items-center h-7">
      {/* Left gradient */}
      {showLeftGradient && (
        <div
          className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none z-30"
          style={{
            background: terminalBg
              ? `linear-gradient(to right, ${terminalBg}, transparent)`
              : undefined,
          }}
        />
      )}

      {/* Scrollable tabs container - with padding-right for plus button */}
      <div
        ref={tabsContainerRef}
        className={cn(
          "flex items-center px-1 py-1 -my-1 gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-hide",
          !hidePlusButton && "pr-12",
        )}
        style={{
          // @ts-expect-error - WebKit-specific property for Electron
          WebkitAppRegion: "no-drag",
        }}
      >
        {terminals.map((terminal, index) => {
          const hasTabsToRight = index < terminals.length - 1
          const canCloseOthers = terminals.length > 1

          return (
            <TerminalTab
              key={terminal.id}
              ref={(el) => {
                if (el) {
                  tabRefs.current.set(terminal.id, el)
                } else {
                  tabRefs.current.delete(terminal.id)
                }
              }}
              terminal={terminal}
              isActive={terminal.id === activeTerminalId}
              isOnly={isOnly}
              isTruncated={truncatedTabs.has(terminal.id)}
              cwd={cwds[terminal.paneId]}
              initialCwd={initialCwd}
              isEditing={editingTerminalId === terminal.id}
              hasTabsToRight={hasTabsToRight}
              canCloseOthers={canCloseOthers}
              small={small}
              onSelect={onSelectTerminal}
              onClose={onCloseTerminal}
              onCloseOthers={() => onCloseOtherTerminals(terminal.id)}
              onCloseToRight={() => onCloseTerminalsToRight(terminal.id)}
              onRename={onRenameTerminal}
              onEditingChange={(isEditing) =>
                handleEditingChange(terminal.id, isEditing)
              }
              onStartRename={() => handleStartRename(terminal.id)}
              textRef={(el) => {
                if (el) {
                  textRefs.current.set(terminal.id, el)
                } else {
                  textRefs.current.delete(terminal.id)
                }
              }}
            />
          )
        })}
      </div>

      {/* Plus button - absolute positioned on right with gradient cover */}
      {!hidePlusButton && (
        <div
          className="absolute right-0 top-0 bottom-0 flex items-center z-20"
          style={{
            // @ts-expect-error - WebKit-specific property for Electron
            WebkitAppRegion: "no-drag",
          }}
        >
          {/* Gradient to cover content peeking from the left */}
          <div
            className="w-6 h-full"
            style={{
              background: terminalBg
                ? `linear-gradient(to right, transparent, ${terminalBg})`
                : undefined,
            }}
          />
          <div
            className="h-full flex items-center pr-1"
            style={{ backgroundColor: terminalBg }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onCreateTerminal}
                  className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md"
                  aria-label={t("terminal.new")}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("terminal.new")}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  )
})
