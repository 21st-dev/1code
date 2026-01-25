"use client"

import React, { memo, useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useAtom } from "jotai"
import { trpc } from "../../lib/trpc"
import { mcpServersPopoverOpenAtom } from "../../lib/atoms"
import { OriginalMCPIcon } from "../../components/ui/icons"
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
import { cn } from "../../lib/utils"
import { ChevronRight, Loader2, RefreshCw } from "lucide-react"

// Status type matching the backend
type MCPServerStatus = "connected" | "failed" | "pending" | "needs-auth"

interface MCPServer {
  name: string
  status: MCPServerStatus
  tools: string[]
  needsAuth: boolean
  config: Record<string, unknown>
}

interface MCPGroup {
  groupName: string
  projectPath: string | null
  mcpServers: MCPServer[]
}

// Get status indicator based on server status
function getStatusIndicator(status: MCPServerStatus) {
  switch (status) {
    case "connected":
      return (
        <span
          className="w-2 h-2 rounded-full bg-green-500 shrink-0"
          aria-label="Connected"
        />
      )
    case "failed":
      return (
        <span
          className="w-2 h-2 rounded-full bg-red-500 shrink-0"
          aria-label="Connection failed"
        />
      )
    case "needs-auth":
      return (
        <span
          className="w-2 h-2 rounded-full bg-yellow-500 shrink-0"
          aria-label="Needs authentication"
        />
      )
    case "pending":
      return (
        <Loader2
          className="w-3 h-3 text-muted-foreground animate-spin shrink-0"
          aria-label="Connecting"
        />
      )
    default:
      return (
        <span
          className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0"
          aria-label="Unknown status"
        />
      )
  }
}

function getStatusText(status: MCPServerStatus): string {
  switch (status) {
    case "connected":
      return "Connected"
    case "failed":
      return "Connection failed"
    case "needs-auth":
      return "Needs authentication"
    case "pending":
      return "Connecting..."
    default:
      return status
  }
}

// Individual server row
interface ServerRowProps {
  server: MCPServer
  isExpanded: boolean
  onToggle: () => void
}

