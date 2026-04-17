"use client"

import { useAtom, useSetAtom } from "jotai"
import {
  AlertCircle,
  AlignJustify,
  Copy,
  FolderOpen,
  PlugZap,
  RefreshCw,
  ServerCog,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Logo } from "../../components/ui/logo"
import {
  apiKeyOnboardingCompletedAtom,
  billingMethodAtom,
  codexApiKeyAtom,
  codexOnboardingAuthMethodAtom,
  codexOnboardingCompletedAtom,
  customClaudeConfigAtom,
  openCodexBackendConfigAtom,
} from "../../lib/atoms"
import { useIsMobile } from "../../lib/hooks/use-mobile"
import { trpc } from "../../lib/trpc"
import {
  agentsMobileViewModeAtom,
  agentsSidebarOpenAtom,
  desktopViewAtom,
} from "../agents/atoms"
import { lastSelectedAgentIdAtom } from "../agents/atoms"
import { bridgeOpenCodexBackendConfig } from "../onboarding/opencodex-backend-config"
import { OpenCodexBackendEditor } from "../onboarding/opencodex-backend-editor"

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "Not started"
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function getStatusVariant(
  status: "stopped" | "starting" | "ready" | "error" | null | undefined,
): "secondary" | "outline" | "destructive" {
  switch (status) {
    case "ready":
      return "secondary"
    case "error":
      return "destructive"
    default:
      return "outline"
  }
}

