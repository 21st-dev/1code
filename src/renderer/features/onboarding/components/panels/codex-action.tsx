"use client"

import { CheckCircle2 } from "lucide-react"
import { useI18n } from "../../../../lib/i18n"
import { trpc } from "../../../../lib/trpc"
import { cn } from "../../../../lib/utils"
import { CodexLoginContent } from "../../../agents/components/codex-login-content"
import { useCodexLoginFlow } from "../../../agents/hooks/use-codex-login-flow"

/**
 * Codex sign-in action with a ChatGPT / API-key toggle. Embedded in the AI-path
 * panel; never auto-starts — the user explicitly connects.
 */
export function CodexAction() {
  const { t } = useI18n()
  const runtimeStatusQuery = trpc.codex.getRuntimeStatus.useQuery()
  const integrationQuery = trpc.codex.getIntegration.useQuery()
  const apiKeyQuery = trpc.codex.getCodexApiKeyStatus.useQuery()
  const runtimeStatus = runtimeStatusQuery.data
  const runtimeUnavailable =
    runtimeStatusQuery.isFetched && runtimeStatus?.ok !== true
  const failedRuntime =
    runtimeStatus?.components.find(
      (component) => component.id === runtimeStatus.blockers[0]?.component,
    ) ?? runtimeStatus?.loginCli

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
    setMethod,
    setApiKeyInput,
    openUrl,
  } = useCodexLoginFlow()

  const isChatgptMethod = method === "chatgpt"
  const runtimeBlocksConnect =
    isChatgptMethod && (runtimeStatusQuery.isLoading || runtimeUnavailable)

  // Already connected for the selected method → show status, not a connect
  // button (which would otherwise resolve to an empty "success" with no feedback).
  const alreadyConnected = isChatgptMethod
    ? integrationQuery.data?.state === "connected_chatgpt"
    : Boolean(apiKeyQuery.data?.hasApiKey) ||
      integrationQuery.data?.state === "connected_api_key"

  return (
    <div className="space-y-4">
      <div className="flex items-center rounded-full bg-muted p-1">
        <button
          type="button"
          onClick={() => setMethod("chatgpt")}
          className={cn(
            "h-8 flex-1 rounded-full text-sm font-medium transition-colors",
            isChatgptMethod
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("onboarding.billing.codexSubscription.title")}
        </button>
        <button
          type="button"
          onClick={() => setMethod("api_key")}
          className={cn(
            "h-8 flex-1 rounded-full text-sm font-medium transition-colors",
            !isChatgptMethod
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("onboarding.billing.codexApiKey.title")}
        </button>
      </div>

      {alreadyConnected ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {t("onboarding.codex.alreadyConnected")}
        </div>
      ) : (
        <CodexLoginContent
          state={state}
          method={method}
          apiKey={apiKeyInput}
          error={error}
          url={url}
          isOpeningUrl={isOpeningUrl}
          hideHeader
          // No auto-start: the user explicitly triggers OAuth from here.
          showConnectButton={isChatgptMethod && !runtimeBlocksConnect}
          isConnecting={isRunning || isOpeningUrl}
          runtimeState={
            isChatgptMethod
              ? runtimeStatusQuery.isLoading
                ? "checking"
                : runtimeUnavailable
                  ? "missing"
                  : "ready"
              : undefined
          }
          runtimeHint={failedRuntime?.hint ?? null}
          onConnect={() => {
            void start()
          }}
          onOpenUrl={() => {
            void openUrl()
          }}
          onRetry={() => {
            void start()
          }}
          onApiKeyChange={setApiKeyInput}
          onSubmitApiKey={() => {
            void saveApiKey()
          }}
        />
      )}
    </div>
  )
}
