"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import { useTheme } from "next-themes"
import { fullThemeDataAtom } from "@/lib/atoms"
import { motion } from "motion/react"
import { ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PlusIcon } from "@/components/ui/icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Kbd } from "@/components/ui/kbd"
import { useResolvedHotkeyDisplay } from "@/lib/hotkeys"
import { Terminal } from "@/features/terminal/terminal"
import { TerminalTabs } from "@/features/terminal/terminal-tabs"
import { getDefaultTerminalBg } from "@/features/terminal/helpers"
import {
  terminalsAtom,
  activeTerminalIdAtom,
  terminalCwdAtom,
} from "@/features/terminal/atoms"
import { trpc } from "@/lib/trpc"
import type { TerminalInstance } from "@/features/terminal/types"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

interface TerminalWidgetProps {
  chatId: string
  scopeKey?: string
  cwd: string
  workspaceId: string
  tabId?: string
  initialCommands?: string[]
  onExpand?: () => void
}

function generateTerminalId(): string {
  return crypto.randomUUID().slice(0, 8)
}

function generatePaneId(scopeKey: string, terminalId: string): string {
  return `${scopeKey}:term:${terminalId}`
}

function getNextTerminalName(terminals: TerminalInstance[]): string {
  const existingNumbers = terminals
    .map((t) => {
      const match = t.name.match(/^Terminal (\d+)$/)
      return match ? parseInt(match[1], 10) : 0
    })
    .filter((n) => n > 0)

  const maxNumber =
    existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0
  return `Terminal ${maxNumber + 1}`
}

/**
 * Terminal Widget for Overview Sidebar
 * Combines WidgetCard header with terminal tabs and content
 * Memoized to prevent re-renders when parent updates
 */
