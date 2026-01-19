"use client"

import { useEffect, useRef, useState } from "react"
import { useSetAtom } from "jotai"

import { Input } from "../../components/ui/input"
import { ClaudeCodeIcon, IconSpinner } from "../../components/ui/icons"
import { Logo } from "../../components/ui/logo"
import { trpc } from "../../lib/trpc"
import { anthropicOnboardingCompletedAtom } from "../../lib/atoms"

type AuthFlowState =
  | { step: "idle" }
  | { step: "starting" }
  | {
      step: "waiting_url"
      sandboxId: string
      sandboxUrl: string
      sessionId: string
    }
  | {
      step: "has_url"
      sandboxId: string
      oauthUrl: string
      sandboxUrl: string
      sessionId: string
    }
  | { step: "submitting" }
  | { step: "error"; message: string }

export function AnthropicOnboardingPage() {
  const [flowState, setFlowState] = useState<AuthFlowState>({ step: "idle" })
  const [authCode, setAuthCode] = useState("")
  const [userClickedConnect, setUserClickedConnect] = useState(false)
  const [urlOpened, setUrlOpened] = useState(false)
  const [savedOauthUrl, setSavedOauthUrl] = useState<string | null>(null)
  const [showOAuthFlow, setShowOAuthFlow] = useState(false)
  const urlOpenedRef = useRef(false)
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom
  )

  // Check for existing CLI config
  const { data: cliConfig, isLoading: isLoadingCliConfig } =
    trpc.claudeCode.hasExistingCliConfig.useQuery()

  // tRPC mutations
  const startAuthMutation = trpc.claudeCode.startAuth.useMutation()
  const submitCodeMutation = trpc.claudeCode.submitCode.useMutation()
  const openOAuthUrlMutation = trpc.claudeCode.openOAuthUrl.useMutation()

  // Poll for OAuth URL
  const pollStatusQuery = trpc.claudeCode.pollStatus.useQuery(
    {
      sandboxUrl: flowState.step === "waiting_url" ? flowState.sandboxUrl : "",
      sessionId: flowState.step === "waiting_url" ? flowState.sessionId : "",
    },
    {
      enabled: flowState.step === "waiting_url",
      refetchInterval: 1500,
    }
  )

  // Auto-start auth on mount ONLY if no CLI config or user chose OAuth
  useEffect(() => {
    if (flowState.step === "idle" && showOAuthFlow) {
      setFlowState({ step: "starting" })
      startAuthMutation.mutate(undefined, {
        onSuccess: (result) => {
          setFlowState({
            step: "waiting_url",
            sandboxId: result.sandboxId,
            sandboxUrl: result.sandboxUrl,
            sessionId: result.sessionId,
          })
        },
        onError: (err) => {
          setFlowState({
            step: "error",
            message: err.message || "Failed to start authentication",
          })
        },
      })
    }
  }, [flowState.step, startAuthMutation, showOAuthFlow])

  // Update flow state when we get the OAuth URL
  useEffect(() => {
    if (flowState.step === "waiting_url" && pollStatusQuery.data?.oauthUrl) {
      setSavedOauthUrl(pollStatusQuery.data.oauthUrl)
      setFlowState({
        step: "has_url",
        sandboxId: flowState.sandboxId,
        oauthUrl: pollStatusQuery.data.oauthUrl,
        sandboxUrl: flowState.sandboxUrl,
        sessionId: flowState.sessionId,
      })
    } else if (
      flowState.step === "waiting_url" &&
      pollStatusQuery.data?.state === "error"
    ) {
      setFlowState({
        step: "error",
        message: pollStatusQuery.data.error || "Failed to get OAuth URL",
      })
    }
  }, [pollStatusQuery.data, flowState])

  // Open URL in browser when ready (after user clicked Connect)
  useEffect(() => {
    if (
      flowState.step === "has_url" &&
      userClickedConnect &&
      !urlOpenedRef.current
    ) {
      urlOpenedRef.current = true
      setUrlOpened(true)
      // Use Electron's shell.openExternal via tRPC
      openOAuthUrlMutation.mutate(flowState.oauthUrl)
    }
  }, [flowState, userClickedConnect, openOAuthUrlMutation])

  // Check if the code looks like a valid Claude auth code (format: XXX#YYY)
  const isValidCodeFormat = (code: string) => {
    const trimmed = code.trim()
    return trimmed.length > 50 && trimmed.includes("#")
  }

  // Use existing CLI config
  const handleUseExistingConfig = () => {
    setAnthropicOnboardingCompleted(true)
  }

  // Switch to OAuth flow
  const handleConnectWithOAuth = () => {
    setShowOAuthFlow(true)
  }

  const handleConnectClick = async () => {
    setUserClickedConnect(true)

    if (flowState.step === "has_url") {
      // URL is ready, open it immediately
      urlOpenedRef.current = true
      setUrlOpened(true)
      openOAuthUrlMutation.mutate(flowState.oauthUrl)
    } else if (flowState.step === "error") {
      // Retry on error
      urlOpenedRef.current = false
      setUrlOpened(false)
      setFlowState({ step: "starting" })
      try {
        const result = await startAuthMutation.mutateAsync()
        setFlowState({
          step: "waiting_url",
          sandboxId: result.sandboxId,
          sandboxUrl: result.sandboxUrl,
          sessionId: result.sessionId,
        })
      } catch (err) {
        setFlowState({
          step: "error",
          message:
            err instanceof Error ? err.message : "Failed to start authentication",
        })
      }
    }
    // For idle, starting, waiting_url states - the useEffect will handle opening the URL
    // when it becomes ready (userClickedConnect is now true)
  }

  // Submit code - reusable for both auto-submit and manual Enter
  const submitCode = async (code: string) => {
    if (!code.trim() || flowState.step !== "has_url") return

    const { sandboxUrl, sessionId } = flowState
    setFlowState({ step: "submitting" })

    try {
      await submitCodeMutation.mutateAsync({
        sandboxUrl,
        sessionId,
        code: code.trim(),
      })
      // Success - mark onboarding as completed
      setAnthropicOnboardingCompleted(true)
    } catch (err) {
      setFlowState({
        step: "error",
        message: err instanceof Error ? err.message : "Failed to submit code",
      })
    }
  }

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAuthCode(value)

    // Auto-submit if the pasted value looks like a valid auth code
    if (isValidCodeFormat(value) && flowState.step === "has_url") {
      // Small delay to let the UI update before submitting
      setTimeout(() => submitCode(value), 100)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && authCode.trim()) {
      submitCode(authCode)
    }
  }

  const handleOpenFallbackUrl = () => {
    if (savedOauthUrl) {
      openOAuthUrlMutation.mutate(savedOauthUrl)
    }
  }

  const isLoadingAuth =
    flowState.step === "starting" || flowState.step === "waiting_url"
  const isSubmitting = flowState.step === "submitting"

  // Show loading state while checking CLI config
  if (isLoadingCliConfig) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <IconSpinner className="h-6 w-6" />
      </div>
    )
  }

  // Show existing config detected UI
  if (cliConfig?.hasConfig && !showOAuthFlow) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
        {/* Draggable title bar area */}
        <div
          className="fixed top-0 left-0 right-0 h-10"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />

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
                Claude Configuration Detected
              </h1>
              <p className="text-sm text-muted-foreground">
                We found an existing Claude CLI configuration
              </p>
            </div>
          </div>

          {/* Detected config info */}
          <div className="p-4 bg-muted/50 border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium">API Key</span>
              <span className="text-sm text-muted-foreground">
                {cliConfig.hasApiKey ? "Configured" : "Not set"}
              </span>
            </div>
            {cliConfig.baseUrl && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-sm font-medium">API Proxy</span>
                <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                  {cliConfig.baseUrl}
                </span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={handleUseExistingConfig}
              className="w-full h-10 px-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.98] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] flex items-center justify-center"
            >
              Use Existing Configuration
            </button>
            <button
              onClick={handleConnectWithOAuth}
              className="w-full h-10 px-3 bg-transparent text-muted-foreground rounded-lg text-sm font-medium transition-colors duration-150 hover:text-foreground hover:bg-muted/50 flex items-center justify-center"
            >
              Connect with Claude OAuth instead
            </button>
          </div>
        </div>
      </div>
    )
  }

  // OAuth flow UI (existing code)
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
      {/* Draggable title bar area */}
      <div
        className="fixed top-0 left-0 right-0 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

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
        <div className="space-y-6">
          {/* Connect Button - shows loader only if user clicked AND loading */}
          {!urlOpened &&
            flowState.step !== "has_url" &&
            flowState.step !== "error" && (
              <button
                onClick={handleConnectClick}
                disabled={userClickedConnect && isLoadingAuth}
                className="w-full h-8 px-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {userClickedConnect && isLoadingAuth ? (
                  <IconSpinner className="h-4 w-4" />
                ) : (
                  "Connect"
                )}
              </button>
            )}

          {/* Code Input - Show after URL is opened, if has_url (after redirect), or if submitting */}
          {/* No Continue button - auto-submit on valid code paste */}
          {(urlOpened ||
            flowState.step === "has_url" ||
            flowState.step === "submitting") && (
            <div className="space-y-4">
              <div className="relative">
                <Input
                  value={authCode}
                  onChange={handleCodeChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Paste your authentication code here..."
                  className="font-mono text-center pr-10"
                  autoFocus
                  disabled={isSubmitting}
                />
                {isSubmitting && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <IconSpinner className="h-4 w-4" />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                A new tab has opened for authentication.
                {savedOauthUrl && (
                  <>
                    {" "}
                    <button
                      onClick={handleOpenFallbackUrl}
                      className="text-primary hover:underline"
                    >
                      Didn't open? Click here
                    </button>
                  </>
                )}
              </p>
            </div>
          )}

          {/* Error State */}
          {flowState.step === "error" && (
            <div className="space-y-4">
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">{flowState.message}</p>
              </div>
              <button
                onClick={handleConnectClick}
                className="w-full h-8 px-3 bg-muted text-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-muted/80 active:scale-[0.97] flex items-center justify-center"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
