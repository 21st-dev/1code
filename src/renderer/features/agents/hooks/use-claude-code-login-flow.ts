import { useCallback, useEffect, useRef, useState } from "react"
import { trpc, trpcClient } from "../../../lib/trpc"

export type ClaudeCodeLoginFlowState =
  | "idle"
  | "running"
  | "importing"
  | "success"
  | "error"
  | "cancelled"

export type ClaudeCodeLoginSubmitState =
  | "idle"
  | "submitting"
  | "submitted"
  | "error"

function isTerminalState(state: ClaudeCodeLoginFlowState): boolean {
  return state === "success" || state === "error" || state === "cancelled"
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error
  }

  return fallback
}

export function useClaudeCodeLoginFlow() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [state, setState] = useState<ClaudeCodeLoginFlowState>("idle")
  const [url, setUrl] = useState<string | null>(null)
  const [output, setOutput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitState, setSubmitState] =
    useState<ClaudeCodeLoginSubmitState>("idle")
  const [submitError, setSubmitError] = useState<string | null>(null)

  const openedUrlRef = useRef<string | null>(null)
  const startRequestIdRef = useRef(0)
  const activeStartRequestRef = useRef<number | null>(null)
  const cancelledStartRequestsRef = useRef(new Set<number>())

  const startLoginMutation = trpc.claudeCode.startLocalLogin.useMutation()
  const cancelLoginMutation = trpc.claudeCode.cancelLocalLogin.useMutation()
  const submitLoginCodeMutation = trpc.claudeCode.submitLocalLoginCode.useMutation()
  const openExternalMutation = trpc.external.openExternal.useMutation()
  const trpcUtils = trpc.useUtils()

  const sessionQuery = trpc.claudeCode.getLocalLoginSession.useQuery(
    { sessionId: sessionId || "" },
    {
      enabled: Boolean(sessionId) && !isTerminalState(state),
      refetchInterval: 1000,
      retry: false,
    },
  )

  const start = useCallback(async () => {
    const requestId = startRequestIdRef.current + 1
    startRequestIdRef.current = requestId
    activeStartRequestRef.current = requestId
    cancelledStartRequestsRef.current.delete(requestId)

    const wasCancelled = () =>
      cancelledStartRequestsRef.current.has(requestId)

    setSessionId(null)
    setState("running")
    setUrl(null)
    setOutput("")
    setError(null)
    setSubmitState("idle")
    setSubmitError(null)
    openedUrlRef.current = null

    try {
      const session = await startLoginMutation.mutateAsync()
      if (wasCancelled()) {
        if (session.sessionId) {
          await cancelLoginMutation
            .mutateAsync({ sessionId: session.sessionId })
            .catch(() => {
              // No-op.
            })
        }
        return
      }

      setSessionId(session.sessionId)
      setState(session.state)
      setUrl(session.url || null)
      setOutput(session.output || "")
      setError(session.error || null)
    } catch (startError) {
      if (wasCancelled()) {
        return
      }

      setState("error")
      setError(
        toErrorMessage(
          startError,
          "Failed to start Claude Code login. Please try again.",
        ),
      )
    } finally {
      if (activeStartRequestRef.current === requestId) {
        activeStartRequestRef.current = null
      }
      cancelledStartRequestsRef.current.delete(requestId)
    }
  }, [cancelLoginMutation, startLoginMutation])

  const cancel = useCallback(async () => {
    if (state === "success") {
      return
    }

    const activeRequestId = activeStartRequestRef.current
    if (activeRequestId !== null) {
      cancelledStartRequestsRef.current.add(activeRequestId)
    }

    if (!sessionId) {
      setState("cancelled")
      return
    }

    try {
      await cancelLoginMutation.mutateAsync({ sessionId })
    } catch {
      // No-op: local UI still moves to cancelled.
    }

    setState("cancelled")
  }, [cancelLoginMutation, sessionId, state])

  const reset = useCallback(() => {
    const activeRequestId = activeStartRequestRef.current
    if (activeRequestId !== null) {
      cancelledStartRequestsRef.current.add(activeRequestId)
      activeStartRequestRef.current = null
    }

    setSessionId(null)
    setState("idle")
    setUrl(null)
    setOutput("")
    setError(null)
    setSubmitState("idle")
    setSubmitError(null)
    openedUrlRef.current = null
  }, [])

  const openUrl = useCallback(
    async (targetUrl = url) => {
      if (!targetUrl) {
        setError("Claude Code auth URL is not available yet")
        return false
      }

      try {
        await openExternalMutation.mutateAsync(targetUrl)
        return true
      } catch (openError) {
        setError(toErrorMessage(openError, "Failed to open Claude Code auth URL"))
        return false
      }
    },
    [openExternalMutation, url],
  )

  const submitCode = useCallback(
    async (code: string) => {
      const trimmedCode = code.trim()
      if (!sessionId) {
        const message = "Claude Code login session is not available yet"
        setSubmitState("error")
        setSubmitError(message)
        return false
      }

      if (!trimmedCode) {
        const message = "Claude Code authentication code is empty"
        setSubmitState("error")
        setSubmitError(message)
        return false
      }

      try {
        setSubmitState("submitting")
        setSubmitError(null)
        const result = await submitLoginCodeMutation.mutateAsync({
          sessionId,
          code: trimmedCode,
        })
        if (!result.success) {
          const message =
            result.session.error ||
            "Failed to submit Claude Code authentication code"
          setSubmitState("error")
          setSubmitError(message)
          return false
        }

        setError(null)
        setSubmitState("submitted")
        setSubmitError(null)
        return true
      } catch (submitError) {
        const message = toErrorMessage(
          submitError,
          "Failed to submit Claude Code authentication code",
        )
        setSubmitState("error")
        setSubmitError(message)
        return false
      }
    },
    [sessionId, submitLoginCodeMutation],
  )

  useEffect(() => {
    const data = sessionQuery.data
    if (!data) return

    if (data.url) {
      setUrl(data.url)
      if (openedUrlRef.current !== data.url) {
        openedUrlRef.current = data.url
        void openUrl(data.url)
      }
    }

    setOutput(data.output || "")
    setState(data.state)
    setError(data.error || null)

    if (data.state === "success" || data.state === "error") {
      setSubmitState("idle")
      setSubmitError(null)
    }

    if (data.state === "success") {
      void Promise.allSettled([
        trpcUtils.anthropicAccounts.list.invalidate(),
        trpcUtils.anthropicAccounts.getActive.invalidate(),
        trpcUtils.claudeCode.getIntegration.invalidate(),
      ])
    }
  }, [openUrl, sessionQuery.data, trpcUtils])

  useEffect(() => {
    return () => {
      if (!sessionId || isTerminalState(state)) return
      void trpcClient.claudeCode.cancelLocalLogin
        .mutate({ sessionId })
        .catch(() => {
          // No-op.
        })
    }
  }, [sessionId, state])

  return {
    sessionId,
    state,
    url,
    output,
    error,
    submitState,
    submitError,
    isRunning: state === "running" || state === "importing",
    isOpeningUrl: openExternalMutation.isPending,
    isSubmittingCode: submitLoginCodeMutation.isPending,
    start,
    cancel,
    reset,
    openUrl,
    submitCode,
  }
}