export const TerminalWidget = memo(function TerminalWidget({
  chatId,
  scopeKey,
  cwd,
  workspaceId,
  tabId,
  initialCommands,
  onExpand,
}: TerminalWidgetProps) {
  const { t } = useI18n()
  const terminalKey = scopeKey ?? chatId
  // Terminal state - reuse existing atoms
  const [allTerminals, setAllTerminals] = useAtom(terminalsAtom)
  const [allActiveIds, setAllActiveIds] = useAtom(activeTerminalIdAtom)
  const terminalCwds = useAtomValue(terminalCwdAtom)

  // Theme detection for terminal background
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const fullThemeData = useAtomValue(fullThemeDataAtom)

  // Resolved hotkey for tooltip
  const toggleTerminalHotkey = useResolvedHotkeyDisplay("toggle-terminal")

  const terminalBg = useMemo(() => {
    if (fullThemeData?.colors?.["terminal.background"]) {
      return fullThemeData.colors["terminal.background"]
    }
    if (fullThemeData?.colors?.["editor.background"]) {
      return fullThemeData.colors["editor.background"]
    }
    return getDefaultTerminalBg(isDark)
  }, [isDark, fullThemeData])

  // Get terminals for this chat
  const terminals = useMemo(
    () => allTerminals[terminalKey] || [],
    [allTerminals, terminalKey],
  )

  const activeTerminalId = useMemo(
    () => allActiveIds[terminalKey] || null,
    [allActiveIds, terminalKey],
  )

  const activeTerminal = useMemo(
    () => terminals.find((t) => t.id === activeTerminalId) || null,
    [terminals, activeTerminalId],
  )

  const killMutation = trpc.terminal.kill.useMutation()

  // Refs for stable callbacks
  const terminalKeyRef = useRef(terminalKey)
  terminalKeyRef.current = terminalKey
  const terminalsRef = useRef(terminals)
  terminalsRef.current = terminals
  const activeTerminalIdRef = useRef(activeTerminalId)
  activeTerminalIdRef.current = activeTerminalId

  const createTerminal = useCallback(() => {
    const currentTerminalKey = terminalKeyRef.current
    const currentTerminals = terminalsRef.current

    const id = generateTerminalId()
    const paneId = generatePaneId(currentTerminalKey, id)
    const name = getNextTerminalName(currentTerminals)

    const newTerminal: TerminalInstance = {
      id,
      paneId,
      name,
      createdAt: Date.now(),
    }

    setAllTerminals((prev) => ({
      ...prev,
      [currentTerminalKey]: [...(prev[currentTerminalKey] || []), newTerminal],
    }))

    setAllActiveIds((prev) => ({
      ...prev,
      [currentTerminalKey]: id,
    }))
  }, [setAllTerminals, setAllActiveIds])

  const selectTerminal = useCallback(
    (id: string) => {
      const currentTerminalKey = terminalKeyRef.current
      setAllActiveIds((prev) => ({
        ...prev,
        [currentTerminalKey]: id,
      }))
    },
    [setAllActiveIds],
  )

  const closeTerminal = useCallback(
    (id: string) => {
      const currentTerminalKey = terminalKeyRef.current
      const currentTerminals = terminalsRef.current
      const currentActiveId = activeTerminalIdRef.current

      const terminal = currentTerminals.find((t) => t.id === id)
      if (!terminal) return

      killMutation.mutate({ paneId: terminal.paneId })

      const newTerminals = currentTerminals.filter((t) => t.id !== id)
      setAllTerminals((prev) => ({
        ...prev,
        [currentTerminalKey]: newTerminals,
      }))

      if (currentActiveId === id) {
        const newActive = newTerminals[newTerminals.length - 1]?.id || null
        setAllActiveIds((prev) => ({
          ...prev,
          [currentTerminalKey]: newActive,
        }))
      }
    },
    [setAllTerminals, setAllActiveIds, killMutation],
  )

  const renameTerminal = useCallback(
    (id: string, name: string) => {
      const currentTerminalKey = terminalKeyRef.current
      setAllTerminals((prev) => ({
        ...prev,
        [currentTerminalKey]: (prev[currentTerminalKey] || []).map((t) =>
          t.id === id ? { ...t, name } : t,
        ),
      }))
    },
    [setAllTerminals],
  )

  const closeOtherTerminals = useCallback(
    (id: string) => {
      const currentTerminalKey = terminalKeyRef.current
      const currentTerminals = terminalsRef.current

      currentTerminals.forEach((terminal) => {
        if (terminal.id !== id) {
          killMutation.mutate({ paneId: terminal.paneId })
        }
      })

      const remainingTerminal = currentTerminals.find((t) => t.id === id)
      setAllTerminals((prev) => ({
        ...prev,
        [currentTerminalKey]: remainingTerminal ? [remainingTerminal] : [],
      }))

      setAllActiveIds((prev) => ({
        ...prev,
        [currentTerminalKey]: id,
      }))
    },
    [setAllTerminals, setAllActiveIds, killMutation],
  )

  const closeTerminalsToRight = useCallback(
    (id: string) => {
      const currentTerminalKey = terminalKeyRef.current
      const currentTerminals = terminalsRef.current

      const index = currentTerminals.findIndex((t) => t.id === id)
      if (index === -1) return

      const terminalsToClose = currentTerminals.slice(index + 1)
      terminalsToClose.forEach((terminal) => {
        killMutation.mutate({ paneId: terminal.paneId })
      })

      const remainingTerminals = currentTerminals.slice(0, index + 1)
      setAllTerminals((prev) => ({
        ...prev,
        [currentTerminalKey]: remainingTerminals,
      }))

      const currentActiveId = activeTerminalIdRef.current
      if (
        currentActiveId &&
        !remainingTerminals.find((t) => t.id === currentActiveId)
      ) {
        setAllActiveIds((prev) => ({
          ...prev,
          [currentTerminalKey]:
            remainingTerminals[remainingTerminals.length - 1]?.id || null,
        }))
      }
    },
    [setAllTerminals, setAllActiveIds, killMutation],
  )

  // Auto-create first terminal when section is rendered and no terminals exist
  useEffect(() => {
    if (terminals.length === 0) {
      createTerminal()
    }
  }, [terminals.length, createTerminal])

  // Delay terminal rendering slightly
  const [canRenderTerminal, setCanRenderTerminal] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => {
      setCanRenderTerminal(true)
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="mx-2 mb-2">
      <div className={cn("rounded-lg border border-border/50 overflow-hidden")}>
        {/* Widget Header with Tabs - like terminal-sidebar.tsx */}
        <div
          className="flex items-center gap-1 pl-1 pr-2 py-1.5 select-none group"
          style={{ backgroundColor: terminalBg }}
        >
          {/* Terminal Tabs - directly without wrapper, like in terminal-sidebar.tsx */}
          {terminals.length > 0 && (
            <TerminalTabs
              terminals={terminals}
              activeTerminalId={activeTerminalId}
              cwds={terminalCwds}
              initialCwd={cwd}
              terminalBg={terminalBg}
              hidePlusButton
              small
              onSelectTerminal={selectTerminal}
              onCloseTerminal={closeTerminal}
              onCloseOtherTerminals={closeOtherTerminals}
              onCloseTerminalsToRight={closeTerminalsToRight}
              onCreateTerminal={createTerminal}
              onRenameTerminal={renameTerminal}
            />
          )}

          {/* Plus button after tabs */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={createTerminal}
                className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md flex-shrink-0"
                aria-label={t("terminal.new")}
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("terminal.new")}</TooltipContent>
          </Tooltip>

          {/* Expand to sidebar button */}
          {onExpand && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onExpand}
                  className="h-5 w-5 p-0 hover:bg-foreground/10 text-muted-foreground hover:text-foreground rounded-md opacity-0 group-hover:opacity-100 transition-[background-color,opacity,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0"
                  aria-label={t("details.expandTerminal")}
                >
                  <ArrowUpRight className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {t("details.expandToSidebar")}
                {toggleTerminalHotkey && <Kbd>{toggleTerminalHotkey}</Kbd>}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Terminal Content */}
        <div
          className="min-h-0 overflow-hidden"
          style={{ backgroundColor: terminalBg, height: "200px" }}
        >
          {activeTerminal && canRenderTerminal ? (
            <motion.div
              key={activeTerminal.paneId}
              className="h-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0 }}
            >
              <Terminal
                paneId={activeTerminal.paneId}
                cwd={cwd}
                workspaceId={workspaceId}
                scopeKey={terminalKey}
                tabId={tabId}
                initialCommands={initialCommands}
                initialCwd={cwd}
              />
            </motion.div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {!canRenderTerminal ? "" : t("terminal.noTerminalOpen")}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
