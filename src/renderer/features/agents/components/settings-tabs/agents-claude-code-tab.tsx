"use client"

import { trpc } from "../../../../lib/trpc"
import { useState } from "react"
import { Button } from "../../../../components/ui/button"
import { IconSpinner } from "../../../../components/ui/icons"
import { Check, X } from "lucide-react"
import { toast } from "sonner"

type AuthFlowState =
  | { step: "idle" }
  | { step: "authenticating" }
  | { step: "cli-setup" }
  | { step: "success" }
  | { step: "error"; message: string; recoverable: boolean }

export function AgentsClaudeCodeTab() {
  const [flowState, setFlowState] = useState<AuthFlowState>({ step: "idle" })

  const utils = trpc.useUtils()

  // Query integration status (local SQLite)
  const {
    data: integration,
    isLoading,
    error,
    refetch,
  } = trpc.claudeCode.getIntegration.useQuery()

  // Query CLI installation status
  const cliInstalledQuery = trpc.claudeCode.isClaudeCliInstalled.useQuery()

  // Start local auth mutation
  const startLocalAuth = trpc.claudeCode.startLocalAuth.useMutation({
    onSuccess: () => {
      setFlowState({ step: "success" })
      toast.success("Claude Code connected successfully!")
      refetch()
      utils.claudeCode.getIntegration.invalidate()
      // Reset to idle after showing success
      setTimeout(() => setFlowState({ step: "idle" }), 1500)
    },
    onError: (error) => {
      const message = error.message || "Failed to authenticate"
      const recoverable = !message.includes("unexpected") && !message.includes("internal")
      setFlowState({ step: "error", message, recoverable })
      toast.error(message)
    },
  })

  // Cancel local auth mutation
  const cancelLocalAuth = trpc.claudeCode.cancelLocalAuth.useMutation()

  // Setup with CLI mutation
  const setupTokenWithCli = trpc.claudeCode.setupTokenWithCli.useMutation({
    onSuccess: () => {
      setFlowState({ step: "success" })
      toast.success("Claude Code connected successfully!")
      refetch()
      utils.claudeCode.getIntegration.invalidate()
      setTimeout(() => setFlowState({ step: "idle" }), 1500)
    },
    onError: (error) => {
      const message = error.message || "Failed to setup with CLI"
      const recoverable = !message.includes("not installed")
      setFlowState({ step: "error", message, recoverable })
      toast.error(message)
    },
  })

  // Disconnect mutation
  const disconnect = trpc.claudeCode.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Claude Code disconnected")
      refetch()
      utils.claudeCode.getIntegration.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to disconnect")
    },
  })

  const handleStartAuth = () => {
    setFlowState({ step: "authenticating" })
    startLocalAuth.mutate()
  }

  const handleCancel = () => {
    cancelLocalAuth.mutate()
    setFlowState({ step: "idle" })
  }

  const handleDisconnect = () => {
    disconnect.mutate()
  }

  const handleSetupWithCli = () => {
    setFlowState({ step: "cli-setup" })
    setupTokenWithCli.mutate()
  }

  const isClaudeCliInstalled = cliInstalledQuery.data?.installed ?? false

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <IconSpinner className="h-6 w-6" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Error</h2>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </div>
    )
  }

  const isConnected = integration?.isConnected

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between pb-3 mb-4">
            <h3 className="text-sm font-medium text-foreground">Claude Code</h3>
          </div>

          <p className="text-sm text-muted-foreground">
            Connect your Claude Code account to enable AI-powered coding
            assistance.
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-6">
            {/* Connected State */}
            {isConnected && flowState.step === "idle" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Connected
                    </p>
                    {integration?.connectedAt && (
                      <p className="text-xs text-muted-foreground">
                        Connected on{" "}
                        {new Date(integration.connectedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={disconnect.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  {disconnect.isPending && (
                    <IconSpinner className="h-4 w-4 mr-2" />
                  )}
                  Disconnect
                </Button>
              </div>
            )}

            {/* Not Connected - Idle State */}
            {!isConnected && flowState.step === "idle" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">Not connected</p>
                </div>

                <div className="space-y-2">
                  {/* Primary: Import from Claude CLI (if installed) */}
                  {isClaudeCliInstalled && (
                    <Button onClick={handleSetupWithCli} className="w-full">
                      Import from Claude CLI
                    </Button>
                  )}

                  {/* Secondary: OAuth (only show if CLI not installed) */}
                  {!isClaudeCliInstalled && (
                    <Button onClick={handleStartAuth} className="w-full">
                      Connect with OAuth
                    </Button>
                  )}

                  {/* Divider */}
                  {isClaudeCliInstalled && (
                    <div className="relative py-2">
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
                    <Button variant="outline" onClick={handleStartAuth} className="w-full">
                      Connect with OAuth
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Authenticating State */}
            {flowState.step === "authenticating" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <IconSpinner className="h-5 w-5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Authenticating with Anthropic...
                    </p>
                    <p className="text-xs text-muted-foreground">
                      A browser window has opened. Please complete authentication there.
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            )}

            {/* CLI Setup State */}
            {flowState.step === "cli-setup" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <IconSpinner className="h-5 w-5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Setting up with Claude CLI...
                    </p>
                    <p className="text-xs text-muted-foreground">
                      A browser window has opened. Please complete authentication there.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Success State */}
            {flowState.step === "success" && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  Authentication successful!
                </p>
              </div>
            )}

            {/* Error State */}
            {flowState.step === "error" && (
              <div className="space-y-4">
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-sm text-destructive">{flowState.message}</p>
                </div>
                {flowState.recoverable && (
                  <Button onClick={handleStartAuth}>Try Again</Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
