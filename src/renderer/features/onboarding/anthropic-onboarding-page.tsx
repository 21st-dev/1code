"use client"

import { useSetAtom } from "jotai"
import { ChevronLeft } from "lucide-react"
import { useState } from "react"

import { ClaudeCodeIcon, IconSpinner } from "../../components/ui/icons"
import { Logo } from "../../components/ui/logo"
import {
  anthropicOnboardingCompletedAtom,
  billingMethodAtom,
} from "../../lib/atoms"
import { trpc } from "../../lib/trpc"

type AuthFlowState =
  | { step: "idle" }
  | { step: "authenticating" }
  | { step: "cli-setup" }
  | { step: "success" }
  | { step: "error"; message: string; recoverable: boolean }

export function AnthropicOnboardingPage() {
  const [flowState, setFlowState] = useState<AuthFlowState>({ step: "idle" })
  const [ignoredExistingToken, setIgnoredExistingToken] = useState(false)
  const [isUsingExistingToken, setIsUsingExistingToken] = useState(false)
  const [existingTokenError, setExistingTokenError] = useState<string | null>(null)

  const setAnthropicOnboardingCompleted = useSetAtom(anthropicOnboardingCompletedAtom)
  const setBillingMethod = useSetAtom(billingMethodAtom)

  const handleBack = () => {
    setBillingMethod(null)
  }

  const formatTokenPreview = (token: string) => {
    const trimmed = token.trim()
    if (trimmed.length <= 16) return trimmed
    return `${trimmed.slice(0, 19)}...${trimmed.slice(-6)}`
  }

  // tRPC mutations
  const startLocalAuthMutation = trpc.claudeCode.startLocalAuth.useMutation()
  const cancelLocalAuthMutation = trpc.claudeCode.cancelLocalAuth.useMutation()
  const importSystemTokenMutation = trpc.claudeCode.importSystemToken.useMutation()
  const setupTokenWithCliMutation = trpc.claudeCode.setupTokenWithCli.useMutation()
  const existingTokenQuery = trpc.claudeCode.getSystemToken.useQuery()
  const cliInstalledQuery = trpc.claudeCode.isClaudeCliInstalled.useQuery()

  const existingToken = existingTokenQuery.data?.token ?? null
  const hasExistingToken = !!existingToken
  const checkedExistingToken = existingTokenQuery.isFetched
  const shouldOfferExistingToken =
    checkedExistingToken && hasExistingToken && !ignoredExistingToken

  const handleConnect = async () => {
    if (flowState.step === "authenticating") return

    setFlowState({ step: "authenticating" })

    try {
      await startLocalAuthMutation.mutateAsync()
      // Only advance to success if still in authenticating state (not canceled)
      if (flowState.step === "authenticating") {
        setFlowState({ step: "success" })
        // Small delay for visual feedback, then complete onboarding
        setTimeout(() => setAnthropicOnboardingCompleted(true), 500)
      }
    } catch (error) {
      // Ignore errors if user has canceled (state is no longer "authenticating")
      if (flowState.step !== "authenticating") return

      const message = error instanceof Error ? error.message : "Authentication failed"
      // Check if error is recoverable (user can retry)
      const recoverable = !message.includes("unexpected") && !message.includes("internal")
      setFlowState({ step: "error", message, recoverable })
    }
  }

  const handleCancel = () => {
    cancelLocalAuthMutation.mutate()
    setFlowState({ step: "idle" })
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
        err instanceof Error ? err.message : "Failed to use existing token"
      )
      setIsUsingExistingToken(false)
    }
  }

  const handleRejectExistingToken = () => {
    setIgnoredExistingToken(true)
    setExistingTokenError(null)
  }

  const handleSetupWithCli = async () => {
    if (flowState.step === "cli-setup") return

    setFlowState({ step: "cli-setup" })

    try {
      await setupTokenWithCliMutation.mutateAsync()
      setFlowState({ step: "success" })
      setTimeout(() => setAnthropicOnboardingCompleted(true), 500)
    } catch (error) {
      if (flowState.step !== "cli-setup") return

      const message = error instanceof Error ? error.message : "CLI setup failed"
      const recoverable = !message.includes("not installed")
      setFlowState({ step: "error", message, recoverable })
    }
  }

  const isAuthenticating = flowState.step === "authenticating"
  const isCliSetup = flowState.step === "cli-setup"
  const isClaudeCliInstalled = cliInstalledQuery.data?.installed ?? false

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
            <div className="w-10 h-10 rounded-full bg-[#D97757] flex items-center justify-center">
              <ClaudeCodeIcon className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight">
              Connect Claude Code
            </h1>
            <p className="text-sm text-muted-foreground">
              Connect your Claude Code subscription to get started
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 flex flex-col items-center">
          {/* Existing token prompt */}
          {shouldOfferExistingToken && flowState.step === "idle" && (
            <div className="space-y-4 w-full">
              <div className="p-4 bg-muted/50 border border-border rounded-lg">
                <p className="text-sm font-medium">
                  Existing Claude Code credentials found
                </p>
                {existingToken && (
                  <pre className="mt-2 px-2.5 py-2 text-xs text-foreground whitespace-pre-wrap break-words font-mono bg-background/60 rounded border border-border/60">
                    {formatTokenPreview(existingToken)}
                  </pre>
                )}
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
                  Auth with Anthropic
                </button>
                <button
                  onClick={handleUseExistingToken}
                  disabled={isUsingExistingToken}
                  className="h-8 px-3 flex-1 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isUsingExistingToken ? (
                    <IconSpinner className="h-4 w-4" />
                  ) : (
                    "Use existing token"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Auth Options - Idle state */}
          {checkedExistingToken &&
            !shouldOfferExistingToken &&
            flowState.step === "idle" && (
              <div className="w-full space-y-3">
                {/* Primary: Import from Claude CLI (if installed) */}
                {isClaudeCliInstalled && (
                  <button
                    onClick={handleSetupWithCli}
                    className="w-full h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] flex items-center justify-center"
                  >
                    Import from Claude CLI
                  </button>
                )}

                {/* Secondary: OAuth (only show if CLI not installed) */}
                {!isClaudeCliInstalled && (
                  <button
                    onClick={handleConnect}
                    className="w-full h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] flex items-center justify-center"
                  >
                    Connect with OAuth
                  </button>
                )}

                {/* Divider */}
                {isClaudeCliInstalled && (
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Or</span>
                    </div>
                  </div>
                )}

                {/* Tertiary: OAuth (if CLI is installed) */}
                {isClaudeCliInstalled && (
                  <button
                    onClick={handleConnect}
                    className="w-full h-8 px-4 bg-muted text-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-muted/80 active:scale-[0.97] flex items-center justify-center"
                  >
                    Connect with OAuth
                  </button>
                )}
              </div>
            )}

          {/* Authenticating state */}
          {isAuthenticating && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <IconSpinner className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Authenticating with Anthropic...</p>
                <p className="text-xs text-muted-foreground">
                  A browser window has opened. Please complete authentication there.
                </p>
              </div>
              <button
                onClick={handleCancel}
                className="h-8 px-4 bg-muted text-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-muted/80 active:scale-[0.97] flex items-center justify-center"
              >
                Cancel
              </button>
            </div>
          )}

          {/* CLI Setup state */}
          {isCliSetup && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <IconSpinner className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Setting up with Claude CLI...</p>
                <p className="text-xs text-muted-foreground">
                  A browser window has opened. Please complete authentication there.
                </p>
              </div>
            </div>
          )}

          {/* Success state */}
          {flowState.step === "success" && (
            <div className="space-y-2 text-center">
              <div className="flex justify-center">
                <svg
                  className="h-8 w-8 text-green-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
                    strokeLinecap="round"
                  />
                  <polyline
                    points="22 4 12 14.01 9 11.01"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium">Authentication successful!</p>
            </div>
          )}

          {/* Error State */}
          {flowState.step === "error" && (
            <div className="space-y-4 w-full">
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">{flowState.message}</p>
              </div>
              {flowState.recoverable && (
                <button
                  onClick={handleConnect}
                  className="w-full h-8 px-3 bg-muted text-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-muted/80 active:scale-[0.97] flex items-center justify-center"
                >
                  Try Again
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