export function BackendControlView() {
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useAtom(agentsSidebarOpenAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const setMobileViewMode = useSetAtom(agentsMobileViewModeAtom)
  const [backendConfig, setBackendConfig] = useAtom(openCodexBackendConfigAtom)
  const setBillingMethod = useSetAtom(billingMethodAtom)
  const setApiKeyOnboardingCompleted = useSetAtom(apiKeyOnboardingCompletedAtom)
  const setCodexOnboardingCompleted = useSetAtom(codexOnboardingCompletedAtom)
  const setCodexOnboardingAuthMethod = useSetAtom(
    codexOnboardingAuthMethodAtom,
  )
  const setStoredCodexApiKey = useSetAtom(codexApiKeyAtom)
  const setStoredConfig = useSetAtom(customClaudeConfigAtom)
  const setLastSelectedAgentId = useSetAtom(lastSelectedAgentIdAtom)
  const [isRestartingHost, setIsRestartingHost] = useState(false)
  const trpcUtils = trpc.useUtils()
  const openFolderMutation = trpc.external.openInFinder.useMutation()
  const copyPathMutation = trpc.external.copyPath.useMutation()
  const disconnectRuntimeMutation = trpc.opencodex.disconnectRuntime.useMutation()
  const { data: backendSurface, isLoading: isBackendSurfaceLoading } =
    trpc.opencodex.getBackendSurface.useQuery()
  const { data: mcpConfig, isLoading: isMcpLoading } =
    trpc.opencodex.getAllMcpConfig.useQuery()

  const handleSidebarToggle = useCallback(() => {
    if (isMobile) {
      setDesktopView(null)
      setMobileViewMode("chats")
    } else {
      setSidebarOpen((current) => !current)
    }
  }, [isMobile, setDesktopView, setMobileViewMode, setSidebarOpen])

  const handleBackendConfigured = useCallback(
    async (normalizedConfig: typeof backendConfig) => {
      const bridge = bridgeOpenCodexBackendConfig(normalizedConfig)

      setBackendConfig(normalizedConfig)
      setBillingMethod(bridge.billingMethod)
      setApiKeyOnboardingCompleted(bridge.apiKeyOnboardingCompleted)
      setCodexOnboardingCompleted(bridge.codexOnboardingCompleted)
      setCodexOnboardingAuthMethod(bridge.codexOnboardingAuthMethod)
      setStoredCodexApiKey(bridge.codexApiKey)
      setStoredConfig(bridge.customClaudeConfig)
      setLastSelectedAgentId(bridge.lastSelectedAgentId)
      await Promise.all([
        trpcUtils.opencodex.getBackendSurface.invalidate(),
        trpcUtils.opencodex.getAllMcpConfig.invalidate(),
      ])
      toast.success("OpenCodex backend route updated")
    },
    [
      backendConfig,
      setApiKeyOnboardingCompleted,
      setBackendConfig,
      setBillingMethod,
      setCodexOnboardingAuthMethod,
      setCodexOnboardingCompleted,
      setLastSelectedAgentId,
      setStoredCodexApiKey,
      setStoredConfig,
      trpcUtils.opencodex.getAllMcpConfig,
      trpcUtils.opencodex.getBackendSurface,
    ],
  )

  const handleRestartHost = useCallback(async () => {
    setIsRestartingHost(true)
    try {
      const nextState = await window.desktopApi.restartBackendHost()
      await Promise.all([
        trpcUtils.opencodex.getBackendSurface.invalidate(),
        trpcUtils.opencodex.getAllMcpConfig.invalidate(),
      ])
      if (nextState.status !== "ready") {
        throw new Error(
          nextState.lastError || "OpenCodex backend host did not become ready.",
        )
      }
      toast.success("Local backend host restarted")
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to restart the local backend host.",
      )
    } finally {
      setIsRestartingHost(false)
    }
  }, [trpcUtils.opencodex.getAllMcpConfig, trpcUtils.opencodex.getBackendSurface])

  const handleDisconnectRuntime = useCallback(async () => {
    try {
      const result = await disconnectRuntimeMutation.mutateAsync()
      if (!result.success) {
        throw new Error("error" in result ? result.error : "Failed to disconnect runtime.")
      }
      await trpcUtils.opencodex.getBackendSurface.invalidate()
      toast.success("Runtime disconnected")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to disconnect runtime.",
      )
    }
  }, [disconnectRuntimeMutation, trpcUtils.opencodex.getBackendSurface])

  const openFolder = useCallback(
    async (path: string) => {
      try {
        await openFolderMutation.mutateAsync(path)
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to open folder.",
        )
      }
    },
    [openFolderMutation],
  )

  const copyPath = useCallback(
    async (path: string) => {
      try {
        await copyPathMutation.mutateAsync(path)
        toast.success("Path copied")
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to copy path.",
        )
      }
    },
    [copyPathMutation],
  )

  const hostState = backendSurface?.backendHost
  const hostPaths = backendSurface?.backendHostPaths
  const runtime = backendSurface?.runtime
  const integration = backendSurface?.integration
  const hostStatusVariant = getStatusVariant(hostState?.status)
  const mcpGroups = mcpConfig?.groups ?? []
  const mcpServerCount = useMemo(
    () =>
      mcpGroups.reduce((count, group) => count + (group.mcpServers?.length ?? 0), 0),
    [mcpGroups],
  )

  return (
    <div className="h-full overflow-y-auto px-4 md:px-6 py-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3">
            {(!sidebarOpen || isMobile) && (
              <button
                onClick={handleSidebarToggle}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                aria-label={isMobile ? "Back to chats" : "Toggle sidebar"}
                type="button"
              >
                <AlignJustify className="h-4 w-4" />
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Logo className="h-5 w-5" fill="white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  OpenCodex Backend
                </h1>
                <p className="text-sm text-muted-foreground">
                  Local-native control center for the hidden APP-Server and
                  OpenHarness route.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={hostStatusVariant}>
              {hostState?.status ?? "stopped"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRestartHost()}
              disabled={isRestartingHost}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4${isRestartingHost ? " animate-spin" : ""}`}
              />
              Restart Host
            </Button>
            {integration?.canDisconnect && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDisconnectRuntime()}
                disabled={disconnectRuntimeMutation.isPending}
              >
                <PlugZap className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.25fr,0.75fr]">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Runtime Surface
                </h2>
                <p className="text-xs text-muted-foreground">
                  The active local route, host lifecycle, and owned directories.
                </p>
              </div>
              {runtime && <Badge variant="outline">{runtime.title}</Badge>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Provider
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {runtime?.providerFamily ?? "Not configured"}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Model
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {backendSurface?.backendConfig && "model" in backendSurface.backendConfig
                    ? backendSurface.backendConfig.model
                    : "Not configured"}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Started
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {formatTimestamp(hostState?.startedAt)}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Last Event
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {hostState?.lastEventType ?? "No event yet"}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                {
                  label: "Config directory",
                  value: hostPaths?.configDir,
                },
                {
                  label: "Data directory",
                  value: hostPaths?.dataDir,
                },
                {
                  label: "Logs directory",
                  value: hostPaths?.logsDir,
                },
                {
                  label: "Owned root",
                  value: hostPaths?.rootDir,
                },
              ].map((entry) => (
                <div
                  key={entry.label}
                  className="rounded-xl border border-border/70 bg-background px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        {entry.label}
                      </p>
                      <p className="mt-2 break-all text-sm text-foreground">
                        {entry.value ?? "Unavailable"}
                      </p>
                    </div>
                    {entry.value && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void copyPath(entry.value!)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void openFolder(entry.value!)}
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {hostState?.lastError && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="break-words">{hostState.lastError}</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <ServerCog className="h-4 w-4 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Backend Inventory
                </h2>
                <p className="text-xs text-muted-foreground">
                  Native capabilities exposed through the local backend.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Runtime session
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {integration?.isConnected ? "Connected" : "Waiting for route"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {integration?.state ?? "No runtime yet"}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  MCP servers
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {isMcpLoading ? "Loading…" : `${mcpServerCount} configured`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {mcpGroups.length > 0
                    ? `${mcpGroups.length} scope group${mcpGroups.length === 1 ? "" : "s"}`
                    : "No MCP scopes yet"}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Process
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {hostState?.pid ? `PID ${hostState.pid}` : "No active PID"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The desktop shell owns the backend host lifecycle.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">
              MCP Scope Summary
            </h2>
            <p className="text-xs text-muted-foreground">
              Each backend-side MCP scope is surfaced here without exposing a
              terminal workflow.
            </p>
          </div>

          {isMcpLoading ? (
            <p className="text-sm text-muted-foreground">Loading MCP groups…</p>
          ) : mcpGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No MCP servers configured for this backend route yet.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {mcpGroups.map((group) => (
                <div
                  key={`${group.groupName}:${group.projectPath ?? "global"}`}
                  className="rounded-xl border border-border/70 bg-background px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {group.groupName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {group.projectPath ?? "Global scope"}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {group.mcpServers.length} server
                      {group.mcpServers.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {group.mcpServers.length > 0 ? (
                      group.mcpServers.map((server) => {
                        const name =
                          typeof server.name === "string"
                            ? server.name
                            : "Unnamed MCP server"
                        return (
                          <Badge key={name} variant="secondary">
                            {name}
                          </Badge>
                        )
                      })
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No servers in this scope.
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <OpenCodexBackendEditor
          variant="settings"
          initialConfig={backendConfig}
          onConfigured={handleBackendConfigured}
        />

        {isBackendSurfaceLoading && (
          <p className="text-xs text-muted-foreground">
            Refreshing backend surface…
          </p>
        )}
      </div>
    </div>
  )
}
