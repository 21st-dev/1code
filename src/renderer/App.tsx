import { Provider as JotaiProvider, useAtom, useAtomValue, useSetAtom } from "jotai"
import { ThemeProvider, useTheme } from "next-themes"
import { useEffect, useMemo, useRef } from "react"
import { Toaster, toast } from "sonner"
import { TooltipProvider } from "./components/ui/tooltip"
import { TRPCProvider } from "./contexts/TRPCProvider"
import { WindowProvider, getInitialWindowParams } from "./contexts/WindowContext"
import { selectedProjectAtom, selectedAgentChatIdAtom } from "./features/agents/atoms"
import { useAgentSubChatStore } from "./features/agents/stores/sub-chat-store"
import { AgentsLayout } from "./features/layout/agents-layout"
import {
  AnthropicOnboardingPage,
  ApiKeyOnboardingPage,
  BillingMethodPage,
  CodexOnboardingPage,
  SelectRepoPage,
} from "./features/onboarding"
import { useLocalOnlyModeState } from "./lib/hooks/use-local-only-mode"
import {
  anthropicOnboardingCompletedAtom,
  apiKeyOnboardingCompletedAtom,
  billingMethodAtom,
  codexOnboardingAuthMethodAtom,
  codexOnboardingCompletedAtom,
  customClaudeConfigAtom,
  LEGACY_CODEX_API_KEY_STORAGE_KEY,
  normalizeCodexApiKey,
  normalizeCustomClaudeConfig,
  repoOnboardingSkippedAtom,
} from "./lib/atoms"
import { I18nProvider, useI18n } from "./lib/i18n"
import { appStore } from "./lib/jotai-store"
import { VSCodeThemeProvider } from "./lib/themes/theme-provider"
import { trpc } from "./lib/trpc"

/**
 * Custom Toaster that adapts to theme
 */
function ThemedToaster() {
  const { resolvedTheme } = useTheme()

  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme as "light" | "dark" | "system"}
      closeButton
    />
  )
}

/**
 * Main content router - decides which page to show based on onboarding state
 */
