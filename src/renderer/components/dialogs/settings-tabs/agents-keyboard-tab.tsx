"use client"

import { useCallback, useMemo, useState, useRef, useEffect } from "react"
import { useListKeyboardNav } from "./use-list-keyboard-nav"
import { useAtom, useAtomValue } from "jotai"
import { RotateCcw, Settings2 } from "lucide-react"
import { cn } from "../../../lib/utils"
import { CmdIcon, OptionIcon, ShiftIcon, ControlIcon } from "../../ui/icons"
import { ResizableSidebar } from "../../ui/resizable-sidebar"
import { settingsKeyboardSidebarWidthAtom } from "../../../features/agents/atoms"
import {
  customHotkeysAtom,
  ctrlTabTargetAtom,
  betaKanbanEnabledAtom,
} from "../../../lib/atoms"
import {
  ALL_SHORTCUT_ACTIONS,
  getShortcutsByCategory,
  hotkeyStringToKeys,
  getResolvedHotkey,
  isCustomHotkey,
  detectConflicts,
  normalizeHotkey,
  CATEGORY_LABELS,
  getShortcutAction,
  type ShortcutAction,
  type ShortcutActionId,
  type ShortcutCategory,
  type CustomHotkeysConfig,
} from "../../../lib/hotkeys"
import { useHotkeyRecorder } from "../../../lib/hotkeys/use-hotkey-recorder"

/**
 * Display a single key in a keyboard shortcut
 */
function ShortcutKey({ keyName, size = "md", isSelected = false }: { keyName: string; size?: "sm" | "md" | "lg"; isSelected?: boolean }) {
  const sizeClasses = {
    sm: "h-5 min-w-5 text-[10px] px-1",
    md: "h-6 min-w-6 text-xs px-1.5",
    lg: "h-8 min-w-8 text-sm px-2",
  }

  const iconSizes = {
    sm: "h-2.5 w-2.5",
    md: "h-3 w-3",
    lg: "h-4 w-4",
  }

  const baseClasses = cn(
    "inline-flex items-center justify-center rounded border font-[inherit] font-normal",
    sizeClasses[size],
    isSelected
      ? "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30"
      : "bg-secondary text-secondary-foreground border-muted"
  )

  const lower = keyName.toLowerCase()

  // Modifier keys with icons
  if (lower === "cmd" || lower === "meta") {
    return (
      <kbd className={baseClasses}>
        <CmdIcon className={iconSizes[size]} />
      </kbd>
    )
  }

  if (lower === "opt" || lower === "alt") {
    return (
      <kbd className={baseClasses}>
        <OptionIcon className={iconSizes[size]} />
      </kbd>
    )
  }

  if (lower === "shift") {
    return (
      <kbd className={baseClasses}>
        <ShiftIcon className={iconSizes[size]} />
      </kbd>
    )
  }

  if (lower === "ctrl") {
    return (
      <kbd className={baseClasses}>
        <ControlIcon className={iconSizes[size]} />
      </kbd>
    )
  }

  // Text-based keys
  const displayMap: Record<string, string> = {
    enter: "↵",
    esc: "Esc",
    escape: "Esc",
    backspace: "⌫",
    delete: "⌦",
    tab: "Tab",
    space: "Space",
  }

  const display = displayMap[lower] || keyName.toUpperCase()

  return (
    <kbd className={baseClasses}>
      {display}
    </kbd>
  )
}

/**
 * Shortcut item in the left list
 */
function ShortcutListItem({
  action,
  config,
  isSelected,
  hasConflict,
  onClick,
  ctrlTabTarget,
}: {
  action: ShortcutAction
  config: CustomHotkeysConfig
  isSelected: boolean
  hasConflict: boolean
  onClick: () => void
  ctrlTabTarget: "workspaces" | "agents"
}) {
  const isCustom = isCustomHotkey(action.id, config)
  let currentHotkey = getResolvedHotkey(action.id, config)

  // Handle dynamic shortcuts for ctrl+tab
  if (action.isDynamic && !isCustom) {
    if (action.id === "quick-switch-workspaces") {
      currentHotkey = ctrlTabTarget === "workspaces" ? "ctrl+tab" : "opt+ctrl+tab"
    } else if (action.id === "quick-switch-agents") {
      currentHotkey = ctrlTabTarget === "workspaces" ? "opt+ctrl+tab" : "ctrl+tab"
    }
  }

  const keys = currentHotkey ? hotkeyStringToKeys(currentHotkey) : []

  return (
    <button
      type="button"
      data-item-id={action.id}
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
        isSelected
          ? "bg-foreground/5 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
        hasConflict && !isSelected && "bg-red-500/10"
      )}
    >
      <span className="text-sm truncate">
        {action.label}
      </span>
      <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
        {keys.map((key, index) => (
          <ShortcutKey key={index} keyName={key} size="sm" />
        ))}
      </div>
    </button>
  )
}

