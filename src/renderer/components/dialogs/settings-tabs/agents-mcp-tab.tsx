"use client"

import { Loader2, Plus } from "lucide-react"
import { Button } from "../../ui/button"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtomValue } from "jotai"
import { toast } from "sonner"
import { useListKeyboardNav } from "./use-list-keyboard-nav"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { LoadingDot, OriginalMCPIcon } from "../../ui/icons"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select"
import { ResizableSidebar } from "../../ui/resizable-sidebar"
import { selectedProjectAtom, settingsMcpSidebarWidthAtom } from "../../../features/agents/atoms"
import {
  AddMcpServerDialog,
  EditMcpServerDialog,
  getStatusText,
  type McpServer,
  type ScopeType,
} from "./mcp"

// Status indicator dot - exported for reuse in other components
export function McpStatusDot({ status }: { status: string }) {
  switch (status) {
    case "connected":
      return <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
    case "failed":
      return <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
    case "needs-auth":
      return <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
    case "pending":
      return <LoadingDot isLoading={true} className="w-3 h-3 text-muted-foreground shrink-0" />
    default:
      return <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
  }
}


// Extract connection info from server config
function getConnectionInfo(config: Record<string, unknown>) {
  const url = config.url as string | undefined
  const command = config.command as string | undefined
  const args = config.args as string[] | undefined
  const env = config.env as Record<string, string> | undefined

  if (url) {
    return { type: "HTTP (SSE)" as const, url, command: undefined, args: undefined, env: undefined }
  }
  if (command) {
    return { type: "stdio" as const, url: undefined, command, args, env }
  }
  return { type: "unknown" as const, url: undefined, command: undefined, args: undefined, env: undefined }
}

