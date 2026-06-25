import { type TranslationKey, useI18n } from "../../../lib/i18n"
import { cn } from "../../../lib/utils"
import type { PathStatus } from "../lib/onboarding-status"

export type BadgeStatus = PathStatus | "optional" | "checking"

const STYLES: Record<BadgeStatus, string> = {
  ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "needs-sign-in": "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "needs-api-key": "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "needs-cli": "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "needs-cli-auth": "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "runtime-missing": "bg-destructive/10 text-destructive",
  "repair-needed": "bg-destructive/10 text-destructive",
  optional: "bg-muted text-muted-foreground",
  "not-started": "bg-muted text-muted-foreground",
  checking: "bg-muted text-muted-foreground",
}

const DOT: Partial<Record<BadgeStatus, string>> = {
  ready: "bg-emerald-500",
  "needs-sign-in": "bg-amber-500",
  "needs-api-key": "bg-amber-500",
  "needs-cli": "bg-amber-500",
  "needs-cli-auth": "bg-amber-500",
  "runtime-missing": "bg-destructive",
  "repair-needed": "bg-destructive",
}

const LABEL_KEYS: Record<BadgeStatus, TranslationKey> = {
  ready: "onboarding.status.ready",
  "needs-sign-in": "onboarding.status.needsSignIn",
  "needs-api-key": "onboarding.status.needsApiKey",
  "needs-cli": "onboarding.status.needsCli",
  "needs-cli-auth": "onboarding.status.needsCliAuth",
  "runtime-missing": "onboarding.status.runtimeMissing",
  "repair-needed": "onboarding.status.repairNeeded",
  optional: "onboarding.status.optional",
  "not-started": "onboarding.status.notStarted",
  checking: "onboarding.status.checking",
}

export function StatusBadge({ status }: { status: BadgeStatus }) {
  const { t } = useI18n()
  const dot = DOT[status]
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium leading-4",
        STYLES[status],
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />}
      {t(LABEL_KEYS[status])}
    </span>
  )
}
