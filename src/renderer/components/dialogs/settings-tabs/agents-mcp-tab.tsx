"use client"

import { ChevronRight, ExternalLink, Loader2, RefreshCw } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { Button } from "../../ui/button"
import { OriginalMCPIcon } from "../../ui/icons"

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

// Status indicator dot
function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full flex-shrink-0",
        status === "connected" && "bg-foreground",
        status !== "connected" && "bg-muted-foreground/50",
        status === "pending" && "animate-pulse",
      )}
    />
  )
}

// Get status text
function getStatusText(status: string): string {
  switch (status) {
    case "connected":
      return "Connected"
    case "failed":
      return "Failed"
    case "needs-auth":
      return "Needs auth"
    case "pending":
      return "Connecting..."
    default:
      return status
  }
}

interface McpServer {
  name: string
  status: string
  tools: string[]
  needsAuth: boolean
  config: Record<string, unknown>
  serverInfo?: { name: string; version: string }
  error?: string
}

interface ServerRowProps {
  server: McpServer
  isExpanded: boolean
  onToggle: () => void
  onAuth?: () => void
}

function ServerRow({ server, isExpanded, onToggle, onAuth }: ServerRowProps) {
  const { tools, needsAuth } = server
  const hasTools = tools.length > 0
  const isConnected = server.status === "connected"

  return (
    <div>
      <div
        role={hasTools ? "button" : undefined}
        tabIndex={hasTools ? 0 : undefined}
        onClick={hasTools ? onToggle : undefined}
        onKeyDown={hasTools ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } } : undefined}
        className={cn(
          "w-full flex items-center gap-3 p-3 text-left transition-colors",
          hasTools && "hover:bg-muted/50 cursor-pointer",
          !hasTools && "cursor-default",
        )}
      >
        {/* Expand chevron */}
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform flex-shrink-0",
            isExpanded && "rotate-90",
            !hasTools && "opacity-0",
          )}
        />

        {/* Status dot */}
        <StatusDot status={server.status} />

        {/* Server info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {server.name}
            </span>
            {server.serverInfo?.version && (
              <span className="text-xs text-muted-foreground">
                v{server.serverInfo.version}
              </span>
            )}
          </div>
          {server.error && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {server.error}
            </p>
          )}
        </div>

        {/* Status / tool count */}
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {isConnected
            ? (hasTools ? `${tools.length} tool${tools.length !== 1 ? "s" : ""}` : "No tools")
            : getStatusText(server.status)}
        </span>

        {/* Authenticate button */}
        {needsAuth && onAuth && (
          <Button
            variant="secondary"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              onAuth()
            }}
          >
            {isConnected ? "Reconnect" : "Auth"}
          </Button>
        )}
      </div>

      {/* Expanded tools list */}
      <AnimatePresence>
        {isExpanded && hasTools && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-10 pr-3 pb-3 space-y-1">
              {tools.map((tool) => (
                <div
                  key={tool}
                  className="text-xs text-muted-foreground font-mono py-0.5"
                >
                  {tool}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function AgentsMcpTab() {
  const isNarrowScreen = useIsNarrowScreen()
  const [expandedServer, setExpandedServer] = useState<string | null>(null)

  // Fetch ALL MCP config (global + all projects) - includes tools for connected servers
  // Uses long staleTime since data is prefetched at app startup and user can manually refresh
  const {
    data: allMcpConfig,
    isLoading: isLoadingConfig,
    refetch,
  } = trpc.claude.getAllMcpConfig.useQuery(undefined, {
    staleTime: 10 * 60 * 1000, // 10 minutes - rely on manual refresh button
  })

  // Refresh state - true during initial load OR manual refresh
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const isRefreshing = isLoadingConfig || isManualRefreshing

  // tRPC
  const startOAuthMutation = trpc.claude.startMcpOAuth.useMutation()
  const openInFinderMutation = trpc.external.openInFinder.useMutation()

  // Process groups for display (filter out empty groups)
  const groups = useMemo(
    () => (allMcpConfig?.groups || []).filter(g => g.mcpServers.length > 0),
    [allMcpConfig?.groups]
  )
  const totalServers = useMemo(
    () => groups.reduce((acc, g) => acc + g.mcpServers.length, 0),
    [groups]
  )

  const handleToggleServer = (serverKey: string) => {
    setExpandedServer(expandedServer === serverKey ? null : serverKey)
  }

  const handleRefresh = useCallback(async (silent = false) => {
    setIsManualRefreshing(true)
    try {
      await refetch()
      if (!silent) {
        toast.success("Refreshed MCP servers")
      }
    } catch (error) {
      if (!silent) {
        toast.error("Failed to refresh MCP servers")
      }
    } finally {
      setIsManualRefreshing(false)
    }
  }, [refetch])

  const handleAuth = async (serverName: string, projectPath: string | null) => {
    try {
      // Use "__global__" marker for global MCP servers
      const result = await startOAuthMutation.mutateAsync({
        serverName,
        projectPath: projectPath ?? "__global__",
      })
      if (result.success) {
        toast.success(`${serverName} authenticated, refreshing...`)
        // Refresh to update status and fetch tools
        await handleRefresh(false)
      } else {
        toast.error(result.error || "Authentication failed")
      }
    } catch (error) {
      // Extract actual error message from tRPC error
      const message = error instanceof Error ? error.message : "Authentication failed";
      console.error(`[MCP Auth] Error authenticating ${serverName}:`, error);
      toast.error(message)
    }
  }

  const handleOpenGlobalClaudeJson = () => {
    openInFinderMutation.mutate("~/.claude.json")
  }

  return (
    <div className="p-6 space-y-6 h-full">
      {/* Header */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold text-foreground">MCP Servers</h3>
            <button
              onClick={() => handleRefresh()}
              disabled={isRefreshing}
              className="h-6 w-6 inline-flex items-center justify-center text-foreground/50 hover:text-foreground disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              {isRefreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Instructions Section - below header */}
      <div className="pb-4 border-b border-border space-y-3">
        <div>
          <h4 className="text-xs font-medium text-foreground mb-1.5">
            How to use MCP Tools
          </h4>
          <p className="text-xs text-muted-foreground">
            Mention a tool in chat with{" "}
            <code className="px-1 py-0.5 bg-muted rounded">@tool-name</code> or
            ask Claude to use it directly.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-medium text-foreground mb-1.5">
            Configuring Servers
          </h4>
          <p className="text-xs text-muted-foreground">
            Add MCP server configuration to{" "}
            <button
              onClick={handleOpenGlobalClaudeJson}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              <span>~/.claude.json</span>
            </button>{" "}
            at the root for global servers or under your project path.
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            <a
              href="https://docs.anthropic.com/en/docs/claude-code/mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground underline transition-colors"
            >
              Documentation from Anthropic
            </a>
          </p>
        </div>
      </div>

      {/* Servers List */}
      <div className="space-y-4">
        {isLoadingConfig ? (
          <div className="bg-background rounded-lg border border-border p-6 text-center">
            <Loader2 className="h-6 w-6 text-muted-foreground/50 mx-auto mb-3 animate-spin" />
            <p className="text-sm text-muted-foreground">
              Loading MCP servers...
            </p>
          </div>
        ) : totalServers === 0 ? (
          <div className="bg-background rounded-lg border border-border p-6 text-center">
            <OriginalMCPIcon className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-2">
              No MCP servers configured
            </p>
            <p className="text-xs text-muted-foreground">
              Add servers to{" "}
              <code className="px-1 py-0.5 bg-muted rounded">~/.claude.json</code>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.groupName}>
                {/* Group label */}
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {group.groupName}
                </p>
                {/* Server rows */}
                <div className="bg-background rounded-lg border border-border overflow-hidden">
                  <div className="divide-y divide-border">
                    {group.mcpServers.map((server) => (
                      <ServerRow
                        key={`${group.groupName}-${server.name}`}
                        server={server}
                        isExpanded={expandedServer === `${group.groupName}-${server.name}`}
                        onToggle={() => handleToggleServer(`${group.groupName}-${server.name}`)}
                        onAuth={() => handleAuth(server.name, group.projectPath)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Bottom spacer for scroll padding */}
      <div className="h-[1px] shrink-0" />
    </div>
  )
}
