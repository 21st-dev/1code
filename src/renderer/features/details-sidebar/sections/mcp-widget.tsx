"use client"

import { useAtomValue, useSetAtom } from "jotai"
import { ChevronDown } from "lucide-react"
import { memo, useMemo, useState } from "react"
import { OriginalMCPIcon } from "../../../components/ui/icons"
import { sessionInfoAtom, type MCPServer } from "../../../lib/atoms"
import { cn } from "../../../lib/utils"
import { pendingMentionAtom } from "../../agents/atoms"

function formatToolName(toolName: string): string {
  return toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Get the best icon URL for an MCP server.
 * Prefers SVG, then picks the largest raster icon.
 * Returns null if no icons available.
 */
function getServerIconUrl(server: MCPServer): string | null {
  const icons = server.serverInfo?.icons
  if (!icons || icons.length === 0) return null

  // Prefer SVG
  const svg = icons.find((i) => i.mimeType === "image/svg+xml")
  if (svg) return svg.src

  // Otherwise pick the one with the largest size, or first available
  let best = icons[0]
  let bestSize = 0
  for (const icon of icons) {
    if (icon.sizes?.length) {
      const size = parseInt(icon.sizes[0], 10) || 0
      if (size > bestSize) {
        bestSize = size
        best = icon
      }
    }
  }
  return best.src
}

function ServerIcon({ server }: { server: MCPServer }) {
  const iconUrl = getServerIconUrl(server)
  const [imgError, setImgError] = useState(false)

  if (iconUrl && !imgError) {
    return (
      <img
        src={iconUrl}
        alt=""
        className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
        onError={() => setImgError(true)}
      />
    )
  }

  return <OriginalMCPIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
}

export const McpWidget = memo(function McpWidget() {
  const sessionInfo = useAtomValue(sessionInfoAtom)
  const setPendingMention = useSetAtom(pendingMentionAtom)
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set())

  const toolsByServer = useMemo(() => {
    if (!sessionInfo?.tools || !sessionInfo?.mcpServers) return new Map<string, string[]>()
    const map = new Map<string, string[]>()
    for (const server of sessionInfo.mcpServers) {
      map.set(server.name, [])
    }
    for (const tool of sessionInfo.tools) {
      if (!tool.startsWith("mcp__")) continue
      const parts = tool.split("__")
      if (parts.length < 3) continue
      const serverName = parts[1]
      const toolName = parts.slice(2).join("__")
      const serverTools = map.get(serverName) || []
      serverTools.push(toolName)
      map.set(serverName, serverTools)
    }
    return map
  }, [sessionInfo?.tools, sessionInfo?.mcpServers])

  if (!sessionInfo?.mcpServers || sessionInfo.mcpServers.length === 0) {
    return (
      <div className="px-2 py-2">
        <div className="text-xs text-muted-foreground">
          No MCP connections configured
        </div>
      </div>
    )
  }

  const toggleServer = (name: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleToolClick = (serverName: string, toolName: string, fullToolId: string) => {
    setPendingMention({
      id: `tool:${fullToolId}`,
      label: formatToolName(toolName),
      path: fullToolId,
      repository: "",
      truncatedPath: serverName,
      type: "tool",
      mcpServer: serverName,
    })
  }

  return (
    <div className="px-2 py-1.5 flex flex-col gap-0.5">
      {sessionInfo.mcpServers.map((server) => {
        const tools = toolsByServer.get(server.name) || []
        const isExpanded = expandedServers.has(server.name)
        const hasTools = tools.length > 0

        return (
          <div key={server.name}>
            {/* Connection row */}
            <button
              onClick={() => hasTools && toggleServer(server.name)}
              className={cn(
                "w-full flex items-center gap-1.5 min-h-[28px] rounded px-1.5 py-0.5 -ml-0.5 transition-colors",
                hasTools
                  ? "hover:bg-accent cursor-pointer"
                  : "cursor-default",
              )}
            >
              <ServerIcon server={server} />
              <span className="text-xs text-foreground truncate flex-1 text-left">
                {server.name}
              </span>
              {hasTools && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {tools.length}
                </span>
              )}
              {hasTools && (
                <ChevronDown
                  className={cn(
                    "h-3 w-3 text-muted-foreground/50 shrink-0 transition-transform duration-150",
                    !isExpanded && "-rotate-90",
                  )}
                />
              )}
            </button>

            {/* Tools list */}
            {isExpanded && hasTools && (
              <div className="ml-[18px] py-0.5 flex flex-col gap-px">
                {tools.map((tool) => {
                  const fullToolId = `mcp__${server.name}__${tool}`
                  return (
                    <button
                      key={tool}
                      onClick={() => handleToolClick(server.name, tool, fullToolId)}
                      className="group/tool w-full flex items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground py-1 px-1.5 rounded hover:bg-accent transition-colors truncate"
                    >
                      <span className="truncate flex-1">{formatToolName(tool)}</span>
                      <span className="text-[10px] text-muted-foreground/0 group-hover/tool:text-muted-foreground/50 transition-colors shrink-0">
                        @
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})
