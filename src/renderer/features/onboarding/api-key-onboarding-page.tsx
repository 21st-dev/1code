"use client"

import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useState, useEffect } from "react"
import { ChevronLeft } from "lucide-react"

import { IconSpinner, KeyFilledIcon, SettingsFilledIcon } from "../../components/ui/icons"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Logo } from "../../components/ui/logo"
import {
  apiKeyOnboardingCompletedAtom,
  billingMethodAtom,
  customClaudeConfigAtom,
  modelProfilesAtom,
  activeProfileIdAtom,
  type CustomClaudeConfig,
} from "../../lib/atoms"
import { trpc } from "../../lib/trpc"
import { cn } from "../../lib/utils"

// Check if the key looks like a valid Anthropic API key
const isValidApiKey = (key: string) => {
  const trimmed = key.trim()
  return trimmed.startsWith("sk-ant-") && trimmed.length > 20
}

export function ApiKeyOnboardingPage() {
  const [storedConfig, setStoredConfig] = useAtom(customClaudeConfigAtom)
  const [profiles, setProfiles] = useAtom(modelProfilesAtom)
  const setActiveProfileId = useSetAtom(activeProfileIdAtom)
  const billingMethod = useAtomValue(billingMethodAtom)
  const setBillingMethod = useSetAtom(billingMethodAtom)
  const setApiKeyOnboardingCompleted = useSetAtom(apiKeyOnboardingCompletedAtom)

  const isCustomModel = billingMethod === "custom-model"

  // Default values for API key mode (not custom model)
  const defaultModel = "claude-sonnet-4-20250514"
  const defaultBaseUrl = "https://api.anthropic.com"

  // Query for existing CLI config (to pre-fill form with detected proxy)
  const { data: cliConfig } = trpc.claudeCode.hasExistingCliConfig.useQuery()

  const [apiKey, setApiKey] = useState(storedConfig.token)
  const [model, setModel] = useState(storedConfig.model || "")
  const [token, setToken] = useState(storedConfig.token)
  const [baseUrl, setBaseUrl] = useState(storedConfig.baseUrl || "")
  // Optional model configuration fields
  const [defaultOpusModel, setDefaultOpusModel] = useState(storedConfig.defaultOpusModel || "")
  const [defaultSonnetModel, setDefaultSonnetModel] = useState(storedConfig.defaultSonnetModel || "")
  const [defaultHaikuModel, setDefaultHaikuModel] = useState(storedConfig.defaultHaikuModel || "")
  const [subagentModel, setSubagentModel] = useState(storedConfig.subagentModel || "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasAppliedCliConfig, setHasAppliedCliConfig] = useState(false)

  // Sync from stored config on mount
  useEffect(() => {
    if (storedConfig.token) {
      setApiKey(storedConfig.token)
      setToken(storedConfig.token)
    }
    if (storedConfig.model) setModel(storedConfig.model)
    if (storedConfig.baseUrl) setBaseUrl(storedConfig.baseUrl)
    if (storedConfig.defaultOpusModel) setDefaultOpusModel(storedConfig.defaultOpusModel)
    if (storedConfig.defaultSonnetModel) setDefaultSonnetModel(storedConfig.defaultSonnetModel)
    if (storedConfig.defaultHaikuModel) setDefaultHaikuModel(storedConfig.defaultHaikuModel)
    if (storedConfig.subagentModel) setSubagentModel(storedConfig.subagentModel)
  }, [])

  // Pre-fill form with detected CLI config (proxy settings) if available
  useEffect(() => {
    // Only proceed if we have config and haven't applied it yet
    if (cliConfig && !hasAppliedCliConfig && isCustomModel) {
      setHasAppliedCliConfig(true)
      
      // Pre-fill with detected values if the current state is empty
      if (cliConfig.apiKey && token === "") {
        setToken(cliConfig.apiKey)
        setApiKey(cliConfig.apiKey)
      }
      if (cliConfig.baseUrl && baseUrl === "") setBaseUrl(cliConfig.baseUrl)
      if (cliConfig.model && model === "") setModel(cliConfig.model)
      if (cliConfig.defaultOpusModel && defaultOpusModel === "") setDefaultOpusModel(cliConfig.defaultOpusModel)
      if (cliConfig.defaultSonnetModel && defaultSonnetModel === "") setDefaultSonnetModel(cliConfig.defaultSonnetModel)
      if (cliConfig.defaultHaikuModel && defaultHaikuModel === "") setDefaultHaikuModel(cliConfig.defaultHaikuModel)
      if (cliConfig.subagentModel && subagentModel === "") setSubagentModel(cliConfig.subagentModel)
    }
  }, [cliConfig, hasAppliedCliConfig, isCustomModel, token, baseUrl, model, defaultOpusModel, defaultSonnetModel, defaultHaikuModel, subagentModel])

  const handleBack = () => {
    setBillingMethod(null)
  }

  // Submit for API key mode (simple - just the key)
  const submitApiKey = (key: string) => {
    if (!isValidApiKey(key)) return

    setIsSubmitting(true)

    const config: CustomClaudeConfig = {
      model: defaultModel,
      token: key.trim(),
      baseUrl: defaultBaseUrl,
    }
    setStoredConfig(config)
    setApiKeyOnboardingCompleted(true)

    setIsSubmitting(false)
  }

  // Submit for custom model mode (all fields)
  const submitCustomModel = () => {
    const trimmedModel = model.trim()
    const trimmedToken = token.trim()
    const trimmedBaseUrl = baseUrl.trim()

    if (!trimmedModel || !trimmedToken || !trimmedBaseUrl) return

    setIsSubmitting(true)

    const config: CustomClaudeConfig = {
      model: trimmedModel,
      token: trimmedToken,
      baseUrl: trimmedBaseUrl,
      defaultOpusModel: defaultOpusModel.trim() || undefined,
      defaultSonnetModel: defaultSonnetModel.trim() || undefined,
      defaultHaikuModel: defaultHaikuModel.trim() || undefined,
      subagentModel: subagentModel.trim() || undefined,
    }
    
    // Save to legacy config atom
    setStoredConfig(config)
    
    // Also create a profile in modelProfilesAtom so it shows in settings
    const newProfileId = crypto.randomUUID()
    const newProfile = {
      id: newProfileId,
      name: "Default", // Saved as Default as requested
      config,
    }
    
    // Add new profile (keep existing profiles like offline profile)
    setProfiles([...profiles, newProfile])
    
    // Set as active profile
    setActiveProfileId(newProfileId)
    
    setApiKeyOnboardingCompleted(true)

    setIsSubmitting(false)
  }

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setApiKey(value)

    // Auto-submit if valid API key is pasted
    if (isValidApiKey(value)) {
      setTimeout(() => submitApiKey(value), 100)
    }
  }

  const handleApiKeyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && apiKey.trim()) {
      submitApiKey(apiKey)
    }
  }

  const canSubmitCustomModel = Boolean(
    model.trim() && token.trim() && baseUrl.trim()
  )

  // Simple API key input mode
  if (!isCustomModel) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
        {/* Draggable title bar area */}
        <div
          className="fixed top-0 left-0 right-0 h-10"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />

        {/* Back button - fixed in top left corner below traffic lights */}
        <button
          onClick={handleBack}
          className="fixed top-12 left-4 flex items-center justify-center h-8 w-8 rounded-full hover:bg-foreground/5 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="w-full max-w-[440px] space-y-8 px-4">
          {/* Header with dual icons */}
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 p-2 mx-auto w-max rounded-full border border-border">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <Logo className="w-5 h-5" fill="white" />
              </div>
              <div className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center">
                <KeyFilledIcon className="w-5 h-5 text-background" />
              </div>
            </div>
            <div className="space-y-1">
              <h1 className="text-base font-semibold tracking-tight">
                Enter API Key
              </h1>
              <p className="text-sm text-muted-foreground">
                Get your API key from{" "}
                <a
                  href="https://console.anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:underline"
                >
                  console.anthropic.com
                </a>
              </p>
            </div>
          </div>

          {/* API Key Input */}
          <div className="space-y-4">
            <div className="relative">
              <Input
                value={apiKey}
                onChange={handleApiKeyChange}
                onKeyDown={handleApiKeyKeyDown}
                placeholder="sk-ant-..."
                className="font-mono text-center pr-10"
                autoFocus
                disabled={isSubmitting}
              />
              {isSubmitting && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <IconSpinner className="h-4 w-4" />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Your API key starts with sk-ant-
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Custom model mode with all fields
  return (
    <div className="h-screen w-screen flex flex-col items-center bg-background select-none overflow-y-auto">
      {/* Draggable title bar area */}
      <div
        className="fixed top-0 left-0 right-0 h-10 z-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Back button - fixed in top left corner below traffic lights */}
      <button
        onClick={handleBack}
        className="fixed top-12 left-4 flex items-center justify-center h-8 w-8 rounded-full hover:bg-foreground/5 transition-colors z-10"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="w-full max-w-[440px] space-y-6 px-4 py-16">
        {/* Header with dual icons */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 p-2 mx-auto w-max rounded-full border border-border">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <Logo className="w-5 h-5" fill="white" />
            </div>
            <div className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center">
              <SettingsFilledIcon className="w-5 h-5 text-background" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight">
              Configure Custom Model
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your custom model configuration
            </p>
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          {/* Base URL */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Base URL *</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.anthropic.com"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">API endpoint URL</p>
          </div>

          {/* API Token */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">API Token *</Label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Your API key or token
            </p>
          </div>

          {/* Default Model */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Default Model *</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="claude-sonnet-4-5-thinking"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Model identifier for API requests
            </p>
          </div>

          {/* Optional Model Configuration Section */}
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-3 font-medium">
              Additional Model Configuration (Optional)
            </p>
          </div>

          {/* 2-column grid for optional model fields */}
          <div className="grid grid-cols-2 gap-3">
            {/* Default Opus Model */}
            <div className="space-y-1">
              <Label className="text-xs">
                Default Opus Model
              </Label>
              <Input
                value={defaultOpusModel}
                onChange={(e) => setDefaultOpusModel(e.target.value)}
                placeholder="claude-opus-4-5-thinking"
                className="w-full h-8"
              />
            </div>

            {/* Default Sonnet Model */}
            <div className="space-y-1">
              <Label className="text-xs">
                Default Sonnet Model
              </Label>
              <Input
                value={defaultSonnetModel}
                onChange={(e) => setDefaultSonnetModel(e.target.value)}
                placeholder="claude-sonnet-4-5-thinking"
                className="w-full h-8"
              />
            </div>

            {/* Default Haiku Model */}
            <div className="space-y-1">
              <Label className="text-xs">
                Default Haiku Model
              </Label>
              <Input
                value={defaultHaikuModel}
                onChange={(e) => setDefaultHaikuModel(e.target.value)}
                placeholder="claude-sonnet-4-5"
                className="w-full h-8"
              />
            </div>

            {/* Subagent Model */}
            <div className="space-y-1">
              <Label className="text-xs">
                Subagent Model
              </Label>
              <Input
                value={subagentModel}
                onChange={(e) => setSubagentModel(e.target.value)}
                placeholder="claude-sonnet-4-5-thinking"
                className="w-full h-8"
              />
            </div>
          </div>
        </div>

        {/* Continue Button */}
        <button
          onClick={submitCustomModel}
          disabled={!canSubmitCustomModel || isSubmitting}
          className={cn(
            "w-full h-8 px-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] flex items-center justify-center",
            (!canSubmitCustomModel || isSubmitting) &&
              "opacity-50 cursor-not-allowed"
          )}
        >
          {isSubmitting ? <IconSpinner className="h-4 w-4" /> : "Continue"}
        </button>
      </div>
    </div>
  )
}
