"use client"

import { Brain, ChevronRight, Zap } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../../../components/ui/command"
import { CheckIcon, ClaudeCodeIcon, IconChevronDown } from "../../../components/ui/icons"
import { Checkbox } from "../../../components/ui/checkbox"
import { Button } from "../../../components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover"
import { cn } from "../../../lib/utils"
import type { ClaudeThinkingLevel, CodexThinkingLevel } from "../lib/models"
import {
  formatClaudeThinkingLabel,
  formatCodexThinkingLabel,
} from "../lib/models"

const CROSS_PROVIDER_DIALOG_DISMISSED_KEY = "agent-model-selector:skip-cross-provider-dialog"

const CodexIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
  </svg>
)

export type AgentProviderId = "claude-code" | "codex"

type ClaudeModelOption = {
  id: string
  name: string
  version: string
  thinkings: ClaudeThinkingLevel[]
}

type CodexModelOption = {
  id: string
  name: string
  thinkings: CodexThinkingLevel[]
}

interface AgentModelSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedAgentId: AgentProviderId
  onSelectedAgentIdChange: (provider: AgentProviderId) => void
  selectedModelLabel: string
  allowProviderSwitch?: boolean
  triggerClassName?: string
  contentClassName?: string
  onOpenModelsSettings?: () => void
  onContinueWithProvider?: (provider: AgentProviderId) => void
  claude: {
    models: ClaudeModelOption[]
    selectedModelId?: string
    onSelectModel: (modelId: string) => void
    hasCustomModelConfig: boolean
    isOffline: boolean
    ollamaModels: string[]
    selectedOllamaModel?: string
    recommendedOllamaModel?: string
    onSelectOllamaModel: (modelId: string) => void
    isConnected: boolean
    selectedThinking: ClaudeThinkingLevel
    onSelectThinking: (thinking: ClaudeThinkingLevel) => void
  }
  codex: {
    models: CodexModelOption[]
    selectedModelId: string
    onSelectModel: (modelId: string) => void
    selectedThinking: CodexThinkingLevel
    onSelectThinking: (thinking: CodexThinkingLevel) => void
    isConnected: boolean
  }
}

type FlatModelItem =
  | { type: "claude"; model: ClaudeModelOption }
  | { type: "codex"; model: CodexModelOption }
  | { type: "ollama"; modelName: string; isRecommended: boolean }
  | { type: "custom" }

