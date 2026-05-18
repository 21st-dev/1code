"use client"

import { AlertTriangle, CheckCircle2 } from "lucide-react"

import { Button } from "../../../components/ui/button"
import { CodexIcon, IconSpinner } from "../../../components/ui/icons"
import { Input } from "../../../components/ui/input"
import { Logo } from "../../../components/ui/logo"
import { useI18n } from "../../../lib/i18n"
import type { CodexAuthMethod, CodexLoginFlowState } from "../hooks/use-codex-login-flow"

type RuntimeState = "checking" | "ready" | "missing"

type CodexLoginContentProps = {
  state: CodexLoginFlowState
  method: CodexAuthMethod
  apiKey: string
  error: string | null
  url: string | null
  isOpeningUrl: boolean
  showConnectButton?: boolean
  isConnecting?: boolean
  runtimeState?: RuntimeState
  runtimeHint?: string | null
  onConnect?: () => void
  onOpenUrl: () => void
  onRetry: () => void
  onApiKeyChange: (value: string) => void
  onSubmitApiKey: () => void
}

export function CodexLoginContent({
  state,
  method,
  apiKey,
  error,
  url,
  isOpeningUrl,
  showConnectButton = false,
  isConnecting = false,
  runtimeState,
  runtimeHint,
  onConnect,
  onOpenUrl,
  onRetry,
  onApiKeyChange,
  onSubmitApiKey,
}: CodexLoginContentProps) {
  const { t } = useI18n()
  const isApiKeyMode = method === "api_key"
  const showRetry = !isApiKeyMode && (state === "error" || state === "cancelled")
  const showConnect = !isApiKeyMode && showConnectButton && state === "idle"
  const showFooter = Boolean(error) || showRetry || showConnect || isApiKeyMode

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2 p-2 mx-auto w-max rounded-full border border-border">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <Logo className="w-5 h-5" fill="white" />
          </div>
          <div className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center">
            <CodexIcon className="w-6 h-6 text-background" />
          </div>
        </div>
        <div className="space-y-1">
          <h1 className="text-base font-semibold tracking-tight">
            {t("onboarding.codex.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isApiKeyMode
              ? t("onboarding.codex.apiKeySubtitle")
              : t("onboarding.codex.subscriptionSubtitle")}
          </p>

          {!isApiKeyMode && state === "running" && (
            <p className="text-xs text-muted-foreground">
              {t("onboarding.codex.waitingForBrowser")}
            </p>
          )}

          {!isApiKeyMode && url && (
            <p className="text-xs text-muted-foreground">
              <button
                onClick={onOpenUrl}
                disabled={isOpeningUrl}
                className="text-primary hover:underline disabled:opacity-50"
              >
                {isOpeningUrl
                  ? t("onboarding.codex.opening")
                  : t("onboarding.claude.didntOpen")}
              </button>
            </p>
          )}
        </div>
      </div>

      {!isApiKeyMode && runtimeState && (
        <div
          className={
            runtimeState === "missing"
              ? "rounded-lg border border-destructive/20 bg-destructive/10 p-3"
              : "rounded-lg border border-border bg-muted/40 p-3"
          }
        >
          <div className="flex gap-2">
            {runtimeState === "checking" ? (
              <IconSpinner className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            ) : runtimeState === "missing" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">
                {runtimeState === "checking"
                  ? t("onboarding.runtime.checking")
                  : runtimeState === "missing"
                    ? t("onboarding.runtime.codexMissing")
                    : t("onboarding.runtime.codexReady")}
              </p>
              {runtimeState === "missing" && runtimeHint && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {runtimeHint}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showFooter && (
        <div className={isApiKeyMode ? "space-y-4" : "space-y-6"}>
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {isApiKeyMode ? (
            <>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="sk-..."
                className="font-mono"
                autoFocus
              />
              <Button
                onClick={onSubmitApiKey}
                disabled={isConnecting || apiKey.trim().length === 0}
                className="w-full"
              >
                {isConnecting
                  ? t("common.connecting")
                  : t("onboarding.codex.connectWithApiKey")}
              </Button>
            </>
          ) : (
            <>
              {showRetry && (
                <Button variant="secondary" onClick={onRetry} className="w-full">
                  {t("common.retry")}
                </Button>
              )}

              {showConnect && (
                <Button onClick={onConnect} disabled={!onConnect || isConnecting} className="w-full">
                  {isConnecting ? t("common.connecting") : t("common.connect")}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
