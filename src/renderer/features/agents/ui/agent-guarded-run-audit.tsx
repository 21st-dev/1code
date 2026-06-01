import { useSetAtom } from "jotai"
import { AlertTriangle, CheckCircle2, FileDiff, ShieldAlert } from "lucide-react"

import { Button } from "../../../components/ui/button"
import { cn } from "../../../lib/utils"
import type { GuardedRunAudit } from "../../../../shared/agent-scope-contracts"
import { filteredDiffFilesAtom } from "../atoms"

export function AgentGuardedRunAudit({
  audit,
}: {
  audit?: GuardedRunAudit
}) {
  const setFilteredDiffFiles = useSetAtom(filteredDiffFilesAtom)

  if (!audit) return null

  const outOfScopeCount = audit.changedFiles.filter(
    (file) => file.scope === "out-of-scope",
  ).length
  const blockedCount = audit.blockedEvents.length
  const icon =
    audit.status === "passed" || audit.status === "expanded" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
    ) : audit.status === "drifted" || audit.status === "blocked" ? (
      <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
    ) : (
      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
    )

  return (
    <div className="mx-2 mt-2 rounded-sm border border-border/70 bg-muted/25 px-2 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {icon}
        <span className="font-medium">Guarded Run</span>
        <span className="rounded-sm border border-border/70 px-1.5 py-0 text-[10px] uppercase tracking-normal text-muted-foreground">
          {audit.runtime}
        </span>
        <span
          className={cn(
            "rounded-sm px-1.5 py-0 text-[10px]",
            outOfScopeCount > 0 || blockedCount > 0
              ? "bg-destructive/10 text-destructive"
              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
          )}
        >
          {audit.status}
        </span>
        {audit.dirtyBeforeRun ? (
          <span className="text-muted-foreground">
            {audit.dirtyBeforeRunFiles?.length ?? 0} pre-existing
          </span>
        ) : null}
        {blockedCount > 0 ? (
          <span className="text-destructive">{blockedCount} blocked</span>
        ) : null}
        {outOfScopeCount > 0 ? (
          <span className="text-destructive">{outOfScopeCount} drifted</span>
        ) : null}
      </div>

      {audit.changedFiles.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {audit.changedFiles.slice(0, 8).map((file) => (
            <Button
              key={file.path}
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 max-w-[220px] gap-1 rounded-sm border border-border/60 px-1.5 text-[11px]"
              onClick={() => setFilteredDiffFiles([file.path])}
            >
              <FileDiff className="h-3 w-3 shrink-0" />
              <span className="truncate">{file.path}</span>
              <span
                className={cn(
                  "shrink-0 text-[10px]",
                  file.scope === "out-of-scope"
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {file.scope}
              </span>
            </Button>
          ))}
          {audit.changedFiles.length > 8 ? (
            <span className="px-1.5 py-1 text-[11px] text-muted-foreground">
              +{audit.changedFiles.length - 8} more
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
