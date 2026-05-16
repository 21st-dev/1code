"use client"

import { useSetAtom } from "jotai"
import { ChevronLeft } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { LanguageSwitcher } from "../../components/language-switcher"
import { ClaudeCodeIcon, IconSpinner } from "../../components/ui/icons"
import { Logo } from "../../components/ui/logo"
import {
  anthropicOnboardingCompletedAtom,
  billingMethodAtom,
} from "../../lib/atoms"
import { useI18n } from "../../lib/i18n"
import { trpc } from "../../lib/trpc"
import { ClaudeCodeAuthCodeForm } from "../agents/components/claude-code-auth-code-form"
import { useClaudeCodeLoginFlow } from "../agents/hooks/use-claude-code-login-flow"

type AuthFlowState =
  | { step: "idle" }
  | { step: "error"; message: string }

export function AnthropicOnboardingPage() {
  const { t } = useI18n()
  const [flowState, setFlowState] = useState<AuthFlowState>({ step: "idle" })
  const [ignoredExistingToken, setIgnoredExistingToken] = useState(false)
  const [isUsingExistingToken, setIsUsingExistingToken] = useState(false)
  const [existingTokenError, setExistingTokenError] = useState<string | null>(null)
  const didAutoStartRef = useRef(false)
  const {
    state: localLoginState,
    url: localLoginUrl,
    output: localLoginOutput,
    error: localLoginErrorMessage,
    submitState: localLoginSubmitState,
    submitError: localLoginSubmitError,
    isRunning: isLocalLoginRunning,
    isSubmittingCode: isSubmittingLocalLoginCode,
    start: startLocalLogin,
    openUrl: openLocalLoginUrl,
    submitCode: submitLocalLoginCode,
  } = useClaudeCodeLoginFlow()
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom,
  )
  const setBillingMethod = useSetAtom(billingMethodAtom)

  const importSystemTokenMutation = trpc.claudeCode.importSystemToken.useMutation()
  const existingTokenQuery = trpc.claudeCode.getSystemToken.useQuery()
  const existingCredential = existingTokenQuery.data
  const hasExistingToken = Boolean(existingCredential?.hasCredentials)
  const checkedExistingToken = !existingTokenQuery.isLoading
  const shouldOfferExistingToken =
    checkedExistingToken && hasExistingToken && !ignoredExistingToken
  const existingCredentialDescription = existingCredential?.hasRefreshToken
    ? t("onboarding.claude.refreshableCredentials")
    : t("onboarding.claude.nonRefreshableCredentials")
  const localLoginError =
    localLoginState === "error" ? localLoginErrorMessage : null
  const hasError = flowState.step === "error" || Boolean(localLoginError)

  const handleBack = () => {
    setBillingMethod(null)
  }

  const handleConnectClick = async () => {
    if (isLocalLoginRunning) return
    setFlowState({ step: "idle" })
    await startLocalLogin()
  }

  const handleUseExistingToken = async () => {
    if (!hasExistingToken || isUsingExistingToken) return

    setIsUsingExistingToken(true)
    setExistingTokenError(null)

    try {
      await importSystemTokenMutation.mutateAsync()
      setAnthropicOnboardingCompleted(true)
    } catch (err) {
      setExistingTokenError(
        err instanceof Error ? err.message : "Failed to use existing token",
      )
      setIsUsingExistingToken(false)
    }
  }

  const handleRejectExistingToken = () => {
    setIgnoredExistingToken(true)
    setExistingTokenError(null)
    void handleConnectClick()
  }

  useEffect(() => {
    if (localLoginState === "success") {
      setAnthropicOnboardingCompleted(true)
    }
  }, [localLoginState, setAnthropicOnboardingCompleted])

  useEffect(() => {
    if (
      didAutoStartRef.current ||
      !checkedExistingToken ||
      shouldOfferExistingToken ||
      flowState.step !== "idle"
    ) {
      return
    }

    didAutoStartRef.current = true
    void handleConnectClick()
  }, [checkedExistingToken, flowState.step, shouldOfferExistingToken])

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
      <div
        className="fixed top-0 left-0 right-0 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      <LanguageSwitcher compact className="fixed top-12 right-4" />

      <button
        onClick={handleBack}
        className="fixed top-12 left-4 flex items-center justify-center h-8 w-8 rounded-full hover:bg-foreground/5 transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="w-full max-w-[440px] space-y-8 px-4">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 p-2 mx-auto w-max rounded-full border border-border">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <Logo className="w-5 h-5" fill="white" />
            </div>
            <div className="w-10 h-10 rounded-full bg-[#D97757] flex items-center justify-center">
              <ClaudeCodeIcon className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight">
              {t("onboarding.claude.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("onboarding.claude.subtitle")}
            </p>
          </div>
        </div>

        <div className="space-y-6 flex flex-col items-center">
          {shouldOfferExistingToken && flowState.step === "idle" && (
            <div className="space-y-4 w-full">
              <div className="p-4 bg-muted/50 border border-border rounded-lg">
                <p className="text-sm font-medium">
                  {t("onboarding.claude.existingCredentials")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {existingCredentialDescription}
                </p>
              </div>
              {existingTokenError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">
                    {existingTokenError}
                  </p>
                </div>
              )}
              <div className="flex w-full gap-2">
                <button
                  onClick={handleRejectExistingToken}
                  disabled={isUsingExistingToken}
                  className="h-8 px-3 flex-1 bg-muted text-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-muted/80 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {t("onboarding.claude.authWithAnthropic")}
                </button>
                <button
                  onClick={handleUseExistingToken}
                  disabled={isUsingExistingToken}
                  className="h-8 px-3 flex-1 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isUsingExistingToken ? (
                    <IconSpinner className="h-4 w-4" />
                  ) : (
                    t("onboarding.claude.useExistingToken")
                  )}
                </button>
              </div>
            </div>
          )}

          {!shouldOfferExistingToken && (
            <div className="w-full space-y-3">
              <div className="p-4 bg-muted/50 border border-border rounded-lg">
                <p className="text-sm text-muted-foreground">
                  {isLocalLoginRunning
                    ? t("onboarding.claude.waitingForLocalLogin")
                    : t("onboarding.claude.localOnlyLoginPrompt")}
                </p>
              </div>
              {(isLocalLoginRunning || localLoginState === "importing") && (
                <>
                  {localLoginOutput && (
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                      {localLoginOutput.trim()}
                    </pre>
                  )}
                  {localLoginUrl && (
                    <button
                      type="button"
                      onClick={() => void openLocalLoginUrl()}
                      className="w-full text-xs text-primary hover:underline"
                    >
                      {t("onboarding.claude.didntOpen")}
                    </button>
                  )}
                  <ClaudeCodeAuthCodeForm
                    disabled={!isLocalLoginRunning}
                    isSubmitting={isSubmittingLocalLoginCode}
                    onSubmitCode={submitLocalLoginCode}
                  />
                  {localLoginSubmitState !== "idle" && (
                    <p
                      className={
                        localLoginSubmitState === "error"
                          ? "text-xs text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {localLoginSubmitError ||
                        (localLoginSubmitState === "submitting"
                          ? t("onboarding.claude.submittingCode")
                          : t("onboarding.claude.codeSubmitted"))}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {checkedExistingToken &&
            !shouldOfferExistingToken &&
            !hasError && (
              <button
                onClick={handleConnectClick}
                disabled={isLocalLoginRunning}
                className="h-8 px-4 min-w-[85px] bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isLocalLoginRunning ? (
                  <IconSpinner className="h-4 w-4" />
                ) : (
                  t("onboarding.claude.signInWithClaudeCode")
                )}
              </button>
            )}

          {hasError && (
            <div className="space-y-4">
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">
                  {localLoginError ||
                    (flowState.step === "error" ? flowState.message : "")}
                </p>
              </div>
              <button
                onClick={handleConnectClick}
                className="w-full h-8 px-3 bg-muted text-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-muted/80 active:scale-[0.97] flex items-center justify-center"
              >
                {t("common.tryAgain")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
