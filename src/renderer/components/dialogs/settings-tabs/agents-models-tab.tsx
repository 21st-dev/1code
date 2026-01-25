import { useAtom, useSetAtom } from "jotai"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  agentsSettingsDialogOpenAtom,
  anthropicOnboardingCompletedAtom,
  openaiApiKeyAtom,
  anthropicApiKeyConfigAtom,
  customProviderConfigAtom,
  type AnthropicApiKeyConfig,
  type CustomProviderConfig,
} from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"

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

const EMPTY_ANTHROPIC_CONFIG: AnthropicApiKeyConfig = {
  token: "",
  baseUrl: "",
}

const EMPTY_CUSTOM_CONFIG: CustomProviderConfig = {
  model: "",
  token: "",
  baseUrl: "",
}

export function AgentsModelsTab() {
  const [storedAnthropicConfig, setStoredAnthropicConfig] = useAtom(anthropicApiKeyConfigAtom)
  const [anthropicToken, setAnthropicToken] = useState(storedAnthropicConfig.token)
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState(storedAnthropicConfig.baseUrl)

  const [storedCustomConfig, setStoredCustomConfig] = useAtom(customProviderConfigAtom)
  const [customModel, setCustomModel] = useState(storedCustomConfig.model)
  const [customToken, setCustomToken] = useState(storedCustomConfig.token)
  const [customBaseUrl, setCustomBaseUrl] = useState(storedCustomConfig.baseUrl)

  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom,
  )
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const isNarrowScreen = useIsNarrowScreen()
  const disconnectClaudeCode = trpc.claudeCode.disconnect.useMutation()
  const { data: claudeCodeIntegration, isLoading: isClaudeCodeLoading } =
    trpc.claudeCode.getIntegration.useQuery()
  const isClaudeCodeConnected = claudeCodeIntegration?.isConnected

  // OpenAI API key state
  const [storedOpenAIKey, setStoredOpenAIKey] = useAtom(openaiApiKeyAtom)
  const [openaiKey, setOpenaiKey] = useState(storedOpenAIKey)
  const setOpenAIKeyMutation = trpc.voice.setOpenAIKey.useMutation()
  const trpcUtils = trpc.useUtils()

  useEffect(() => {
    setAnthropicToken(storedAnthropicConfig.token)
    setAnthropicBaseUrl(storedAnthropicConfig.baseUrl)
  }, [storedAnthropicConfig.token, storedAnthropicConfig.baseUrl])

  useEffect(() => {
    setCustomModel(storedCustomConfig.model)
    setCustomToken(storedCustomConfig.token)
    setCustomBaseUrl(storedCustomConfig.baseUrl)
  }, [storedCustomConfig.model, storedCustomConfig.token, storedCustomConfig.baseUrl])

  useEffect(() => {
    setOpenaiKey(storedOpenAIKey)
  }, [storedOpenAIKey])

  const trimmedAnthropicToken = anthropicToken.trim()
  const trimmedAnthropicBaseUrl = anthropicBaseUrl.trim()
  const canSaveAnthropic = Boolean(trimmedAnthropicToken)
  const canResetAnthropic = Boolean(trimmedAnthropicToken || trimmedAnthropicBaseUrl)

  const handleSaveAnthropic = () => {
    if (!canSaveAnthropic) {
      toast.error("Enter an API token to save")
      return
    }
    const nextConfig: AnthropicApiKeyConfig = {
      token: trimmedAnthropicToken,
      baseUrl: trimmedAnthropicBaseUrl,
    }
    setStoredAnthropicConfig(nextConfig)
    toast.success("Anthropic API key saved")
  }

  const handleResetAnthropic = () => {
    setStoredAnthropicConfig(EMPTY_ANTHROPIC_CONFIG)
    setAnthropicToken("")
    setAnthropicBaseUrl("")
    toast.success("Anthropic API key removed")
  }

  const trimmedCustomModel = customModel.trim()
  const trimmedCustomToken = customToken.trim()
  const trimmedCustomBaseUrl = customBaseUrl.trim()
  const canSaveCustom = Boolean(trimmedCustomModel && trimmedCustomToken && trimmedCustomBaseUrl)
  const canResetCustom = Boolean(trimmedCustomModel || trimmedCustomToken || trimmedCustomBaseUrl)

  const handleSaveCustom = () => {
    if (!canSaveCustom) {
      toast.error("Fill model, token, and base URL to save")
      return
    }
    const nextConfig: CustomProviderConfig = {
      model: trimmedCustomModel,
      token: trimmedCustomToken,
      baseUrl: trimmedCustomBaseUrl,
    }
    setStoredCustomConfig(nextConfig)
    toast.success("Custom provider settings saved")
  }

  const handleResetCustom = () => {
    setStoredCustomConfig(EMPTY_CUSTOM_CONFIG)
    setCustomModel("")
    setCustomToken("")
    setCustomBaseUrl("")
    toast.success("Custom provider settings reset")
  }

  const handleClaudeCodeSetup = () => {
    disconnectClaudeCode.mutate()
    setSettingsOpen(false)
    setAnthropicOnboardingCompleted(false)
  }

  // OpenAI key handlers
  const trimmedOpenAIKey = openaiKey.trim()
  const canSaveOpenAI = trimmedOpenAIKey !== storedOpenAIKey
  const canResetOpenAI = !!trimmedOpenAIKey

  const handleSaveOpenAI = async () => {
    if (trimmedOpenAIKey && !trimmedOpenAIKey.startsWith("sk-")) {
      toast.error("Invalid OpenAI API key format. Key should start with 'sk-'")
      return
    }

    try {
      await setOpenAIKeyMutation.mutateAsync({ key: trimmedOpenAIKey })
      setStoredOpenAIKey(trimmedOpenAIKey)
      // Invalidate voice availability check
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success("OpenAI API key saved")
    } catch (err) {
      toast.error("Failed to save OpenAI API key")
    }
  }

  const handleResetOpenAI = async () => {
    try {
      await setOpenAIKeyMutation.mutateAsync({ key: "" })
      setStoredOpenAIKey("")
      setOpenaiKey("")
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success("OpenAI API key removed")
    } catch (err) {
      toast.error("Failed to remove OpenAI API key")
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header - hidden on narrow screens since it's in the navigation bar */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Models</h3>
          <p className="text-xs text-muted-foreground">
            Configure model credentials and providers
          </p>
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
            Anthropic API Key
          </h4>
          <p className="text-xs text-muted-foreground">
            Use your own Anthropic API key for Claude models (Opus, Sonnet, Haiku)
          </p>
        </div>
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-6">
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <Label className="text-sm font-medium">API token</Label>
                <p className="text-xs text-muted-foreground">
                  Your Anthropic API key (sk-ant-...)
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  type="password"
                  value={anthropicToken}
                  onChange={(e) => setAnthropicToken(e.target.value)}
                  className="w-full"
                  placeholder="sk-ant-..."
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <Label className="text-sm font-medium">Base URL (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Leave empty to use default (https://api.anthropic.com)
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  value={anthropicBaseUrl}
                  onChange={(e) => setAnthropicBaseUrl(e.target.value)}
                  className="w-full"
                  placeholder="https://api.anthropic.com"
                />
              </div>
            </div>
          </div>

          <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetAnthropic}
              disabled={!canResetAnthropic}
              className="hover:bg-red-500/10 hover:text-red-600"
            >
              Reset
            </Button>
            <Button size="sm" onClick={handleSaveAnthropic} disabled={!canSaveAnthropic}>
              Save
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">
            Custom Provider
          </h4>
          <p className="text-xs text-muted-foreground">
            Configure a custom model provider (e.g. API proxy, alternative providers)
          </p>
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
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  className="w-full"
                  placeholder="claude-sonnet-4-20250514"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <Label className="text-sm font-medium">API token</Label>
                <p className="text-xs text-muted-foreground">
                  API key or token for the provider
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  type="password"
                  value={customToken}
                  onChange={(e) => setCustomToken(e.target.value)}
                  className="w-full"
                  placeholder="sk-..."
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <Label className="text-sm font-medium">Base URL</Label>
                <p className="text-xs text-muted-foreground">
                  API endpoint URL
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  className="w-full"
                  placeholder="https://api.example.com"
                />
              </div>
            </div>
          </div>

          <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetCustom}
              disabled={!canResetCustom}
              className="hover:bg-red-500/10 hover:text-red-600"
            >
              Reset
            </Button>
            <Button size="sm" onClick={handleSaveCustom} disabled={!canSaveCustom}>
              Save
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Voice Input</h4>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <Label className="text-sm font-medium">OpenAI API Key</Label>
                <p className="text-xs text-muted-foreground">
                  Required for voice transcription (Whisper API). Free users need their own key.
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  className="w-full"
                  placeholder="sk-..."
                />
              </div>
            </div>
          </div>

          <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetOpenAI}
              disabled={!canResetOpenAI || setOpenAIKeyMutation.isPending}
              className="hover:bg-red-500/10 hover:text-red-600"
            >
              Remove
            </Button>
            <Button
              size="sm"
              onClick={handleSaveOpenAI}
              disabled={!canSaveOpenAI || setOpenAIKeyMutation.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
