"use client"

import { useAtomValue } from "jotai"
import { Check, Copy, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import {
  lastSelectedAgentIdAtom,
  selectedProjectAtom,
  settingsMcpSidebarWidthAtom,
} from "../../../features/agents/atoms"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { useI18n } from "../../../lib/i18n"
import { Button } from "../../ui/button"
import { LoadingDot, OriginalMCPIcon } from "../../ui/icons"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { ResizableSidebar } from "../../ui/resizable-sidebar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select"
import { Switch } from "../../ui/switch"
import {
  DeleteServerConfirm,
  getStatusText,
  type McpServer,
  type ScopeType,
} from "./mcp"
import { useListKeyboardNav } from "./use-list-keyboard-nav"

type McpProvider = "claude-code" | "codex"
type ProviderSection = {
  provider: McpProvider
  title: "CODEX" | "CLAUDE CODE"
}

type ListedServer = {
  key: string
  provider: McpProvider
  groupName: string
  projectPath: string | null
  server: McpServer
}

// Status indicator dot - exported for reuse in other components
export function McpStatusDot({
  status,
  disabled,
}: {
  status: string
  disabled?: boolean
}) {
  if (disabled) {
    return <span className="w-2 h-2 rounded-full bg-muted-foreground/30 shrink-0" />
  }

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
  const args = getStringArray(config.args)
  const env = getRecordKeys(config.env)
  const envVars = getStringArray(config.envVars)
  const headers = getRecordKeys(config.headers)
  const envHttpHeaders = getRecordKeys(config.envHttpHeaders)
  const bearerTokenEnvVar =
    typeof config.bearerTokenEnvVar === "string" ? config.bearerTokenEnvVar : undefined
  const cwd = typeof config.cwd === "string" ? config.cwd : undefined
  const transportType =
    typeof config.transportType === "string" ? config.transportType : undefined

  if (url) {
    return {
      type: transportType || "HTTP (SSE)",
      url,
      command: undefined,
      args: undefined,
      cwd: undefined,
      envKeys: [],
      headerKeys: uniqueStrings([
        ...headers,
        ...envHttpHeaders,
        ...(bearerTokenEnvVar ? [`Authorization (${bearerTokenEnvVar})`] : []),
      ]),
    }
  }
  if (command) {
    return {
      type: transportType || "stdio",
      url: undefined,
      command,
      args: args.length > 0 ? args : undefined,
      cwd,
      envKeys: uniqueStrings([...env, ...envVars]),
      headerKeys: [],
    }
  }
  return {
    type: transportType || "unknown",
    url: undefined,
    command: undefined,
    args: args.length > 0 ? args : undefined,
    cwd,
    envKeys: uniqueStrings([...env, ...envVars]),
    headerKeys: uniqueStrings([
      ...headers,
      ...envHttpHeaders,
      ...(bearerTokenEnvVar ? [`Authorization (${bearerTokenEnvVar})`] : []),
    ]),
  }
}

function isCodexHttpServer(provider: McpProvider, server: McpServer): boolean {
  if (provider !== "codex") return false
  const transportType = String((server.config as Record<string, unknown>).transportType || "").toLowerCase()
  if (transportType === "http" || transportType === "sse" || transportType === "streamable_http") {
    return true
  }
  return typeof (server.config as Record<string, unknown>).url === "string"
}

function isServerDisabled(server: McpServer): boolean {
  const config = server.config as Record<string, unknown>
  return config.disabled === true || config.enabled === false
}

function getRecordKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  return Object.keys(value as Record<string, unknown>)
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function getConfigSource(
  provider: McpProvider,
  groupName: string,
  projectPath: string | null,
): string {
  if (groupName.toLowerCase().startsWith("plugin:")) return groupName
  if (provider === "codex") {
    return projectPath ? "Codex project config" : "~/.codex/config.toml"
  }
  if (projectPath) {
    return `${projectPath}/.mcp.json / Claude project config`
  }
  return "~/.claude.json / ~/.claude/mcp.json"
}

function getGroupDisplayName(
  groupName: string,
  projectPath: string | null,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (groupName.toLowerCase() === "global" && !projectPath) {
    return t("settings.mcp.global")
  }
  return groupName
}

function CopyValueButton({ value }: { value: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      toast.error(t("terminal.failedCopy"))
    }
  }, [t, value])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="h-6 w-6 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 inline-flex items-center justify-center transition-colors"
      title={copied ? t("settings.mcp.copied") : t("settings.mcp.copyValue")}
      aria-label={copied ? t("settings.mcp.copied") : t("settings.mcp.copyValue")}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-xs text-foreground" title={value}>
        {value}
      </p>
    </div>
  )
}

