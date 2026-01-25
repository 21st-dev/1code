"use client"

import React, { memo, useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useAtom } from "jotai"
import { trpc } from "../../lib/trpc"
import { runningServersPopoverOpenAtom } from "../../lib/atoms"
import { ServerIcon } from "../../components/ui/icons"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "../../components/ui/dropdown-menu"
import { cn } from "../../lib/utils"
import { Square, ExternalLink, Search, X, Check } from "lucide-react"
import { toast } from "sonner"
import type { DetectedPort } from "../terminal/types"

// Format port address for display
function formatAddress(address: string, port: number): string {
  if (address === "*" || address === "0.0.0.0" || address === "::") {
    return `localhost:${port}`
  }
  return `${address}:${port}`
}

// Common dev server ports to prioritize (Vite, Next.js, etc.)
const DEV_SERVER_PRIORITY: Record<string, number> = {
  Vite: 1,
  "Next.js": 2,
  Astro: 3,
  Nuxt: 4,
  SvelteKit: 5,
  Remix: 6,
  "Create React App": 7,
  "Webpack Dev Server": 8,
  Storybook: 9,
}

// Vite default port range
const VITE_PORTS = new Set([5173, 5174, 5175, 5176, 5177, 5178, 5179])

function getServerPriority(server: DetectedPort): number {
  // Check by process name first
  const namePriority = DEV_SERVER_PRIORITY[server.processName]
  if (namePriority !== undefined) return namePriority

  // Check if it's a Vite port
  if (VITE_PORTS.has(server.port)) return 1

  // Next.js default port
  if (server.port === 3000) return 2

  // Other common dev ports
  if (server.port >= 3000 && server.port <= 3999) return 10
  if (server.port >= 8000 && server.port <= 8999) return 11

  return 100 // Default priority (lower priority)
}

// Generate a unique key for a server (paneId:port)
function getServerKey(server: DetectedPort): string {
  return `${server.paneId}:${server.port}`
}

// Individual server row
interface ServerRowProps {
  server: DetectedPort
  serverKey: string
  onStop: (pid: number, processName: string) => void
  isKilling: boolean
  isSelected: boolean
  onToggleSelect: (key: string) => void
  showCheckbox: boolean
}

const ServerRow = memo(function ServerRow({
  server,
  serverKey,
  onStop,
  isKilling,
  isSelected,
  onToggleSelect,
  showCheckbox,
}: ServerRowProps) {
  const address = formatAddress(server.address, server.port)
  const url = `http://${address}`

  const handleOpenInBrowser = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      window.open(url, "_blank")
    },
    [url]
  )

  const handleStop = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onStop(server.pid, server.processName)
    },
    [onStop, server.pid, server.processName]
  )

  const handleToggle = useCallback(() => {
    onToggleSelect(serverKey)
  }, [onToggleSelect, serverKey])

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 rounded-md group cursor-pointer",
        isSelected && "bg-muted/30"
      )}
      onClick={handleToggle}
    >
      {/* Checkbox */}
      {showCheckbox && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleToggle()
          }}
          className={cn(
            "flex items-center justify-center h-4 w-4 rounded border transition-colors shrink-0",
            isSelected
              ? "bg-primary border-primary text-primary-foreground"
              : "border-muted-foreground/40 hover:border-muted-foreground"
          )}
        >
          {isSelected && <Check className="h-3 w-3" />}
        </button>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            :{server.port}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {server.processName}
          </span>
        </div>
      </div>

      <div className={cn(
        "flex items-center gap-1 transition-opacity",
        showCheckbox ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}>
        {/* Open in browser */}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleOpenInBrowser}
              className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Open in browser</TooltipContent>
        </Tooltip>

        {/* Stop server */}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleStop}
              disabled={isKilling}
              className={cn(
                "flex items-center justify-center h-6 w-6 rounded transition-colors",
                isKilling
                  ? "text-muted-foreground cursor-not-allowed"
                  : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
              )}
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Stop server</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
})

