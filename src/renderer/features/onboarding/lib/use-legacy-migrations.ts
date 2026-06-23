import { useAtom } from "jotai"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import {
  customClaudeConfigAtom,
  LEGACY_CODEX_API_KEY_STORAGE_KEY,
  LEGACY_OPENAI_API_KEY_STORAGE_KEY,
  normalizeCodexApiKey,
  normalizeCustomClaudeConfig,
} from "../../../lib/atoms"
import { useI18n } from "../../../lib/i18n"
import { trpc } from "../../../lib/trpc"

/**
 * One-time migrations of credentials persisted by older app versions into the
 * secure main-process stores. Kept out of the render/routing path: each runs at
 * most once and, on success, invalidates the owning query so the derived setup
 * status ({@link useSetupStatus}) picks the credential up — there is no separate
 * onboarding "completed" flag to set.
 */
export function useLegacyMigrations() {
  const { t } = useI18n()
  const trpcUtils = trpc.useUtils()
  const saveCodexApiKeyMutation = trpc.codex.saveCodexApiKey.useMutation()
  const importLegacyProviderConfig =
    trpc.claudeProviderConfig.importLegacy.useMutation()
  const [legacyCustomClaudeConfig, setLegacyCustomClaudeConfig] = useAtom(
    customClaudeConfigAtom,
  )

  const codexKeyAttemptedRef = useRef(false)
  const voiceKeyAttemptedRef = useRef(false)
  const providerConfigAttemptedRef = useRef(false)

  // Legacy renderer-stored Codex API key -> secure store.
  useEffect(() => {
    if (codexKeyAttemptedRef.current) return
    if (typeof window === "undefined") return

    const legacyValue = window.localStorage.getItem(
      LEGACY_CODEX_API_KEY_STORAGE_KEY,
    )
    if (legacyValue === null) return

    codexKeyAttemptedRef.current = true
    window.localStorage.removeItem(LEGACY_CODEX_API_KEY_STORAGE_KEY)

    const normalized = normalizeCodexApiKey(legacyValue)
    if (!normalized) return

    saveCodexApiKeyMutation.mutate(
      { apiKey: normalized },
      {
        onSuccess: async () => {
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
    t,
    trpcUtils.codex.getCodexApiKeyStatus,
    trpcUtils.codex.getIntegration,
  ])

  // Legacy renderer-stored voice key: clear and refresh availability.
  useEffect(() => {
    if (voiceKeyAttemptedRef.current) return
    if (typeof window === "undefined") return

    voiceKeyAttemptedRef.current = true
    window.localStorage.removeItem(LEGACY_OPENAI_API_KEY_STORAGE_KEY)
    void trpcUtils.voice.isAvailable.invalidate()
  }, [trpcUtils.voice.isAvailable])

  // Legacy renderer-stored custom Claude provider token -> secure store.
  useEffect(() => {
    if (providerConfigAttemptedRef.current) return

    const normalized = normalizeCustomClaudeConfig(legacyCustomClaudeConfig)
    if (!normalized) return

    providerConfigAttemptedRef.current = true
    const authMode = normalized.baseUrl.includes("anthropic.com")
      ? "api_key"
      : "auth_token"

    importLegacyProviderConfig.mutate(
      { ...normalized, authMode },
      {
        onSuccess: async () => {
          setLegacyCustomClaudeConfig({ model: "", token: "", baseUrl: "" })
          await trpcUtils.claudeProviderConfig.get.invalidate()
        },
        onError: (error) => {
          console.warn(
            "[App] Failed to migrate legacy Claude provider config:",
            error,
          )
          setLegacyCustomClaudeConfig({ model: "", token: "", baseUrl: "" })
          toast.error(t("toast.models.failedToMigrateLegacyClaudeProvider"))
        },
      },
    )
  }, [
    importLegacyProviderConfig,
    legacyCustomClaudeConfig,
    setLegacyCustomClaudeConfig,
    t,
    trpcUtils.claudeProviderConfig.get,
  ])
}