function ConnectionRow({
  label,
  value,
  copyValue,
  mono = true,
  children,
}: {
  label: string
  value?: string
  copyValue?: string
  mono?: boolean
  children?: ReactNode
}) {
  const effectiveCopyValue = copyValue ?? value

  return (
    <div className="flex gap-3 px-3 py-2.5">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {children ?? (
            <span
              className={cn(
                "block text-xs text-foreground break-all select-text",
                mono && "font-mono",
              )}
            >
              {value}
            </span>
          )}
        </div>
        {effectiveCopyValue && <CopyValueButton value={effectiveCopyValue} />}
      </div>
    </div>
  )
}

// --- Detail Panel ---
function McpServerDetail({
  provider,
  groupName,
  projectPath,
  server,
  onAuth,
  onLogout,
  onRefresh,
  onDelete,
  onToggleEnabled,
  isEditable,
  isToggleable,
  isToggling,
  isRefreshing,
}: {
  provider: McpProvider
  groupName: string
  projectPath: string | null
  server: McpServer
  onAuth?: () => void
  onLogout?: () => void
  onRefresh?: () => void
  onDelete?: () => void
  onToggleEnabled?: (enabled: boolean) => void
  isEditable?: boolean
  isToggleable?: boolean
  isToggling?: boolean
  isRefreshing?: boolean
}) {
  const { t } = useI18n()
  const { tools, needsAuth } = server
  const hasTools = tools.length > 0
  const isConnected = server.status === "connected"
  const isDisabled = isServerDisabled(server)
  const connection = getConnectionInfo(server.config)
  const hideToolsCount = isCodexHttpServer(provider, server)
  const source = getConfigSource(provider, groupName, projectPath)
  const isPluginSource = groupName.toLowerCase().startsWith("plugin:")
  const providerLabel = provider === "codex" ? "Codex" : "Claude Code"
  const scopeLabel = isPluginSource
    ? t("common.plugin")
    : projectPath
      ? t("common.project")
      : t("settings.mcp.global")
  const statusLabel = isDisabled
    ? t("settings.mcp.disabled")
    : isConnected
      ? t("common.connected")
      : server.status === "failed"
        ? t("settings.mcp.failed")
        : server.status === "needs-auth"
          ? t("settings.mcp.needsAuth")
          : server.status === "pending"
            ? t("common.connecting")
            : server.status === "pending-approval"
              ? t("settings.mcp.pendingApproval")
              : getStatusText(server.status)
  const toolsSummary = hideToolsCount
    ? t("settings.mcp.tools")
    : hasTools
      ? tools.length === 1
        ? t("settings.mcp.oneTool")
        : t("settings.mcp.toolCount", { count: tools.length })
      : t("settings.mcp.noTools")

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="mt-1">
            <McpStatusDot status={server.status} disabled={isDisabled} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">{server.name}</h3>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t("settings.mcp.toolConnection")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {statusLabel} · {toolsSummary}
              {server.serverInfo?.version && ` \u00B7 v${server.serverInfo.version}`}
            </p>
          </div>
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isRefreshing && "animate-spin")} />
              {t("settings.mcp.refresh")}
            </Button>
          )}
          {needsAuth && onAuth && (
            <Button variant="secondary" size="sm" className="h-7 px-3 text-xs" onClick={onAuth}>
              {isConnected ? t("settings.mcp.reconnect") : t("settings.mcp.authenticate")}
            </Button>
          )}
          {onLogout && (
            <Button variant="outline" size="sm" className="h-7 px-3 text-xs" onClick={onLogout}>
              {t("settings.mcp.logout")}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SummaryItem label={t("settings.mcp.status")} value={statusLabel} />
          <SummaryItem label={t("settings.mcp.provider")} value={providerLabel} />
          <SummaryItem label={t("settings.mcp.scope")} value={scopeLabel} />
          <SummaryItem label={t("settings.mcp.source")} value={source} />
        </div>

        {/* Enable/Disable Toggle */}
        {isToggleable && onToggleEnabled && (
          <div className="flex items-center justify-between">
            <div>
              <h5 className="text-xs font-medium text-foreground">
                {t("settings.mcp.enabled")}
              </h5>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("settings.mcp.disableDescription")}
              </p>
            </div>
            <Switch
              checked={!isDisabled}
              onCheckedChange={onToggleEnabled}
              disabled={isToggling}
            />
          </div>
        )}

        {/* Connection Section */}
        <div>
          <h5 className="text-xs font-medium text-foreground mb-2">
            {t("settings.mcp.connection")}
          </h5>
          <div className="rounded-md border border-border bg-background overflow-hidden">
            <div className="divide-y divide-border">
              <ConnectionRow label={t("settings.mcp.type")} value={connection.type} />
              {connection.url && (
                <ConnectionRow label="URL" value={connection.url} />
              )}
              {connection.command && (
                <ConnectionRow label={t("settings.mcp.command")} value={connection.command} />
              )}
              {connection.args && connection.args.length > 0 && (
                <ConnectionRow
                  label={t("settings.mcp.args")}
                  copyValue={connection.args.join(" ")}
                >
                  <div className="flex flex-wrap gap-1">
                    {connection.args.map((arg) => (
                      <span
                        key={arg}
                        className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground select-text break-all"
                      >
                        {arg}
                      </span>
                    ))}
                  </div>
                </ConnectionRow>
              )}
              {connection.cwd && (
                <ConnectionRow label="Cwd" value={connection.cwd} />
              )}
              {connection.envKeys.length > 0 && (
                <ConnectionRow label="Env" copyValue={connection.envKeys.join(", ")}>
                  <div className="flex flex-wrap gap-1">
                    {connection.envKeys.map((key) => (
                      <span key={key} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground select-text">
                        {key}
                      </span>
                    ))}
                  </div>
                </ConnectionRow>
              )}
              {connection.headerKeys.length > 0 && (
                <ConnectionRow label="Headers" copyValue={connection.headerKeys.join(", ")}>
                  <div className="flex flex-wrap gap-1">
                    {connection.headerKeys.map((key) => (
                      <span key={key} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground select-text">
                        {key}
                      </span>
                    ))}
                  </div>
                </ConnectionRow>
              )}
            </div>
          </div>
        </div>

        {isConnected && !hasTools && !hideToolsCount && (
          <div className="rounded-md border border-border bg-muted/20 px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h5 className="text-xs font-medium text-foreground">
                  {t("settings.mcp.noToolsTitle")}
                </h5>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("settings.mcp.noToolsDescription")}
                </p>
              </div>
              {onRefresh && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isRefreshing && "animate-spin")} />
                  {t("settings.mcp.refreshTools")}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Error Section */}
        {server.error && (
          <div>
            <h5 className="text-xs font-medium text-red-500 mb-2">
              {t("settings.mcp.error")}
            </h5>
            <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
              <p className="text-xs text-red-400 font-mono break-all select-text">{server.error}</p>
            </div>
          </div>
        )}

        {/* Tools Section */}
        {hasTools && (
          <div>
            <h5 className="text-xs font-medium text-foreground mb-3">
              {hideToolsCount
                ? t("settings.mcp.tools")
                : t("settings.mcp.toolsWithCount", { count: tools.length })}
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

        {isEditable && onDelete && (
          <div className="pt-2 border-t border-border">
            <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h5 className="text-xs font-medium text-red-500">
                    {t("settings.mcp.dangerZone")}
                  </h5>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("settings.mcp.dangerZoneDescription")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  onClick={onDelete}
                  aria-label={t("settings.mcp.deleteServer")}
                  title={t("settings.mcp.deleteServer")}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  {t("settings.mcp.deleteServer")}
                </Button>
              </div>
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
  defaultProvider,
  projectPath,
  projectName,
}: {
  onCreated: () => void
  onCancel: () => void
  hasProject: boolean
  defaultProvider: McpProvider
  projectPath?: string
  projectName?: string
}) {
  const { t } = useI18n()
  const addClaudeServerMutation = trpc.claude.addMcpServer.useMutation()
  const addCodexServerMutation = trpc.codex.addMcpServer.useMutation()
  const [provider, setProvider] = useState<McpProvider>(defaultProvider)
  const isSaving =
    provider === "codex"
      ? addCodexServerMutation.isPending
      : addClaudeServerMutation.isPending
  const [name, setName] = useState("")
  const [type, setType] = useState<"stdio" | "http">("stdio")
  const [command, setCommand] = useState("")
  const [args, setArgs] = useState("")
  const [url, setUrl] = useState("")
  const [scope, setScope] = useState<"global" | "project">(
    defaultProvider === "claude-code" && hasProject ? "project" : "global",
  )
  const effectiveScope = provider === "codex" ? "global" : scope

  const canSave = name.trim().length > 0 && (effectiveScope !== "project" || !!projectPath) && (
    (type === "stdio" && command.trim().length > 0) ||
    (type === "http" && url.trim().length > 0)
  )

  const handleSubmit = async () => {
    const parsedArgs = args.trim() ? args.split(/\s+/) : undefined
    try {
      if (provider === "codex") {
        await addCodexServerMutation.mutateAsync({
          name: name.trim(),
          transport: type,
          command: type === "stdio" ? command.trim() : undefined,
          args: type === "stdio" ? parsedArgs : undefined,
          url: type === "http" ? url.trim() : undefined,
          scope: "global",
        })
      } else {
        await addClaudeServerMutation.mutateAsync({
          name: name.trim(),
          transport: type,
          command: type === "stdio" ? command.trim() : undefined,
          args: type === "stdio" ? parsedArgs : undefined,
          url: type === "http" ? url.trim() : undefined,
          scope: effectiveScope,
          ...(effectiveScope === "project" && projectPath ? { projectPath } : {}),
        })
      }
      toast.success(t("settings.mcp.toast.added", { name: name.trim() }))
      onCreated()
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.mcp.toast.failedToAddServer")
      toast.error(t("settings.mcp.toast.failedToAdd"), { description: message })
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              {t("settings.mcp.newServer")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("settings.mcp.createDescription")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!canSave || isSaving}>
              {isSaving ? t("settings.mcp.adding") : t("common.add")}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("settings.mcp.provider")}</Label>
          <Select
            value={provider}
            onValueChange={(v) => {
              const nextProvider = v as McpProvider
              setProvider(nextProvider)
              if (nextProvider === "codex") {
                setScope("global")
              } else if (hasProject) {
                setScope("project")
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="codex">OpenAI Codex</SelectItem>
              <SelectItem value="claude-code">Claude Code</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("settings.mcp.name")}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-server"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t("settings.mcp.transport")}</Label>
          <Select value={type} onValueChange={(v) => setType(v as "stdio" | "http")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio">{t("settings.mcp.transportStdio")}</SelectItem>
              <SelectItem value="http">{t("settings.mcp.transportHttpSse")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {type === "stdio" ? (
          <>
            <div className="space-y-1.5">
              <Label>{t("settings.mcp.command")}</Label>
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx, python, node..."
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.mcp.arguments")}</Label>
              <Input
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="-m mcp_server --port 3000"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                {t("settings.mcp.argumentsHint")}
              </p>
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

        {provider === "codex" ? (
          <div className="space-y-1.5">
            <Label>{t("settings.mcp.scope")}</Label>
            <Select value="global" disabled>
              <SelectTrigger disabled>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">
                  {t("settings.mcp.scopeCodexGlobal")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : hasProject && (
          <div className="space-y-1.5">
            <Label>{t("settings.mcp.scope")}</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "global" | "project")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">
                  {t("settings.mcp.scopeClaudeGlobal")}
                </SelectItem>
                <SelectItem value="project">
                  {projectName
                    ? t("settings.mcp.scopeProjectNamed", { project: projectName })
                    : t("common.project")}
                </SelectItem>
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
  const { t } = useI18n()
  const lastSelectedAgentId = useAtomValue(lastSelectedAgentIdAtom)
  const defaultAddProvider: McpProvider =
    lastSelectedAgentId === "codex" ? "codex" : "claude-code"
  const [selectedServerKey, setSelectedServerKey] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [deletingServer, setDeletingServer] = useState<{
    provider: McpProvider
    server: McpServer
    scope: ScopeType
    projectPath?: string | null
  } | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const providerSections = useMemo<ProviderSection[]>(
    () => [
      { provider: "claude-code", title: "CLAUDE CODE" },
      { provider: "codex", title: "CODEX" },
    ],
    [],
  )

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

  const claudeMcpQuery = trpc.claude.getAllMcpConfig.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  })
  const codexMcpQuery = trpc.codex.getAllMcpConfig.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  })
  const hasAnyData = Boolean(claudeMcpQuery.data || codexMcpQuery.data)
  const isLoadingConfig =
    !hasAnyData && (claudeMcpQuery.isLoading || codexMcpQuery.isLoading)
  const refreshClaudeMcpMutation = trpc.claude.refreshMcpConfig.useMutation()
  const refreshCodexMcpMutation = trpc.codex.refreshMcpConfig.useMutation()
  const isRefreshingConfig =
    claudeMcpQuery.isFetching ||
    codexMcpQuery.isFetching ||
    refreshClaudeMcpMutation.isPending ||
    refreshCodexMcpMutation.isPending

  const startClaudeOAuthMutation = trpc.claude.startMcpOAuth.useMutation()
  const startCodexOAuthMutation = trpc.codex.startMcpOAuth.useMutation()
  const logoutCodexMcpMutation = trpc.codex.logoutMcpServer.useMutation()
  const updateMutation = trpc.claude.updateMcpServer.useMutation()
  const removeClaudeMcpMutation = trpc.claude.removeMcpServer.useMutation()
  const removeCodexMcpMutation = trpc.codex.removeMcpServer.useMutation()

  const sortedGroupsByProvider = useMemo(() => {
    const statusOrder: Record<string, number> = {
      connected: 0,
      pending: 1,
      "needs-auth": 2,
      failed: 3,
    }

    const sortGroups = (
      groups: Array<{ groupName: string; projectPath: string | null; mcpServers: McpServer[] }>,
    ) =>
      groups.map((g) => ({
        ...g,
        mcpServers: [...g.mcpServers].sort(
          (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3),
        ),
      }))

    return {
      codex: sortGroups(codexMcpQuery.data?.groups || []),
      claudeCode: sortGroups(claudeMcpQuery.data?.groups || []),
    }
  }, [codexMcpQuery.data?.groups, claudeMcpQuery.data?.groups])

  const allListedServers = useMemo<ListedServer[]>(() => {
    return providerSections.flatMap((section) => {
      const groups =
        section.provider === "codex"
          ? sortedGroupsByProvider.codex
          : sortedGroupsByProvider.claudeCode

      return groups.flatMap((group) =>
        group.mcpServers.map((server) => ({
          key: `${section.provider}:${group.groupName}:${server.name}`,
          provider: section.provider,
          groupName: group.groupName,
          projectPath: group.projectPath,
          server,
        })),
      )
    })
  }, [providerSections, sortedGroupsByProvider])

  const filteredListedServers = useMemo(() => {
    if (!searchQuery.trim()) return allListedServers
    const q = searchQuery.toLowerCase()
    return allListedServers.filter((item) =>
      item.server.name.toLowerCase().includes(q),
    )
  }, [allListedServers, searchQuery])

  const filteredSections = useMemo(
    () =>
      providerSections
        .map((section) => ({
          ...section,
          servers: filteredListedServers.filter(
            (server) => server.provider === section.provider,
          ),
        }))
        .filter((section) => section.servers.length > 0),
    [providerSections, filteredListedServers],
  )

  const totalServers = allListedServers.length

  // Flat list of all server keys for keyboard navigation
  const allServerKeys = useMemo(
    () => filteredListedServers.map((server) => server.key),
    [filteredListedServers],
  )

  const { containerRef: listRef, onKeyDown: listKeyDown } = useListKeyboardNav({
    items: allServerKeys,
    selectedItem: selectedServerKey,
    onSelect: setSelectedServerKey,
  })

  // Auto-select first server when data loads (sorted, so connected first)
  useEffect(() => {
    if (selectedServerKey || isLoadingConfig) return
    const firstServer = allListedServers[0]
    if (firstServer) {
      setSelectedServerKey(firstServer.key)
    }
  }, [allListedServers, selectedServerKey, isLoadingConfig])

  // Find selected server
  const selectedServer = useMemo<ListedServer | null>(() => {
    if (!selectedServerKey) return null
    return (
      allListedServers.find((server) => server.key === selectedServerKey) || null
    )
  }, [selectedServerKey, allListedServers])

  const handleRefresh = useCallback(
    async (silent = false, targetProvider?: McpProvider) => {
      try {
        if (targetProvider === "codex") {
          await refreshCodexMcpMutation.mutateAsync()
          await codexMcpQuery.refetch({ cancelRefetch: false })
        } else if (targetProvider === "claude-code") {
          await refreshClaudeMcpMutation.mutateAsync()
          await claudeMcpQuery.refetch({ cancelRefetch: false })
        } else {
          await Promise.all([
            refreshCodexMcpMutation.mutateAsync(),
            refreshClaudeMcpMutation.mutateAsync(),
          ])
          await Promise.all([
            codexMcpQuery.refetch({ cancelRefetch: false }),
            claudeMcpQuery.refetch({ cancelRefetch: false }),
          ])
        }
        if (!silent) {
          toast.success(t("settings.mcp.toast.refreshed"))
        }
      } catch {
        if (!silent) {
          toast.error(t("settings.mcp.toast.failedToRefresh"))
        }
      }
    },
    [
      codexMcpQuery,
      claudeMcpQuery,
      refreshCodexMcpMutation,
      refreshClaudeMcpMutation,
      t,
    ],
  )


  const handleAuth = async (
    provider: McpProvider,
    serverName: string,
    projectPath: string | null,
  ) => {
    try {
      const result = provider === "codex"
        ? await startCodexOAuthMutation.mutateAsync({
            serverName,
            ...(projectPath ? { projectPath } : {}),
          })
        : await startClaudeOAuthMutation.mutateAsync({
            serverName,
            projectPath: projectPath ?? "__global__",
          })

      if (result.success) {
        toast.success(t("settings.mcp.toast.authenticated", { name: serverName }))
        // Plugin servers get promoted to Global after OAuth — update selection
          setSelectedServerKey(`${provider}:Global:${serverName}`)
        await handleRefresh(true, provider)
      } else {
        toast.error(result.error || t("settings.mcp.toast.authenticationFailed"))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.mcp.toast.authenticationFailed")
      toast.error(message)
    }
  }

  const handleCodexAuthLogout = async (
    serverName: string,
    projectPath?: string | null,
  ) => {
    try {
      const result = await logoutCodexMcpMutation.mutateAsync({
        serverName,
        ...(projectPath ? { projectPath } : {}),
      })
      if (result.success) {
        toast.success(t("settings.mcp.toast.loggedOut", { name: serverName }))
        await handleRefresh(true, "codex")
      } else {
        toast.error(result.error || t("settings.mcp.toast.logoutFailed"))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.mcp.toast.logoutFailed")
      toast.error(message)
    }
  }

  const handleToggleEnabled = async (item: ListedServer, enabled: boolean) => {
    if (item.provider !== "claude-code") return
    try {
      await updateMutation.mutateAsync({
        name: item.server.name,
        scope: getScopeFromServer(item),
        projectPath: item.projectPath ?? undefined,
        disabled: !enabled,
      })
      toast.success(
        enabled
          ? t("settings.mcp.toast.enabled", { name: item.server.name })
          : t("settings.mcp.toast.disabled", { name: item.server.name }),
      )
      await handleRefresh(true, "claude-code")
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.mcp.toast.failedToToggle")
      toast.error(message)
    }
  }

  const handleDelete = async () => {
    if (!deletingServer) return
    try {
      if (deletingServer.provider === "codex") {
        await removeCodexMcpMutation.mutateAsync({
          name: deletingServer.server.name,
          scope: "global",
        })
      } else {
        await removeClaudeMcpMutation.mutateAsync({
          name: deletingServer.server.name,
          scope: deletingServer.scope,
          projectPath: deletingServer.projectPath ?? undefined,
        })
      }
      toast.success(t("settings.mcp.toast.removed", { name: deletingServer.server.name }))
      setDeletingServer(null)
      setSelectedServerKey(null)
      await handleRefresh(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.mcp.toast.failedToRemove")
      toast.error(message)
    }
  }

  const canCodexLogout = (server: McpServer) => {
    const authStatus = String(
      (server.config as Record<string, unknown>).authStatus || "",
    )
      .trim()
      .toLowerCase()
    return authStatus === "o_auth" || authStatus === "bearer_token"
  }

  const isEditableServer = (item: ListedServer): boolean => {
    if (item.provider === "codex") {
      // Codex edit/delete currently supports global scope only.
      return !item.projectPath
    }
    return !item.groupName.toLowerCase().includes("plugin")
  }

  const getScopeFromServer = (item: ListedServer): ScopeType =>
    item.projectPath ? "project" : "global"

  const isToggleableServer = (item: ListedServer): boolean =>
    item.provider === "claude-code" &&
    !item.groupName.toLowerCase().includes("plugin")

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
          <div className="px-2 pt-2 flex-shrink-0 flex items-center">
            <input
              ref={searchInputRef}
              placeholder={t("settings.mcp.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={listKeyDown}
              className="h-7 w-full rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40 outline-none mr-1.5"
            />
            <button
              onClick={() => { setShowAddForm(true); setSelectedServerKey(null) }}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              title={t("settings.mcp.addServer")}
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={() => { void handleRefresh() }}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              title={t("settings.mcp.refreshServers")}
              aria-label={t("settings.mcp.refreshServers")}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshingConfig && "animate-spin")} />
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
                <p className="text-sm text-muted-foreground mb-1">
                  {t("settings.mcp.noServers")}
                </p>
                <p className="text-[11px] text-muted-foreground/70 mb-2">
                  {t("settings.mcp.emptyHint")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  {t("settings.mcp.addServer")}
                </Button>
              </div>
            ) : filteredListedServers.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-xs text-muted-foreground">
                  {t("settings.mcp.noResults")}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSections.map((section) => (
                  <div key={section.provider} className="space-y-0.5">
                    <div className="px-2 pb-1 pt-1">
                      <p className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">
                        {section.title}
                      </p>
                      <div className="mt-1 h-px bg-border" />
                    </div>
                    {section.servers.map((item) => {
                      const key = item.key
                      const server = item.server
                      const isDisabled = isServerDisabled(server)
                      const hideToolsCount = isCodexHttpServer(item.provider, server)
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
                              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                              <div className="flex items-center gap-1">
                                <span
                                  className={cn(
                                    "truncate block text-sm leading-tight flex-1",
                                    isDisabled && "opacity-50",
                                  )}
                                >
                                  {server.name}
                                </span>
                                <div className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">
                                  <McpStatusDot status={server.status} disabled={isDisabled} />
                                </div>
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60 min-w-0">
                                <span className="truncate flex-1 min-w-0">
                                  {getGroupDisplayName(item.groupName, item.projectPath, t)}
                                </span>
                                {server.status !== "pending" && (
                                  <span className="flex-shrink-0">
                                    {isDisabled
                                      ? t("settings.mcp.disabled")
                                      : server.status === "connected"
                                        ? (hideToolsCount
                                            ? t("common.connected")
                                            : server.tools.length === 1
                                              ? t("settings.mcp.oneTool")
                                              : t("settings.mcp.toolCount", { count: server.tools.length }))
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
            defaultProvider={defaultAddProvider}
            projectPath={selectedProject?.path}
            projectName={selectedProject?.name}
          />
        ) : selectedServer ? (
          <McpServerDetail
            provider={selectedServer.provider}
            groupName={selectedServer.groupName}
            projectPath={selectedServer.projectPath}
            server={selectedServer.server}
            onAuth={() =>
              handleAuth(
                selectedServer.provider,
                selectedServer.server.name,
                selectedServer.projectPath,
              )
            }
            onLogout={
              selectedServer.provider === "codex" && canCodexLogout(selectedServer.server)
                ? () => handleCodexAuthLogout(selectedServer.server.name, selectedServer.projectPath)
                : undefined
            }
            onRefresh={() => { void handleRefresh(false, selectedServer.provider) }}
            onDelete={
              isEditableServer(selectedServer)
                ? () =>
                    setDeletingServer({
                      provider: selectedServer.provider,
                      server: selectedServer.server,
                      scope: getScopeFromServer(selectedServer),
                      projectPath: selectedServer.projectPath,
                    })
                : undefined
            }
            onToggleEnabled={
              isToggleableServer(selectedServer)
                ? (enabled) => handleToggleEnabled(selectedServer, enabled)
                : undefined
            }
            isEditable={isEditableServer(selectedServer)}
            isToggleable={isToggleableServer(selectedServer)}
            isToggling={updateMutation.isPending}
            isRefreshing={isRefreshingConfig}
          />
        ) : isLoadingConfig ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <OriginalMCPIcon className="h-12 w-12 text-border mb-4" />
            <p className="text-sm font-medium text-foreground">
              {t("settings.mcp.pageTitle")}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-2 max-w-sm">
              {t("settings.mcp.pageDescription")}
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              {totalServers > 0
                ? t("settings.mcp.selectToView")
                : t("settings.mcp.noneConfigured")}
            </p>
            {totalServers === 0 && (
              <>
                <p className="text-xs text-muted-foreground/70 mt-2 max-w-sm">
                  {t("settings.mcp.emptyHint")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  {t("settings.mcp.addFirstServer")}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <DeleteServerConfirm
        open={!!deletingServer}
        onOpenChange={(open) => { if (!open) setDeletingServer(null) }}
        serverName={deletingServer?.server.name ?? ""}
        onConfirm={handleDelete}
        isDeleting={removeClaudeMcpMutation.isPending || removeCodexMcpMutation.isPending}
      />
    </div>
  )
}
