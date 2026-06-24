"use client"

import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { AgentChatProvider } from "../../../../shared/agent-chat-provider"
import { Button } from "../../../components/ui/button"
import { Checkbox } from "../../../components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import {
  AgentIcon,
  CheckIcon,
  IconChevronDown,
} from "../../../components/ui/icons"
import { useI18n } from "../../../lib/i18n"
import { cn } from "../../../lib/utils"
import type {
  ClaudeModelSource,
  CodexModelSource,
  KunModelSource,
} from "../atoms"
import type { CodexThinkingLevel } from "../lib/models"

export const ENGINE_SWITCH_DIALOG_DISMISSED_KEY =
  "agent-model-selector:skip-cross-provider-dialog"

export type ContinueWithProviderSelection = {
  claudeModelId?: string
  claudeModelSource?: ClaudeModelSource
  codexModelId?: string
  codexModelSource?: CodexModelSource
  codexThinking?: CodexThinkingLevel
  kunModelSource?: KunModelSource
}

export type AgentEngineOptionStatus = "ready" | "setup-required" | "unavailable"

export type AgentEngineOption = {
  id: AgentChatProvider
  name: string
  status: AgentEngineOptionStatus
  experimental?: boolean
  statusLabel?: string
}

const DIALOG_EASING = [0.55, 0.055, 0.675, 0.19] as const

function EngineSwitchConfirmDialog({
  isOpen,
  engineName,
  onConfirm,
  onClose,
}: {
  isOpen: boolean
  engineName: string
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
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
            animate={{
              opacity: 1,
              transition: { duration: 0.18, ease: DIALOG_EASING },
            }}
            exit={{
              opacity: 0,
              pointerEvents: "none" as const,
              transition: { duration: 0.15, ease: DIALOG_EASING },
            }}
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
              onClick={(event) => event.stopPropagation()}
            >
              <div className="bg-background rounded-2xl border shadow-2xl overflow-hidden">
                <div className="p-6">
                  <h2 className="text-xl font-semibold mb-2">
                    {t("agent.engine.switchToEngine", {
                      engine: engineName,
                    })}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t("agent.engine.switchCreatesNewChat")}
                  </p>
                </div>
                <div className="bg-muted p-4 flex items-center justify-between border-t border-border rounded-b-xl">
                  <div className="flex items-center gap-2 select-none">
                    <Checkbox
                      id="engine-switch-dont-ask-again"
                      checked={dontShowAgain}
                      onCheckedChange={(value) =>
                        setDontShowAgain(value === true)
                      }
                    />
                    <label
                      htmlFor="engine-switch-dont-ask-again"
                      className="cursor-pointer text-xs text-muted-foreground"
                    >
                      {t("agent.model.dontAskAgain")}
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={onClose}
                      variant="ghost"
                      className="rounded-md"
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      onClick={() => onConfirm(dontShowAgain)}
                      variant="default"
                      className="rounded-md"
                    >
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

export function AgentEngineSelector({
  selectedEngineId,
  options,
  canSwitchInPlace = true,
  onSelectEngine,
  onContinueWithEngine,
  onSetupEngine,
  className,
  contentClassName,
}: {
  selectedEngineId: AgentChatProvider
  options: AgentEngineOption[]
  canSwitchInPlace?: boolean
  onSelectEngine: (engine: AgentChatProvider) => void
  onContinueWithEngine?: (engine: AgentChatProvider) => void
  onSetupEngine?: (engine: AgentChatProvider) => void
  className?: string
  contentClassName?: string
}) {
  const { t } = useI18n()
  const selectedOption =
    options.find((option) => option.id === selectedEngineId) ?? options[0]
  const [pendingEngine, setPendingEngine] = useState<AgentEngineOption | null>(
    null,
  )

  const handleCloseConfirmDialog = useCallback(() => {
    setPendingEngine(null)
  }, [])

  const continueWithEngine = useCallback(
    (engine: AgentChatProvider) => {
      if (onContinueWithEngine) {
        window.setTimeout(() => onContinueWithEngine(engine), 0)
      }
    },
    [onContinueWithEngine],
  )

  const handleConfirmEngineSwitch = useCallback(
    (dontShowAgain: boolean) => {
      const option = pendingEngine
      if (dontShowAgain) {
        try {
          localStorage.setItem(ENGINE_SWITCH_DIALOG_DISMISSED_KEY, "true")
        } catch {}
      }
      setPendingEngine(null)
      if (option) {
        continueWithEngine(option.id)
      }
    },
    [continueWithEngine, pendingEngine],
  )

  const handleSelectOption = useCallback(
    (option: AgentEngineOption) => {
      if (option.id === selectedEngineId) return
      if (option.status === "setup-required") {
        onSetupEngine?.(option.id)
        return
      }
      if (option.status === "unavailable") return
      if (canSwitchInPlace || !onContinueWithEngine) {
        onSelectEngine(option.id)
        return
      }

      const dismissed = (() => {
        try {
          return (
            localStorage.getItem(ENGINE_SWITCH_DIALOG_DISMISSED_KEY) === "true"
          )
        } catch {
          return false
        }
      })()
      if (dismissed) {
        continueWithEngine(option.id)
      } else {
        setPendingEngine(option)
      }
    },
    [
      canSwitchInPlace,
      continueWithEngine,
      onContinueWithEngine,
      onSelectEngine,
      onSetupEngine,
      selectedEngineId,
    ],
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("agent.engine.selector")}
          title={t("agent.engine.selector")}
          className={cn(
            "flex h-8 max-w-[150px] min-w-0 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-muted/50 hover:text-foreground outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            className,
          )}
        >
          <AgentIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {selectedOption?.name ?? t("agent.engine.engine")}
          </span>
          <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className={cn("w-56", contentClassName)}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {options.map((option) => {
            const selected = option.id === selectedEngineId
            const blocked = option.status !== "ready"
            const statusLabel =
              option.statusLabel ??
              (option.status === "setup-required"
                ? t("agent.engine.status.setupRequired")
                : option.status === "unavailable"
                  ? t("agent.engine.status.unavailable")
                  : option.experimental
                    ? t("agent.engine.status.experimental")
                    : null)
            return (
              <DropdownMenuItem
                key={option.id}
                onSelect={(event) => {
                  event.preventDefault()
                  handleSelectOption(option)
                }}
                aria-disabled={blocked}
                className={cn("justify-between gap-2", blocked && "opacity-60")}
              >
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                {statusLabel ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {statusLabel}
                  </span>
                ) : null}
                {selected ? (
                  <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                ) : null}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <EngineSwitchConfirmDialog
        isOpen={pendingEngine !== null}
        engineName={pendingEngine?.name ?? ""}
        onConfirm={handleConfirmEngineSwitch}
        onClose={handleCloseConfirmDialog}
      />
    </>
  )
}