/**
 * Right panel showing selected shortcut details
 */
function ShortcutDetailPanel({
  action,
  config,
  isRecording,
  onStartRecording,
  onRecord,
  onCancel,
  onReset,
  ctrlTabTarget,
  conflictMessage,
}: {
  action: ShortcutAction
  config: CustomHotkeysConfig
  isRecording: boolean
  onStartRecording: () => void
  onRecord: (hotkey: string) => void
  onCancel: () => void
  onReset: () => void
  ctrlTabTarget: "workspaces" | "agents"
  conflictMessage: string | null
}) {
  const isCustom = isCustomHotkey(action.id, config)
  let currentHotkey = getResolvedHotkey(action.id, config)
  const recorderButtonRef = useRef<HTMLButtonElement>(null)

  // Handle dynamic shortcuts for ctrl+tab
  if (action.isDynamic && !isCustom) {
    if (action.id === "quick-switch-workspaces") {
      currentHotkey = ctrlTabTarget === "workspaces" ? "ctrl+tab" : "opt+ctrl+tab"
    } else if (action.id === "quick-switch-agents") {
      currentHotkey = ctrlTabTarget === "workspaces" ? "opt+ctrl+tab" : "ctrl+tab"
    }
  }

  const keys = currentHotkey ? hotkeyStringToKeys(currentHotkey) : []
  const defaultAction = getShortcutAction(action.id)
  const defaultKeys = defaultAction?.defaultKeys || []

  const { currentKeys } = useHotkeyRecorder({
    onRecord,
    onCancel,
    isRecording,
  })

  // Click outside to cancel recording
  useEffect(() => {
    if (!isRecording) return

    const handleClickOutside = (e: MouseEvent) => {
      if (recorderButtonRef.current && !recorderButtonRef.current.contains(e.target as Node)) {
        onCancel()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isRecording, onCancel])

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      {/* Title */}
      <h3 className="text-base font-medium text-foreground mb-1">{action.label}</h3>
      <p className="text-sm text-muted-foreground mb-8">
        {action.isDynamic ? action.dynamicDescription : `${CATEGORY_LABELS[action.category]} shortcut`}
      </p>

      {/* Hotkey display / recorder */}
      <button
        ref={recorderButtonRef}
        type="button"
        onClick={onStartRecording}
        className={cn(
          "flex items-center justify-center gap-1 px-6 py-3 h-[52px] rounded-lg border-2 transition-shadow",
          isRecording
            ? "border-primary bg-secondary ring-[3px] ring-primary/20"
            : conflictMessage
              ? "border-red-500 bg-red-500/10"
              : "border-border bg-background hover:border-muted-foreground/50 hover:bg-secondary/50"
        )}
      >
        {(() => {
          // During recording, show currentKeys or "Press keys..."
          if (isRecording) {
            if (currentKeys.length > 0) {
              return (
                <div className="flex items-center gap-1">
                  {currentKeys.map((key, index) => (
                    <ShortcutKey key={index} keyName={key} size="lg" />
                  ))}
                </div>
              )
            }
            return (
              <span className="text-sm text-muted-foreground animate-pulse">
                Press keys...
              </span>
            )
          }
          // Not recording - always show saved keys (they update immediately now)
          if (keys.length > 0) {
            return (
              <div className="flex items-center gap-1">
                {keys.map((key, index) => (
                  <ShortcutKey key={index} keyName={key} size="lg" />
                ))}
              </div>
            )
          }
          return <span className="text-sm text-muted-foreground">Not set</span>
        })()}
      </button>

      {/* Conflict warning - shown temporarily when trying to set conflicting hotkey */}
      {conflictMessage && (
        <p className="text-xs text-red-500 mt-3 animate-pulse">
          {conflictMessage}
        </p>
      )}

      {/* Reset to default / Instructions - always reserve space to prevent layout shift */}
      <div className="mt-6 h-8 flex items-center justify-center">
        {isCustom ? (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary border border-border rounded-lg transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset to</span>
            <div className="flex items-center gap-0.5">
              {defaultKeys.map((key, index) => (
                <ShortcutKey key={index} keyName={key} size="sm" />
              ))}
            </div>
          </button>
        ) : (
          <p className="text-xs text-muted-foreground text-center">
            Click to record a new shortcut
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Empty state when no shortcut is selected
 */
function EmptyDetailPanel() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <Settings2 className="h-10 w-10 text-muted-foreground/20 mb-3" />
      <p className="text-sm text-muted-foreground">
        Select a shortcut to customize
      </p>
    </div>
  )
}

/**
 * Main keyboard settings tab component
 */
export function AgentsKeyboardTab() {
  const [customHotkeys, setCustomHotkeys] = useAtom(customHotkeysAtom)
  const [ctrlTabTarget] = useAtom(ctrlTabTargetAtom)
  const betaKanbanEnabled = useAtomValue(betaKanbanEnabledAtom)
  // Default to first shortcut
  const [selectedActionId, setSelectedActionId] = useState<ShortcutActionId>("show-shortcuts")
  const [isRecording, setIsRecording] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Focus search on "/" hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  // Get shortcuts by category, filtering out disabled features
  const shortcutsByCategory = useMemo(() => {
    const all = getShortcutsByCategory()
    // Filter out kanban shortcut if feature is disabled
    if (!betaKanbanEnabled) {
      return {
        ...all,
        workspaces: all.workspaces.filter(action => action.id !== "open-kanban"),
      }
    }
    return all
  }, [betaKanbanEnabled])

  // Detect conflicts
  const conflicts = useMemo(
    () => detectConflicts(customHotkeys),
    [customHotkeys]
  )

  // Filter shortcuts by search query
  const filteredShortcuts = useMemo(() => {
    if (!searchQuery.trim()) {
      return shortcutsByCategory
    }
    const query = searchQuery.toLowerCase()
    const result: Record<ShortcutCategory, ShortcutAction[]> = {
      general: [],
      workspaces: [],
      agents: [],
    }
    for (const category of Object.keys(shortcutsByCategory) as ShortcutCategory[]) {
      result[category] = shortcutsByCategory[category].filter(action =>
        action.label.toLowerCase().includes(query)
      )
    }
    return result
  }, [shortcutsByCategory, searchQuery])

  // Flat list of all action IDs for keyboard navigation
  const allActionIds = useMemo(
    () => (["general", "workspaces", "agents"] as ShortcutCategory[]).flatMap(
      (cat) => filteredShortcuts[cat].map((a) => a.id)
    ),
    [filteredShortcuts]
  )

  const { containerRef: listRef, onKeyDown: listKeyDown } = useListKeyboardNav({
    items: allActionIds,
    selectedItem: selectedActionId,
    onSelect: (id) => { setSelectedActionId(id); setIsRecording(false) },
  })

  // Get selected action
  const selectedAction = useMemo(
    () => selectedActionId ? getShortcutAction(selectedActionId) : null,
    [selectedActionId]
  )

  // Has any custom hotkeys
  const hasCustomHotkeys = useMemo(
    () => Object.keys(customHotkeys.bindings).length > 0,
    [customHotkeys]
  )

  // Start recording
  const handleStartRecording = useCallback(() => {
    setIsRecording(true)
  }, [])

  // Cancel recording
  const handleCancel = useCallback(() => {
    setIsRecording(false)
  }, [])

  // Check if a hotkey would conflict with another action
  const checkConflict = useCallback((hotkey: string, currentActionId: ShortcutActionId): ShortcutAction | null => {
    const normalizedNew = normalizeHotkey(hotkey)

    for (const action of ALL_SHORTCUT_ACTIONS) {
      if (action.id === currentActionId) continue

      const existingHotkey = getResolvedHotkey(action.id, customHotkeys)
      if (existingHotkey && normalizeHotkey(existingHotkey) === normalizedNew) {
        return action
      }
    }
    return null
  }, [customHotkeys])

  // Record a hotkey
  const handleRecord = useCallback((hotkey: string) => {
    if (!selectedActionId) return

    // Check for conflicts
    const conflictingAction = checkConflict(hotkey, selectedActionId)
    if (conflictingAction) {
      // Show conflict message and don't save
      setConflictMessage(`"${conflictingAction.label}" already uses this shortcut`)
      setIsRecording(false)

      // Clear message after 2 seconds
      setTimeout(() => {
        setConflictMessage(null)
      }, 2000)
      return
    }

    // No conflict, save the hotkey then exit recording mode
    setCustomHotkeys((prev) => ({
      ...prev,
      bindings: {
        ...prev.bindings,
        [selectedActionId]: hotkey,
      },
    }))
    setConflictMessage(null)
    // Delay to let atom update propagate before exiting recording mode
    setTimeout(() => {
      setIsRecording(false)
    }, 50)
  }, [selectedActionId, setCustomHotkeys, checkConflict])

  // Reset selected hotkey to default
  const handleReset = useCallback(() => {
    if (!selectedActionId) return
    setCustomHotkeys((prev) => {
      const { [selectedActionId]: _, ...rest } = prev.bindings
      return {
        ...prev,
        bindings: rest,
      }
    })
  }, [selectedActionId, setCustomHotkeys])

  // Reset all hotkeys to defaults
  const handleResetAll = useCallback(() => {
    setCustomHotkeys({ version: 1, bindings: {} })
  }, [setCustomHotkeys])

  // Count total shortcuts
  const totalShortcuts = useMemo(() => {
    return Object.values(filteredShortcuts).reduce((sum, arr) => sum + arr.length, 0)
  }, [filteredShortcuts])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar - shortcuts list */}
      <ResizableSidebar
        isOpen={true}
        onClose={() => {}}
        widthAtom={settingsKeyboardSidebarWidthAtom}
        minWidth={200}
        maxWidth={400}
        side="left"
        animationDuration={0}
        initialWidth={240}
        exitWidth={240}
        disableClickToClose={true}
      >
        <div className="flex flex-col h-full bg-background border-r overflow-hidden" style={{ borderRightWidth: "0.5px" }}>
          {/* Search */}
          <div className="px-2 pt-2 flex-shrink-0">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search shortcuts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 w-full rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40 outline-none"
            />
          </div>

          {/* Shortcuts list */}
          <div ref={listRef} onKeyDown={listKeyDown} tabIndex={-1} className="flex-1 overflow-y-auto px-2 pt-2 pb-2 outline-none">
            {totalShortcuts === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No shortcuts found
              </div>
            ) : (
              <div className="space-y-3">
                {(["general", "workspaces", "agents"] as ShortcutCategory[]).map((category) => {
                  const actions = filteredShortcuts[category]
                  if (actions.length === 0) return null
                  return (
                    <div key={category}>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                        {CATEGORY_LABELS[category]}
                      </p>
                      <div className="space-y-0.5">
                        {actions.map((action) => (
                          <ShortcutListItem
                            key={action.id}
                            action={action}
                            config={customHotkeys}
                            isSelected={selectedActionId === action.id}
                            hasConflict={!!conflicts.get(action.id)}
                            onClick={() => {
                              setSelectedActionId(action.id)
                              setIsRecording(false)
                            }}
                            ctrlTabTarget={ctrlTabTarget}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Reset all button at bottom */}
          {hasCustomHotkeys && (
            <div className="pt-2 pb-2 px-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleResetAll}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Reset all to defaults
              </button>
            </div>
          )}
        </div>
      </ResizableSidebar>

      {/* Right panel - shortcut details */}
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        {selectedAction ? (
          <ShortcutDetailPanel
            action={selectedAction}
            config={customHotkeys}
            isRecording={isRecording}
            onStartRecording={handleStartRecording}
            onRecord={handleRecord}
            onCancel={handleCancel}
            onReset={handleReset}
            ctrlTabTarget={ctrlTabTarget}
            conflictMessage={conflictMessage}
          />
        ) : (
          <EmptyDetailPanel />
        )}
      </div>
    </div>
  )
}
