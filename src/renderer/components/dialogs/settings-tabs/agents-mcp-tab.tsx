"use client"

import { useState, useEffect } from "react"
import { ChevronRight, ExternalLink, RefreshCw } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { useAtomValue } from "jotai"
import { sessionInfoAtom } from "../../../lib/atoms"
import { cn } from "../../../lib/utils"
import { OriginalMCPIcon } from "../../ui/icons"
import { trpc } from "../../../lib/trpc"

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

interface ServerRowProps {
  server: {
    name: string
    status: string
    serverInfo?: { name: string; version: string }
    error?: string
  }
  tools: string[]
  isExpanded: boolean
  onToggle: () => void
}

function ServerRow({ server, tools, isExpanded, onToggle }: ServerRowProps) {
  const hasTools = tools.length > 0

  return (
    <div>
      <button
        onClick={hasTools ? onToggle : undefined}
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
          {server.status === "connected" && hasTools
            ? `${tools.length} tool${tools.length !== 1 ? "s" : ""}`
            : getStatusText(server.status)}
        </span>
      </button>

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

// Claude Desktop server row (simpler - no status, just config info)
interface DesktopServerRowProps {
  server: {
    name: string
    command?: string
    args?: string[]
    url?: string
  }
  isExpanded: boolean
  onToggle: () => void
}

function DesktopServerRow({ server, isExpanded, onToggle }: DesktopServerRowProps) {
  const hasDetails = server.command || server.url || (server.args && server.args.length > 0)

  return (
    <div>
      <button
        onClick={hasDetails ? onToggle : undefined}
        className={cn(
          "w-full flex items-center gap-3 p-3 text-left transition-colors",
          hasDetails && "hover:bg-muted/50 cursor-pointer",
          !hasDetails && "cursor-default",
        )}
      >
        {/* Expand chevron */}
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform flex-shrink-0",
            isExpanded && "rotate-90",
            !hasDetails && "opacity-0",
          )}
        />

        {/* Status dot - always show as configured (not connected yet) */}
        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />

        {/* Server info */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground truncate block">
            {server.name}
          </span>
        </div>

        {/* Type indicator */}
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {server.url ? "Remote" : "Local"}
        </span>
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-10 pr-3 pb-3 space-y-1">
              {server.command && (
                <div className="text-xs text-muted-foreground font-mono py-0.5">
                  <span className="text-muted-foreground/70">command:</span> {server.command}
                </div>
              )}
              {server.args && server.args.length > 0 && (
                <div className="text-xs text-muted-foreground font-mono py-0.5">
                  <span className="text-muted-foreground/70">args:</span> {server.args.join(" ")}
                </div>
              )}
              {server.url && (
                <div className="text-xs text-muted-foreground font-mono py-0.5">
                  <span className="text-muted-foreground/70">url:</span> {server.url}
                </div>
              )}
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
  const [expandedDesktopServer, setExpandedDesktopServer] = useState<string | null>(null)

  const sessionInfo = useAtomValue(sessionInfoAtom)
  const mcpServers = sessionInfo?.mcpServers || []
  const tools = sessionInfo?.tools || []

  // Fetch Claude Desktop MCP config
  const { data: desktopConfig, isLoading: isLoadingDesktop, refetch: refetchDesktop } =
    trpc.claude.getClaudeDesktopMcpConfig.useQuery()

  const desktopServers = (desktopConfig?.mcpServers || []) as Array<{
    name: string
    command?: string
    args?: string[]
    env?: Record<string, string>
  }>

  // Group tools by server
  const toolsByServer = mcpServers.reduce(
    (acc, server) => {
      const serverTools = tools
        .filter((tool) => tool.startsWith(`mcp__${server.name}__`))
        .map((tool) => tool.split("__").slice(2).join("__"))
      acc[server.name] = serverTools
      return acc
    },
    {} as Record<string, string[]>,
  )

  const handleToggleServer = (serverName: string) => {
    setExpandedServer(expandedServer === serverName ? null : serverName)
  }

  const handleToggleDesktopServer = (serverName: string) => {
    setExpandedDesktopServer(expandedDesktopServer === serverName ? null : serverName)
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
      {/* Header */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">MCP Servers</h3>
          <a
            href="https://docs.anthropic.com/en/docs/claude-code/mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors inline-flex items-center gap-1"
          >
            Documentation <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* Claude Desktop Servers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-foreground">
            Claude Desktop Servers
          </h4>
          <button
            onClick={() => refetchDesktop()}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors p-1"
            title="Refresh"
          >
            <RefreshCw className={cn("h-3 w-3", isLoadingDesktop && "animate-spin")} />
          </button>
        </div>

        {isLoadingDesktop ? (
          <div className="bg-background rounded-lg border border-border p-4 text-center">
            <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin mx-auto" />
          </div>
        ) : desktopServers.length === 0 ? (
          <div className="bg-background rounded-lg border border-border p-4 text-center">
            <p className="text-xs text-muted-foreground">
              No Claude Desktop servers configured
            </p>
            {desktopConfig?.configPath && (
              <p className="text-xs text-muted-foreground/70 mt-1 font-mono truncate">
                {desktopConfig.configPath}
              </p>
            )}
          </div>
        ) : (
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="divide-y divide-border">
              {desktopServers.map((server) => (
                <DesktopServerRow
                  key={server.name}
                  server={server}
                  isExpanded={expandedDesktopServer === server.name}
                  onToggle={() => handleToggleDesktopServer(server.name)}
                />
              ))}
            </div>
          </div>
        )}
        {desktopConfig?.configPath && desktopServers.length > 0 && (
          <p className="text-xs text-muted-foreground/70 font-mono truncate">
            {desktopConfig.configPath}
          </p>
        )}
      </div>

      {/* Active Session Servers */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-foreground">
          Active Session Servers
        </h4>
        {mcpServers.length === 0 ? (
          <div className="bg-background rounded-lg border border-border p-4 text-center">
            <OriginalMCPIcon className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              No active MCP servers
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Start a chat to connect servers from{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-[10px]">~/.claude.json</code>
            </p>
          </div>
        ) : (
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="divide-y divide-border">
              {mcpServers.map((server) => (
                <ServerRow
                  key={server.name}
                  server={server}
                  tools={toolsByServer[server.name] || []}
                  isExpanded={expandedServer === server.name}
                  onToggle={() => handleToggleServer(server.name)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="pt-4 border-t border-border space-y-3">
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
            <code className="px-1 py-0.5 bg-muted rounded">~/.claude.json</code>{" "}
            under your project path, or install via{" "}
            <code className="px-1 py-0.5 bg-muted rounded">npx install-mcp</code>.
          </p>
        </div>
      </div>
    </div>
  )
}