// Main popover component
interface RunningServersPopoverProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export const RunningServersPopover = memo(function RunningServersPopover({
  children,
  open,
  onOpenChange,
}: RunningServersPopoverProps) {
  const [killingPids, setKillingPids] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Fetch all ports - no polling, subscription handles updates
  const { data: ports = [], refetch } = trpc.terminal.getAllPorts.useQuery(
    undefined,
    {
      // No refetchInterval - subscription provides real-time updates
      // This query is just for initial data and triggered refetches
    }
  )

  // Subscribe to port changes with "active" mode when popover is open (fast scanning)
  // Subscription automatically starts/stops scanning based on subscribers
  trpc.terminal.portChanges.useSubscription(
    { mode: open ? "active" : "background" },
    {
      onData: () => {
        refetch()
      },
    }
  )

  // Filter ports based on search query
  // Sort and filter ports - prioritize dev servers like Vite
  const filteredPorts = useMemo(() => {
    let result = [...ports]

    // Filter by search query if present
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (port) =>
          port.port.toString().includes(query) ||
          port.processName.toLowerCase().includes(query)
      )
    }

    // Sort by priority (Vite first), then by most recently detected
    result.sort((a, b) => {
      const priorityA = getServerPriority(a)
      const priorityB = getServerPriority(b)
      if (priorityA !== priorityB) return priorityA - priorityB
      return b.detectedAt - a.detectedAt // Most recent first within same priority
    })

    return result
  }, [ports, searchQuery])

  // Clear selection when ports change (in case a selected process was killed)
  useEffect(() => {
    const validKeys = new Set(ports.map((p) => getServerKey(p)))
    setSelectedKeys((prev) => {
      const next = new Set<string>()
      for (const key of prev) {
        if (validKeys.has(key)) next.add(key)
      }
      return next.size === prev.size ? prev : next
    })
  }, [ports])

  // Reset search and selection when popover closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("")
      setSelectedKeys(new Set())
    }
  }, [open])

  // Kill process mutation
  const killProcess = trpc.terminal.killProcessByPid.useMutation({
    onSuccess: (_, variables) => {
      setKillingPids((prev) => {
        const next = new Set(prev)
        next.delete(variables.pid)
        return next
      })
      // Clear selections for any ports that belonged to this PID
      setSelectedKeys((prev) => {
        const keysToRemove = ports
          .filter((p) => p.pid === variables.pid)
          .map((p) => getServerKey(p))
        if (keysToRemove.length === 0) return prev
        const next = new Set(prev)
        for (const key of keysToRemove) {
          next.delete(key)
        }
        return next
      })
    },
    onError: (error, variables) => {
      setKillingPids((prev) => {
        const next = new Set(prev)
        next.delete(variables.pid)
        return next
      })
      toast.error(`Failed to stop server: ${error.message}`)
    },
  })

  const handleStop = useCallback(
    (pid: number, _processName: string) => {
      setKillingPids((prev) => new Set(prev).add(pid))
      killProcess.mutate({ pid })
    },
    [killProcess]
  )

  const handleToggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const handleStopSelected = useCallback(async () => {
    // Map selected keys back to unique PIDs (multiple ports can share a PID)
    const pidsToKill = new Set<number>()
    for (const key of selectedKeys) {
      const server = ports.find((p) => getServerKey(p) === key)
      if (server) pidsToKill.add(server.pid)
    }
    const pidArray = Array.from(pidsToKill)
    for (const pid of pidArray) {
      setKillingPids((prev) => new Set(prev).add(pid))
      killProcess.mutate({ pid })
    }
    toast.success(`Stopping ${selectedKeys.size} server${selectedKeys.size > 1 ? "s" : ""}`)
  }, [selectedKeys, ports, killProcess])

  const handleSelectAll = useCallback(() => {
    const allKeys = new Set(filteredPorts.map((p) => getServerKey(p)))
    setSelectedKeys((prev) => {
      // If all filtered are selected, deselect all
      const allSelected = filteredPorts.every((p) => prev.has(getServerKey(p)))
      if (allSelected) {
        const next = new Set(prev)
        for (const p of filteredPorts) {
          next.delete(getServerKey(p))
        }
        return next
      }
      // Otherwise, select all filtered
      return new Set([...prev, ...allKeys])
    })
  }, [filteredPorts])

  const hasSelection = selectedKeys.size > 0
  const allFilteredSelected =
    filteredPorts.length > 0 && filteredPorts.every((p) => selectedKeys.has(getServerKey(p)))

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[320px] p-0"
      >
        <div className="flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-sm font-medium text-foreground">
              Running Servers
            </span>
            <span className="text-xs text-muted-foreground">
              {ports.length} active
            </span>
          </div>

          {/* Search bar */}
          {ports.length > 0 && (
            <div className="px-2 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by port or name..."
                  className="w-full h-7 pl-7 pr-7 text-sm bg-muted/50 border border-border rounded-md placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Selection actions bar */}
          {ports.length > 0 && (
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-border bg-muted/20">
              <button
                type="button"
                onClick={handleSelectAll}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <div
                  className={cn(
                    "flex items-center justify-center h-3.5 w-3.5 rounded border transition-colors",
                    allFilteredSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/40"
                  )}
                >
                  {allFilteredSelected && <Check className="h-2.5 w-2.5" />}
                </div>
                {allFilteredSelected ? "Deselect all" : "Select all"}
              </button>
              {hasSelection && (
                <button
                  type="button"
                  onClick={handleStopSelected}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                  Stop {selectedKeys.size}
                </button>
              )}
            </div>
          )}

          {/* Server list */}
          <div className="max-h-[280px] overflow-y-auto">
            {ports.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No servers running
              </div>
            ) : filteredPorts.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No matches found
              </div>
            ) : (
              <div className="py-1">
                {filteredPorts.map((server) => {
                  const serverKey = getServerKey(server)
                  return (
                    <ServerRow
                      key={serverKey}
                      server={server}
                      serverKey={serverKey}
                      onStop={handleStop}
                      isKilling={killingPids.has(server.pid)}
                      isSelected={selectedKeys.has(serverKey)}
                      onToggleSelect={handleToggleSelect}
                      showCheckbox={hasSelection || ports.length > 1}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
})

// Sidebar button section component
interface RunningServersSectionProps {
  isMobile?: boolean
}

export const RunningServersSection = memo(function RunningServersSection({
  isMobile = false,
}: RunningServersSectionProps) {
  const [popoverOpen, setPopoverOpen] = useAtom(runningServersPopoverOpenAtom)
  const [blockTooltip, setBlockTooltip] = useState(false)
  const prevPopoverOpen = useRef(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Fetch port count for badge - no polling needed, subscription handles updates
  const { data: ports = [], refetch } = trpc.terminal.getAllPorts.useQuery(undefined, {
    // No refetchInterval - subscription provides updates with "background" mode (slow scanning)
  })

  // Subscribe to port changes with "background" mode (slow scanning for badge)
  // When popover opens, the RunningServersPopover's subscription will upgrade to "active" mode
  trpc.terminal.portChanges.useSubscription(
    { mode: "background" },
    {
      onData: () => {
        refetch()
      },
    }
  )

  // Handle tooltip blocking when popover closes
  useEffect(() => {
    if (prevPopoverOpen.current && !popoverOpen) {
      buttonRef.current?.blur()
      setBlockTooltip(true)
      const timer = setTimeout(() => setBlockTooltip(false), 300)
      prevPopoverOpen.current = popoverOpen
      return () => clearTimeout(timer)
    }
    prevPopoverOpen.current = popoverOpen
  }, [popoverOpen])

  const portCount = ports.length

  return (
    <Tooltip
      delayDuration={500}
      open={popoverOpen || blockTooltip ? false : undefined}
    >
      <TooltipTrigger asChild>
        <div>
          <RunningServersPopover
            open={popoverOpen}
            onOpenChange={setPopoverOpen}
          >
            <button
              ref={buttonRef}
              type="button"
              className={cn(
                "flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 relative",
                isMobile ? "h-10 w-10" : "h-7 w-7"
              )}
              suppressHydrationWarning
            >
              <ServerIcon className="h-4 w-4" />
              {/* Badge for active server count */}
              {portCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[14px] h-[14px] px-1 text-[10px] font-medium bg-emerald-500 text-white rounded-full">
                  {portCount > 9 ? "9+" : portCount}
                </span>
              )}
            </button>
          </RunningServersPopover>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {portCount > 0
          ? `${portCount} server${portCount > 1 ? "s" : ""} running`
          : "Running Servers"}
      </TooltipContent>
    </Tooltip>
  )
})

// Dropdown menu item version for use in Help submenu
interface RunningServersMenuItemProps {
  onCloseMenu?: () => void
}

export const RunningServersMenuItem = memo(function RunningServersMenuItem({
  onCloseMenu,
}: RunningServersMenuItemProps) {
  const [killingPids, setKillingPids] = useState<Set<number>>(new Set())

  // Fetch all ports
  const { data: ports = [], refetch } = trpc.terminal.getAllPorts.useQuery(undefined, {})

  // Subscribe to port changes
  trpc.terminal.portChanges.useSubscription(
    { mode: "background" },
    {
      onData: () => {
        refetch()
      },
    }
  )

  // Sort ports - prioritize dev servers like Vite
  const sortedPorts = useMemo(() => {
    const result = [...ports]
    result.sort((a, b) => {
      const priorityA = getServerPriority(a)
      const priorityB = getServerPriority(b)
      if (priorityA !== priorityB) return priorityA - priorityB
      return b.detectedAt - a.detectedAt
    })
    return result
  }, [ports])

  // Kill process mutation
  const killProcess = trpc.terminal.killProcessByPid.useMutation({
    onSuccess: (_, variables) => {
      setKillingPids((prev) => {
        const next = new Set(prev)
        next.delete(variables.pid)
        return next
      })
    },
    onError: (error, variables) => {
      setKillingPids((prev) => {
        const next = new Set(prev)
        next.delete(variables.pid)
        return next
      })
      toast.error(`Failed to stop server: ${error.message}`)
    },
  })

  const handleStop = useCallback(
    (e: React.MouseEvent, pid: number) => {
      e.preventDefault()
      e.stopPropagation()
      setKillingPids((prev) => new Set(prev).add(pid))
      killProcess.mutate({ pid })
    },
    [killProcess]
  )

  const handleOpenInBrowser = useCallback((e: React.MouseEvent, address: string, port: number) => {
    e.preventDefault()
    e.stopPropagation()
    const url = `http://${formatAddress(address, port)}`
    window.open(url, "_blank")
  }, [])

  const portCount = ports.length

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2">
        <ServerIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1">Running Servers</span>
        {portCount > 0 && (
          <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-medium bg-emerald-500 text-white rounded-full">
            {portCount > 9 ? "9+" : portCount}
          </span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-[280px] p-0"
        sideOffset={6}
        alignOffset={-4}
      >
        <div className="flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-sm font-medium text-foreground">
              Running Servers
            </span>
            <span className="text-xs text-muted-foreground">
              {portCount} active
            </span>
          </div>

          {/* Server list */}
          <div className="max-h-[240px] overflow-y-auto">
            {portCount === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No servers running
              </div>
            ) : (
              <div className="py-1">
                {sortedPorts.map((server) => {
                  const serverKey = getServerKey(server)
                  const address = formatAddress(server.address, server.port)
                  const isKilling = killingPids.has(server.pid)

                  return (
                    <div
                      key={serverKey}
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 rounded-md group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            :{server.port}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {server.processName}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Open in browser */}
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => handleOpenInBrowser(e, server.address, server.port)}
                              className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Open in browser</TooltipContent>
                        </Tooltip>

                        {/* Stop server */}
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => handleStop(e, server.pid)}
                              disabled={isKilling}
                              className={cn(
                                "flex items-center justify-center h-6 w-6 rounded transition-colors",
                                isKilling
                                  ? "text-muted-foreground cursor-not-allowed"
                                  : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                              )}
                            >
                              <Square className="h-3 w-3 fill-current" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Stop server</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
})