const ServerRow = memo(function ServerRow({
  server,
  isExpanded,
  onToggle,
}: ServerRowProps) {
  const hasTools = server.tools.length > 0

  return (
    <div>
      <button
        type="button"
        onClick={() => hasTools && onToggle()}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
          hasTools ? "hover:bg-muted/50 cursor-pointer" : "cursor-default"
        )}
        title={getStatusText(server.status)}
      >
        {/* Expand/collapse chevron */}
        <ChevronRight
          className={cn(
            "h-3 w-3 text-muted-foreground transition-transform shrink-0",
            isExpanded && "rotate-90",
            !hasTools && "opacity-0"
          )}
          aria-hidden="true"
        />

        {/* Status indicator */}
        {getStatusIndicator(server.status)}

        {/* Server name */}
        <span className="flex-1 truncate text-foreground">{server.name}</span>

        {/* Tool count badge */}
        {hasTools && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
            {server.tools.length} tool{server.tools.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {/* Tools list (expanded) */}
      {isExpanded && hasTools && (
        <div className="pl-8 pr-3 py-1 space-y-0.5">
          {server.tools.map((tool) => (
            <div
              key={tool}
              className="text-xs text-muted-foreground py-0.5 truncate"
              title={tool}
            >
              {tool}
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

// Main popover component
interface McpServersPopoverProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export const McpServersPopover = memo(function McpServersPopover({
  children,
  open,
  onOpenChange,
}: McpServersPopoverProps) {
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set())

  // Fetch all MCP config
  const { data, isLoading, refetch, isRefetching } =
    trpc.claude.getAllMcpConfig.useQuery(undefined, {
      staleTime: 30 * 1000, // 30 seconds
      refetchOnWindowFocus: false,
    })

  const groups = (data?.groups || []) as MCPGroup[]

  // Count total connected servers
  const connectedCount = useMemo(() => {
    return groups.reduce((count, group) => {
      return (
        count + group.mcpServers.filter((s) => s.status === "connected").length
      )
    }, 0)
  }, [groups])

  // Count total servers
  const totalCount = useMemo(() => {
    return groups.reduce((count, group) => count + group.mcpServers.length, 0)
  }, [groups])

  // Reset expanded servers when popover closes
  useEffect(() => {
    if (!open) {
      setExpandedServers(new Set())
    }
  }, [open])

  const toggleServer = useCallback((serverKey: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev)
      if (next.has(serverKey)) {
        next.delete(serverKey)
      } else {
        next.add(serverKey)
      }
      return next
    })
  }, [])

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

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
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                MCP Servers
              </span>
              {isLoading || isRefetching ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : (
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {connectedCount}/{totalCount} connected
            </span>
          </div>

          {/* Server list */}
          <div className="max-h-[320px] overflow-y-auto">
            {isLoading ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                Loading MCP servers...
              </div>
            ) : totalCount === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No MCP servers configured
              </div>
            ) : (
              <div className="py-1">
                {groups.map((group) => (
                  <div key={group.groupName}>
                    {/* Group header - only show if multiple groups or has project path */}
                    {(groups.length > 1 || group.projectPath) && (
                      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/30">
                        {group.groupName}
                      </div>
                    )}

                    {/* Servers in group */}
                    {group.mcpServers.map((server) => {
                      const serverKey = `${group.groupName}:${server.name}`
                      return (
                        <ServerRow
                          key={serverKey}
                          server={server}
                          isExpanded={expandedServers.has(serverKey)}
                          onToggle={() => toggleServer(serverKey)}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer with config hint */}
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Configure in{" "}
            <code className="bg-muted px-1 py-0.5 rounded">~/.claude.json</code>{" "}
            or{" "}
            <code className="bg-muted px-1 py-0.5 rounded">.mcp.json</code>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
})

// Sidebar button section component
interface McpServersSectionProps {
  isMobile?: boolean
}

export const McpServersSection = memo(function McpServersSection({
  isMobile = false,
}: McpServersSectionProps) {
  const [popoverOpen, setPopoverOpen] = useAtom(mcpServersPopoverOpenAtom)
  const [blockTooltip, setBlockTooltip] = useState(false)
  const prevPopoverOpen = useRef(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Fetch MCP config for badge count
  const { data, isLoading } = trpc.claude.getAllMcpConfig.useQuery(undefined, {
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  })

  const groups = (data?.groups || []) as MCPGroup[]

  // Count connected servers
  const connectedCount = useMemo(() => {
    return groups.reduce((count, group) => {
      return (
        count + group.mcpServers.filter((s) => s.status === "connected").length
      )
    }, 0)
  }, [groups])

  // Count total servers
  const totalCount = useMemo(() => {
    return groups.reduce((count, group) => count + group.mcpServers.length, 0)
  }, [groups])

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

  // Don't show if no MCP servers configured and not loading
  if (!isLoading && totalCount === 0) {
    return null
  }

  return (
    <Tooltip
      delayDuration={500}
      open={popoverOpen || blockTooltip ? false : undefined}
    >
      <TooltipTrigger asChild>
        <div>
          <McpServersPopover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <button
              ref={buttonRef}
              type="button"
              className={cn(
                "flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 relative",
                isMobile ? "h-10 w-10" : "h-7 w-7"
              )}
              suppressHydrationWarning
            >
              <OriginalMCPIcon className="h-4 w-4" />
              {/* Badge for connected count */}
              {!isLoading && totalCount > 0 && (
                <span
                  className={cn(
                    "absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[14px] h-[14px] px-1 text-[10px] font-medium text-white rounded-full",
                    connectedCount === totalCount
                      ? "bg-emerald-500"
                      : connectedCount > 0
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  )}
                >
                  {connectedCount > 9 ? "9+" : connectedCount}
                </span>
              )}
            </button>
          </McpServersPopover>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {isLoading
          ? "Loading MCP servers..."
          : totalCount > 0
            ? `${connectedCount}/${totalCount} MCP server${totalCount > 1 ? "s" : ""} connected`
            : "MCP Servers"}
      </TooltipContent>
    </Tooltip>
  )
})
