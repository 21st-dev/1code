import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import { useTheme } from "next-themes"
import { motion } from "motion/react"
import {
    devTerminalsAtom,
    activeDevTerminalIdAtom,
    type DevTerminalInstance,
} from "./atoms"
import { fullThemeDataAtom } from "@/lib/atoms"
import { terminalCwdAtom } from "../terminal/atoms"
import { Terminal } from "../terminal/terminal"
import { TerminalTabs } from "../terminal/terminal-tabs"
import { getDefaultTerminalBg } from "../terminal/helpers"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

interface DevTerminalProps {
    projectId: string
    projectPath: string
}

function generateTerminalId(): string {
    return crypto.randomUUID().slice(0, 8)
}

function generatePaneId(projectId: string, terminalId: string): string {
    // Format: ${projectId}:devterm:${terminalId}
    return `${projectId}:devterm:${terminalId}`
}

function getNextTerminalName(terminals: DevTerminalInstance[]): string {
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

export function DevTerminal({ projectId, projectPath }: DevTerminalProps) {
    const [allTerminals, setAllTerminals] = useAtom(devTerminalsAtom)
    const [allActiveIds, setAllActiveIds] = useAtom(activeDevTerminalIdAtom)
    const terminalCwds = useAtomValue(terminalCwdAtom)

    // Theme detection
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

    // Get terminals for this project
    const terminals = useMemo(
        () => allTerminals.get(projectId) || [],
        [allTerminals, projectId],
    )

    // Get active terminal ID
    const activeTerminalId = useMemo(
        () => allActiveIds.get(projectId) || null,
        [allActiveIds, projectId],
    )

    // Get active terminal instance
    const activeTerminal = useMemo(
        () => terminals.find((t) => t.id === activeTerminalId) || null,
        [terminals, activeTerminalId]
    )

    const killMutation = trpc.terminal.kill.useMutation()

    // Refs
    const projectIdRef = useRef(projectId)
    projectIdRef.current = projectId
    const terminalsRef = useRef(terminals)
    terminalsRef.current = terminals
    const activeTerminalIdRef = useRef(activeTerminalId)
    activeTerminalIdRef.current = activeTerminalId

    // Actions
    const createTerminal = useCallback(() => {
        const currentProjectId = projectIdRef.current
        const currentTerminals = terminalsRef.current

        const id = generateTerminalId()
        const paneId = generatePaneId(currentProjectId, id)
        const name = getNextTerminalName(currentTerminals)

        const newTerminal: DevTerminalInstance = {
            id,
            paneId,
            name,
        }

        setAllTerminals((prev) => {
            const next = new Map(prev)
            const list = next.get(currentProjectId) || []
            next.set(currentProjectId, [...list, newTerminal])
            return next
        })

        setAllActiveIds((prev) => {
            const next = new Map(prev)
            next.set(currentProjectId, id)
            return next
        })
    }, [setAllTerminals, setAllActiveIds])

    const selectTerminal = useCallback((id: string) => {
        const currentProjectId = projectIdRef.current
        setAllActiveIds((prev) => {
            const next = new Map(prev)
            next.set(currentProjectId, id)
            return next
        })
    }, [setAllActiveIds])

    const closeTerminal = useCallback((id: string) => {
        const currentProjectId = projectIdRef.current
        const currentTerminals = terminalsRef.current
        const currentActiveId = activeTerminalIdRef.current

        const terminal = currentTerminals.find((t) => t.id === id)
        if (!terminal) return

        killMutation.mutate({ paneId: terminal.paneId })

        const newTerminals = currentTerminals.filter((t) => t.id !== id)
        setAllTerminals((prev) => {
            const next = new Map(prev)
            next.set(currentProjectId, newTerminals)
            return next
        })

        if (currentActiveId === id) {
            const newActive = newTerminals[newTerminals.length - 1]?.id || null
            setAllActiveIds((prev) => {
                const next = new Map(prev)
                if (newActive) {
                    next.set(currentProjectId, newActive)
                } else {
                    next.delete(currentProjectId)
                }
                return next
            })
        }
    }, [killMutation, setAllTerminals, setAllActiveIds])

    const renameTerminal = useCallback((id: string, name: string) => {
        const currentProjectId = projectIdRef.current
        setAllTerminals((prev) => {
            const next = new Map(prev)
            const list = next.get(currentProjectId) || []
            next.set(currentProjectId, list.map(t => t.id === id ? { ...t, name } : t))
            return next
        })
    }, [setAllTerminals])

    const closeOtherTerminals = useCallback((id: string) => {
        const currentProjectId = projectIdRef.current
        const currentTerminals = terminalsRef.current

        currentTerminals.forEach((terminal) => {
            if (terminal.id !== id) {
                killMutation.mutate({ paneId: terminal.paneId })
            }
        })

        const remainingTerminal = currentTerminals.find((t) => t.id === id)
        const newList = remainingTerminal ? [remainingTerminal] : []

        setAllTerminals((prev) => {
            const next = new Map(prev)
            next.set(currentProjectId, newList)
            return next
        })

        setAllActiveIds((prev) => {
            const next = new Map(prev)
            next.set(currentProjectId, id)
            return next
        })
    }, [killMutation, setAllTerminals, setAllActiveIds])

    const closeTerminalsToRight = useCallback((id: string) => {
        const currentProjectId = projectIdRef.current
        const currentTerminals = terminalsRef.current
        const index = currentTerminals.findIndex((t) => t.id === id)
        if (index === -1) return

        const terminalsToClose = currentTerminals.slice(index + 1)
        terminalsToClose.forEach((terminal) => {
            killMutation.mutate({ paneId: terminal.paneId })
        })

        const remainingTerminals = currentTerminals.slice(0, index + 1)
        setAllTerminals((prev) => {
            const next = new Map(prev)
            next.set(currentProjectId, remainingTerminals)
            return next
        })

        // If active was closed, switch to last remaining
        const currentActiveId = activeTerminalIdRef.current
        if (currentActiveId && !remainingTerminals.find(t => t.id === currentActiveId)) {
            const newActive = remainingTerminals[remainingTerminals.length - 1]?.id || null
            setAllActiveIds((prev) => {
                const next = new Map(prev)
                if (newActive) {
                    next.set(currentProjectId, newActive)
                } else {
                    next.delete(currentProjectId)
                }
                return next
            })
        }
    }, [killMutation, setAllTerminals, setAllActiveIds])

    // Map to TerminalInstance compatible type for TerminalTabs
    const terminalInstancesForTabs = useMemo(() => {
        return terminals.map(t => ({
            ...t,
            createdAt: 0 // Mock createdAt as it's not strictly needed for tabs unless sorted
        }))
    }, [terminals])

    if (terminals.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-4 text-center space-y-4">
                <div className="space-y-2">
                    <h3 className="font-medium">No Open Terminals</h3>
                    <p className="text-sm text-muted-foreground">
                        Start a dev server or run commands for this project.
                    </p>
                </div>
                <Button onClick={createTerminal} variant="outline" size="sm" className="gap-2">
                    <Plus className="w-4 h-4" />
                    New Terminal
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full min-w-0 overflow-hidden">
            <div
                className="flex items-center gap-1 pl-1 pr-2 py-1.5 flex-shrink-0 border-b border-border/10"
                style={{ backgroundColor: terminalBg }}
            >
                <TerminalTabs
                    terminals={terminalInstancesForTabs}
                    activeTerminalId={activeTerminalId}
                    cwds={terminalCwds}
                    initialCwd="" // Not strictly needed for tabs display
                    terminalBg={terminalBg}
                    onSelectTerminal={selectTerminal}
                    onCloseTerminal={closeTerminal}
                    onCloseOtherTerminals={closeOtherTerminals}
                    onCloseTerminalsToRight={closeTerminalsToRight}
                    onCreateTerminal={createTerminal}
                    onRenameTerminal={renameTerminal}
                />
            </div>

            <div
                className="flex-1 min-h-0 min-w-0 overflow-hidden"
                style={{ backgroundColor: terminalBg }}
            >
                {activeTerminal ? (
                    <motion.div
                        key={activeTerminal.paneId}
                        className="h-full"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0 }}
                    >
                        <Terminal
                            paneId={activeTerminal.paneId}
                            cwd={projectPath || ""} // Use project path as CWD
                            workspaceId={projectId}
                            terminalInstance={undefined} // Not needed for basic dev terminal
                        />
                    </motion.div>
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        No terminal selected
                    </div>
                )}
            </div>
        </div>
    )
}
