"use client"

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { memo } from "react"
import { useI18n } from "@/lib/i18n"
import { useCurrentRunTrace } from "./run-trace-data"

interface RunErrorWidgetProps {
  chatId: string
  activeSubChatId?: string | null
}

export const RunErrorWidget = memo(function RunErrorWidget({
  chatId,
  activeSubChatId,
}: RunErrorWidgetProps) {
  const { t } = useI18n()
  const trace = useCurrentRunTrace({ chatId, activeSubChatId })

  if (trace.isLoading && !trace.hasJob) {
    return (
      <div className="flex items-center px-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        {t("details.error.loading")}
      </div>
    )
  }

  if (!trace.hasJob || !trace.job) {
    return (
      <div className="px-2 py-3 text-xs text-muted-foreground">
        {t("details.error.noRun")}
      </div>
    )
  }

  if (!trace.error) {
    return (
      <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        {t("details.error.noError")}
      </div>
    )
  }

  return (
    <div className="px-2 py-2">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground">
            {trace.error.title}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {trace.error.code}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {trace.error.body}
      </p>
      <div className="mt-2 rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
        <div className="font-medium text-foreground/80">
          {t("details.error.nextAction")}
        </div>
        <div>{trace.error.nextAction}</div>
      </div>
      {trace.error.details && (
        <details className="mt-2 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer font-medium">
            {t("details.error.details")}
          </summary>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono">
            {trace.error.details}
          </pre>
        </details>
      )}
    </div>
  )
})
