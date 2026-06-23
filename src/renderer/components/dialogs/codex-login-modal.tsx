"use client"

import { useAtom, useSetAtom } from "jotai"
import { X } from "lucide-react"
import { useEffect, useRef } from "react"
import { pendingAuthRetryMessageAtom } from "../../features/agents/atoms"
import { CodexLoginContent } from "../../features/agents/components/codex-login-content"
import { useCodexLoginFlow } from "../../features/agents/hooks/use-codex-login-flow"
import {
  agentsSettingsDialogActiveTabAtom,
  agentsSettingsDialogOpenAtom,
  codexLoginModalOpenAtom,
  type SettingsTab,
} from "../../lib/atoms"
import { useI18n } from "../../lib/i18n"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
} from "../ui/alert-dialog"

type CodexLoginModalProps = {
  autoStart?: boolean
}

export function CodexLoginModal({ autoStart = true }: CodexLoginModalProps) {
  const { t } = useI18n()
  const [open, setOpen] = useAtom(codexLoginModalOpenAtom)
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const [pendingAuthRetry, setPendingAuthRetry] = useAtom(
    pendingAuthRetryMessageAtom,
  )
  const didInitForOpenRef = useRef(false)
  const didStartForOpenRef = useRef(false)
  const shouldAutoOpenUrlRef = useRef(false)
  const isAuthRetryFlow = pendingAuthRetry?.provider === "codex"
  const shouldAutoStartForCurrentFlow = autoStart && !isAuthRetryFlow

  const {
    state,
    method,
    apiKeyInput,
    url,
    error,
    isRunning,
    isOpeningUrl,
    start,
    saveApiKey,
    setApiKeyInput,
    cancel,
    reset,
    openUrl,
  } = useCodexLoginFlow()

  const clearPendingRetryIfNeeded = () => {
    if (
      pendingAuthRetry &&
      pendingAuthRetry.provider === "codex" &&
      !pendingAuthRetry.readyToRetry
    ) {
      setPendingAuthRetry(null)
    }
  }

  useEffect(() => {
    if (!open) {
      didInitForOpenRef.current = false
      didStartForOpenRef.current = false
      shouldAutoOpenUrlRef.current = false
      return
    }

    if (!didInitForOpenRef.current) {
      didInitForOpenRef.current = true
      reset()
    }

    if (!shouldAutoStartForCurrentFlow || method !== "chatgpt") {
      return
    }

    if (didStartForOpenRef.current) {
      return
    }

    didStartForOpenRef.current = true
    void start()
  }, [method, open, reset, shouldAutoStartForCurrentFlow, start])

  useEffect(() => {
    if (!open || method !== "chatgpt") {
      shouldAutoOpenUrlRef.current = false
      return
    }

    if (!shouldAutoOpenUrlRef.current) {
      return
    }

    if (url) {
      shouldAutoOpenUrlRef.current = false
      void openUrl()
      return
    }

    if (state === "error" || state === "cancelled" || state === "success") {
      shouldAutoOpenUrlRef.current = false
    }
  }, [method, open, openUrl, state, url])

  useEffect(() => {
    if (!open || state !== "success") return

    if (
      pendingAuthRetry?.provider === "codex" &&
      !pendingAuthRetry.readyToRetry
    ) {
      setPendingAuthRetry({ ...pendingAuthRetry, readyToRetry: true })
    }

    setOpen(false)
  }, [open, pendingAuthRetry, setOpen, setPendingAuthRetry, state])

  const handleConnect = () => {
    if (method === "api_key") {
      void saveApiKey()
      return
    }

    shouldAutoOpenUrlRef.current = true
    void start()
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      void cancel()
      clearPendingRetryIfNeeded()
    }
    setOpen(nextOpen)
  }

  const handleOpenModelsSettings = () => {
    clearPendingRetryIfNeeded()
    setSettingsActiveTab("models" as SettingsTab)
    setSettingsOpen(true)
    setOpen(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="w-[380px] p-6">
        <AlertDialogCancel className="absolute right-4 top-4 h-6 w-6 p-0 border-0 bg-transparent hover:bg-muted rounded-sm opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
          <span className="sr-only">{t("common.close")}</span>
        </AlertDialogCancel>

        <CodexLoginContent
          state={state}
          method={method}
          apiKey={apiKeyInput}
          error={error}
          url={url}
          isOpeningUrl={isOpeningUrl}
          showConnectButton={!shouldAutoStartForCurrentFlow}
          isConnecting={isRunning || isOpeningUrl}
          onConnect={handleConnect}
          onOpenUrl={() => {
            void openUrl()
          }}
          onRetry={() => {
            if (method === "api_key") {
              void saveApiKey()
              return
            }

            if (shouldAutoStartForCurrentFlow) {
              void start()
              return
            }

            handleConnect()
          }}
          onApiKeyChange={setApiKeyInput}
          onSubmitApiKey={() => {
            void saveApiKey()
          }}
        />

        {isAuthRetryFlow && (
          <div className="text-center !mt-2">
            <button
              type="button"
              onClick={handleOpenModelsSettings}
              className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            >
              {t("onboarding.codex.apiKeySettingsLink")}
            </button>
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
