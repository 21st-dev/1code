"use client"

import { Brain, ChevronRight, Info, Zap } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
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
import { CheckIcon, ClaudeCodeIcon, IconChevronDown, ThinkingIcon } from "../../../components/ui/icons"
import { Switch } from "../../../components/ui/switch"
import { Checkbox } from "../../../components/ui/checkbox"
import { Button } from "../../../components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover"
import { cn } from "../../../lib/utils"
import { useI18n, type TranslationKey } from "../../../lib/i18n"
import {
  isProviderProfileSource,
  providerProfileSource,
} from "../../../../shared/provider-profile-types"
import type { ClaudeModelSource, CodexModelSource } from "../atoms"
import type { CodexThinkingLevel, ModelInfo } from "../lib/models"
import { formatCodexThinkingLabel } from "../lib/models"

const CROSS_PROVIDER_DIALOG_DISMISSED_KEY = "agent-model-selector:skip-cross-provider-dialog"

const CodexIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
  </svg>
)

export type AgentProviderId = "claude-code" | "codex"

export type ContinueWithProviderSelection = {
  claudeModelId?: string
  claudeModelSource?: ClaudeModelSource
  codexModelId?: string
  codexModelSource?: CodexModelSource
  codexThinking?: CodexThinkingLevel
}

type ClaudeModelOption = {
  id: string
  name: string
  version: string
  info?: ModelInfo
}

type CodexModelOption = {
  id: string
  name: string
  thinkings: CodexThinkingLevel[]
  info?: ModelInfo
}

type ProviderProfileOption = {
  id: string
  name: string
  presetId: string | null
  defaultModel: string
  targetRuntimes: string[]
  capabilities?: {
    claude?: boolean
    codex?: boolean
    local?: boolean
    helpers?: boolean
  }
  lastTestStatus?: {
    ok: boolean
    message: string
  } | null
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
  onContinueWithProvider?: (
    provider: AgentProviderId,
    selection?: ContinueWithProviderSelection,
  ) => void
  providerProfiles?: ProviderProfileOption[]
  claude: {
    models: ClaudeModelOption[]
    selectedModelId?: string
    onSelectModel: (modelId: string) => void
    selectedModelSource: ClaudeModelSource
    onSelectModelSource: (source: ClaudeModelSource) => void
    hasCustomModelConfig: boolean
    isOffline: boolean
    ollamaModels: string[]
    selectedOllamaModel?: string
    recommendedOllamaModel?: string
    onSelectOllamaModel: (modelId: string) => void
    isConnected: boolean
    thinkingEnabled: boolean
    onThinkingChange: (enabled: boolean) => void
  }
  codex: {
    models: CodexModelOption[]
    selectedModelId: string
    onSelectModel: (modelId: string) => void
    selectedModelSource: CodexModelSource
    onSelectModelSource: (source: CodexModelSource) => void
    selectedThinking: CodexThinkingLevel
    onSelectThinking: (thinking: CodexThinkingLevel) => void
    isConnected: boolean
  }
}

type FlatModelItem =
  | { type: "claude"; model: ClaudeModelOption }
  | { type: "codex-source"; source: Extract<CodexModelSource, "chatgpt" | "openai-api-key"> }
  | { type: "codex"; model: CodexModelOption }
  | { type: "ollama"; modelName: string; isRecommended: boolean }
  | { type: "custom" }
  | {
      type: "provider-profile"
      profile: ProviderProfileOption
      runtime: "claude" | "codex" | "local"
    }

type ModelGroupId =
  | "custom"
  | "claude"
  | "claudeProfiles"
  | "codex"
  | "codexProfiles"
  | "local"

type ActiveModelInfo = {
  info: ModelInfo
  modelLabel: string
  top: number
  left: number
}

