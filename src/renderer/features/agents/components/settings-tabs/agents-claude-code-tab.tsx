"use client"

import { trpc } from "../../../../lib/trpc"
import { useState, useEffect } from "react"
import { Button } from "../../../../components/ui/button"
import { Input } from "../../../../components/ui/input"
import { Label } from "../../../../components/ui/label"
import { IconSpinner } from "../../../../components/ui/icons"
import { ExternalLink, Check, X, Copy } from "lucide-react"
import { toast } from "sonner"
import { useHaptic } from "../../hooks/use-haptic"

type AuthFlowState =
  | { step: "idle" }
  | { step: "starting" }
  | {
      step: "waiting_url"
      sandboxId: string
      sandboxUrl: string
      sessionId: string
    }
  | {
      step: "has_url"
      sandboxId: string
      oauthUrl: string
      sandboxUrl: string
      sessionId: string
    }
  | { step: "submitting" }
  | { step: "error"; message: string }

export function AgentsClaudeCodeTab() {
  const [flowState, setFlowState] = useState<AuthFlowState>({ step: "idle" })
  const [authCode, setAuthCode] = useState("")
  const [copied, setCopied] = useState(false)
  // Advanced settings state
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const [customBinaryPath, setCustomBinaryPath] = useState("")
  const [envVarsText, setEnvVarsText] = useState("")
  // Config dir and MCP servers state
  const [customConfigDir, setCustomConfigDir] = useState("")
  const [mcpServers, setMcpServers] = useState<Array<{
    id: string
    name: string
    description: string
    enabled: boolean
  }>>([])
  // Auth mode state
  const [authMode, setAuthMode] = useState<"oauth" | "aws" | "apiKey">("oauth")
  const [apiKey, setApiKey] = useState("")
  const [bedrockRegion, setBedrockRegion] = useState("us-east-1")
  const { trigger: triggerHaptic } = useHaptic()

  const utils = trpc.useUtils()

  // Query integration status (local SQLite)
  const {
    data: integration,
    isLoading,
    error,
    refetch,
  } = trpc.claudeCode.getIntegration.useQuery()

  // Query Claude Code settings
  const {
    data: claudeSettings,
    isLoading: settingsLoading,
    refetch: refetchSettings,
  } = trpc.claudeSettings.getSettings.useQuery()

  // Query MCP servers
  const { data: mcpData, refetch: refetchMcp } = trpc.claudeSettings.listMcpServers.useQuery()

  // Update settings mutation
  const updateSettings = trpc.claudeSettings.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings saved")
      refetchSettings()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save settings")
    },
  })

  // Start auth mutation
  const startAuth = trpc.claudeCode.startAuth.useMutation({
    onSuccess: (data) => {
      setFlowState({
        step: "waiting_url",
        sandboxId: data.sandboxId,
        sandboxUrl: data.sandboxUrl,
        sessionId: data.sessionId,
      })
    },
    onError: (error) => {
      setFlowState({ step: "error", message: error.message })
      toast.error(error.message || "Failed to start authentication")
    },
  })

  // Poll for auth status (directly from sandbox)
  const { data: authStatus } = trpc.claudeCode.pollStatus.useQuery(
    {
      sandboxUrl: flowState.step === "waiting_url" ? flowState.sandboxUrl : "",
      sessionId: flowState.step === "waiting_url" ? flowState.sessionId : "",
    },
    {
      enabled: flowState.step === "waiting_url",
      refetchInterval: 1500,
      refetchIntervalInBackground: true,
    }
  )

  // Submit code mutation
  const submitCode = trpc.claudeCode.submitCode.useMutation({
    onSuccess: () => {
      toast.success("Claude Code connected successfully!")
      setFlowState({ step: "idle" })
      setAuthCode("")
      refetch()
      utils.claudeCode.getIntegration.invalidate()
    },
    onError: (error) => {
      setFlowState({ step: "error", message: error.message })
      toast.error(error.message || "Failed to complete authentication")
    },
  })

  // Disconnect mutation
  const disconnect = trpc.claudeCode.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Claude Code disconnected")
      refetch()
      utils.claudeCode.getIntegration.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to disconnect")
    },
  })

  // Open URL mutation (uses Electron shell.openExternal)
  const openOAuthUrl = trpc.claudeCode.openOAuthUrl.useMutation()

  // Update flow state when OAuth URL is ready
  useEffect(() => {
    if (
      flowState.step === "waiting_url" &&
      authStatus?.oauthUrl
    ) {
      setFlowState({
        step: "has_url",
        sandboxId: flowState.sandboxId,
        oauthUrl: authStatus.oauthUrl,
        sandboxUrl: flowState.sandboxUrl,
        sessionId: flowState.sessionId,
      })
    }
  }, [authStatus, flowState])

  // Sync form with settings
  useEffect(() => {
    if (claudeSettings) {
      setCustomBinaryPath(claudeSettings.customBinaryPath || "")
      setCustomConfigDir(claudeSettings.customConfigDir || "")
      setEnvVarsText(
        Object.entries(claudeSettings.customEnvVars)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n") || ""
      )
      setAuthMode(claudeSettings.authMode || "oauth")
      setBedrockRegion(claudeSettings.bedrockRegion || "us-east-1")
      // Don't set API key from masked value - user needs to enter it
    }
  }, [claudeSettings])

  // Sync MCP servers from query
  useEffect(() => {
    if (mcpData?.servers) {
      setMcpServers(mcpData.servers)
    }
  }, [mcpData])

  const handleStartAuth = () => {
    setFlowState({ step: "starting" })
    startAuth.mutate()
  }

  const handleSubmitCode = () => {
    if (!authCode.trim() || flowState.step !== "has_url") return

    setFlowState({ step: "submitting" })
    submitCode.mutate({
      sandboxUrl: flowState.sandboxUrl,
      sessionId: flowState.sessionId,
      code: authCode.trim(),
    })
  }

  const handleCancel = () => {
    setFlowState({ step: "idle" })
    setAuthCode("")
  }

  const handleCopyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url)
    triggerHaptic("medium")
    setCopied(true)
    toast.success("URL copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenUrl = (url: string) => {
    openOAuthUrl.mutate(url)
  }

  const handleDisconnect = () => {
    disconnect.mutate()
  }

  // Parse env vars from text format (KEY=VALUE, one per line)
  const parseEnvVars = (text: string): Record<string, string> => {
    const result: Record<string, string> = {}
    for (const line of text.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eqIndex = trimmed.indexOf("=")
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim()
        const value = trimmed.slice(eqIndex + 1).trim()
        if (key) {
          result[key] = value
        }
      }
    }
    return result
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <IconSpinner className="h-6 w-6" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Error</h2>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </div>
    )
  }

  const isConnected = integration?.isConnected

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between pb-3 mb-4">
            <h3 className="text-sm font-medium text-foreground">Claude Code</h3>
          </div>

          <p className="text-sm text-muted-foreground">
            Connect your Claude Code account to enable AI-powered coding
            assistance.
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-6">
            {/* Auth Mode Selector */}
            <div className="space-y-3 pb-4 border-b border-border">
              <Label className="text-sm font-medium">Authentication Mode</Label>
              <div className="flex gap-2">
                <Button
                  variant={authMode === "oauth" ? "default" : "outline"}
                  onClick={() => setAuthMode("oauth")}
                  className="flex-1"
                  size="sm"
                >
                  OAuth
                </Button>
                <Button
                  variant={authMode === "aws" ? "default" : "outline"}
                  onClick={() => setAuthMode("aws")}
                  className="flex-1"
                  size="sm"
                >
                  AWS Bedrock
                </Button>
                <Button
                  variant={authMode === "apiKey" ? "default" : "outline"}
                  onClick={() => setAuthMode("apiKey")}
                  className="flex-1"
                  size="sm"
                >
                  API Key
                </Button>
              </div>

              {/* API Key Input - only show in apiKey mode */}
              {authMode === "apiKey" && (
                <div className="space-y-2 pt-2">
                  <Label className="text-sm">Anthropic API Key</Label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-api03-..."
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your API key is encrypted and stored locally. Only used when API Key mode is selected.
                  </p>
                </div>
              )}

              {/* Bedrock Region Selector - only show in aws mode */}
              {authMode === "aws" && (
                <div className="space-y-2 pt-2">
                  <Label className="text-sm">Bedrock Region</Label>
                  <Input
                    value={bedrockRegion}
                    onChange={(e) => setBedrockRegion(e.target.value)}
                    placeholder="us-east-1"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    AWS region for Bedrock (e.g., us-east-1, eu-central-1)
                  </p>
                </div>
              )}

              {/* Save Auth Settings Button */}
              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  onClick={() => {
                    updateSettings.mutate({
                      authMode,
                      ...(authMode === "apiKey" && apiKey && { apiKey }),
                      bedrockRegion,
                    })
                  }}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending && (
                    <IconSpinner className="h-4 w-4 mr-2" />
                  )}
                  Save Auth Settings
                </Button>
              </div>
            </div>

            {/* Connected State - OAuth mode only */}
            {isConnected && authMode === "oauth" && flowState.step === "idle" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Connected (OAuth)
                    </p>
                    {integration?.connectedAt && (
                      <p className="text-xs text-muted-foreground">
                        Connected on{" "}
                        {new Date(integration.connectedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={disconnect.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  {disconnect.isPending && (
                    <IconSpinner className="h-4 w-4 mr-2" />
                  )}
                  Disconnect
                </Button>
              </div>
            )}

            {/* AWS Mode Status */}
            {authMode === "aws" && flowState.step === "idle" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      AWS Bedrock Mode
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Region: {bedrockRegion || "us-east-1"}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ensure you have AWS credentials configured (env vars or ~/.aws/credentials file)
                </p>
              </div>
            )}

            {/* API Key Mode Status */}
            {authMode === "apiKey" && flowState.step === "idle" && (
              <div className="space-y-4">
                {apiKey ? (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        API Key Configured
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Using encrypted API key storage
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enter an API key above to continue
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Not Connected - OAuth Mode Only */}
            {!isConnected && authMode === "oauth" && flowState.step === "idle" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">Not connected (OAuth)</p>
                </div>

                <Button onClick={handleStartAuth}>Connect Claude Code</Button>
              </div>
            )}

            {/* Starting State */}
            {flowState.step === "starting" && (
              <div className="flex items-center gap-3">
                <IconSpinner className="h-5 w-5" />
                <p className="text-sm text-muted-foreground">
                  Setting up authentication...
                </p>
              </div>
            )}

            {/* Waiting for URL State */}
            {flowState.step === "waiting_url" && (
              <div className="flex items-center gap-3">
                <IconSpinner className="h-5 w-5" />
                <p className="text-sm text-muted-foreground">
                  Preparing authentication URL...
                </p>
              </div>
            )}

            {/* Has URL State - Auth Flow */}
            {flowState.step === "has_url" && (
              <div className="space-y-6">
                {/* Step 1: Open URL */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    1. Open this URL to authenticate with Claude
                  </Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 bg-muted rounded-md text-xs font-mono truncate">
                      {flowState.oauthUrl}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyUrl(flowState.oauthUrl)}
                    >
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleOpenUrl(flowState.oauthUrl)}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Open
                    </Button>
                  </div>
                </div>

                {/* Step 2: Enter Code */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    2. After logging in, paste the code you received
                  </Label>
                  <Input
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    placeholder="Paste your authentication code here..."
                    className="font-mono"
                  />
                </div>
              </div>
            )}

            {/* Submitting State */}
            {flowState.step === "submitting" && (
              <div className="flex items-center gap-3">
                <IconSpinner className="h-5 w-5" />
                <p className="text-sm text-muted-foreground">
                  Verifying authentication...
                </p>
              </div>
            )}

            {/* Error State */}
            {flowState.step === "error" && (
              <div className="space-y-4">
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-sm text-destructive">{flowState.message}</p>
                </div>
                <Button onClick={handleStartAuth}>Try Again</Button>
              </div>
            )}
          </div>

          {/* Footer with Action Buttons */}
          {flowState.step === "has_url" && (
            <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-3 border-t">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitCode}
                disabled={!authCode.trim()}
              >
                Submit Code
              </Button>
            </div>
          )}
        </div>

        {/* Advanced Settings Section */}
        {isConnected && (
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setSettingsExpanded(!settingsExpanded)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
            >
              <span className="text-sm font-medium">Advanced Settings</span>
              <span className="text-muted-foreground">
                {settingsExpanded ? "▼" : "▶"}
              </span>
            </button>
            {settingsExpanded && (
              <div className="p-4 pt-0 space-y-4 border-t border-border">
                {/* Custom Binary Path */}
                <div className="space-y-2">
                  <Label className="text-sm">Custom Claude Binary Path</Label>
                  <Input
                    value={customBinaryPath}
                    onChange={(e) => setCustomBinaryPath(e.target.value)}
                    placeholder="/usr/local/bin/claude or leave empty for bundled"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the bundled Claude binary. Specify an absolute path to use your own build.
                  </p>
                </div>

                {/* Custom Environment Variables */}
                <div className="space-y-2">
                  <Label className="text-sm">Custom Environment Variables</Label>
                  <textarea
                    value={envVarsText}
                    onChange={(e) => setEnvVarsText(e.target.value)}
                    placeholder="ANTHROPIC_MODEL=claude-sonnet-4-5-20250514&#10;CLAUDE_DEFAULT_MODEL=claude-sonnet-4-5-20250514"
                    className="w-full min-h-[100px] p-2 text-sm font-mono bg-muted rounded-md border border-border resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    One variable per line in KEY=VALUE format. These affect Claude's settings.json behavior.
                  </p>
                </div>

                {/* Custom Config Directory */}
                <div className="space-y-2">
                  <Label className="text-sm">Claude Config Directory</Label>
                  <Input
                    value={customConfigDir}
                    onChange={(e) => setCustomConfigDir(e.target.value)}
                    placeholder="Leave empty for per-chat isolation (default)"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Controls where Claude stores skills, agents, and settings.
                    Leave empty for isolated per-chat storage (default).
                    Use ~/.claude to share with your terminal Claude.
                  </p>
                </div>

                {/* MCP Servers */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">MCP Servers</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refetchMcp()}
                      className="h-6 px-2"
                    >
                      Refresh
                    </Button>
                  </div>
                  {mcpServers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No MCP servers found in ~/.claude/
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {mcpServers.map((server) => (
                        <div
                          key={server.id}
                          className="flex items-center justify-between p-2 bg-muted rounded-md"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{server.name}</p>
                            {server.description && (
                              <p className="text-xs text-muted-foreground truncate">
                                {server.description}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              const updated = mcpServers.map((s) =>
                                s.id === server.id
                                  ? { ...s, enabled: !s.enabled }
                                  : s
                              )
                              setMcpServers(updated)
                              updateSettings.mutate({
                                mcpServerSettings: updated.reduce(
                                  (acc, s) => ({
                                    ...acc,
                                    [s.id]: { enabled: s.enabled },
                                  }),
                                  {},
                                ),
                              })
                            }}
                            className={`ml-2 px-2 py-1 text-xs rounded-md transition-colors ${
                              server.enabled
                                ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {server.enabled ? "Enabled" : "Disabled"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    MCP servers extend Claude's capabilities. Toggle to enable/disable for this app.
                  </p>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      updateSettings.mutate({
                        customBinaryPath: customBinaryPath || null,
                        customEnvVars: parseEnvVars(envVarsText),
                        customConfigDir: customConfigDir || null,
                        mcpServerSettings: mcpServers.reduce(
                          (acc, s) => ({
                            ...acc,
                            [s.id]: { enabled: s.enabled },
                          }),
                          {},
                        ),
                      })
                    }}
                    disabled={updateSettings.isPending}
                  >
                    {updateSettings.isPending && (
                      <IconSpinner className="h-4 w-4 mr-2" />
                    )}
                    Save Settings
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