// --- Detail Panel ---
function McpServerDetail({ server, onAuth }: { server: McpServer; onAuth?: () => void }) {
  const { tools, needsAuth } = server
  const hasTools = tools.length > 0
  const isConnected = server.status === "connected"
  const connection = getConnectionInfo(server.config)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{server.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isConnected
                ? (hasTools ? `${tools.length} tool${tools.length !== 1 ? "s" : ""}` : "No tools")
                : getStatusText(server.status)}
              {server.serverInfo?.version && ` \u00B7 v${server.serverInfo.version}`}
            </p>
          </div>
          {needsAuth && onAuth && (
            <Button variant="secondary" size="sm" className="h-7 px-3 text-xs" onClick={onAuth}>
              {isConnected ? "Reconnect" : "Authenticate"}
            </Button>
          )}
        </div>

        {/* Connection Section */}
        <div>
          <h5 className="text-xs font-medium text-foreground mb-2">Connection</h5>
          <div className="rounded-md border border-border bg-background overflow-hidden">
            <div className="divide-y divide-border">
              <div className="flex gap-3 px-3 py-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0">Type</span>
                <span className="text-xs text-foreground font-mono">{connection.type}</span>
              </div>
              {connection.url && (
                <div className="flex gap-3 px-3 py-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">URL</span>
                  <span className="text-xs text-foreground font-mono break-all">{connection.url}</span>
                </div>
              )}
              {connection.command && (
                <div className="flex gap-3 px-3 py-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Command</span>
                  <span className="text-xs text-foreground font-mono break-all">{connection.command}</span>
                </div>
              )}
              {connection.args && connection.args.length > 0 && (
                <div className="flex gap-3 px-3 py-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Args</span>
                  <span className="text-xs text-foreground font-mono break-all">{connection.args.join(" ")}</span>
                </div>
              )}
              {connection.env && Object.keys(connection.env).length > 0 && (
                <div className="flex gap-3 px-3 py-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Env</span>
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(connection.env).map((key) => (
                      <span key={key} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {key}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error Section */}
        {server.error && (
          <div>
            <h5 className="text-xs font-medium text-red-500 mb-2">Error</h5>
            <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
              <p className="text-xs text-red-400 font-mono break-all">{server.error}</p>
            </div>
          </div>
        )}

        {/* Tools Section */}
        {hasTools && (
          <div>
            <h5 className="text-xs font-medium text-foreground mb-3">
              Tools ({tools.length})
            </h5>
            <div className="grid gap-2">
              {tools.map((tool, i) => {
                const toolName = typeof tool === "string" ? tool : tool.name
                const toolDesc = typeof tool === "string" ? undefined : tool.description
                return (
                  <div key={toolName || i} className="rounded-lg border border-border bg-background px-3.5 py-2.5">
                    <p className="text-[13px] font-medium text-foreground font-mono">{toolName}</p>
                    {toolDesc && (
                      <p className="text-xs text-muted-foreground leading-relaxed mt-1">{toolDesc}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Create Form ---
function CreateMcpServerForm({
  onCreated,
  onCancel,
  hasProject,
}: {
  onCreated: () => void
  onCancel: () => void
  hasProject: boolean
}) {
  const addServerMutation = trpc.claude.addMcpServer.useMutation()
  const isSaving = addServerMutation.isPending
  const [name, setName] = useState("")
  const [type, setType] = useState<"stdio" | "http">("stdio")
  const [command, setCommand] = useState("")
  const [args, setArgs] = useState("")
  const [url, setUrl] = useState("")
  const [scope, setScope] = useState<"global" | "project">("global")

  const canSave = name.trim().length > 0 && (
    (type === "stdio" && command.trim().length > 0) ||
    (type === "http" && url.trim().length > 0)
  )

  const handleSubmit = async () => {
    const parsedArgs = args.trim() ? args.split(/\s+/) : undefined
    try {
      await addServerMutation.mutateAsync({
        name: name.trim(),
        transport: type,
        command: type === "stdio" ? command.trim() : undefined,
        args: type === "stdio" ? parsedArgs : undefined,
        url: type === "http" ? url.trim() : undefined,
        scope,
      })
      toast.success("Server added", { description: name.trim() })
      onCreated()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add server"
      toast.error("Failed to add", { description: message })
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">New MCP Server</h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!canSave || isSaving}>
              {isSaving ? "Adding..." : "Add"}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-server"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label>Transport</Label>
          <Select value={type} onValueChange={(v) => setType(v as "stdio" | "http")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio">stdio (local command)</SelectItem>
              <SelectItem value="http">HTTP (SSE)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {type === "stdio" ? (
          <>
            <div className="space-y-1.5">
              <Label>Command</Label>
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx, python, node..."
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Arguments</Label>
              <Input
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="-m mcp_server --port 3000"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">Space-separated arguments</p>
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <Label>URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:3000/sse"
              className="font-mono"
            />
          </div>
        )}

        {hasProject && (
          <div className="space-y-1.5">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "global" | "project")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global (~/.claude.json)</SelectItem>
                <SelectItem value="project">Project</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Main Component ---
export function AgentsMcpTab() {
  const [selectedServerKey, setSelectedServerKey] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const selectedProject = useAtomValue(selectedProjectAtom)

  // Dialog state for Add/Edit MCP server dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<{
    server: McpServer
    scope: ScopeType
    projectPath: string | null
  } | null>(null)

  const updateMutation = trpc.claude.updateMcpServer.useMutation()

  // Focus search on "/" hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  const {
    data: allMcpConfig,
    isLoading: isLoadingConfig,
    refetch,
  } = trpc.claude.getAllMcpConfig.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  })

  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const isRefreshing = isLoadingConfig || isManualRefreshing

  const startOAuthMutation = trpc.claude.startMcpOAuth.useMutation()

  const groups = useMemo(
    () => (allMcpConfig?.groups || []).filter(g => g.mcpServers.length > 0),
    [allMcpConfig?.groups]
  )
  const totalServers = useMemo(
    () => groups.reduce((acc, g) => acc + g.mcpServers.length, 0),
    [groups]
  )

  // Sort servers by status: connected first, then needs-auth, then failed/other
  const sortedGroups = useMemo(() => {
    const statusOrder: Record<string, number> = {
      connected: 0,
      pending: 1,
      "needs-auth": 2,
      failed: 3,
    }
    return groups.map((g) => ({
      ...g,
      mcpServers: [...g.mcpServers].sort(
        (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
      ),
    }))
  }, [groups])

  // Filter groups by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return sortedGroups
    const q = searchQuery.toLowerCase()
    return sortedGroups
      .map((g) => ({
        ...g,
        mcpServers: g.mcpServers.filter((s) => s.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.mcpServers.length > 0)
  }, [sortedGroups, searchQuery])

  // Flat list of all server keys for keyboard navigation
  const allServerKeys = useMemo(
    () => filteredGroups.flatMap((g) => g.mcpServers.map((s) => `${g.groupName}-${s.name}`)),
    [filteredGroups]
  )

  const { containerRef: listRef, onKeyDown: listKeyDown } = useListKeyboardNav({
    items: allServerKeys,
    selectedItem: selectedServerKey,
    onSelect: setSelectedServerKey,
  })

  // Auto-select first server when data loads (sorted, so connected first)
  useEffect(() => {
    if (selectedServerKey || isLoadingConfig) return
    for (const group of sortedGroups) {
      if (group.mcpServers.length > 0) {
        setSelectedServerKey(`${group.groupName}-${group.mcpServers[0]!.name}`)
        return
      }
    }
  }, [sortedGroups, selectedServerKey, isLoadingConfig])

  // Find selected server
  const selectedServer = useMemo(() => {
    if (!selectedServerKey) return null
    for (const group of groups) {
      for (const server of group.mcpServers) {
        if (`${group.groupName}-${server.name}` === selectedServerKey) {
          return { server, group }
        }
      }
    }
    return null
  }, [selectedServerKey, groups])

  const handleRefresh = useCallback(async (silent = false) => {
    setIsManualRefreshing(true)
    try {
      await refetch()
      if (!silent) {
        toast.success("Refreshed MCP servers")
      }
    } catch {
      if (!silent) {
        toast.error("Failed to refresh MCP servers")
      }
    } finally {
      setIsManualRefreshing(false)
    }
  }, [refetch])


  const handleAuth = async (serverName: string, projectPath: string | null) => {
    try {
      const result = await startOAuthMutation.mutateAsync({
        serverName,
        projectPath: projectPath ?? "__global__",
      })
      if (result.success) {
        toast.success(`${serverName} authenticated, refreshing...`)
        // Plugin servers get promoted to Global after OAuth — update selection
        setSelectedServerKey(`Global-${serverName}`)
        await handleRefresh(true)
      } else {
        toast.error(result.error || "Authentication failed")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed"
      toast.error(message)
    }
  }

  const getScopeFromGroup = (groupName: string): ScopeType => {
    if (groupName.toLowerCase().includes("global") || groupName.toLowerCase().includes("user")) {
      return "global"
    }
    return "project"
  }

  const isEditableGroup = (groupName: string): boolean => {
    // Plugin-managed servers are not directly editable
    return !groupName.toLowerCase().includes("plugin")
  }

  const handleToggleEnabled = async (server: McpServer, group: { groupName: string; projectPath: string | null }, enabled: boolean) => {
    try {
      await updateMutation.mutateAsync({
        name: server.name,
        scope: getScopeFromGroup(group.groupName),
        projectPath: group.projectPath ?? undefined,
        disabled: !enabled,
      })
      await handleRefresh(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to toggle server"
      toast.error(message)
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar - server list */}
      <ResizableSidebar
        isOpen={true}
        onClose={() => {}}
        widthAtom={settingsMcpSidebarWidthAtom}
        minWidth={200}
        maxWidth={400}
        side="left"
        animationDuration={0}
        initialWidth={240}
        exitWidth={240}
        disableClickToClose={true}
      >
        <div className="flex flex-col h-full bg-background border-r overflow-hidden" style={{ borderRightWidth: "0.5px" }}>
          {/* Search + Add */}
          <div className="px-2 pt-2 flex-shrink-0 flex items-center gap-1.5">
            <input
              ref={searchInputRef}
              placeholder="Search servers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={listKeyDown}
              className="h-7 w-full rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40 outline-none"
            />
            <button
              onClick={() => { setShowAddForm(true); setSelectedServerKey(null) }}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              title="Add MCP server"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {/* Server list */}
          <div ref={listRef} onKeyDown={listKeyDown} tabIndex={-1} className="flex-1 overflow-y-auto px-2 pt-2 pb-2 outline-none">
            {isLoadingConfig ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
              </div>
            ) : totalServers === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <OriginalMCPIcon className="h-8 w-8 text-border mb-3" />
                <p className="text-sm text-muted-foreground mb-1">No servers</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add server
                </Button>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-xs text-muted-foreground">No results found</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredGroups.map((group) => (
                  <div key={group.groupName} className="space-y-0.5">
                    {group.mcpServers.map((server) => {
                      const key = `${group.groupName}-${server.name}`
                      const isSelected = selectedServerKey === key
                      return (
                        <button
                          key={key}
                          data-item-id={key}
                          onClick={() => setSelectedServerKey(key)}
                          className={cn(
                            "w-full text-left py-1.5 pl-2 pr-2 rounded-md cursor-pointer group relative",
                            "transition-colors duration-75",
                            "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                            isSelected
                              ? "bg-foreground/5 text-foreground"
                              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                              <div className="flex items-center gap-1">
                                <span className="truncate block text-sm leading-tight flex-1">
                                  {server.name}
                                </span>
                                <div className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">
                                  <McpStatusDot status={server.status} />
                                </div>
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60 min-w-0">
                                <span className="truncate flex-1 min-w-0">
                                  {group.groupName}
                                </span>
                                {server.status !== "pending" && (
                                  <span className="flex-shrink-0">
                                    {server.status === "connected"
                                      ? `${server.tools.length} tool${server.tools.length !== 1 ? "s" : ""}`
                                      : getStatusText(server.status)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </ResizableSidebar>

      {/* Right content - detail panel */}
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        {showAddForm ? (
          <CreateMcpServerForm
            onCreated={() => { setShowAddForm(false); handleRefresh(true) }}
            onCancel={() => setShowAddForm(false)}
            hasProject={!!selectedProject?.path}
          />
        ) : selectedServer ? (
          <McpServerDetail
            server={selectedServer.server}
            onAuth={() => handleAuth(selectedServer.server.name, selectedServer.group.projectPath)}
          />
        ) : isLoadingConfig ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <OriginalMCPIcon className="h-12 w-12 text-border mb-4" />
            <p className="text-sm text-muted-foreground">
              {totalServers > 0
                ? "Select a server to view details"
                : "No MCP servers configured"}
            </p>
            {totalServers === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add your first server
              </Button>
            )}
          </div>
        )}
      </div>

      <AddMcpServerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onServerAdded={() => handleRefresh(true)}
      />
      <EditMcpServerDialog
        open={!!editingServer}
        onOpenChange={(open) => { if (!open) setEditingServer(null) }}
        server={editingServer?.server || null}
        scope={editingServer?.scope || "global"}
        projectPath={editingServer?.projectPath ?? undefined}
        onServerUpdated={() => handleRefresh(true)}
        onServerDeleted={() => handleRefresh(true)}
      />
    </div>
  )
}
