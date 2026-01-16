"use client"

import { useState, useEffect } from "react"
import { Check, X, Link as LinkIcon } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { AnthropicOAuthFlow } from "./anthropic-oauth-flow"
import { ClaudeCodeIcon, IconSpinner } from "../ui/icons"
import { trpc } from "../../lib/trpc"

type ConnectionState =
  | { status: "loading" }
  | { status: "connected"; connectedAt: string }
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "error"; message: string }

export function AnthropicOAuthProviderCard() {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: "loading",
  })
  const [showOAuthFlow, setShowOAuthFlow] = useState(false)

  const { data: integration, isLoading } = trpc.claudeCode.getIntegration.useQuery(
    undefined,
    {
      refetchOnWindowFocus: true,
    }
  )

  const disconnectMutation = trpc.claudeCode.disconnect.useMutation({
    onSuccess: () => {
      setConnectionState({ status: "disconnected" })
    },
  })

  // Update connection state from query - only update if not in manual states
  useEffect(() => {
    if (showOAuthFlow) return

    if (isLoading) {
      setConnectionState({ status: "loading" })
    } else if (integration) {
      if (integration.isConnected) {
        setConnectionState({
          status: "connected",
          connectedAt: integration.connectedAt ?? new Date().toISOString(),
        })
      } else {
        setConnectionState({ status: "disconnected" })
      }
    }
  }, [integration, isLoading, showOAuthFlow])

  const handleConnect = () => {
    setShowOAuthFlow(true)
    setConnectionState({ status: "connecting" })
  }

  const handleDisconnect = () => {
    if (confirm("Are you sure you want to disconnect your Anthropic OAuth account?")) {
      disconnectMutation.mutate()
    }
  }

  const handleOAuthSuccess = () => {
    setShowOAuthFlow(false)
    setConnectionState({ status: "connected", connectedAt: new Date().toISOString() })
  }

  const handleOAuthError = (message: string) => {
    setConnectionState({ status: "error", message })
  }

  const handleCancelOAuth = () => {
    setShowOAuthFlow(false)
    setConnectionState({ status: "disconnected" })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[#D97757] flex items-center justify-center">
              <ClaudeCodeIcon className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-medium">Anthropic OAuth</span>
          </div>

          {connectionState.status === "connected" && (
            <div className="flex items-center gap-1 text-xs text-primary">
              <Check className="h-3 w-3" />
              <span>Connected</span>
            </div>
          )}
        </div>

        {/* Content */}
        {connectionState.status === "loading" && (
          <div className="flex items-center justify-center py-2">
            <IconSpinner className="h-4 w-4 text-muted-foreground" />
          </div>
        )}

        {connectionState.status === "disconnected" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Connect your Claude Code subscription
            </p>
            <Button
              size="sm"
              className="w-full"
              onClick={handleConnect}
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              Connect
            </Button>
          </div>
        )}

        {connectionState.status === "connected" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Connected on {formatDate(connectionState.connectedAt)}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
            >
              <X className="h-4 w-4 mr-2" />
              Disconnect
            </Button>
          </div>
        )}

        {connectionState.status === "error" && (
          <div className="space-y-3">
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded">
              <p className="text-xs text-destructive">
                {connectionState.message}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleConnect}
            >
              Try Again
            </Button>
          </div>
        )}

        {/* OAuth Flow UI (when connecting) */}
        {showOAuthFlow && (
          <AnthropicOAuthFlow
            autoStart={true}
            onSuccess={handleOAuthSuccess}
            onError={handleOAuthError}
            render={({ flowState, authCode, startAuth, setAuthCode, submitCode, cancelAuth }) => (
              <div className="space-y-3">
                {(flowState.step === "idle" ||
                  flowState.step === "starting" ||
                  flowState.step === "waiting_url") && (
                  <div className="flex items-center justify-center py-2">
                    <IconSpinner className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}

                {(flowState.step === "has_url" ||
                  flowState.step === "submitting") && (
                  <div className="space-y-3">
                    <Input
                      value={authCode}
                      onChange={(e) => setAuthCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && authCode.trim()) {
                          submitCode()
                        }
                      }}
                      placeholder="Paste your authentication code here..."
                      className="font-mono text-sm"
                      autoFocus
                      disabled={flowState.step === "submitting"}
                    />
                    {flowState.step === "submitting" && (
                      <div className="flex items-center justify-center">
                        <IconSpinner className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        A new tab has opened for authentication
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelAuth}
                        disabled={flowState.step === "submitting"}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {flowState.step === "error" && (
                  <div className="space-y-3">
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded">
                      <p className="text-xs text-destructive">
                        {flowState.message}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={startAuth}
                      >
                        Try Again
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelAuth}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          />
        )}
      </div>
    </div>
  )
}
