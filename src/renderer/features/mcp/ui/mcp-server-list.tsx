"use client"

import React from "react"
import { useAtom, useAtomValue } from "jotai"
import { Search, Check, AlertTriangle, Minus, Loader2 } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedMcpServerAtom, mcpServerSearchAtom } from "../atoms"
import type { McpAuthStatus } from "../types"

function getStatusIcon(status: McpAuthStatus) {
  switch (status) {
    case "configured":
      return <Check className="h-3 w-3 text-green-500" />
    case "missing_credentials":
      return <AlertTriangle className="h-3 w-3 text-yellow-500" />
    case "no_auth_needed":
      return <Minus className="h-3 w-3 text-muted-foreground" />
  }
}

function getStatusText(status: McpAuthStatus) {
  switch (status) {
    case "configured":
      return "Configured"
    case "missing_credentials":
      return "Missing credentials"
    case "no_auth_needed":
      return "No auth needed"
  }
}

export function McpServerList() {
  const [selectedServer, setSelectedServer] = useAtom(selectedMcpServerAtom)
  const [search, setSearch] = useAtom(mcpServerSearchAtom)

  const { data, isLoading, error } = trpc.mcp.listServers.useQuery()

  const filteredServers = React.useMemo(() => {
    if (!data?.servers) return []
    if (!search.trim()) return data.servers

    const query = search.toLowerCase()
    return data.servers.filter(
      (server) =>
        server.id.toLowerCase().includes(query) ||
        server.name.toLowerCase().includes(query)
    )
  }, [data?.servers, search])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Failed to load MCP servers: {error.message}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search servers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto">
        {filteredServers.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            {data?.servers?.length === 0
              ? "No MCP servers configured"
              : "No servers match your search"}
          </div>
        ) : (
          <div className="py-1">
            {filteredServers.map((server) => (
              <button
                key={server.id}
                type="button"
                onClick={() => setSelectedServer(server.id)}
                className={cn(
                  "w-full px-3 py-2 text-left transition-colors",
                  "hover:bg-muted/50",
                  selectedServer === server.id && "bg-accent"
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex-1 text-sm font-medium truncate",
                      !server.enabled && "text-muted-foreground"
                    )}
                  >
                    {server.name}
                  </span>
                  {!server.enabled && (
                    <span className="text-xs text-muted-foreground">(disabled)</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {getStatusIcon(server.authStatus)}
                  <span className="text-xs text-muted-foreground">
                    {getStatusText(server.authStatus)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
