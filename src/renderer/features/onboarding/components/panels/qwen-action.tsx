"use client"

import { AlertTriangle } from "lucide-react"
import { IconSpinner } from "../../../../components/ui/icons"
import { type TranslationKey, useI18n } from "../../../../lib/i18n"
import { trpc } from "../../../../lib/trpc"

type Translate = (
  key: TranslationKey,
  values?: Record<string, string | number>,
) => string

const QWEN_STATUS_TEXT_KEYS: Record<string, TranslationKey> = {
  "Install Qwen Code CLI, run qwen, authenticate with /auth, then retry detection.":
    "settings.models.qwenCli.installHint",
  "Run qwen, then use /auth inside the Qwen Code CLI.":
    "settings.models.qwenCli.authHint",
  "Qwen Code runtime is disabled. Enable it in Settings to configure Qwen setup.":
    "settings.models.qwenCli.runtimeDisabled",
  "Qwen Code CLI was not found on PATH.": "settings.models.qwenCli.pathMissing",
  "Qwen executable path must be an absolute local file path.":
    "settings.models.qwenCli.pathAbsolutePathRequired",
  "Qwen executable path must be a file path, not a shell command.":
    "settings.models.qwenCli.pathShellCommandRejected",
  "Qwen executable path contains secret-like text and was rejected.":
    "settings.models.qwenCli.pathSecretRejected",
  "Qwen executable path is invalid or not executable.":
    "settings.models.qwenCli.pathInvalidOrNotExecutable",
  "Qwen executable path is invalid.": "settings.models.qwenCli.pathInvalid",
  "Runtime executable path could not be resolved.":
    "settings.models.qwenCli.pathInvalidOrNotExecutable",
  "Runtime executable was not found.":
    "settings.models.qwenCli.pathInvalidOrNotExecutable",
  "Runtime path exists but is not a file.":
    "settings.models.qwenCli.pathInvalidOrNotExecutable",
  "Runtime executable is not executable.":
    "settings.models.qwenCli.pathInvalidOrNotExecutable",
}

function localizeQwenStatusText(
  value: string | null | undefined,
  t: Translate,
) {
  if (!value) return null
  const key = QWEN_STATUS_TEXT_KEYS[value]
  if (key) return t(key)
  if (/^(EACCES|ENOENT|EPERM):/.test(value)) {
    return t("settings.models.qwenCli.pathInvalidOrNotExecutable")
  }
  return value
}

/**
 * Qwen Code setup action. Unlike Claude/Codex there is no in-app login — Qwen is
 * runtime-managed and authenticates inside its own CLI (`qwen`, then `/auth`).
 * The app can only detect CLI availability, so this panel shows install/auth
 * guidance and a re-detect button rather than a connect flow.
 */
export function QwenAction() {
  const { t } = useI18n()
  const utils = trpc.useUtils()
  const statusQuery = trpc.agentRuntime.getQwenCliStatus.useQuery(undefined, {
    staleTime: 15_000,
  })
  const status = statusQuery.data
  const cliDetected = status?.ok === true
  const isChecking = statusQuery.isLoading
  const blockerMessage =
    localizeQwenStatusText(status?.blocker?.message, t) ??
    localizeQwenStatusText(status?.executable.hint, t)
  const installCommand = status?.guidance.installCommand ?? null
  const authHint = localizeQwenStatusText(status?.guidance.authHint, t)

  const recheck = () => {
    void utils.agentRuntime.getQwenCliStatus.invalidate()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("onboarding.qwen.subtitle")}
      </p>

      <div
        className={
          isChecking
            ? "rounded-lg border border-border bg-muted/40 p-3"
            : "rounded-lg border border-amber-500/25 bg-amber-500/10 p-3"
        }
      >
        <div className="flex gap-2">
          {isChecking ? (
            <IconSpinner className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-foreground">
              {isChecking
                ? t("onboarding.runtime.checking")
                : cliDetected
                  ? t("onboarding.qwen.cliDetected")
                  : t("onboarding.qwen.setupRequired")}
            </p>
            {!isChecking && (cliDetected || blockerMessage) && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {cliDetected
                  ? t("onboarding.qwen.cliDetectedHint")
                  : blockerMessage}
              </p>
            )}
          </div>
        </div>
      </div>

      {!isChecking && (
        <ol className="space-y-3 text-xs text-muted-foreground">
          <li className="space-y-1.5">
            <p className="font-medium text-foreground">
              {t("onboarding.qwen.step1")}
            </p>
            {installCommand && (
              <pre className="overflow-auto whitespace-pre-wrap rounded-md bg-muted/60 px-3 py-2 font-mono text-[11px] text-foreground">
                {installCommand}
              </pre>
            )}
          </li>
          <li className="space-y-1.5">
            <p className="font-medium text-foreground">
              {t("onboarding.qwen.step2")}
            </p>
            {authHint && <p className="leading-relaxed">{authHint}</p>}
          </li>
          <li>
            <p className="font-medium text-foreground">
              {t("onboarding.qwen.step3")}
            </p>
          </li>
        </ol>
      )}

      <button
        type="button"
        onClick={recheck}
        disabled={statusQuery.isFetching}
        className="flex h-8 w-full items-center justify-center rounded-lg bg-muted px-4 text-sm font-medium text-foreground transition-[background-color,transform] duration-150 hover:bg-muted/80 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {statusQuery.isFetching ? (
          <IconSpinner className="h-4 w-4" />
        ) : (
          t("onboarding.qwen.recheck")
        )}
      </button>
    </div>
  )
}