function CodexThinkingSubMenu({
  thinkings,
  selectedThinking,
  onSelectThinking,
}: {
  thinkings: CodexThinkingLevel[]
  selectedThinking: CodexThinkingLevel
  onSelectThinking: (thinking: CodexThinkingLevel) => void
}) {
  const { t } = useI18n()
  const triggerRef = useRef<HTMLDivElement>(null)
  const subMenuRef = useRef<HTMLDivElement>(null)
  const [showSub, setShowSub] = useState(false)
  const [subPos, setSubPos] = useState({ top: 0, left: 0 })
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleClose = useCallback(() => {
    closeTimeout.current = setTimeout(() => setShowSub(false), 150)
  }, [])

  const cancelClose = useCallback(() => {
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current)
      closeTimeout.current = null
    }
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
    return () => {
      if (closeTimeout.current) {
        clearTimeout(closeTimeout.current)
      }
    }
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
          <span>{t("agent.model.thinking")}</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="text-xs">
            {formatCodexThinkingLabel(selectedThinking)}
          </span>
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
            {thinkings.map((thinking) => {
              const isSelected = selectedThinking === thinking
              return (
                <button
                  key={thinking}
                  onClick={() => onSelectThinking(thinking)}
                  className="flex items-center justify-between gap-4 min-h-[32px] py-[5px] px-1.5 mx-1 w-[calc(100%-8px)] rounded-md text-sm cursor-default select-none outline-none dark:hover:bg-neutral-800 hover:text-foreground transition-colors"
                >
                  <span>{formatCodexThinkingLabel(thinking)}</span>
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
  const { t } = useI18n()
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
                    {t("agent.model.switchToProvider", { provider: providerName })}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t("agent.model.crossProviderMessage")}
                  </p>
                </div>
                <div className="bg-muted p-4 flex items-center justify-between border-t border-border rounded-b-xl">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={dontShowAgain}
                      onCheckedChange={(v) => setDontShowAgain(v === true)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {t("agent.model.dontAskAgain")}
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Button onClick={onClose} variant="ghost" className="rounded-md">
                      {t("common.cancel")}
                    </Button>
                    <Button onClick={() => onConfirm(dontShowAgain)} variant="default" className="rounded-md">
                      {t("agent.model.newChat")}
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

function ModelInfoButton({
  info,
  modelLabel,
  onShow,
  onHide,
}: {
  info: ModelInfo
  modelLabel: string
  onShow: (info: ModelInfo, modelLabel: string, anchor: HTMLElement) => void
  onHide: (modelLabel: string) => void
}) {
  const { t } = useI18n()

  const stopSelection = (event: React.SyntheticEvent) => {
    event.stopPropagation()
  }

  const show = (
    event: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>,
  ) => {
    stopSelection(event)
    onShow(info, modelLabel, event.currentTarget)
  }

  return (
    <button
      type="button"
      aria-label={t("agent.model.info.aria", { model: modelLabel })}
      onPointerDown={stopSelection}
      onMouseDown={(event) => {
        event.preventDefault()
        stopSelection(event)
      }}
      onMouseEnter={show}
      onFocus={show}
      onMouseLeave={() => onHide(modelLabel)}
      onBlur={() => onHide(modelLabel)}
      onClick={stopSelection}
      onKeyDown={stopSelection}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
    >
      <Info className="h-3.5 w-3.5" />
    </button>
  )
}

function ModelInfoPanel({
  activeInfo,
}: {
  activeInfo: ActiveModelInfo
}) {
  const { t } = useI18n()
  const translate = (key: string) => t(key as TranslationKey)
  const { info, modelLabel, top, left } = activeInfo
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelTop, setPanelTop] = useState(top)
  const [panelMaxHeight, setPanelMaxHeight] = useState<number | undefined>()

  const rows = [
    [t("agent.model.info.context"), info.contextWindow],
    [t("agent.model.info.maxOutput"), info.maxOutput],
    [t("agent.model.info.pricing"), info.pricing],
    ...(info.cachedInput
      ? [[t("agent.model.info.cachedInput"), info.cachedInput]]
      : []),
    [t("agent.model.info.latency"), translate(info.latencyKey)],
  ]

  useLayoutEffect(() => {
    const gap = 8

    const updatePosition = () => {
      const viewportHeight = window.innerHeight
      const maxAvailableHeight = Math.max(180, viewportHeight - gap * 2)
      const measuredHeight = panelRef.current?.scrollHeight ?? maxAvailableHeight
      const panelHeight = Math.min(measuredHeight, maxAvailableHeight)
      const nextTop = Math.min(
        Math.max(gap, top),
        Math.max(gap, viewportHeight - panelHeight - gap),
      )

      setPanelTop(nextTop)
      setPanelMaxHeight(Math.max(180, viewportHeight - nextTop - gap))
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    return () => window.removeEventListener("resize", updatePosition)
  }, [info, modelLabel, top])

  return (
    <div
      ref={panelRef}
      className="fixed z-[70] flex w-80 max-w-[320px] pointer-events-none flex-col items-start gap-2 overflow-y-auto rounded-md border border-border bg-popover p-3 text-left text-popover-foreground shadow-lg dark"
      style={{ top: panelTop, left, maxHeight: panelMaxHeight }}
    >
      <div className="space-y-1">
        <div className="text-sm font-medium text-popover-foreground">
          {modelLabel}
        </div>
        <p className="text-xs text-muted-foreground">
          {translate(info.summaryKey)}
        </p>
      </div>

      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <span className="text-muted-foreground">{label}</span>
            <span className="min-w-0 text-popover-foreground">{value}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1 border-t border-border/60 pt-2">
        <div className="text-[11px] font-medium uppercase text-muted-foreground">
          {t("agent.model.info.bestFor")}
        </div>
        <p className="text-xs text-popover-foreground">
          {translate(info.bestForKey)}
        </p>
      </div>

      {info.tokenNoteKey && (
        <div className="rounded-md bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium">
            {t("agent.model.info.tokenNote")}:{" "}
          </span>
          {translate(info.tokenNoteKey)}
        </div>
      )}
    </div>
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
  providerProfiles = [],
  claude,
  codex,
}: AgentModelSelectorProps) {
  const { t } = useI18n()
  const [search, setSearch] = useState("")
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<{
    provider: AgentProviderId
    selection?: ContinueWithProviderSelection
  } | null>(null)
  const [activeModelInfo, setActiveModelInfo] = useState<ActiveModelInfo | null>(null)

  const canSelectProvider = (provider: AgentProviderId) =>
    allowProviderSwitch || selectedAgentId === provider
  const selectedClaudeModelSource =
    claude.selectedModelSource === "custom-provider" && !claude.hasCustomModelConfig
      ? "claude-oauth"
      : claude.selectedModelSource

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
    } else {
      if (claude.hasCustomModelConfig) {
        items.push({ type: "custom" })
      }
      for (const m of claude.models) {
        items.push({ type: "claude", model: m })
      }
    }

    for (const profile of providerProfiles) {
      if (profile.targetRuntimes.includes("local")) {
        items.push({ type: "provider-profile", profile, runtime: "local" })
        continue
      }
      if (profile.targetRuntimes.includes("claude")) {
        items.push({ type: "provider-profile", profile, runtime: "claude" })
      }
    }

    items.push({ type: "codex-source", source: "chatgpt" })
    items.push({ type: "codex-source", source: "openai-api-key" })
    for (const m of codex.models) {
      items.push({ type: "codex", model: m })
    }

    for (const profile of providerProfiles) {
      if (profile.targetRuntimes.includes("local")) continue
      if (profile.targetRuntimes.includes("codex")) {
        items.push({ type: "provider-profile", profile, runtime: "codex" })
      }
    }

    return items
  }, [claude, codex, providerProfiles])

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
        case "codex-source":
          return (
            (item.source === "chatgpt" ? "codex chatgpt" : "codex api key")
              .toLowerCase()
              .includes(q)
          )
        case "ollama":
          return item.modelName.toLowerCase().includes(q)
        case "custom":
          return (
            t("agent.model.customProvider").toLowerCase().includes(q) ||
            t("agent.model.customModel").toLowerCase().includes(q)
          )
        case "provider-profile":
          return (
            item.profile.name.toLowerCase().includes(q) ||
            item.profile.defaultModel.toLowerCase().includes(q) ||
            (item.profile.presetId ?? "").toLowerCase().includes(q)
          )
      }
    })
  }, [allModels, search, t])

  const getItemGroup = useCallback((item: FlatModelItem): ModelGroupId => {
    switch (item.type) {
      case "custom":
        return "custom"
      case "claude":
        return "claude"
      case "provider-profile":
        if (item.runtime === "claude") return "claudeProfiles"
        if (item.runtime === "codex") return "codexProfiles"
        return "local"
      case "codex-source":
      case "codex":
        return "codex"
      case "ollama":
        return "local"
    }
  }, [])

  const getGroupHeading = useCallback((group: ModelGroupId): string => {
    switch (group) {
      case "custom":
        return t("agent.model.group.customProvider")
      case "claude":
        return t("agent.model.group.claudeCodeOAuth")
      case "claudeProfiles":
        return t("agent.model.group.claudeProviderProfiles")
      case "codex":
        return t("agent.model.group.codexOfficial")
      case "codexProfiles":
        return t("agent.model.group.codexProviderProfiles")
      case "local":
        return t("agent.model.group.localProviderProfiles")
    }
  }, [t])

  const groupedFilteredModels = useMemo(() => {
    const groups: Record<ModelGroupId, FlatModelItem[]> = {
      custom: [],
      claude: [],
      claudeProfiles: [],
      codex: [],
      codexProfiles: [],
      local: [],
    }

    for (const item of filteredModels) {
      groups[getItemGroup(item)].push(item)
    }

    return ([
      "custom",
      "claude",
      "claudeProfiles",
      "codex",
      "codexProfiles",
      "local",
    ] as ModelGroupId[])
      .map((id) => ({ id, heading: getGroupHeading(id), items: groups[id] }))
      .filter((group) => group.items.length > 0)
  }, [filteredModels, getGroupHeading, getItemGroup])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen)
      if (!nextOpen) {
        setSearch("")
        setActiveModelInfo(null)
      }
    },
    [onOpenChange],
  )

  const showModelInfo = useCallback(
    (info: ModelInfo, modelLabel: string, anchor: HTMLElement) => {
      const rect = anchor.getBoundingClientRect()
      const panelWidth = 320
      const panelMinHeight = 220
      const gap = 8
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const left =
        rect.right + gap + panelWidth <= viewportWidth - gap
          ? rect.right + gap
          : Math.max(gap, rect.left - panelWidth - gap)
      const top = Math.min(
        Math.max(gap, rect.top - gap),
        Math.max(gap, viewportHeight - panelMinHeight - gap),
      )

      setActiveModelInfo({ info, modelLabel, top, left })
    },
    [],
  )

  const hideModelInfo = useCallback((modelLabel: string) => {
    setActiveModelInfo((current) =>
      current?.modelLabel === modelLabel ? null : current,
    )
  }, [])

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
        return (
          selectedAgentId === "claude-code" &&
          selectedClaudeModelSource === "claude-oauth" &&
          claude.selectedModelId === item.model.id
        )
      case "codex":
        return (
          selectedAgentId === "codex" &&
          !isProviderProfileSource(codex.selectedModelSource) &&
          codex.selectedModelId === item.model.id
        )
      case "codex-source":
        return (
          selectedAgentId === "codex" &&
          codex.selectedModelSource === item.source
        )
      case "ollama":
        return selectedAgentId === "claude-code" && claude.selectedOllamaModel === item.modelName
      case "custom":
        return (
          selectedAgentId === "claude-code" &&
          selectedClaudeModelSource === "custom-provider"
        )
      case "provider-profile": {
        const source = providerProfileSource(item.profile.id)
        if (item.runtime === "claude") {
          return selectedAgentId === "claude-code" && selectedClaudeModelSource === source
        }
        return selectedAgentId === "codex" && codex.selectedModelSource === source
      }
    }
  }

  const getItemProvider = (item: FlatModelItem): AgentProviderId => {
    if (item.type === "codex" || item.type === "codex-source") return "codex"
    if (item.type === "provider-profile") {
      if (item.runtime === "claude") return "claude-code"
      if (item.runtime === "codex") return "codex"
      return item.profile.targetRuntimes.includes("codex") ? "codex" : "claude-code"
    }
    return "claude-code"
  }

  const isItemDisabled = (item: FlatModelItem): boolean => {
    if (item.type === "provider-profile" && item.profile.lastTestStatus?.ok === false) {
      return true
    }
    const provider = getItemProvider(item)
    if (canSelectProvider(provider)) return false
    // When onContinueWithProvider is available, cross-provider items are clickable (not disabled)
    if (onContinueWithProvider) return false
    return true
  }

  const isItemCrossProvider = (item: FlatModelItem): boolean => {
    return !canSelectProvider(getItemProvider(item)) && !!onContinueWithProvider
  }

  const getCrossProviderSelection = (
    item: FlatModelItem,
    provider: AgentProviderId,
  ): ContinueWithProviderSelection | undefined => {
    switch (item.type) {
      case "claude":
        return {
          claudeModelId: item.model.id,
          claudeModelSource: "claude-oauth",
        }
      case "custom":
        return { claudeModelSource: "custom-provider" }
      case "codex-source":
        return { codexModelSource: item.source }
      case "codex": {
        const thinking = item.model.thinkings.includes(codex.selectedThinking)
          ? codex.selectedThinking
          : item.model.thinkings.includes("high")
            ? "high"
            : item.model.thinkings[0]
        return {
          codexModelId: item.model.id,
          ...(thinking ? { codexThinking: thinking } : {}),
        }
      }
      case "provider-profile": {
        const source = providerProfileSource(item.profile.id)
        return provider === "codex"
          ? { codexModelSource: source as CodexModelSource }
          : { claudeModelSource: source as ClaudeModelSource }
      }
      case "ollama":
        return undefined
    }
  }

  const handleConfirmCrossProvider = useCallback(
    (dontShowAgain: boolean) => {
      const action = pendingAction
      if (dontShowAgain) {
        try {
          localStorage.setItem(CROSS_PROVIDER_DIALOG_DISMISSED_KEY, "true")
        } catch {}
      }
      setConfirmDialogOpen(false)
      setPendingAction(null)
      if (action && onContinueWithProvider) {
        window.setTimeout(() => {
          onContinueWithProvider(action.provider, action.selection)
        }, 0)
      }
    },
    [pendingAction, onContinueWithProvider],
  )

  const handleCloseConfirmDialog = useCallback(() => {
    setConfirmDialogOpen(false)
    setPendingAction(null)
  }, [])

  const handleItemClick = (item: FlatModelItem) => {
    const provider = getItemProvider(item)

    // Cross-provider click → show confirmation or continue directly
    if (!canSelectProvider(provider) && onContinueWithProvider) {
      handleOpenChange(false)
      const selection = getCrossProviderSelection(item, provider)
      const dismissed = (() => {
        try {
          return localStorage.getItem(CROSS_PROVIDER_DIALOG_DISMISSED_KEY) === "true"
        } catch {
          return false
        }
      })()
      if (dismissed) {
        onContinueWithProvider(provider, selection)
      } else {
        setPendingAction({ provider, selection })
        setConfirmDialogOpen(true)
      }
      return
    }

    switch (item.type) {
      case "claude":
        if (!canSelectProvider("claude-code")) return
        onSelectedAgentIdChange("claude-code")
        claude.onSelectModelSource("claude-oauth")
        claude.onSelectModel(item.model.id)
        break
      case "codex":
        if (!canSelectProvider("codex")) return
        onSelectedAgentIdChange("codex")
        if (isProviderProfileSource(codex.selectedModelSource)) {
          codex.onSelectModelSource("chatgpt")
        }
        codex.onSelectModel(item.model.id)
        break
      case "codex-source":
        if (!canSelectProvider("codex")) return
        onSelectedAgentIdChange("codex")
        codex.onSelectModelSource(item.source)
        break
      case "ollama":
        if (!canSelectProvider("claude-code")) return
        onSelectedAgentIdChange("claude-code")
        claude.onSelectOllamaModel(item.modelName)
        break
      case "custom":
        if (!canSelectProvider("claude-code")) return
        onSelectedAgentIdChange("claude-code")
        claude.onSelectModelSource("custom-provider")
        break
      case "provider-profile": {
        const source = providerProfileSource(item.profile.id)
        const targetProvider = getItemProvider(item)
        if (!canSelectProvider(targetProvider)) return
        onSelectedAgentIdChange(targetProvider)
        if (targetProvider === "claude-code") {
          claude.onSelectModelSource(source as ClaudeModelSource)
        } else {
          codex.onSelectModelSource(source as CodexModelSource)
        }
        break
      }
    }
    handleOpenChange(false)
  }

  const getItemIcon = (item: FlatModelItem) => {
    switch (item.type) {
      case "claude":
        return <ClaudeCodeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      case "codex":
      case "codex-source":
        return <CodexIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      case "ollama":
        return <Zap className="h-4 w-4 text-muted-foreground shrink-0" />
      case "custom":
        return <ClaudeCodeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      case "provider-profile":
        return item.runtime === "claude" ? (
          <ClaudeCodeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <CodexIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )
    }
  }

  const getItemLabel = (item: FlatModelItem): string => {
    switch (item.type) {
      case "claude":
        return `${item.model.name} ${item.model.version}`
      case "codex":
        return item.model.name
      case "codex-source":
        return item.source === "chatgpt"
          ? t("agent.model.codexChatGPT")
          : t("agent.model.codexApiKey")
      case "ollama":
        return item.modelName + (item.isRecommended ? ` ${t("agent.model.recommendedSuffix")}` : "")
      case "custom":
        return t("agent.model.customProvider")
      case "provider-profile":
        return `${item.profile.name} · ${item.profile.defaultModel}`
    }
  }

  const getItemInfo = (item: FlatModelItem): ModelInfo | null => {
    switch (item.type) {
      case "claude":
      case "codex":
        return item.model.info ?? null
      case "codex-source":
      case "ollama":
      case "custom":
      case "provider-profile":
        return null
    }
  }

  const getItemKey = (item: FlatModelItem): string => {
    switch (item.type) {
      case "claude":
        return `claude-${item.model.id}`
      case "codex-source":
        return `codex-source-${item.source}`
      case "codex":
        return `codex-${item.model.id}`
      case "ollama":
        return `ollama-${item.modelName}`
      case "custom":
        return "custom"
      case "provider-profile":
        return `provider-profile-${item.runtime}-${item.profile.id}`
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("agent.model.selector")}
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
            placeholder={t("agent.model.searchPlaceholder")}
            value={search}
            onValueChange={setSearch}
          />

          {/* Claude thinking toggle */}
          {selectedAgentId === "claude-code" &&
            !claude.isOffline &&
            selectedClaudeModelSource === "claude-oauth" && (
            <>
              <div
                className="flex items-center justify-between min-h-[32px] py-[5px] px-1.5 mx-1"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1.5">
                  <ThinkingIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm">{t("agent.model.thinking")}</span>
                </div>
                <Switch
                  checked={claude.thinkingEnabled}
                  onCheckedChange={claude.onThinkingChange}
                  className="scale-75"
                />
              </div>
              <CommandSeparator />
            </>
          )}

          {/* Codex thinking level selector with hover sub-menu */}
          {selectedAgentId === "codex" && (() => {
            const selectedCodexModel = codex.models.find((m) => m.id === codex.selectedModelId) || codex.models[0]
            if (!selectedCodexModel) return null
            return (
              <>
                <CodexThinkingSubMenu
                  thinkings={selectedCodexModel.thinkings}
                  selectedThinking={codex.selectedThinking}
                  onSelectThinking={codex.onSelectThinking}
                />
                <CommandSeparator />
              </>
            )
          })()}

          <CommandList
            className="max-h-[300px] overflow-y-auto"
            onScroll={() => setActiveModelInfo(null)}
          >
            {groupedFilteredModels.length > 0 ? (
              groupedFilteredModels.map((group) => (
                <CommandGroup key={group.id} heading={group.heading}>
                  {group.items.map((item) => {
                    const selected = isItemSelected(item)
                    const disabled = isItemDisabled(item)
                    const crossProvider = isItemCrossProvider(item)
                    const label = getItemLabel(item)
                    const info = getItemInfo(item)
                    return (
                      <CommandItem
                        key={getItemKey(item)}
                        value={getItemKey(item)}
                        onSelect={() => handleItemClick(item)}
                        disabled={disabled}
                        className={cn("gap-2", crossProvider && "opacity-60")}
                      >
                        {getItemIcon(item)}
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="min-w-0 truncate">{label}</span>
                          {info && (
                            <ModelInfoButton
                              info={info}
                              modelLabel={label}
                              onShow={showModelInfo}
                              onHide={hideModelInfo}
                            />
                          )}
                        </div>
                        {crossProvider && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {t("agent.model.newChat")}
                          </span>
                        )}
                        {selected && (
                          <CheckIcon className="h-4 w-4 shrink-0" />
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ))
            ) : (
              <CommandEmpty>{t("agent.model.noModelsFound")}</CommandEmpty>
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
                <span className="flex-1 text-left">{t("agent.model.addModels")}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </div>
        )}
      </Command>
      </PopoverContent>

      {activeModelInfo &&
        typeof document !== "undefined" &&
        createPortal(
          <ModelInfoPanel activeInfo={activeModelInfo} />,
          document.body,
        )}

      <CrossProviderConfirmDialog
        isOpen={confirmDialogOpen}
        providerName={pendingAction?.provider === "codex" ? "Codex" : "Claude Code"}
        onConfirm={handleConfirmCrossProvider}
        onClose={handleCloseConfirmDialog}
      />
    </Popover>
  )
}
