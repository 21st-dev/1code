"use client"

import { useAtom, useSetAtom } from "jotai"
import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { pendingAuthRetryMessageAtom } from "../../features/agents/atoms"
import {
  agentsLoginModalOpenAtom,
  agentsSettingsDialogActiveTabAtom,
  agentsSettingsDialogOpenAtom,
  type SettingsTab,
} from "../../lib/atoms"
import { appStore } from "../../lib/jotai-store"
import { trpc } from "../../lib/trpc"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
} from "../ui/alert-dialog"
import { Button } from "../ui/button"
import { ClaudeCodeIcon, IconSpinner } from "../ui/icons"
import { Logo } from "../ui/logo"

type AuthFlowState =
  | { step: "idle" }
  | { step: "authenticating" }
  | { step: "cli-setup" }
  | { step: "success" }
  | { step: "error"; message: string; recoverable: boolean }

export function ClaudeLoginModal() {
  const [open, setOpen] = useAtom(agentsLoginModalOpenAtom)
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const [flowState, setFlowState] = useState<AuthFlowState>({ step: "idle" })

  // tRPC mutations
  const startLocalAuthMutation = trpc.claudeCode.startLocalAuth.useMutation()
  const cancelLocalAuthMutation = trpc.claudeCode.cancelLocalAuth.useMutation()
  const setupTokenWithCliMutation = trpc.claudeCode.setupTokenWithCli.useMutation()
  const cliInstalledQuery = trpc.claudeCode.isClaudeCliInstalled.useQuery()

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setFlowState({ step: "idle" })
    }
  }, [open])

  // Helper to trigger retry after successful OAuth
  const triggerAuthRetry = () => {
    const pending = appStore.get(pendingAuthRetryMessageAtom)
    if (pending) {
      console.log("[ClaudeLoginModal] OAuth success - triggering retry for subChatId:", pending.subChatId)
      appStore.set(pendingAuthRetryMessageAtom, { ...pending, readyToRetry: true })
    }
  }

  // Helper to clear pending retry (on cancel/close without success)
  const clearPendingRetry = () => {
    const pending = appStore.get(pendingAuthRetryMessageAtom)
    if (pending && !pending.readyToRetry) {
      console.log("[ClaudeLoginModal] Modal closed without success - clearing pending retry")
      appStore.set(pendingAuthRetryMessageAtom, null)
    }
  }

  const handleConnect = async () => {
    if (flowState.step === "authenticating") return

    setFlowState({ step: "authenticating" })

    try {
      await startLocalAuthMutation.mutateAsync()
      setFlowState({ step: "success" })
      // Trigger retry and close modal after brief success state
      triggerAuthRetry()
      setTimeout(() => setOpen(false), 500)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed"
      const recoverable = !message.includes("unexpected") && !message.includes("internal")
      setFlowState({ step: "error", message, recoverable })
    }
  }

  const handleCancel = () => {
    cancelLocalAuthMutation.mutate()
    setFlowState({ step: "idle" })
  }

  const handleSetupWithCli = async () => {
    if (flowState.step === "cli-setup") return

    setFlowState({ step: "cli-setup" })

    try {
      await setupTokenWithCliMutation.mutateAsync()
      setFlowState({ step: "success" })
      triggerAuthRetry()
      setTimeout(() => setOpen(false), 500)
    } catch (error) {
      if (flowState.step !== "cli-setup") return

      const message = error instanceof Error ? error.message : "CLI setup failed"
      const recoverable = !message.includes("not installed")
      setFlowState({ step: "error", message, recoverable })
    }
  }

  const handleOpenModelsSettings = () => {
    clearPendingRetry()
    setSettingsActiveTab("models" as SettingsTab)
    setSettingsOpen(true)
    setOpen(false)
  }

  // Handle modal open/close - clear pending retry if closing without success
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      clearPendingRetry()
    }
    setOpen(newOpen)
  }

  const isAuthenticating = flowState.step === "authenticating"
  const isCliSetup = flowState.step === "cli-setup"
  const isClaudeCliInstalled = cliInstalledQuery.data?.installed ?? false

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="w-[380px] p-6">
        {/* Close button */}
        <AlertDialogCancel className="absolute right-4 top-4 h-6 w-6 p-0 border-0 bg-transparent hover:bg-muted rounded-sm opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </AlertDialogCancel>

        <div className="space-y-8">
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
                Claude Code
              </h1>
              <p className="text-sm text-muted-foreground">
                Connect your Claude Code subscription
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            {/* Auth Options - Idle state */}
            {flowState.step === "idle" && (
              <div className="w-full space-y-3">
                {/* Primary: Import from Claude CLI (if installed) */}
                {isClaudeCliInstalled && (
                  <Button onClick={handleSetupWithCli} className="w-full">
                    Import from Claude CLI
                  </Button>
                )}

                {/* Secondary: OAuth (only show if CLI not installed) */}
                {!isClaudeCliInstalled && (
                  <Button onClick={handleConnect} className="w-full">
                    Connect with OAuth
                  </Button>
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
                  <Button variant="secondary" onClick={handleConnect} className="w-full">
                    Connect with OAuth
                  </Button>
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
                <Button variant="secondary" onClick={handleCancel} className="w-full">
                  Cancel
                </Button>
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
              <div className="space-y-4">
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">{flowState.message}</p>
                </div>
                {flowState.recoverable && (
                  <Button variant="secondary" onClick={handleConnect} className="w-full">
                    Try Again
                  </Button>
                )}
              </div>
            )}

            <div className="text-center !mt-2">
              <button
                type="button"
                onClick={handleOpenModelsSettings}
                className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
              >
                Set a custom model in Settings
              </button>
            </div>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
