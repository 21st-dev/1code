"use client"

import { useAtom, useSetAtom } from "jotai"
import { X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { pendingAuthRetryMessageAtom } from "../../features/agents/atoms"
import { ClaudeCodeAuthCodeForm } from "../../features/agents/components/claude-code-auth-code-form"
import { useClaudeCodeLoginFlow } from "../../features/agents/hooks/use-claude-code-login-flow"
import {
  agentsLoginModalOpenAtom,
  agentsSettingsDialogActiveTabAtom,
  agentsSettingsDialogOpenAtom,
  anthropicOnboardingCompletedAtom,
  type SettingsTab,
} from "../../lib/atoms"
import { appStore } from "../../lib/jotai-store"
import { trpc } from "../../lib/trpc"
import { useI18n } from "../../lib/i18n"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "../ui/alert-dialog"
import { Button } from "../ui/button"
import { ClaudeCodeIcon, IconSpinner } from "../ui/icons"
import { Logo } from "../ui/logo"

type AuthFlowState =
  | { step: "idle" }
  | { step: "submitting" }
  | { step: "error"; message: string }

type ClaudeLoginModalProps = {
  hideCustomModelSettingsLink?: boolean
  autoStartAuth?: boolean
}

export function ClaudeLoginModal({
  hideCustomModelSettingsLink = false,
  autoStartAuth = false,
}: ClaudeLoginModalProps) {
  const [open, setOpen] = useAtom(agentsLoginModalOpenAtom)
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom,
  )
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const [flowState, setFlowState] = useState<AuthFlowState>({ step: "idle" })
  const didAutoStartForOpenRef = useRef(false)
  const localLoginSuccessHandledRef = useRef(false)
  const wasOpenRef = useRef(open)
  const { t } = useI18n()
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
    cancel: cancelLocalLogin,
    reset: resetLocalLogin,
    openUrl: openLocalLoginUrl,
    submitCode: submitLocalLoginCode,
  } = useClaudeCodeLoginFlow()

  const importSystemTokenMutation = trpc.claudeCode.importSystemToken.useMutation()
  const systemTokenQuery = trpc.claudeCode.getSystemToken.useQuery(undefined, {
    enabled: open,
  })
  const trpcUtils = trpc.useUtils()
  const hasLocalClaudeCredential = Boolean(systemTokenQuery.data?.hasCredentials)

  const triggerAuthRetry = useCallback(() => {
    const pending = appStore.get(pendingAuthRetryMessageAtom)
    if (pending && pending.provider === "claude-code") {
      console.log(
        "[ClaudeLoginModal] OAuth success - triggering retry for subChatId:",
        pending.subChatId,
      )
      appStore.set(pendingAuthRetryMessageAtom, {
        ...pending,
        readyToRetry: true,
      })
    }
  }, [])

  const clearPendingRetry = useCallback(() => {
    const pending = appStore.get(pendingAuthRetryMessageAtom)
    if (
      pending &&
      pending.provider === "claude-code" &&
      !pending.readyToRetry
    ) {
      console.log(
        "[ClaudeLoginModal] Modal closed without success - clearing pending retry",
      )
      appStore.set(pendingAuthRetryMessageAtom, null)
    }
  }, [])

  const handleAuthSuccess = useCallback(() => {
    triggerAuthRetry()
    setAnthropicOnboardingCompleted(true)
    setOpen(false)
    void Promise.allSettled([
      trpcUtils.anthropicAccounts.list.invalidate(),
      trpcUtils.anthropicAccounts.getActive.invalidate(),
      trpcUtils.claudeCode.getIntegration.invalidate(),
    ])
  }, [
    setAnthropicOnboardingCompleted,
    setOpen,
    triggerAuthRetry,
    trpcUtils,
  ])

  const handleImportLocalCredentials = useCallback(async () => {
    setFlowState({ step: "submitting" })
    try {
      await importSystemTokenMutation.mutateAsync()
      handleAuthSuccess()
    } catch (err) {
      setFlowState({
        step: "error",
        message:
          err instanceof Error
            ? err.message
            : t("onboarding.claude.failedToImportLocalCredentials"),
      })
    }
  }, [handleAuthSuccess, importSystemTokenMutation, t])

  const handleConnectClick = useCallback(async () => {
    if (hasLocalClaudeCredential) {
      await handleImportLocalCredentials()
      return
    }

    setFlowState({ step: "idle" })
    await startLocalLogin()
  }, [
    handleImportLocalCredentials,
    hasLocalClaudeCredential,
    startLocalLogin,
  ])

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      return
    }

    if (!wasOpenRef.current) return

    wasOpenRef.current = false
    setFlowState({ step: "idle" })
    didAutoStartForOpenRef.current = false
    localLoginSuccessHandledRef.current = false
    if (isLocalLoginRunning) {
      void cancelLocalLogin()
    }
    resetLocalLogin()
  }, [cancelLocalLogin, isLocalLoginRunning, open, resetLocalLogin])

  useEffect(() => {
    if (
      localLoginState !== "success" ||
      localLoginSuccessHandledRef.current
    ) {
      return
    }

    localLoginSuccessHandledRef.current = true
    handleAuthSuccess()
  }, [handleAuthSuccess, localLoginState])

  useEffect(() => {
    if (
      !open ||
      !autoStartAuth ||
      flowState.step !== "idle" ||
      didAutoStartForOpenRef.current
    ) {
      return
    }

    didAutoStartForOpenRef.current = true
    void handleConnectClick()
  }, [autoStartAuth, flowState.step, handleConnectClick, open])

  const handleOpenModelsSettings = () => {
    clearPendingRetry()
    setSettingsActiveTab("models" as SettingsTab)
    setSettingsOpen(true)
    setOpen(false)
  }

  const isSubmitting = flowState.step === "submitting"
  const localLoginError =
    localLoginState === "error" ? localLoginErrorMessage : null
  const hasError = flowState.step === "error" || Boolean(localLoginError)

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      clearPendingRetry()
    }
    setOpen(newOpen)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="w-[380px] p-6">
        <AlertDialogTitle className="sr-only">
          Claude Code login
        </AlertDialogTitle>
        <AlertDialogDescription className="sr-only">
          Connect local Claude Code credentials.
        </AlertDialogDescription>
        <AlertDialogCancel className="absolute right-4 top-4 h-6 w-6 p-0 border-0 bg-transparent hover:bg-muted rounded-sm opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
          <span className="sr-only">{t("common.close")}</span>
        </AlertDialogCancel>

        <div className="space-y-8">
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
                Claude Code
              </h1>
              <p className="text-sm text-muted-foreground">
                Connect your Claude Code subscription
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="p-4 bg-muted/50 border border-border rounded-lg">
              <p className="text-sm text-muted-foreground">
                {hasLocalClaudeCredential
                  ? t("onboarding.claude.localCredentialsReady")
                  : isLocalLoginRunning
                    ? t("onboarding.claude.waitingForLocalLogin")
                    : t("onboarding.claude.localOnlyLoginPrompt")}
              </p>
            </div>

            {!hasError && hasLocalClaudeCredential && (
              <Button
                onClick={() => void handleImportLocalCredentials()}
                className="w-full"
                disabled={importSystemTokenMutation.isPending || isSubmitting}
              >
                {importSystemTokenMutation.isPending || isSubmitting ? (
                  <IconSpinner className="h-4 w-4" />
                ) : (
                  t("onboarding.claude.importLocalCredentials")
                )}
              </Button>
            )}

            {!hasError && !hasLocalClaudeCredential && (
              <Button
                onClick={() => void handleConnectClick()}
                className="w-full"
                disabled={isLocalLoginRunning || isSubmitting}
              >
                {isLocalLoginRunning || isSubmitting ? (
                  <IconSpinner className="h-4 w-4" />
                ) : (
                  t("onboarding.claude.signInWithClaudeCode")
                )}
              </Button>
            )}

            {(isLocalLoginRunning || localLoginState === "importing") && (
              <div className="space-y-3">
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
              </div>
            )}

            {hasError && (
              <div className="space-y-4">
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">
                    {localLoginError ||
                      (flowState.step === "error" ? flowState.message : "")}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={
                    hasLocalClaudeCredential
                      ? () => void handleImportLocalCredentials()
                      : () => void startLocalLogin()
                  }
                  className="w-full"
                >
                  {hasLocalClaudeCredential
                    ? t("onboarding.claude.importLocalCredentials")
                    : t("onboarding.claude.signInWithClaudeCode")}
                </Button>
              </div>
            )}

            {!hideCustomModelSettingsLink && (
              <div className="text-center !mt-2">
                <button
                  type="button"
                  onClick={handleOpenModelsSettings}
                  className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  Set a custom model in Settings
                </button>
              </div>
            )}
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
