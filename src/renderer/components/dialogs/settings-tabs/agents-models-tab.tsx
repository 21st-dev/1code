import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  agentsSettingsDialogOpenAtom,
  anthropicOnboardingCompletedAtom,
  customClaudeConfigAtom,
  autoOfflineModeAtom,
  showOfflineModeFeaturesAtom,
  type CustomClaudeConfig,
} from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Switch } from "../../ui/switch"

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

const EMPTY_CONFIG: CustomClaudeConfig = {
  model: "",
  token: "",
  baseUrl: "",
}

export function AgentsModelsTab() {
  const [storedConfig, setStoredConfig] = useAtom(customClaudeConfigAtom)
  const [model, setModel] = useState(storedConfig.model)
  const [baseUrl, setBaseUrl] = useState(storedConfig.baseUrl)
  const [token, setToken] = useState(storedConfig.token)
  const [autoOffline, setAutoOffline] = useAtom(autoOfflineModeAtom)
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom,
  )
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const isNarrowScreen = useIsNarrowScreen()
  const disconnectClaudeCode = trpc.claudeCode.disconnect.useMutation()
  const { data: claudeCodeIntegration, isLoading: isClaudeCodeLoading } =
    trpc.claudeCode.getIntegration.useQuery()
  const isClaudeCodeConnected = claudeCodeIntegration?.isConnected

  // Get Ollama status
  const { data: ollamaStatus } = trpc.ollama.getStatus.useQuery(undefined, {
    refetchInterval: 30000, // Refresh every 30s
  })

  // Check if offline features should be visible (debug flag)
  const showOfflineFeatures = useAtomValue(showOfflineModeFeaturesAtom)

  useEffect(() => {
    setModel(storedConfig.model)
    setBaseUrl(storedConfig.baseUrl)
    setToken(storedConfig.token)
  }, [storedConfig.model, storedConfig.baseUrl, storedConfig.token])

  const trimmedModel = model.trim()
  const trimmedBaseUrl = baseUrl.trim()
  const trimmedToken = token.trim()
  const canSave = Boolean(trimmedModel && trimmedBaseUrl && trimmedToken)
  const canReset = Boolean(trimmedModel || trimmedBaseUrl || trimmedToken)

  const handleSave = () => {
    if (!canSave) {
      toast.error("Fill model, token, and base URL to save")
      return
    }
    const nextConfig: CustomClaudeConfig = {
      model: trimmedModel,
      token: trimmedToken,
      baseUrl: trimmedBaseUrl,
    }

    setStoredConfig(nextConfig)
    toast.success("Model settings saved")
  }

  const handleReset = () => {
    setStoredConfig(EMPTY_CONFIG)
    setModel("")
    setBaseUrl("")
    setToken("")
    toast.success("Model settings reset")
  }

  const handleClaudeCodeSetup = () => {
    disconnectClaudeCode.mutate()
    setSettingsOpen(false)
    setAnthropicOnboardingCompleted(false)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header - hidden on narrow screens since it's in the navigation bar */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Models</h3>
          <p className="text-xs text-muted-foreground">
            Configure model overrides and Claude Code authentication
          </p>
        </div>
      )}

      {/* Offline Mode Section - only show if debug flag enabled */}
      {showOfflineFeatures && (
        <div className="space-y-2">
          <div className="pb-2">
            <h4 className="text-sm font-medium text-foreground">Offline Mode</h4>
          </div>

          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="p-4 space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground">
                    Ollama Status
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {ollamaStatus?.ollama.available
                      ? `Running - ${ollamaStatus.ollama.models.length} model${ollamaStatus.ollama.models.length !== 1 ? 's' : ''} installed`
                      : 'Not running or not installed'}
                  </p>
                  {ollamaStatus?.ollama.recommendedModel && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Recommended: {ollamaStatus.ollama.recommendedModel}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {ollamaStatus?.ollama.available ? (
                    <span className="text-green-600 text-sm font-medium">● Available</span>
                  ) : (
                    <span className="text-muted-foreground text-sm">○ Unavailable</span>
                  )}
                </div>
              </div>

              {/* Auto-fallback toggle */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground">
                    Auto Offline Mode
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Automatically use Ollama when internet is unavailable
                  </p>
                </div>
                <Switch
                  checked={autoOffline}
                  onCheckedChange={setAutoOffline}
                />
              </div>

              {/* Info message */}
              {!ollamaStatus?.ollama.available && (
                <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
                  <p className="font-medium mb-1">To enable offline mode:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Install Ollama from <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="underline">ollama.com</a></li>
                    <li>Run: <code className="bg-background px-1 py-0.5 rounded">ollama pull qwen2.5-coder:7b</code></li>
                    <li>Ollama will run automatically in the background</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Claude Code</h4>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-foreground">
                Claude Code Connection
              </span>
              {isClaudeCodeLoading ? (
                <span className="text-xs text-muted-foreground">
                  Checking...
                </span>
              ) : isClaudeCodeConnected ? (
                claudeCodeIntegration?.connectedAt ? (
                  <span className="text-xs text-muted-foreground">
                    Connected on{" "}
                    {new Date(
                      claudeCodeIntegration.connectedAt,
                    ).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Connected
                  </span>
                )
              ) : (
                <span className="text-xs text-muted-foreground">
                  Not connected yet
                </span>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleClaudeCodeSetup}
              disabled={disconnectClaudeCode.isPending || isClaudeCodeLoading}
            >
              {isClaudeCodeConnected ? "Reconnect" : "Connect"}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">
            Override Model
          </h4>
        </div>
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-6">

          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">Model name</Label>
              <p className="text-xs text-muted-foreground">
                Model identifier to use for requests
              </p>
            </div>
            <div className="flex-shrink-0 w-80">
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full"
                placeholder="claude-3-7-sonnet-20250219"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">API token</Label>
              <p className="text-xs text-muted-foreground">
                ANTHROPIC_AUTH_TOKEN env
              </p>
            </div>
            <div className="flex-shrink-0 w-80">
              <Input
                type="password"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value)
                }}
                className="w-full"
                placeholder="sk-ant-..."
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">Base URL</Label>
              <p className="text-xs text-muted-foreground">
                ANTHROPIC_BASE_URL env
              </p>
            </div>
            <div className="flex-shrink-0 w-80">
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full"
                placeholder="https://api.anthropic.com"
              />
            </div>
          </div>
        </div>

        <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-2 border-t">
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={!canReset} className="hover:bg-red-500/10 hover:text-red-600">
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </div>
        </div>
      </div>
    </div>
  )
}
