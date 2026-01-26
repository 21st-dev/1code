"use client"

import { ExternalLink, Loader2, Plus, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { Button } from "../../ui/button"
import { OriginalMCPIcon } from "../../ui/icons"
import {
  AddMcpServerDialog,
  EditMcpServerDialog,
  McpServerRow,
  type McpServer,
  type ScopeType,
} from "./mcp"

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

export function AgentsMcpTab() {
  const isNarrowScreen = useIsNarrowScreen()
  const [expandedServer, setExpandedServer] = useState<string | null>(null)

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<{
    server: McpServer
    scope: ScopeType
    projectPath: string | null
  } | null>(null)

  // Fetch ALL MCP config (global + all projects) - includes tools for connected servers
  const { data: allMcpConfig, isLoading: isLoadingConfig, refetch } = trpc.claude.getAllMcpConfig.useQuery()

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false)

  // tRPC
  const startOAuthMutation = trpc.claude.startMcpOAuth.useMutation()
  const openInFinderMutation = trpc.external.openInFinder.useMutation()
  const updateMutation = trpc.claude.updateMcpServer.useMutation()

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
    setIsRefreshing(true)
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
      setIsRefreshing(false)
    }
  }, [refetch])

  // Refresh on every tab access (component mount)
  useEffect(() => {
    handleRefresh(true)
  }, [handleRefresh])

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
      toast.error("Authentication failed")
    }
  }

  const handleOpenGlobalClaudeJson = () => {
    openInFinderMutation.mutate("~/.claude.json")
  }

  const handleToggleEnabled = async (
    server: McpServer,
    scope: ScopeType,
    projectPath: string | null,
    enabled: boolean
  ) => {
    try {
      const result = await updateMutation.mutateAsync({
        name: server.name,
        scope,
        projectPath: projectPath || undefined,
        disabled: !enabled,
      })
      if (result.success) {
        toast.success(enabled ? "Server enabled" : "Server disabled")
        await handleRefresh(true)
      } else {
        toast.error(result.error || "Failed to update server")
      }
    } catch (error) {
      toast.error("Failed to update server")
    }
  }

  // Determine scope from group name
  const getScopeFromGroup = (groupName: string): ScopeType => {
    if (groupName === "Global" || groupName.startsWith("Plugin:")) {
      return "global"
    }
    return "project"
  }

  // Check if a group contains editable servers (not plugins)
  const isEditableGroup = (groupName: string): boolean => {
    return !groupName.startsWith("Plugin:")
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
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Server
            </Button>
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
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Server
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const scope = getScopeFromGroup(group.groupName)
              const isEditable = isEditableGroup(group.groupName)

              return (
                <div key={group.groupName}>
                  {/* Group label */}
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {group.groupName}
                  </p>
                  {/* Server rows */}
                  <div className="bg-background rounded-lg border border-border overflow-hidden">
                    <div className="divide-y divide-border">
                      {group.mcpServers.map((server) => (
                        <McpServerRow
                          key={`${group.groupName}-${server.name}`}
                          server={server}
                          isExpanded={expandedServer === `${group.groupName}-${server.name}`}
                          onToggle={() => handleToggleServer(`${group.groupName}-${server.name}`)}
                          onAuth={() => handleAuth(server.name, group.projectPath)}
                          onEdit={
                            isEditable
                              ? () =>
                                  setEditingServer({
                                    server,
                                    scope,
                                    projectPath: group.projectPath,
                                  })
                              : undefined
                          }
                          onToggleEnabled={
                            isEditable
                              ? (enabled) =>
                                  handleToggleEnabled(server, scope, group.projectPath, enabled)
                              : undefined
                          }
                          isEditable={isEditable}
                          showToggle={isEditable}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {/* Bottom spacer for scroll padding */}
      <div className="h-[1px] shrink-0" />

      {/* Add Server Dialog */}
      <AddMcpServerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={() => handleRefresh(true)}
      />

      {/* Edit Server Dialog */}
      <EditMcpServerDialog
        open={!!editingServer}
        onOpenChange={(open) => {
          if (!open) setEditingServer(null)
        }}
        server={editingServer?.server || null}
        scope={editingServer?.scope || "global"}
        projectPath={editingServer?.projectPath || null}
        onSuccess={() => handleRefresh(true)}
        onDelete={() => handleRefresh(true)}
      />
    </div>
  )
}
