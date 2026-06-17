"use client"

import { useAtomValue, useSetAtom } from "jotai"
import { ChevronLeft } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
import { LanguageSwitcher } from "../../components/language-switcher"
import {
  codexOnboardingAuthMethodAtom,
  codexOnboardingCompletedAtom,
  onboardingProviderModeAtom,
} from "../../lib/atoms"
import { trpc } from "../../lib/trpc"
import { CodexLoginContent } from "../agents/components/codex-login-content"
import { useCodexLoginFlow } from "../agents/hooks/use-codex-login-flow"

export function CodexOnboardingPage() {
  const onboardingProviderMode = useAtomValue(onboardingProviderModeAtom)
  const setOnboardingProviderMode = useSetAtom(onboardingProviderModeAtom)
  const setCodexOnboardingCompleted = useSetAtom(codexOnboardingCompletedAtom)
  const setCodexOnboardingAuthMethod = useSetAtom(codexOnboardingAuthMethodAtom)
  const didAutoStartRef = useRef(false)
  const runtimeStatusQuery = trpc.codex.getRuntimeStatus.useQuery()
  const onboardingMethod = useMemo(() => {
    if (onboardingProviderMode === "codex-api-key") return "api_key"
    return "chatgpt"
  }, [onboardingProviderMode])
  const runtimeStatus = runtimeStatusQuery.data
  const runtimeUnavailable =
    runtimeStatusQuery.isFetched && runtimeStatus?.ok !== true
  const failedRuntime = runtimeStatus?.loginCli.ok
    ? runtimeStatus.acp
    : runtimeStatus?.loginCli

  const {
    state,
    method,
    apiKeyInput,
    url,
    error,
    isRunning,
    isOpeningUrl,
    start,
    saveApiKey,
    setMethod,
    setApiKeyInput,
    cancel,
    openUrl,
  } = useCodexLoginFlow()

  useEffect(() => {
    setMethod(onboardingMethod)
  }, [onboardingMethod, setMethod])

  useEffect(() => {
    if (onboardingMethod !== "chatgpt") {
      return
    }

    if (runtimeStatusQuery.isLoading || runtimeUnavailable) {
      return
    }

    // Wait until flow state reflects selected onboarding method to avoid
    // triggering OAuth from the default "chatgpt" value on first render.
    if (method !== onboardingMethod) {
      return
    }

    if (didAutoStartRef.current) {
      return
    }

    didAutoStartRef.current = true
    void start()
  }, [
    method,
    onboardingMethod,
    runtimeStatusQuery.isLoading,
    runtimeUnavailable,
    start,
  ])

  useEffect(() => {
    if (state === "success") {
      setCodexOnboardingCompleted(true)
      setCodexOnboardingAuthMethod(method)
    }
  }, [method, setCodexOnboardingAuthMethod, setCodexOnboardingCompleted, state])

  const handleBack = async () => {
    if (isRunning) {
      await cancel()
    }
    setOnboardingProviderMode(null)
  }

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
      <div
        className="fixed top-0 left-0 right-0 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      <LanguageSwitcher compact className="fixed top-12 right-4" />

      <button
        onClick={() => void handleBack()}
        className="fixed top-12 left-4 flex items-center justify-center h-8 w-8 rounded-full hover:bg-foreground/5 transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="w-full max-w-[480px] px-4">
        <CodexLoginContent
          state={state}
          method={method}
          apiKey={apiKeyInput}
          error={error}
          url={url}
          isOpeningUrl={isOpeningUrl}
          isConnecting={isRunning || isOpeningUrl}
          runtimeState={
            onboardingMethod === "chatgpt"
              ? runtimeStatusQuery.isLoading
                ? "checking"
                : runtimeUnavailable
                  ? "missing"
                  : "ready"
              : undefined
          }
          runtimeHint={failedRuntime?.hint ?? null}
          onOpenUrl={() => {
            void openUrl()
          }}
          onRetry={() => {
            void start()
          }}
          onApiKeyChange={setApiKeyInput}
          onSubmitApiKey={() => {
            void saveApiKey()
          }}
        />
      </div>
    </div>
  )
}
