"use client"

import React, { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"

interface McpToolDetail {
  name: string
  description?: string
  inputSchema?: {
    type: "object"
    properties?: Record<string, { type: string; description?: string }>
    required?: string[]
  }
}

interface McpServer {
  name: string
  status: string
  serverInfo?: { name?: string; version?: string }
  tools: McpToolDetail[]
  transportType?: "stdio" | "http"
}

interface McpSectionProps {
  chatId: string
  projectPath?: string
  isCollapsed: boolean
  onToggleCollapse: () => void
}

// Status indicator dot
function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full flex-shrink-0",
        status === "connected" && "bg-foreground",
        status === "failed" && "bg-destructive",
        status === "needs-auth" && "bg-amber-500",
        status !== "connected" && status !== "failed" && status !== "needs-auth" && "bg-muted-foreground/50",
        status === "pending" && "animate-pulse",
      )}
    />
  )
}

// Format tool signature for display
function formatToolSignature(tool: McpToolDetail): string {
  const params = tool.inputSchema?.properties
  const required = tool.inputSchema?.required || []

  if (!params) {
    return `${tool.name}()`
  }

  const paramStrings = Object.entries(params).map(([key, schema]) => {
    const isRequired = required.includes(key)
    const type = schema.type || "unknown"
    return `${key}: ${type}${isRequired ? "" : "?"}`
  })

  return `${tool.name}(${paramStrings.join(", ")})`
}

// Tool display component
function ToolItem({ tool }: { tool: McpToolDetail }) {
  return (
    <div className="text-xs text-muted-foreground font-mono py-0.5 pl-2 border-l border-border/50">
      <span className="text-foreground">{tool.name}</span>
      <span className="text-muted-foreground/80">({formatToolSignature(tool).replace(tool.name, "")})</span>
    </div>
  )
}

// Server row component
function ServerRow({
  server,
  isExpanded,
  onToggle,
}: {
  server: McpServer
  isExpanded: boolean
  onToggle: () => void
}) {
  const hasTools = server.tools.length > 0

  return (
    <div>
      <button
        onClick={hasTools ? onToggle : undefined}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors rounded-md",
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
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm text-foreground truncate">
            {server.serverInfo?.name || server.name}
          </span>
          {server.serverInfo?.version && (
            <span className="text-[10px] text-muted-foreground">
              v{server.serverInfo.version}
            </span>
          )}
        </div>

        {/* Tool count */}
        <span className="text-[10px] text-muted-foreground flex-shrink-0">
          {server.status === "connected"
            ? hasTools
              ? `${server.tools.length} tool${server.tools.length !== 1 ? "s" : ""}`
              : "No tools"
            : server.status}
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
            <div className="pl-8 pr-2 pb-2 space-y-0.5">
              {server.tools.map((tool) => (
                <ToolItem key={tool.name} tool={tool} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function McpSection({
  chatId,
  projectPath,
  isCollapsed,
  onToggleCollapse,
}: McpSectionProps) {
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set())

  // Query project MCP servers
  // Always run the query to show global MCP servers even without a project selected
  const { data: mcpData, isLoading } = trpc.claude.getProjectMcpServers.useQuery(
    { projectPath: projectPath || "" },
    {
      refetchInterval: 60000, // Refresh every minute
    }
  )

  const servers: McpServer[] = mcpData?.servers || []

  const handleToggleServer = (serverName: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev)
      if (next.has(serverName)) {
        next.delete(serverName)
      } else {
        next.add(serverName)
      }
      return next
    })
  }

  return (
    <div className="flex flex-col border-t border-border overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-background/50">
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCollapse}
            className="p-0.5 hover:bg-muted rounded transition-colors"
            aria-label={isCollapsed ? "Expand MCP" : "Collapse MCP"}
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isCollapsed ? "rotate-0" : "rotate-90"
              )}
            />
          </button>
          <span className="text-xs font-medium text-muted-foreground">MCP</span>
        </div>
        <span className="text-xs text-muted-foreground/60">
          {servers.length}
        </span>
      </div>

      {/* MCP Servers List */}
      {!isCollapsed && (
        <div className="overflow-y-auto px-2 pb-2 space-y-0.5">
          {isLoading ? (
            <div className="text-xs text-muted-foreground/60 text-center py-4">
              Loading...
            </div>
          ) : servers.length === 0 ? (
            <div className="text-xs text-muted-foreground/60 text-center py-4">
              No MCP servers
            </div>
          ) : (
            servers.map((server) => (
              <ServerRow
                key={server.name}
                server={server}
                isExpanded={expandedServers.has(server.name)}
                onToggle={() => handleToggleServer(server.name)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
