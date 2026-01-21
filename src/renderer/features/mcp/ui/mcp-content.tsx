"use client"

import React from "react"
import { Plug } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { McpServerList } from "./mcp-server-list"
import { McpServerDetail } from "./mcp-server-detail"
import { McpAuthModal } from "./mcp-auth-modal"

export function McpContent() {
  const { data: configPath } = trpc.mcp.getConfigPath.useQuery()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5" />
          <h1 className="text-lg font-semibold">MCP Servers</h1>
        </div>
        {configPath && (
          <span className="text-xs text-muted-foreground truncate max-w-[300px]">
            {configPath.path}
          </span>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Server list (left) */}
        <div className="w-[280px] border-r border-border flex-shrink-0 overflow-hidden">
          <McpServerList />
        </div>

        {/* Server detail (right) */}
        <div className="flex-1 overflow-hidden">
          <McpServerDetail />
        </div>
      </div>

      {/* Auth modal */}
      <McpAuthModal />
    </div>
  )
}