function ThinkingSubMenu<T extends string>({
  levels,
  selected,
  onSelect,
  formatLabel,
}: {
  levels: T[]
  selected: T
  onSelect: (level: T) => void
  formatLabel: (level: T) => string
}) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const subMenuRef = useRef<HTMLDivElement>(null)
  const [showSub, setShowSub] = useState(false)
  const [subPos, setSubPos] = useState({ top: 0, left: 0 })
  const closeTimeout = useRef<ReturnType<typeof setTimeout>>()

  const scheduleClose = useCallback(() => {
    closeTimeout.current = setTimeout(() => setShowSub(false), 150)
  }, [])

  const cancelClose = useCallback(() => {
    clearTimeout(closeTimeout.current)
  }, [])

  const handleTriggerEnter = useCallback(() => {
    cancelClose()
    if (triggerRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect()
      const popoverEl = triggerRef.current.closest(
        "[data-radix-popper-content-wrapper] > *",
      )
      setSubPos({
        top: triggerRect.top - 4,
        left: triggerRect.right + 6,
      })
    }
    setShowSub(true)
  }, [cancelClose])

  const handleTriggerLeave = useCallback(
    (e: React.MouseEvent) => {
      const related = e.relatedTarget as Node | null
      if (subMenuRef.current?.contains(related)) return
      scheduleClose()
    },
    [scheduleClose],
  )

  const handleSubLeave = useCallback(
    (e: React.MouseEvent) => {
      const related = e.relatedTarget as Node | null
      if (triggerRef.current?.contains(related)) return
      scheduleClose()
    },
    [scheduleClose],
  )

  useEffect(() => {
    return () => clearTimeout(closeTimeout.current)
  }, [])

  return (
    <div className="py-1">
      <div
        ref={triggerRef}
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handleTriggerLeave}
        className={cn(
          "flex items-center justify-between gap-1.5 min-h-[32px] py-[5px] px-1.5 mx-1 rounded-md text-sm cursor-default select-none outline-none transition-colors",
          showSub
            ? "dark:bg-neutral-800 bg-accent text-foreground"
            : "dark:hover:bg-neutral-800 hover:text-foreground",
        )}
      >
        <div className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>Thinking</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="text-xs">{formatLabel(selected)}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        </div>
      </div>

      {showSub &&
        createPortal(
          <div
            ref={subMenuRef}
            onMouseEnter={cancelClose}
            onMouseLeave={handleSubLeave}
            className="fixed z-50 min-w-[180px] overflow-auto rounded-[10px] border border-border bg-popover text-sm text-popover-foreground shadow-lg py-1 animate-in fade-in-0 zoom-in-95 slide-in-from-left-2"
            style={{ top: subPos.top, left: subPos.left }}
          >
            {levels.map((level) => {
              const isSelected = selected === level
              return (
                <button
                  key={level}
                  onClick={() => onSelect(level)}
                  className="flex items-center justify-between gap-4 min-h-[32px] py-[5px] px-1.5 mx-1 w-[calc(100%-8px)] rounded-md text-sm cursor-default select-none outline-none dark:hover:bg-neutral-800 hover:text-foreground transition-colors"
                >
                  <span>{formatLabel(level)}</span>
                  {isSelected && (
                    <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}

const DIALOG_EASING = [0.55, 0.055, 0.675, 0.19] as const

function CrossProviderConfirmDialog({
  isOpen,
  providerName,
  onConfirm,
  onClose,
}: {
  isOpen: boolean
  providerName: string
  onConfirm: (dontShowAgain: boolean) => void
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const dontShowAgainRef = useRef(false)
  dontShowAgainRef.current = dontShowAgain

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setDontShowAgain(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        onConfirm(dontShowAgainRef.current)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onConfirm, onClose])

  if (!mounted) return null
  const portalTarget = typeof document !== "undefined" ? document.body : null
  if (!portalTarget) return null

  return createPortal(
    <AnimatePresence mode="wait" initial={false}>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.18, ease: DIALOG_EASING } }}
            exit={{ opacity: 0, pointerEvents: "none" as const, transition: { duration: 0.15, ease: DIALOG_EASING } }}
            className="fixed inset-0 z-[45] bg-black/25"
            onClick={onClose}
            style={{ pointerEvents: "auto" }}
          />
          <div className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-[46] pointer-events-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, ease: DIALOG_EASING }}
              className="w-[90vw] max-w-[400px] pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-background rounded-2xl border shadow-2xl overflow-hidden">
                <div className="p-6">
                  <h2 className="text-xl font-semibold mb-2">
                    Switch to {providerName}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    To use a different agent, a new chat will be created with your current conversation history attached.
                  </p>
                </div>
                <div className="bg-muted p-4 flex items-center justify-between border-t border-border rounded-b-xl">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={dontShowAgain}
                      onCheckedChange={(v) => setDontShowAgain(v === true)}
                    />
                    <span className="text-xs text-muted-foreground">Don't ask again</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Button onClick={onClose} variant="ghost" className="rounded-md">
                      Cancel
                    </Button>
                    <Button onClick={() => onConfirm(dontShowAgain)} variant="default" className="rounded-md">
                      New chat
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    portalTarget,
  )
}

export function AgentModelSelector({
  open,
  onOpenChange,
  selectedAgentId,
  onSelectedAgentIdChange,
  selectedModelLabel,
  allowProviderSwitch = true,
  triggerClassName,
  contentClassName,
  onOpenModelsSettings,
  onContinueWithProvider,
  claude,
  codex,
}: AgentModelSelectorProps) {
  const [search, setSearch] = useState("")
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingProvider, setPendingProvider] = useState<AgentProviderId | null>(null)

  const canSelectProvider = (provider: AgentProviderId) =>
    allowProviderSwitch || selectedAgentId === provider

  // Build flat list of all models (show all regardless of connection status)
  const allModels = useMemo<FlatModelItem[]>(() => {
    const items: FlatModelItem[] = []

    if (claude.isOffline && claude.ollamaModels.length > 0) {
      for (const m of claude.ollamaModels) {
        items.push({
          type: "ollama",
          modelName: m,
          isRecommended: m === claude.recommendedOllamaModel,
        })
      }
    } else if (claude.hasCustomModelConfig) {
      items.push({ type: "custom" })
    } else {
      for (const m of claude.models) {
        items.push({ type: "claude", model: m })
      }
    }

    for (const m of codex.models) {
      items.push({ type: "codex", model: m })
    }

    return items
  }, [claude, codex])

  // Filter by search
  const filteredModels = useMemo(() => {
    if (!search.trim()) return allModels
    const q = search.toLowerCase().trim()
    return allModels.filter((item) => {
      switch (item.type) {
        case "claude":
          return (
            item.model.name.toLowerCase().includes(q) ||
            item.model.version.toLowerCase().includes(q) ||
            `${item.model.name} ${item.model.version}`.toLowerCase().includes(q)
          )
        case "codex":
          return item.model.name.toLowerCase().includes(q)
        case "ollama":
          return item.modelName.toLowerCase().includes(q)
        case "custom":
          return "custom model".includes(q)
      }
    })
  }, [allModels, search])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen)
      if (!nextOpen) {
        setSearch("")
      }
    },
    [onOpenChange],
  )

  const triggerIcon =
    selectedAgentId === "claude-code" &&
    claude.isOffline &&
    claude.ollamaModels.length > 0 ? (
      <Zap className="h-4 w-4" />
    ) : selectedAgentId === "codex" ? (
      <CodexIcon className="h-3.5 w-3.5" />
    ) : (
      <ClaudeCodeIcon className="h-3.5 w-3.5" />
    )

  const isItemSelected = (item: FlatModelItem): boolean => {
    switch (item.type) {
      case "claude":
        return selectedAgentId === "claude-code" && claude.selectedModelId === item.model.id
      case "codex":
        return selectedAgentId === "codex" && codex.selectedModelId === item.model.id
      case "ollama":
        return selectedAgentId === "claude-code" && claude.selectedOllamaModel === item.modelName
      case "custom":
        return selectedAgentId === "claude-code"
    }
  }

  const getItemProvider = (item: FlatModelItem): AgentProviderId => {
    return item.type === "codex" ? "codex" : "claude-code"
  }

  const isItemDisabled = (item: FlatModelItem): boolean => {
    const provider = getItemProvider(item)
    if (canSelectProvider(provider)) return false
    // When onContinueWithProvider is available, cross-provider items are clickable (not disabled)
    if (onContinueWithProvider) return false
    return true
  }

  const isItemCrossProvider = (item: FlatModelItem): boolean => {
    return !canSelectProvider(getItemProvider(item)) && !!onContinueWithProvider
  }

  const handleConfirmCrossProvider = useCallback(
    (dontShowAgain: boolean) => {
      if (dontShowAgain) {
        try {
          localStorage.setItem(CROSS_PROVIDER_DIALOG_DISMISSED_KEY, "true")
        } catch {}
      }
      setConfirmDialogOpen(false)
      if (pendingProvider && onContinueWithProvider) {
        onContinueWithProvider(pendingProvider)
      }
      setPendingProvider(null)
    },
    [pendingProvider, onContinueWithProvider],
  )

  const handleCloseConfirmDialog = useCallback(() => {
    setConfirmDialogOpen(false)
    setPendingProvider(null)
  }, [])

  const handleItemClick = (item: FlatModelItem) => {
    const provider = getItemProvider(item)

    // Cross-provider click → show confirmation or continue directly
    if (!canSelectProvider(provider) && onContinueWithProvider) {
      handleOpenChange(false)
      const dismissed = (() => {
        try { return localStorage.getItem(CROSS_PROVIDER_DIALOG_DISMISSED_KEY) === "true" } catch { return false }
      })()
      if (dismissed) {
        onContinueWithProvider(provider)
      } else {
        setPendingProvider(provider)
        setConfirmDialogOpen(true)
      }
      return
    }

    switch (item.type) {
      case "claude":
        if (!canSelectProvider("claude-code")) return
        onSelectedAgentIdChange("claude-code")
        claude.onSelectModel(item.model.id)
        break
      case "codex":
        if (!canSelectProvider("codex")) return
        onSelectedAgentIdChange("codex")
        codex.onSelectModel(item.model.id)
        break
      case "ollama":
        if (!canSelectProvider("claude-code")) return
        onSelectedAgentIdChange("claude-code")
        claude.onSelectOllamaModel(item.modelName)
        break
      case "custom":
        if (!canSelectProvider("claude-code")) return
        onSelectedAgentIdChange("claude-code")
        break
    }
    handleOpenChange(false)
  }

  const getItemIcon = (item: FlatModelItem) => {
    switch (item.type) {
      case "claude":
        return <ClaudeCodeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      case "codex":
        return <CodexIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      case "ollama":
        return <Zap className="h-4 w-4 text-muted-foreground shrink-0" />
      case "custom":
        return <ClaudeCodeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    }
  }

  const getItemLabel = (item: FlatModelItem): string => {
    switch (item.type) {
      case "claude":
        return `${item.model.name} ${item.model.version}`
      case "codex":
        return item.model.name
      case "ollama":
        return item.modelName + (item.isRecommended ? " (recommended)" : "")
      case "custom":
        return "Custom Model"
    }
  }

  const getItemKey = (item: FlatModelItem): string => {
    switch (item.type) {
      case "claude":
        return `claude-${item.model.id}`
      case "codex":
        return `codex-${item.model.id}`
      case "ollama":
        return `ollama-${item.modelName}`
      case "custom":
        return "custom"
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out rounded-md outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            "hover:text-foreground hover:bg-muted/50",
            triggerClassName,
          )}
        >
          {triggerIcon}
          <span className="truncate">{selectedModelLabel}</span>
          <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-64 p-0", contentClassName)}
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search models..."
            value={search}
            onValueChange={setSearch}
          />

          {/* Claude thinking effort selector with hover sub-menu */}
          {selectedAgentId === "claude-code" &&
            !claude.isOffline &&
            !claude.hasCustomModelConfig &&
            (() => {
              const selectedClaudeModel =
                claude.models.find((m) => m.id === claude.selectedModelId) ||
                claude.models[0]
              if (!selectedClaudeModel) return null
              return (
                <>
                  <ThinkingSubMenu<ClaudeThinkingLevel>
                    levels={selectedClaudeModel.thinkings}
                    selected={claude.selectedThinking}
                    onSelect={claude.onSelectThinking}
                    formatLabel={formatClaudeThinkingLabel}
                  />
                  <CommandSeparator />
                </>
              )
            })()}

          {/* Codex thinking level selector with hover sub-menu */}
          {selectedAgentId === "codex" && (() => {
            const selectedCodexModel = codex.models.find((m) => m.id === codex.selectedModelId) || codex.models[0]
            if (!selectedCodexModel) return null
            return (
              <>
                <ThinkingSubMenu<CodexThinkingLevel>
                  levels={selectedCodexModel.thinkings}
                  selected={codex.selectedThinking}
                  onSelect={codex.onSelectThinking}
                  formatLabel={formatCodexThinkingLabel}
                />
                <CommandSeparator />
              </>
            )
          })()}

          <CommandList className="max-h-[300px] overflow-y-auto">
            {filteredModels.length > 0 ? (
              <CommandGroup>
                {filteredModels.map((item) => {
                  const selected = isItemSelected(item)
                  const disabled = isItemDisabled(item)
                  const crossProvider = isItemCrossProvider(item)
                  const is1M =
                    item.type === "claude" && item.model.id.endsWith("[1m]")
                  return (
                    <CommandItem
                      key={getItemKey(item)}
                      value={getItemKey(item)}
                      onSelect={() => handleItemClick(item)}
                      disabled={disabled}
                      className={cn("gap-2", crossProvider && "opacity-60")}
                    >
                      {getItemIcon(item)}
                      <span className="truncate flex-1">{getItemLabel(item)}</span>
                      {is1M && (
                        <span
                          title="1M context window — significantly higher token cost"
                          className="text-[10px] font-medium text-amber-600 dark:text-amber-500 shrink-0"
                        >
                          1M · higher cost
                        </span>
                      )}
                      {crossProvider && (
                        <span className="text-[10px] text-muted-foreground shrink-0">New chat</span>
                      )}
                      {selected && (
                        <CheckIcon className="h-4 w-4 shrink-0" />
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ) : (
              <CommandEmpty>No models found.</CommandEmpty>
            )}
          </CommandList>

          {onOpenModelsSettings && (
            <div className="border-t border-border/50 py-1">
              <button
                onClick={() => {
                  onOpenModelsSettings()
                  handleOpenChange(false)
                }}
                className="flex items-center gap-1.5 min-h-[32px] py-[5px] px-1.5 mx-1 w-[calc(100%-8px)] rounded-md text-sm cursor-default select-none outline-none dark:hover:bg-neutral-800 hover:text-foreground transition-colors"
              >
                <span className="flex-1 text-left">Add Models</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>

      <CrossProviderConfirmDialog
        isOpen={confirmDialogOpen}
        providerName={pendingProvider === "codex" ? "Codex" : "Claude Code"}
        onConfirm={handleConfirmCrossProvider}
        onClose={handleCloseConfirmDialog}
      />
    </Popover>
  )
}
