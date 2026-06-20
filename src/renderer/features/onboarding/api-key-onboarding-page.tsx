"use client"

import { useAtomValue, useSetAtom } from "jotai"
import { ChevronLeft, Info } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { providerProfileSource } from "../../../shared/provider-profile-types"
import { LanguageSwitcher } from "../../components/language-switcher"
import {
  IconSpinner,
  KeyFilledIcon,
  SettingsFilledIcon,
} from "../../components/ui/icons"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Logo } from "../../components/ui/logo"
import { Switch } from "../../components/ui/switch"
import {
  apiKeyOnboardingCompletedAtom,
  onboardingProviderModeAtom,
} from "../../lib/atoms"
import { useI18n } from "../../lib/i18n"
import { trpc } from "../../lib/trpc"
import { cn } from "../../lib/utils"
import {
  type ClaudeModelSource,
  lastSelectedClaudeModelSourceAtom,
} from "../agents/atoms"

type OnboardingProviderAuthMode = "api_key" | "auth_token"

function toProviderProfileAuthMode(mode: OnboardingProviderAuthMode) {
  return mode === "api_key" ? "x-api-key" : "bearer"
}

// Check if the key looks like a valid Anthropic API key
const isValidApiKey = (key: string) => {
  const trimmed = key.trim()
  return trimmed.startsWith("sk-ant-") && trimmed.length > 20
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function ApiKeyOnboardingPage() {
  const { t } = useI18n()
  const onboardingProviderMode = useAtomValue(onboardingProviderModeAtom)
  const setOnboardingProviderMode = useSetAtom(onboardingProviderModeAtom)
  const setApiKeyOnboardingCompleted = useSetAtom(apiKeyOnboardingCompletedAtom)
  const setLastSelectedClaudeModelSource = useSetAtom(
    lastSelectedClaudeModelSourceAtom,
  )
  const trpcUtils = trpc.useUtils()
  const saveProviderProfile = trpc.providerProfiles.saveProfile.useMutation()
  const saveLocalApiProviderConfig =
    trpc.localApiProviderConfig.save.useMutation()

  const isCustomModel = onboardingProviderMode === "custom-model"

  // Default values for API key mode (not custom model)
  const defaultModel = "claude-sonnet-4-6"
  const defaultBaseUrl = "https://api.anthropic.com"

  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState(defaultModel)
  const [token, setToken] = useState("")
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl)
  const [authMode, setAuthMode] =
    useState<OnboardingProviderAuthMode>("auth_token")
  const [useForUtilityApis, setUseForUtilityApis] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)

  const handleBack = () => {
    setSubmissionError(null)
    setOnboardingProviderMode(null)
  }

  // Submit for API key mode (simple - just the key)
  const submitApiKey = (key: string) => {
    if (!isValidApiKey(key)) return

    setSubmissionError(null)
    setIsSubmitting(true)

    saveProviderProfile.mutate(
      {
        name: "Anthropic API Key",
        presetId: null,
        protocol: "anthropic",
        baseUrl: defaultBaseUrl,
        defaultModel,
        authMode: "x-api-key",
        token: key.trim(),
        targetRuntimes: ["claude"],
        capabilities: {
          claude: true,
          streaming: true,
          tools: true,
          vision: true,
        },
      },
      {
        onSuccess: async ({ profile }) => {
          await trpcUtils.providerProfiles.listProfiles.invalidate()
          setLastSelectedClaudeModelSource(
            providerProfileSource(profile.id) as ClaudeModelSource,
          )
          setApiKeyOnboardingCompleted(true)
        },
        onError: (error) => {
          const message = getErrorMessage(error)
          setSubmissionError(message)
          toast.error(t("toast.models.failedToSaveProviderProfile"), {
            description: message,
          })
        },
        onSettled: () => setIsSubmitting(false),
      },
    )
  }

  // Submit for custom model mode (all three fields)
  const submitCustomModel = async () => {
    const trimmedModel = model.trim()
    const trimmedToken = token.trim()
    const trimmedBaseUrl = baseUrl.trim()

    if (!trimmedModel || !trimmedToken || !trimmedBaseUrl) return

    setSubmissionError(null)
    setIsSubmitting(true)

    try {
      const result = await saveProviderProfile.mutateAsync({
        name: "Custom Claude Provider",
        presetId: null,
        protocol: "anthropic",
        baseUrl: trimmedBaseUrl,
        defaultModel: trimmedModel,
        authMode: toProviderProfileAuthMode(authMode),
        token: trimmedToken,
        targetRuntimes: ["claude"],
        capabilities: { claude: true, streaming: true, tools: true },
      })

      if (useForUtilityApis) {
        await Promise.all([
          saveLocalApiProviderConfig.mutateAsync({
            purpose: "sub_chat_title",
            model: trimmedModel,
            token: trimmedToken,
            baseUrl: trimmedBaseUrl,
          }),
          saveLocalApiProviderConfig.mutateAsync({
            purpose: "commit_message",
            model: trimmedModel,
            token: trimmedToken,
            baseUrl: trimmedBaseUrl,
          }),
        ])
        await trpcUtils.localApiProviderConfig.get.invalidate()
      }

      await trpcUtils.providerProfiles.listProfiles.invalidate()
      setLastSelectedClaudeModelSource(
        providerProfileSource(result.profile.id) as ClaudeModelSource,
      )
      setApiKeyOnboardingCompleted(true)
    } catch (error) {
      const message = getErrorMessage(error)
      setSubmissionError(message)
      toast.error(t("toast.models.failedToSaveProviderProfile"), {
        description: message,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setApiKey(value)
    setSubmissionError(null)

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
    model.trim() && token.trim() && baseUrl.trim(),
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

        <LanguageSwitcher compact className="fixed top-12 right-4" />

        {/* Back button - fixed in top left corner below traffic lights */}
        <button
          type="button"
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
                {t("onboarding.apiKey.title")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("onboarding.apiKey.subtitle")}{" "}
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
              {t("onboarding.apiKey.hint")}
            </p>
            {submissionError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <p className="font-medium">
                  {t("toast.models.failedToSaveProviderProfile")}
                </p>
                <p className="mt-1 leading-relaxed">{submissionError}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Custom model mode with all fields
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
      {/* Draggable title bar area */}
      <div
        className="fixed top-0 left-0 right-0 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      <LanguageSwitcher compact className="fixed top-12 right-4" />

      {/* Back button - fixed in top left corner below traffic lights */}
      <button
        type="button"
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
              <SettingsFilledIcon className="w-5 h-5 text-background" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight">
              {t("onboarding.customModel.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("onboarding.customModel.subtitle")}
            </p>
          </div>
        </div>

        <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">
              {t("onboarding.customModel.runtimeNoticeTitle")}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("onboarding.customModel.runtimeNoticeBody")}
            </p>
            <div className="flex items-start justify-between gap-3 border-t border-border/70 pt-2">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground">
                  {t("onboarding.customModel.utilityApisTitle")}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("onboarding.customModel.utilityApisBody")}
                </p>
              </div>
              <Switch
                checked={useForUtilityApis}
                onCheckedChange={setUseForUtilityApis}
                aria-label={t("onboarding.customModel.utilityApisTitle")}
                className="mt-0.5"
              />
            </div>
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          {/* Model Name */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t("onboarding.customModel.modelName")}
            </Label>
            <Input
              value={model}
              onChange={(e) => {
                setModel(e.target.value)
                setSubmissionError(null)
              }}
              placeholder="claude-sonnet-4-6"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              {t("onboarding.customModel.modelHint")}
            </p>
          </div>

          {/* API Token */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t("onboarding.customModel.apiToken")}
            </Label>
            <Input
              type="password"
              value={token}
              onChange={(e) => {
                setToken(e.target.value)
                setSubmissionError(null)
              }}
              placeholder="sk-ant-..."
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              {t("onboarding.customModel.tokenHint")}
            </p>
          </div>

          {/* Auth Mode */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t("onboarding.customModel.authEnv")}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("api_key")
                  setSubmissionError(null)
                }}
                className={cn(
                  "h-8 rounded-lg border text-xs font-medium transition-colors",
                  authMode === "api_key"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                ANTHROPIC_API_KEY
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("auth_token")
                  setSubmissionError(null)
                }}
                className={cn(
                  "h-8 rounded-lg border text-xs font-medium transition-colors",
                  authMode === "auth_token"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                ANTHROPIC_AUTH_TOKEN
              </button>
            </div>
          </div>

          {/* Base URL */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("common.baseUrl")}</Label>
            <Input
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value)
                setSubmissionError(null)
              }}
              placeholder="https://api.anthropic.com"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              {t("onboarding.customModel.baseUrlHint")}
            </p>
          </div>
        </div>

        {submissionError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
            <p className="font-medium">
              {t("toast.models.failedToSaveProviderProfile")}
            </p>
            <p className="mt-1">{submissionError}</p>
          </div>
        )}

        {/* Continue Button */}
        <button
          type="button"
          onClick={() => void submitCustomModel()}
          disabled={!canSubmitCustomModel || isSubmitting}
          className={cn(
            "w-full h-8 px-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] flex items-center justify-center",
            (!canSubmitCustomModel || isSubmitting) &&
              "opacity-50 cursor-not-allowed",
          )}
        >
          {isSubmitting ? (
            <IconSpinner className="h-4 w-4" />
          ) : (
            t("common.continue")
          )}
        </button>
      </div>
    </div>
  )
}
