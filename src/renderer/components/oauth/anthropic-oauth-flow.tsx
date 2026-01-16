"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "../ui/input"
import { IconSpinner } from "../ui/icons"
import { trpc } from "../../lib/trpc"

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

interface AnthropicOAuthFlowProps {
  onSuccess: () => void
  onError: (message: string) => void
  autoStart?: boolean
  render: (state: {
    flowState: AuthFlowState
    authCode: string
    startAuth: () => void
    setAuthCode: (code: string) => void
    submitCode: () => void
    cancelAuth: () => void
  }) => React.ReactNode
}

export function AnthropicOAuthFlow({
  onSuccess,
  onError,
  autoStart = true,
  render,
}: AnthropicOAuthFlowProps) {
  const [flowState, setFlowState] = useState<AuthFlowState>({ step: "idle" })
  const [authCode, setAuthCode] = useState("")
  const [userClickedConnect, setUserClickedConnect] = useState(false)
  const [urlOpened, setUrlOpened] = useState(false)
  const [savedOauthUrl, setSavedOauthUrl] = useState<string | null>(null)
  const urlOpenedRef = useRef(false)

  const startAuthMutation = trpc.claudeCode.startAuth.useMutation()
  const submitCodeMutation = trpc.claudeCode.submitCode.useMutation()
  const openOAuthUrlMutation = trpc.claudeCode.openOAuthUrl.useMutation()

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

  // Auto-start auth on mount if autoStart is true
  useEffect(() => {
    if (autoStart && flowState.step === "idle") {
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
          const msg = err.message || "Failed to start authentication"
          setFlowState({ step: "error", message: msg })
          onError(msg)
        },
      })
    }
  }, [flowState.step, startAuthMutation, autoStart, onError])

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
      const msg = pollStatusQuery.data.error || "Failed to get OAuth URL"
      setFlowState({ step: "error", message: msg })
      onError(msg)
    }
  }, [pollStatusQuery.data, flowState, onError])

  // Open URL in browser when ready
  // - Auto-start mode: open immediately when URL is ready
  // - Manual mode: wait for user to click Connect
  useEffect(() => {
    if (
      flowState.step === "has_url" &&
      !urlOpenedRef.current &&
      (autoStart || userClickedConnect)
    ) {
      urlOpenedRef.current = true
      setUrlOpened(true)
      openOAuthUrlMutation.mutate(flowState.oauthUrl)
    }
  }, [flowState, userClickedConnect, openOAuthUrlMutation, autoStart])

  const isValidCodeFormat = (code: string) => {
    const trimmed = code.trim()
    return trimmed.length > 50 && trimmed.includes("#")
  }

  const startAuth = async () => {
    setUserClickedConnect(true)

    if (flowState.step === "has_url") {
      urlOpenedRef.current = true
      setUrlOpened(true)
      openOAuthUrlMutation.mutate(flowState.oauthUrl)
    } else if (flowState.step === "error") {
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
        const msg = err instanceof Error ? err.message : "Failed to start authentication"
        setFlowState({ step: "error", message: msg })
        onError(msg)
      }
    }
  }

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
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit code"
      setFlowState({ step: "error", message: msg })
      onError(msg)
    }
  }

  const handleAuthCodeChange = (value: string) => {
    setAuthCode(value)
    if (isValidCodeFormat(value) && flowState.step === "has_url") {
      setTimeout(() => submitCode(value), 100)
    }
  }

  const cancelAuth = () => {
    setFlowState({ step: "idle" })
    setAuthCode("")
    setUserClickedConnect(false)
    setUrlOpened(false)
    setSavedOauthUrl(null)
    urlOpenedRef.current = false
  }

  const isLoadingAuth =
    flowState.step === "starting" || flowState.step === "waiting_url"
  const isSubmitting = flowState.step === "submitting"

  return (
    <>
      {render({
        flowState: { ...flowState, isLoadingAuth, isSubmitting },
        authCode,
        startAuth,
        setAuthCode: handleAuthCodeChange,
        submitCode: () => submitCode(authCode),
        cancelAuth,
      })}
      {/* Hidden input for code submission */}
      {(urlOpened ||
        flowState.step === "has_url" ||
        flowState.step === "submitting") && (
        <div className="hidden">
          <Input
            value={authCode}
            onChange={(e) => handleAuthCodeChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && authCode.trim()) {
                submitCode(authCode)
              }
            }}
            disabled={isSubmitting}
          />
        </div>
      )}
    </>
  )
}