function AppContent() {
  const { t } = useI18n()
  const billingMethod = useAtomValue(billingMethodAtom)
  const setBillingMethod = useSetAtom(billingMethodAtom)
  const { isLocalOnly, isResolved: isLocalOnlyResolved } =
    useLocalOnlyModeState()
  const [legacyCustomClaudeConfig, setLegacyCustomClaudeConfig] = useAtom(
    customClaudeConfigAtom
  )
  const anthropicOnboardingCompleted = useAtomValue(
    anthropicOnboardingCompletedAtom
  )
  const setAnthropicOnboardingCompleted = useSetAtom(anthropicOnboardingCompletedAtom)
  const apiKeyOnboardingCompleted = useAtomValue(apiKeyOnboardingCompletedAtom)
  const setApiKeyOnboardingCompleted = useSetAtom(apiKeyOnboardingCompletedAtom)
  const codexOnboardingCompleted = useAtomValue(codexOnboardingCompletedAtom)
  const setCodexOnboardingCompleted = useSetAtom(codexOnboardingCompletedAtom)
  const setCodexOnboardingAuthMethod = useSetAtom(codexOnboardingAuthMethodAtom)
  const repoOnboardingSkipped = useAtomValue(repoOnboardingSkippedAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const { setActiveSubChat, addToOpenSubChats, setChatId } = useAgentSubChatStore()
  const legacyProviderMigrationAttemptedRef = useRef(false)
  const legacyCodexApiKeyMigrationAttemptedRef = useRef(false)
  const importLegacyProviderConfig =
    trpc.claudeProviderConfig.importLegacy.useMutation()
  const saveCodexApiKeyMutation = trpc.codex.saveCodexApiKey.useMutation()
  const trpcUtils = trpc.useUtils()

  // Apply initial window params (chatId/subChatId) when opening via "Open in new window"
  useEffect(() => {
    const params = getInitialWindowParams()
    if (params.chatId) {
      console.log("[App] Opening chat from window params:", params.chatId, params.subChatId)
      setSelectedChatId(params.chatId)
      setChatId(params.chatId)
      if (params.subChatId) {
        addToOpenSubChats(params.subChatId)
        setActiveSubChat(params.subChatId)
      }
    }
  }, [setSelectedChatId, setChatId, addToOpenSubChats, setActiveSubChat])

  // Claim the initially selected chat to prevent duplicate windows.
  // For new windows opened via "Open in new window", the chat is pre-claimed by main process.
  // For restored windows (persisted localStorage), we need to claim here.
  // Read atom directly from store to avoid stale closure with empty deps.
  useEffect(() => {
    if (!window.desktopApi?.claimChat) return
    const currentChatId = appStore.get(selectedAgentChatIdAtom)
    if (!currentChatId) return
    window.desktopApi.claimChat(currentChatId).then((result) => {
      if (!result.ok) {
        // Another window already has this chat — clear our selection
        setSelectedChatId(null)
      }
    })
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Check if user has existing CLI config (API key or proxy)
  // Based on PR #29 by @sa4hnd
  const { data: cliConfig, isLoading: isLoadingCliConfig } =
    trpc.claudeCode.hasExistingCliConfig.useQuery()
  const { data: secureProviderConfig } =
    trpc.claudeProviderConfig.get.useQuery()
  const { data: claudeCodeIntegration } =
    trpc.claudeCode.getIntegration.useQuery()

  // Migration: If user already completed Anthropic onboarding but has no billing method set,
  // automatically set it to "claude-subscription" (legacy users before billing method was added)
  useEffect(() => {
    if (!billingMethod && anthropicOnboardingCompleted && !isLocalOnly) {
      setBillingMethod("claude-subscription")
    }
  }, [billingMethod, anthropicOnboardingCompleted, isLocalOnly, setBillingMethod])

  useEffect(() => {
    if (!isLocalOnlyResolved || !isLocalOnly) return
    if (
      billingMethod === "claude-subscription" &&
      anthropicOnboardingCompleted &&
      claudeCodeIntegration &&
      !claudeCodeIntegration.isConnected
    ) {
      setAnthropicOnboardingCompleted(false)
    }
  }, [
    anthropicOnboardingCompleted,
    billingMethod,
    claudeCodeIntegration,
    isLocalOnly,
    isLocalOnlyResolved,
    setAnthropicOnboardingCompleted,
  ])

  // Auto-skip onboarding if user has existing CLI config (API key or proxy)
  // This allows users with ANTHROPIC_API_KEY to use the app without OAuth
  useEffect(() => {
    if (cliConfig?.hasConfig && !billingMethod) {
      console.log("[App] Detected existing CLI config, auto-completing onboarding")
      setBillingMethod("api-key")
      setApiKeyOnboardingCompleted(true)
    }
  }, [cliConfig?.hasConfig, billingMethod, setBillingMethod, setApiKeyOnboardingCompleted])

  useEffect(() => {
    const config = secureProviderConfig?.config
    if (!config?.hasToken) return

    if (!billingMethod) {
      setBillingMethod(
        config.baseUrl.includes("anthropic.com") ? "api-key" : "custom-model"
      )
    }
    setApiKeyOnboardingCompleted(true)
  }, [
    billingMethod,
    secureProviderConfig?.config,
    setApiKeyOnboardingCompleted,
    setBillingMethod,
  ])

  useEffect(() => {
    if (legacyCodexApiKeyMigrationAttemptedRef.current) return
    if (typeof window === "undefined") return

    const legacyValue = window.localStorage.getItem(
      LEGACY_CODEX_API_KEY_STORAGE_KEY,
    )
    if (legacyValue === null) return

    legacyCodexApiKeyMigrationAttemptedRef.current = true
    window.localStorage.removeItem(LEGACY_CODEX_API_KEY_STORAGE_KEY)

    const normalized = normalizeCodexApiKey(legacyValue)
    if (!normalized) return

    saveCodexApiKeyMutation.mutate(
      { apiKey: normalized },
      {
        onSuccess: async () => {
          setCodexOnboardingAuthMethod("api_key")
          setCodexOnboardingCompleted(true)
          await trpcUtils.codex.getCodexApiKeyStatus.invalidate()
          await trpcUtils.codex.getIntegration.invalidate()
        },
        onError: (error) => {
          console.warn("[App] Failed to migrate legacy Codex API key:", error)
          toast.error(t("toast.models.failedToMigrateCodexApiKey"))
        },
      },
    )
  }, [
    saveCodexApiKeyMutation,
    setCodexOnboardingAuthMethod,
    setCodexOnboardingCompleted,
    t,
    trpcUtils.codex.getCodexApiKeyStatus,
    trpcUtils.codex.getIntegration,
  ])

  // Migrate the legacy renderer-stored custom Claude token into secure
  // main-process storage, then clear the raw token from localStorage.
  useEffect(() => {
    if (legacyProviderMigrationAttemptedRef.current) return

    const normalized = normalizeCustomClaudeConfig(legacyCustomClaudeConfig)
    if (!normalized) return

    legacyProviderMigrationAttemptedRef.current = true
    const authMode = normalized.baseUrl.includes("anthropic.com")
      ? "api_key"
      : "auth_token"

    importLegacyProviderConfig.mutate(
      { ...normalized, authMode },
      {
        onSuccess: () => {
          setLegacyCustomClaudeConfig({ model: "", token: "", baseUrl: "" })
          if (!billingMethod) {
            setBillingMethod(
              normalized.baseUrl.includes("anthropic.com")
                ? "api-key"
                : "custom-model"
            )
          }
          setApiKeyOnboardingCompleted(true)
        },
        onError: (error) => {
          console.warn("[App] Failed to migrate legacy Claude provider config:", error)
          legacyProviderMigrationAttemptedRef.current = false
        },
      }
    )
  }, [
    importLegacyProviderConfig,
    billingMethod,
    legacyCustomClaudeConfig,
    setApiKeyOnboardingCompleted,
    setBillingMethod,
    setLegacyCustomClaudeConfig,
  ])

  // Fetch projects to validate selectedProject exists
  const { data: projects, isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery()

  // Validated project - only valid if exists in DB
  const validatedProject = useMemo(() => {
    if (!selectedProject) return null
    // While loading, trust localStorage value to prevent flicker
    if (isLoadingProjects) return selectedProject
    // After loading, validate against DB
    if (!projects) return null
    const exists = projects.some((p) => p.id === selectedProject.id)
    return exists ? selectedProject : null
  }, [selectedProject, projects, isLoadingProjects])

  // Determine which page to show:
  // 1. No billing method selected -> BillingMethodPage
  // 2. Claude subscription selected but not completed -> AnthropicOnboardingPage
  // 3. Codex selected but not completed -> CodexOnboardingPage
  // 4. API key or custom model selected but not completed -> ApiKeyOnboardingPage
  // 5. No valid project selected and repository onboarding not deferred -> SelectRepoPage
  // 6. Otherwise -> AgentsLayout
  if (!billingMethod) {
    return <BillingMethodPage />
  }

  if (billingMethod === "claude-subscription" && !anthropicOnboardingCompleted) {
    return <AnthropicOnboardingPage />
  }

  if (
    (billingMethod === "codex-subscription" ||
      billingMethod === "codex-api-key") &&
    !codexOnboardingCompleted
  ) {
    return <CodexOnboardingPage />
  }

  if (
    (billingMethod === "api-key" || billingMethod === "custom-model") &&
    !apiKeyOnboardingCompleted
  ) {
    return <ApiKeyOnboardingPage />
  }

  if (!validatedProject && !isLoadingProjects && !repoOnboardingSkipped) {
    return <SelectRepoPage />
  }

  return <AgentsLayout />
}

export function App() {
  return (
    <WindowProvider>
      <JotaiProvider store={appStore}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <VSCodeThemeProvider>
            <I18nProvider>
              <TooltipProvider delayDuration={100}>
                <TRPCProvider>
                  <div
                    data-agents-page
                    className="h-screen w-screen bg-background text-foreground overflow-hidden"
                  >
                    <AppContent />
                  </div>
                  <ThemedToaster />
                </TRPCProvider>
              </TooltipProvider>
            </I18nProvider>
          </VSCodeThemeProvider>
        </ThemeProvider>
      </JotaiProvider>
    </WindowProvider>
  )
}
