"use client"

import { useSetAtom } from "jotai"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { IconSpinner } from "../../../../components/ui/icons"
import { helperApisSetupPromptPendingAtom } from "../../../../lib/atoms"
import { useI18n } from "../../../../lib/i18n"
import { trpc } from "../../../../lib/trpc"
import { ClaudeCodeAuthCodeForm } from "../../../agents/components/claude-code-auth-code-form"
import { useClaudeCodeLoginFlow } from "../../../agents/hooks/use-claude-code-login-flow"

type AuthFlowState = { step: "idle" } | { step: "error"; message: string }

/**
 * Claude Code sign-in action (OAuth + existing-credential import). Embedded in the
 * AI-path panel; never auto-starts — the user must click to launch login.
 */
export function ClaudeCodeAction() {
  const { t } = useI18n()
  const [flowState, setFlowState] = useState<AuthFlowState>({ step: "idle" })
  const [ignoredExistingToken, setIgnoredExistingToken] = useState(false)
  const [isUsingExistingToken, setIsUsingExistingToken] = useState(false)
  const [existingTokenError, setExistingTokenError] = useState<string | null>(
    null,
  )
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
  const setHelperApisSetupPromptPending = useSetAtom(
    helperApisSetupPromptPendingAtom,
  )

  const importSystemTokenMutation =
    trpc.claudeCode.importSystemToken.useMutation()
  const trpcUtils = trpc.useUtils()
  const existingTokenQuery = trpc.claudeCode.getSystemToken.useQuery()
  const runtimeStatusQuery = trpc.claudeCode.getRuntimeStatus.useQuery()
  const integrationQuery = trpc.claudeCode.getIntegration.useQuery()
  const alreadyConnected = Boolean(
    integrationQuery.data?.isConnected && !integrationQuery.data?.isExpired,
  )
  const existingCredential = existingTokenQuery.data
  const runtimeStatus = runtimeStatusQuery.data
  const runtimeReady = runtimeStatus?.executable.ok === true
  const runtimeUnavailable =
    runtimeStatusQuery.isFetched && runtimeStatus?.executable.ok !== true
  const hasExistingToken = Boolean(existingCredential?.hasCredentials)
  const checkedExistingToken = !existingTokenQuery.isLoading
  const shouldOfferExistingToken =
    checkedExistingToken && hasExistingToken && !ignoredExistingToken
  const existingCredentialDescription = existingCredential?.hasRefreshToken
    ? t("onboarding.claude.credentialsWithRefreshToken")
    : t("onboarding.claude.nonRefreshableCredentials")
  const formatClaudeCodeAuthError = (message: string | null | undefined) => {
    if (!message) return ""
    if (
      /secure storage is unavailable|OS keychain\/credential store/i.test(
        message,
      )
    ) {
      return t("onboarding.claude.secureStorageUnavailable")
    }
    if (/invalid_grant|expired or revoked/i.test(message)) {
      return t("onboarding.claude.localCredentialsInvalid")
    }
    return message
  }
  const localLoginError =
    localLoginState === "error"
      ? formatClaudeCodeAuthError(localLoginErrorMessage)
      : null
  const hasError = flowState.step === "error" || Boolean(localLoginError)
  const localizedLocalLoginOutput = localLoginOutput
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const trimmed = line.trim()
      if (
        trimmed ===
        "Opening Anthropic sign-in in your browser. Paste the full authentication code here after sign-in."
      ) {
        return t("onboarding.claude.localLoginOpening")
      }
      if (
        trimmed === "Authentication code submitted; exchanging token locally..."
      ) {
        return t("onboarding.claude.localLoginCodeSubmitted")
      }
      if (trimmed === "Local Claude Code credentials imported.") {
        return t("onboarding.claude.localLoginImported")
      }
      const failedPrefix = "Claude Code login failed:"
      if (trimmed.startsWith(failedPrefix)) {
        return `${t("onboarding.claude.localLoginFailed")} ${formatClaudeCodeAuthError(trimmed.slice(failedPrefix.length).trim())}`
      }
      return trimmed
    })
    .join("\n")

  const handleConnectClick = useCallback(async () => {
    if (isLocalLoginRunning || runtimeUnavailable) return
    setFlowState({ step: "idle" })
    await startLocalLogin()
  }, [isLocalLoginRunning, runtimeUnavailable, startLocalLogin])

  const handleUseExistingToken = async () => {
    if (!hasExistingToken || isUsingExistingToken || !runtimeReady) return

    setIsUsingExistingToken(true)
    setExistingTokenError(null)

    try {
      const result = await importSystemTokenMutation.mutateAsync()
      trpcUtils.claudeCode.getIntegration.setData(undefined, result.metadata)
      await Promise.allSettled([
        trpcUtils.anthropicAccounts.list.invalidate(),
        trpcUtils.anthropicAccounts.getActive.invalidate(),
        trpcUtils.claudeCode.getIntegration.invalidate(),
      ])
      setHelperApisSetupPromptPending(true)
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
      setHelperApisSetupPromptPending(true)
    }
  }, [localLoginState, setHelperApisSetupPromptPending])

  // Already connected → show status rather than a sign-in button.
  if (alreadyConnected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {t("onboarding.claude.alreadyConnected")}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div
        className={
          runtimeUnavailable
            ? "w-full rounded-lg border border-destructive/20 bg-destructive/10 p-3"
            : "w-full rounded-lg border border-border bg-muted/40 p-3"
        }
      >
        <div className="flex gap-2">
          {runtimeStatusQuery.isLoading ? (
            <IconSpinner className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : runtimeUnavailable ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">
              {runtimeStatusQuery.isLoading
                ? t("onboarding.runtime.checking")
                : runtimeUnavailable
                  ? t("onboarding.runtime.claudeMissing")
                  : t("onboarding.runtime.claudeReady")}
            </p>
            {runtimeUnavailable && runtimeStatus?.executable.hint && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {runtimeStatus.executable.hint}
              </p>
            )}
          </div>
        </div>
      </div>

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
                {formatClaudeCodeAuthError(existingTokenError)}
              </p>
            </div>
          )}
          <div className="grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleRejectExistingToken}
              disabled={isUsingExistingToken || !runtimeReady}
              className="flex min-h-10 min-w-0 items-center justify-center rounded-lg bg-muted px-3 py-2 text-center text-sm font-medium leading-5 text-foreground transition-[background-color,transform] duration-150 hover:bg-muted/80 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("onboarding.claude.authWithAnthropic")}
            </button>
            <button
              type="button"
              onClick={handleUseExistingToken}
              disabled={isUsingExistingToken || !runtimeReady}
              className="flex min-h-10 min-w-0 items-center justify-center rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium leading-5 text-primary-foreground shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)]"
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
              {localizedLocalLoginOutput && (
                <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                  {localizedLocalLoginOutput}
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

      {checkedExistingToken && !shouldOfferExistingToken && !hasError && (
        <button
          type="button"
          onClick={handleConnectClick}
          disabled={isLocalLoginRunning || !runtimeReady}
          className="h-8 px-4 w-full bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
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
            type="button"
            onClick={handleConnectClick}
            className="w-full h-8 px-3 bg-muted text-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-muted/80 active:scale-[0.97] flex items-center justify-center"
          >
            {t("common.tryAgain")}
          </button>
        </div>
      )}
    </div>
  )
}
