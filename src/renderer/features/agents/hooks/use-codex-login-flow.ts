import { useAtom } from "jotai"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  codexApiKeyAtom,
  normalizeCodexApiKey,
} from "../../../lib/atoms"
import { useI18n } from "../../../lib/i18n"
import { trpc, trpcClient } from "../../../lib/trpc"

export type CodexAuthMethod = "chatgpt" | "api_key"

export type CodexLoginFlowState =
  | "idle"
  | "running"
  | "success"
  | "error"
  | "cancelled"

const VERIFY_ATTEMPTS = 6
const VERIFY_DELAY_MS = 400

function isTerminalState(state: CodexLoginFlowState): boolean {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isConnectedForMethod(params: {
  integrationState?: string
  method: CodexAuthMethod
}): boolean {
  if (params.method === "chatgpt") {
    return params.integrationState === "connected_chatgpt"
  }

  return params.integrationState === "connected_api_key"
}

export function useCodexLoginFlow() {
  const { t } = useI18n()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [state, setState] = useState<CodexLoginFlowState>("idle")
  const [url, setUrl] = useState<string | null>(null)
  const [output, setOutput] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [method, setMethod] = useState<CodexAuthMethod>("chatgpt")
  const [storedApiKey, setStoredApiKey] = useAtom(codexApiKeyAtom)
  const [apiKeyInput, setApiKeyInput] = useState<string>(storedApiKey)

  const startRequestIdRef = useRef(0)
  const activeStartRequestRef = useRef<number | null>(null)
  const cancelledStartRequestsRef = useRef(new Set<number>())
  const verifyingSessionRef = useRef<string | null>(null)
  const successToastSessionRef = useRef<string | null>(null)
  const lastErrorToastRef = useRef<string | null>(null)

  const startLoginMutation = trpc.codex.startLogin.useMutation()
  const cancelLoginMutation = trpc.codex.cancelLogin.useMutation()
  const openExternalMutation = trpc.external.openExternal.useMutation()
  const trpcUtils = trpc.useUtils()

  const sessionQuery = trpc.codex.getLoginSession.useQuery(
    { sessionId: sessionId || "" },
    {
      enabled: Boolean(sessionId) && !isTerminalState(state),
      refetchInterval: 1000,
      retry: false,
    },
  )

  useEffect(() => {
    setApiKeyInput(storedApiKey)
  }, [storedApiKey])

  const notifyError = useCallback((message: string) => {
    if (lastErrorToastRef.current === message) {
      return
    }

    lastErrorToastRef.current = message
    toast.error(message)
  }, [])

  const verifyConnectedSession = useCallback(
    async (verificationKey: string) => {
      let lastVerifyError: unknown = null

      for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt += 1) {
        try {
          const integration = await trpcClient.codex.getIntegration.query()
          if (
            isConnectedForMethod({
              integrationState: integration.state,
              method,
            })
          ) {
            await trpcUtils.codex.getIntegration.invalidate()
            setState("success")
            setError(null)
            if (successToastSessionRef.current !== verificationKey) {
              successToastSessionRef.current = verificationKey
              toast.success(t("onboarding.codex.connectedSuccessfully"), { duration: 10000 })
            }
            return
          }
        } catch (verifyError) {
          lastVerifyError = verifyError
        }

        if (attempt < VERIFY_ATTEMPTS - 1) {
          await sleep(VERIFY_DELAY_MS)
        }
      }

      const message = lastVerifyError
        ? toErrorMessage(
            lastVerifyError,
            t("onboarding.codex.failedVerifyLogin"),
          )
        : t("onboarding.codex.credentialsNotDetected")

      setState("error")
      setError(message)
      notifyError(message)
    },
    [method, notifyError, trpcUtils, t],
  )

  const saveApiKey = useCallback(async () => {
    const normalized = normalizeCodexApiKey(apiKeyInput)
    if (!normalized) {
      const message = t("toast.models.invalidCodexApiKey")
      setState("error")
      setError(message)
      notifyError(message)
      return false
    }

    setStoredApiKey(normalized)
    setSessionId(null)
    setUrl(null)
    setOutput(t("onboarding.codex.usingAppManagedApiKey"))
    setError(null)
    setState("success")
    await trpcUtils.codex.getIntegration.invalidate()
    toast.success(t("toast.models.codexApiKeySaved"), { duration: 10000 })
    return true
  }, [apiKeyInput, notifyError, setStoredApiKey, trpcUtils, t])

  const start = useCallback(async () => {
    if (method === "api_key") {
      await saveApiKey()
      return
    }

    const requestId = startRequestIdRef.current + 1
    startRequestIdRef.current = requestId
    activeStartRequestRef.current = requestId
    cancelledStartRequestsRef.current.delete(requestId)

    const wasCancelled = () =>
      cancelledStartRequestsRef.current.has(requestId)

    setError(null)
    setSessionId(null)
    setUrl(null)
    setOutput("")
    verifyingSessionRef.current = null
    lastErrorToastRef.current = null

      // Skip launching `codex login` when already connected.
    try {
      const integration = await trpcClient.codex.getIntegration.query()
      if (
        isConnectedForMethod({
          integrationState: integration.state,
          method,
        })
      ) {
        if (wasCancelled()) {
          return
        }

        await trpcUtils.codex.getIntegration.invalidate()
        setState("success")
        setSessionId(null)
        setUrl(null)
        setOutput(integration.rawOutput || "Already connected")
        return
      }
    } catch {
      // Start mutation will surface the actionable error.
    }

    if (wasCancelled()) {
      return
    }

    setState("running")

    try {
      const session = await startLoginMutation.mutateAsync()

      if (wasCancelled()) {
        if (session.sessionId) {
          await cancelLoginMutation
            .mutateAsync({ sessionId: session.sessionId })
            .catch(() => {
              // No-op
            })
        }
        return
      }

      setSessionId(session.sessionId)
      setState(session.state === "success" ? "running" : session.state)
      setUrl(session.url || null)
      setOutput(session.output || "")
      setError(session.error || null)
      toast.info(t("onboarding.codex.waitingForBrowser"))
    } catch (startError) {
      if (wasCancelled()) {
        return
      }

      const message = toErrorMessage(
        startError,
        t("onboarding.codex.failedStartLogin"),
      )
      setState("error")
      setError(message)
      notifyError(message)
    } finally {
      if (activeStartRequestRef.current === requestId) {
        activeStartRequestRef.current = null
      }
      cancelledStartRequestsRef.current.delete(requestId)
    }
  }, [
    cancelLoginMutation,
    method,
    notifyError,
    saveApiKey,
    startLoginMutation,
    t,
    trpcUtils,
  ])

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
      // No-op: we still mark this local flow as cancelled.
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
    verifyingSessionRef.current = null
    successToastSessionRef.current = null
    lastErrorToastRef.current = null
  }, [])

  const openUrl = useCallback(async () => {
    if (!url) {
      setError("Auth URL is not available yet")
      return false
    }

    try {
      await openExternalMutation.mutateAsync(url)
      return true
    } catch (openError) {
      setError(toErrorMessage(openError, "Failed to open auth URL"))
      return false
    }
  }, [openExternalMutation, url])

  useEffect(() => {
    const data = sessionQuery.data
    if (!data) return

    if (data.url) {
      setUrl(data.url)
    }
    setOutput(data.output || "")
    if (data.state === "success") {
      const verificationKey = data.sessionId || sessionId || "codex-login"
      if (verifyingSessionRef.current === verificationKey) {
        return
      }
      verifyingSessionRef.current = verificationKey
      setState("running")
      setError(null)
      void verifyConnectedSession(verificationKey)
      return
    }

    setState(data.state)
    setError(data.error || null)
    if (data.state === "error") {
      const message =
        data.error || "Codex login failed. Please retry."
      if (message) {
        notifyError(message)
      }
    }
  }, [notifyError, sessionId, sessionQuery.data, verifyConnectedSession])

  useEffect(() => {
    return () => {
      if (!sessionId || isTerminalState(state)) return
      void trpcClient.codex.cancelLogin.mutate({ sessionId }).catch(() => {
        // No-op
      })
    }
  }, [sessionId, state])

  const setMethodAndResetError = useCallback((nextMethod: CodexAuthMethod) => {
    setMethod(nextMethod)
    setError(null)
    if (state !== "running") {
      setState("idle")
    }
  }, [state])

  return {
    sessionId,
    state,
    method,
    apiKeyInput,
    url,
    output,
    error,
    isRunning: state === "running",
    isOpeningUrl: openExternalMutation.isPending,
    start,
    saveApiKey,
    cancel,
    reset,
    openUrl,
    setMethod: setMethodAndResetError,
    setApiKeyInput,
  }
}
