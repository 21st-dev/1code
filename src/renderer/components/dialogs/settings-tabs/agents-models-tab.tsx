import { useAtom, useSetAtom } from "jotai"
import { ChevronDown, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  apiKeyOnboardingCompletedAtom,
  billingMethodAtom,
  codexApiKeyAtom,
  codexOnboardingAuthMethodAtom,
  codexOnboardingCompletedAtom,
  customClaudeConfigAtom,
  hiddenModelsAtom,
  normalizeCodexApiKey,
  openaiApiKeyAtom,
  openCodexBackendConfigAtom,
  type CustomClaudeConfig,
} from "../../../lib/atoms"
import { AgentIcon, SearchIcon } from "../../ui/icons"
import { CLAUDE_MODELS, CODEX_MODELS } from "../../../features/agents/lib/models"
import { trpc } from "../../../lib/trpc"
import { Badge } from "../../ui/badge"
import { Button } from "../../ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../ui/collapsible"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Switch } from "../../ui/switch"
import { lastSelectedAgentIdAtom } from "../../../features/agents/atoms"
import { bridgeOpenCodexBackendConfig } from "../../../features/onboarding/opencodex-backend-config"
import { OpenCodexBackendEditor } from "../../../features/onboarding/opencodex-backend-editor"

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
  const [backendConfig, setBackendConfig] = useAtom(openCodexBackendConfigAtom)
  const [storedConfig, setStoredConfig] = useAtom(customClaudeConfigAtom)
  const setBillingMethod = useSetAtom(billingMethodAtom)
  const setApiKeyOnboardingCompleted = useSetAtom(apiKeyOnboardingCompletedAtom)
  const setCodexOnboardingCompleted = useSetAtom(codexOnboardingCompletedAtom)
  const setCodexOnboardingAuthMethod = useSetAtom(
    codexOnboardingAuthMethodAtom,
  )
  const setLastSelectedAgentId = useSetAtom(lastSelectedAgentIdAtom)
  const [model, setModel] = useState(storedConfig.model)
  const [baseUrl, setBaseUrl] = useState(storedConfig.baseUrl)
  const [token, setToken] = useState(storedConfig.token)
  const isNarrowScreen = useIsNarrowScreen()
  const { data: backendSurface, isLoading: isBackendSurfaceLoading } =
    trpc.opencodex.getBackendSurface.useQuery()

  // OpenAI API key state
  const [storedCodexApiKey, setStoredCodexApiKey] = useAtom(codexApiKeyAtom)
  const [codexApiKey, setCodexApiKey] = useState(storedCodexApiKey)
  const [isSavingCodexApiKey, setIsSavingCodexApiKey] = useState(false)
  const [storedOpenAIKey, setStoredOpenAIKey] = useAtom(openaiApiKeyAtom)
  const [openaiKey, setOpenaiKey] = useState(storedOpenAIKey)
  const setOpenAIKeyMutation = trpc.voice.setOpenAIKey.useMutation()
  const disconnectRuntimeMutation = trpc.opencodex.disconnectRuntime.useMutation()
  const trpcUtils = trpc.useUtils()

  useEffect(() => {
    setModel(storedConfig.model)
    setBaseUrl(storedConfig.baseUrl)
    setToken(storedConfig.token)
  }, [storedConfig.model, storedConfig.baseUrl, storedConfig.token])

  useEffect(() => {
    setOpenaiKey(storedOpenAIKey)
  }, [storedOpenAIKey])

  useEffect(() => {
    setCodexApiKey(storedCodexApiKey)
  }, [storedCodexApiKey])

  const savedConfigRef = useRef(storedConfig)

  const handleBlurSave = useCallback(() => {
    const trimmedModel = model.trim()
    const trimmedBaseUrl = baseUrl.trim()
    const trimmedToken = token.trim()

    // Only save if all fields are filled
    if (trimmedModel && trimmedBaseUrl && trimmedToken) {
      const next: CustomClaudeConfig = {
        model: trimmedModel,
        token: trimmedToken,
        baseUrl: trimmedBaseUrl,
      }
      if (
        next.model !== savedConfigRef.current.model ||
        next.token !== savedConfigRef.current.token ||
        next.baseUrl !== savedConfigRef.current.baseUrl
      ) {
        setStoredConfig(next)
        savedConfigRef.current = next
      }
    } else if (!trimmedModel && !trimmedBaseUrl && !trimmedToken) {
      // All cleared — reset
      if (savedConfigRef.current.model || savedConfigRef.current.token || savedConfigRef.current.baseUrl) {
        setStoredConfig(EMPTY_CONFIG)
        savedConfigRef.current = EMPTY_CONFIG
      }
    }
  }, [model, baseUrl, token, setStoredConfig])

  const handleReset = () => {
    setStoredConfig(EMPTY_CONFIG)
    savedConfigRef.current = EMPTY_CONFIG
    setModel("")
    setBaseUrl("")
    setToken("")
    toast.success("Model settings reset")
  }

  const canReset = Boolean(model.trim() || baseUrl.trim() || token.trim())

  const handleBackendConfigured = async (normalizedConfig: typeof backendConfig) => {
    const bridge = bridgeOpenCodexBackendConfig(normalizedConfig)

    setBackendConfig(normalizedConfig)
    setBillingMethod(bridge.billingMethod)
    setApiKeyOnboardingCompleted(bridge.apiKeyOnboardingCompleted)
    setCodexOnboardingCompleted(bridge.codexOnboardingCompleted)
    setCodexOnboardingAuthMethod(bridge.codexOnboardingAuthMethod)
    setStoredCodexApiKey(bridge.codexApiKey)
    setCodexApiKey(bridge.codexApiKey)
    setStoredConfig(bridge.customClaudeConfig)
    savedConfigRef.current = bridge.customClaudeConfig
    setModel(bridge.customClaudeConfig.model)
    setBaseUrl(bridge.customClaudeConfig.baseUrl)
    setToken(bridge.customClaudeConfig.token)
    setLastSelectedAgentId(bridge.lastSelectedAgentId)
    await trpcUtils.opencodex.getBackendSurface.invalidate()
    toast.success("Local backend route updated")
  }

  const handleCodexSetup = () => {
    toast.info("Update the local OpenCodex backend route above instead of using a provider-specific login flow.")
  }

  const handleCodexLogout = async () => {
    const confirmed = window.confirm(
      "Disconnect this OpenCodex API override on this device?",
    )
    if (!confirmed) return

    try {
      const result = await disconnectRuntimeMutation.mutateAsync()
      if (!result.success) {
        throw new Error("error" in result ? result.error : "Failed to disconnect runtime")
      }
      await trpcUtils.opencodex.getBackendSurface.invalidate()
      toast.success("Runtime disconnected")
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to disconnect runtime"
      toast.error(message)
    }
  }

  const normalizedStoredCodexApiKey = normalizeCodexApiKey(storedCodexApiKey)
  const hasAppCodexApiKey = Boolean(normalizedStoredCodexApiKey)
  const activeRuntime = backendSurface?.runtime
  const runtimeIntegration = backendSurface?.integration
  const runtimeHost = backendSurface?.backendHost
  const isCodexRoute = activeRuntime?.routeKind === "codex"
  const isRuntimeConnected = Boolean(runtimeIntegration?.isConnected)
  const showRuntimeLoading = isBackendSurfaceLoading
  const runtimeTitle = activeRuntime?.title || "OpenCodex Runtime"
  const [hiddenModels, setHiddenModels] = useAtom(hiddenModelsAtom)

  const toggleModelVisibility = useCallback((modelId: string) => {
    setHiddenModels((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId)
      }
      return [...prev, modelId]
    })
  }, [setHiddenModels])

  const codexConnectionText = !activeRuntime
    ? "Backend not configured"
    : isCodexRoute
      ? runtimeIntegration?.state === "connected_chatgpt"
        ? "Connected through an inherited local session"
        : runtimeIntegration?.state === "connected_api_key" ||
            runtimeIntegration?.state === "configured_api_key"
          ? "Configured through the saved API route"
          : runtimeIntegration?.state === "not_logged_in"
            ? "Waiting for a valid backend API key"
            : "Runtime status unavailable"
      : `Configured through ${runtimeTitle}`

  // OpenAI key handlers
  const trimmedOpenAIKey = openaiKey.trim()
  const canResetOpenAI = !!trimmedOpenAIKey

  const handleCodexApiKeyBlur = async () => {
    const trimmedKey = codexApiKey.trim()

    if (trimmedKey === storedCodexApiKey) return
    if (!trimmedKey) return

    const normalized = normalizeCodexApiKey(trimmedKey)
    if (!normalized) {
      toast.error("Invalid API override key format. Key should start with 'sk-'")
      setCodexApiKey(storedCodexApiKey)
      return
    }

    setIsSavingCodexApiKey(true)
    try {
      setStoredCodexApiKey(normalized)
      setCodexApiKey(normalized)
      await trpcUtils.opencodex.getBackendSurface.invalidate()
      toast.success("API override key saved")
    } catch {
      toast.error("Failed to save API override key")
    } finally {
      setIsSavingCodexApiKey(false)
    }
  }

  const handleRemoveCodexApiKey = async () => {
    setIsSavingCodexApiKey(true)
    try {
      setStoredCodexApiKey("")
      setCodexApiKey("")
      await trpcUtils.opencodex.getBackendSurface.invalidate()
      toast.success("API override key removed")
    } catch {
      toast.error("Failed to remove API override key")
    } finally {
      setIsSavingCodexApiKey(false)
    }
  }

  const handleSaveOpenAI = async () => {
    if (trimmedOpenAIKey === storedOpenAIKey) return // No change
    if (trimmedOpenAIKey && !trimmedOpenAIKey.startsWith("sk-")) {
      toast.error("Invalid voice transcription key format. Key should start with 'sk-'")
      return
    }

    try {
      await setOpenAIKeyMutation.mutateAsync({ key: trimmedOpenAIKey })
      setStoredOpenAIKey(trimmedOpenAIKey)
      // Invalidate voice availability check
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success("Voice transcription key saved")
    } catch (err) {
      toast.error("Failed to save voice transcription key")
    }
  }

  const handleResetOpenAI = async () => {
    try {
      await setOpenAIKeyMutation.mutateAsync({ key: "" })
      setStoredOpenAIKey("")
      setOpenaiKey("")
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success("Voice transcription key removed")
    } catch (err) {
      toast.error("Failed to remove voice transcription key")
    }
  }

  // All models merged into one list for the top section
  const allModels = useMemo(() => {
    const items: { id: string; name: string; provider: "claude" | "codex" }[] = []
    for (const m of CLAUDE_MODELS) {
      items.push({ id: m.id, name: `${m.name} ${m.version}`, provider: "claude" })
    }
    for (const m of CODEX_MODELS) {
      items.push({ id: m.id, name: m.name, provider: "codex" })
    }
    return items
  }, [])

  const [modelSearch, setModelSearch] = useState("")
  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return allModels
    const q = modelSearch.toLowerCase().trim()
    return allModels.filter((m) => m.name.toLowerCase().includes(q))
  }, [allModels, modelSearch])

  const [isApiKeysOpen, setIsApiKeysOpen] = useState(false)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Models</h3>
        </div>
      )}

      {/* ===== Models Section ===== */}
      <div className="space-y-2">
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          {/* Search */}
          <div className="px-1.5 pt-1.5 pb-0.5">
            <div className="flex items-center gap-1.5 h-7 px-1.5 rounded-md bg-muted/50">
              <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="Add or search model"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Model list */}
          <div className="divide-y divide-border">
            {filteredModels.map((m) => {
              const isEnabled = !hiddenModels.includes(m.id)
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.name}</span>
                    <AgentIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => toggleModelVisibility(m.id)}
                  />
                </div>
              )
            })}
            {filteredModels.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No models found
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Accounts Section ===== */}
      <div className="space-y-2">
        <div className="pb-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">
              Local Backend Route
            </h4>
            <p className="text-xs text-muted-foreground">
              Frontend-managed OpenCodex route. No desktop cloud login or subscription handoff.
            </p>
          </div>
        </div>
        <OpenCodexBackendEditor
          variant="settings"
          initialConfig={backendConfig}
          onConfigured={handleBackendConfigured}
        />
      </div>

      <div className="space-y-2">
        <div className="pb-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">
              {runtimeTitle}
            </h4>
            <p className="text-xs text-muted-foreground">
              Unified runtime status for the active OpenCodex backend route
            </p>
          </div>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden divide-y divide-border">
          {showRuntimeLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading runtime...
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-6 p-4 hover:bg-muted/50">
                <div>
                  <div className="text-sm font-medium">Backend Runtime</div>
                  <div className="text-xs text-muted-foreground">
                    {codexConnectionText}
                  </div>
                  {runtimeHost && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Host: {runtimeHost.status}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isRuntimeConnected && (
                    <Badge variant="secondary" className="text-xs">
                      Active
                    </Badge>
                  )}
                  {isCodexRoute && runtimeIntegration?.canDisconnect ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleCodexLogout()}
                      disabled={disconnectRuntimeMutation.isPending}
                    >
                      {disconnectRuntimeMutation.isPending ? "..." : "Disconnect"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleCodexSetup()}
                      disabled={
                        isBackendSurfaceLoading ||
                        disconnectRuntimeMutation.isPending ||
                        isSavingCodexApiKey
                      }
                    >
                      Review Route
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== API Keys Section (Collapsible) ===== */}
      <Collapsible open={isApiKeysOpen} onOpenChange={setIsApiKeysOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors">
          <ChevronDown className={`h-4 w-4 transition-transform ${isApiKeysOpen ? "" : "-rotate-90"}`} />
          API Keys
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          {/* OpenCodex API override key */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between gap-6 p-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">API Override Key</Label>
                  {hasAppCodexApiKey && (
                    <Badge variant="secondary" className="text-xs">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Takes priority over the local OpenCodex session
                </p>
              </div>
              <div className="flex-shrink-0 w-80 flex items-center gap-2">
                <Input
                  type="password"
                  value={codexApiKey}
                  onChange={(e) => setCodexApiKey(e.target.value)}
                  onBlur={handleCodexApiKeyBlur}
                  className="w-full font-mono"
                  placeholder="sk-..."
                />
                {hasAppCodexApiKey && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => void handleRemoveCodexApiKey()}
                    disabled={isSavingCodexApiKey}
                    aria-label="Remove API override key"
                    className="text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Voice transcription key */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between gap-6 p-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Voice Transcription Key</Label>
                  {canResetOpenAI && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResetOpenAI}
                      disabled={setOpenAIKeyMutation.isPending}
                      className="h-5 px-1.5 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Required for voice transcription
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  onBlur={handleSaveOpenAI}
                  className="w-full"
                  placeholder="sk-..."
                />
              </div>
            </div>
          </div>

          {/* Backend override model */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">
                Backend Override Model
              </h4>
              {canReset && (
                <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground hover:text-red-600 hover:bg-red-500/10">
                  Reset
                </Button>
              )}
            </div>
            <div className="bg-background rounded-lg border border-border overflow-hidden">
              <div className="flex items-center justify-between p-4">
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
                    onBlur={handleBlurSave}
                    className="w-full"
                    placeholder="claude-3-7-sonnet-20250219"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border-t border-border">
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
                    onChange={(e) => setToken(e.target.value)}
                    onBlur={handleBlurSave}
                    className="w-full"
                    placeholder="sk-ant-..."
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border-t border-border">
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
                    onBlur={handleBlurSave}
                    className="w-full"
                    placeholder="https://api.anthropic.com"
                  />
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

