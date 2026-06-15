"use client"

import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock3,
  Loader2,
} from "lucide-react"
import { memo } from "react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type {
  WorkbenchTraceRow,
  WorkbenchTraceSeverity,
} from "../../agents/workbench/workbench-trace-presenter"
import { useCurrentRunTrace } from "./run-trace-data"

interface RunTraceWidgetProps {
  chatId: string
  activeSubChatId?: string | null
}

function getSeverityClassName(severity: WorkbenchTraceSeverity): string {
  if (severity === "success") return "text-emerald-500"
  if (severity === "warning") return "text-amber-500"
  if (severity === "error") return "text-destructive"
  return "text-muted-foreground"
}

function getRowIcon(row: WorkbenchTraceRow) {
  if (row.severity === "success") return CheckCircle2
  if (row.severity === "warning" || row.severity === "error") return AlertCircle
  if (row.status === "running" || row.status === "started") return Clock3
  return Circle
}

function TraceRow({ row }: { row: WorkbenchTraceRow }) {
  const { t } = useI18n()
  const Icon = getRowIcon(row)

  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2 px-2 py-1.5">
      <Icon
        className={cn(
          "mt-0.5 h-3.5 w-3.5 flex-shrink-0",
          getSeverityClassName(row.severity),
        )}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-medium text-foreground">
            {t(row.titleKey)}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            #{row.sequence}
          </span>
          {row.status && (
            <span className="truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {row.status}
            </span>
          )}
        </div>
        {row.summary && (
          <div
            className="mt-0.5 truncate text-[11px] text-muted-foreground"
            title={row.summary}
          >
            {row.summary}
          </div>
        )}
      </div>
    </div>
  )
}

export const RunTraceWidget = memo(function RunTraceWidget({
  chatId,
  activeSubChatId,
}: RunTraceWidgetProps) {
  const { t } = useI18n()
  const trace = useCurrentRunTrace({ chatId, activeSubChatId })

  if (trace.isLoading && !trace.hasJob) {
    return (
      <div className="flex items-center px-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        {t("details.trace.loading")}
      </div>
    )
  }

  if (!trace.hasJob || !trace.job) {
    return (
      <div className="px-2 py-3 text-xs text-muted-foreground">
        {t("details.trace.noRun")}
      </div>
    )
  }

  return (
    <div>
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border/40 px-2 py-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-foreground">
            {trace.job.runtime}
          </div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">
            {trace.job.id}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {trace.isFetching && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {trace.job.status}
          </span>
        </div>
      </div>

      {trace.compactRows.length === 0 ? (
        <div className="px-2 py-3 text-xs text-muted-foreground">
          {t("details.trace.noEvents")}
        </div>
      ) : (
        <div className="divide-y divide-border/30">
          {trace.compactRows.map((row) => (
            <TraceRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  )
})
