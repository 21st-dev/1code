"use client"

import { useAtom, useAtomValue } from "jotai"
import { motion } from "motion/react"
import { useTheme } from "next-themes"
import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  activeTerminalIdAtom,
  terminalCwdAtom,
  terminalSidebarOpenAtomFamily,
  terminalsAtom,
} from "@/features/terminal/atoms"
import { getDefaultTerminalBg } from "@/features/terminal/helpers"
import { Terminal } from "@/features/terminal/terminal"
import { TerminalTabs } from "@/features/terminal/terminal-tabs"
import type { TerminalInstance } from "@/features/terminal/types"
import { fullThemeDataAtom } from "@/lib/atoms"
import { useI18n } from "@/lib/i18n"
import { trpc } from "@/lib/trpc"

interface TerminalSectionProps {
  chatId: string
  scopeKey?: string
  cwd: string
  workspaceId: string
  tabId?: string
  initialCommands?: string[]
  isExpanded?: boolean
  /** Render header with tabs separately (for widget card integration) */
  renderHeader?: (header: ReactNode) => void
  /** Background color for terminal */
  onTerminalBgChange?: (bg: string) => void
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

export function TerminalSection({
  chatId,
  scopeKey,
  cwd,
  workspaceId,
  tabId,
  initialCommands,
  isExpanded = false,
  renderHeader,
  onTerminalBgChange,
}: TerminalSectionProps) {
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

  const terminalBg = useMemo(() => {
    if (fullThemeData?.colors?.["terminal.background"]) {
      return fullThemeData.colors["terminal.background"]
    }
    if (fullThemeData?.colors?.["editor.background"]) {
      return fullThemeData.colors["editor.background"]
    }
    return getDefaultTerminalBg(isDark)
  }, [isDark, fullThemeData])

  // Notify parent about terminal background color
  useEffect(() => {
    onTerminalBgChange?.(terminalBg)
  }, [terminalBg, onTerminalBgChange])

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

  // Tabs component for header
  const tabsHeader =
    terminals.length > 0 ? (
      <TerminalTabs
        terminals={terminals}
        activeTerminalId={activeTerminalId}
        cwds={terminalCwds}
        initialCwd={cwd}
        terminalBg={terminalBg}
        onSelectTerminal={selectTerminal}
        onCloseTerminal={closeTerminal}
        onCloseOtherTerminals={closeOtherTerminals}
        onCloseTerminalsToRight={closeTerminalsToRight}
        onCreateTerminal={createTerminal}
        onRenameTerminal={renameTerminal}
      />
    ) : null

  // Call renderHeader if provided (for widget card integration)
  useEffect(() => {
    renderHeader?.(tabsHeader)
  }, [renderHeader, tabsHeader])

  // If renderHeader is provided, only render content (header is handled by parent)
  if (renderHeader) {
    return (
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
    )
  }

  // Standard render with tabs inside
  return (
    <div
      className="flex flex-col"
      style={{
        minHeight: isExpanded ? "400px" : "200px",
        height: isExpanded ? "100%" : undefined,
      }}
    >
      {/* Tabs */}
      <div
        className="flex items-center gap-1 px-1 py-1 flex-shrink-0"
        style={{ backgroundColor: terminalBg }}
      >
        {tabsHeader}
      </div>

      {/* Terminal Content */}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{
          backgroundColor: terminalBg,
          height: isExpanded ? "100%" : "200px",
        }}
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
  )
}
