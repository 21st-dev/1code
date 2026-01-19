"use client"

import { useState, useEffect } from "react"
import { ChevronRight } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { useAtom, useAtomValue } from "jotai"
import { sessionInfoAtom } from "../../../lib/atoms"
import { selectedProjectAtom } from "../../../features/agents/atoms"
import { cn } from "../../../lib/utils"
import { OriginalMCPIcon } from "../../ui/icons"
import { trpc } from "../../../lib/trpc"

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = (): void => {
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
        status === "connecting" && "animate-pulse",
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
      return "Available"
    case "connecting":
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

export function AgentsMcpTab() {
  const isNarrowScreen = useIsNarrowScreen()
  const [expandedServer, setExpandedServer] = useState<string | null>(null)

  const [sessionInfo, setSessionInfo] = useAtom(sessionInfoAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)

  // Fetch MCP config when tab is opened (even before starting a chat)
  const { data: mcpConfig } = trpc.claude.getMcpConfig.useQuery(
    { projectPath: selectedProject?.path || "" },
    {
      enabled: true, // Always fetch to show available MCP servers
      staleTime: 30 * 1000, // 30 seconds
    },
  )

  // Update sessionInfo with MCP config if we got servers from config
  useEffect(() => {
    if (mcpConfig?.mcpServers?.length && !sessionInfo?.mcpServers?.length) {
      setSessionInfo((prev) => ({
        tools: prev?.tools || [],
        mcpServers: mcpConfig.mcpServers.map((s) => ({
          name: s.name,
          status: s.status,
        })),
        plugins: prev?.plugins || [],
        skills: prev?.skills || [],
      }))
    }
  }, [mcpConfig, sessionInfo?.mcpServers?.length, setSessionInfo])

  const mcpServers = sessionInfo?.mcpServers || mcpConfig?.mcpServers?.map(s => ({ name: s.name, status: s.status })) || []
  const tools = sessionInfo?.tools || []

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
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
          >
            Documentation
          </a>
        </div>
      )}

      {/* Servers List */}
      <div className="space-y-4">
        {mcpServers.length === 0 ? (
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
            under your project path.
          </p>
        </div>
      </div>
    </div>
  )
}
