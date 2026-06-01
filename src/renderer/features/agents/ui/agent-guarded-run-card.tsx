import { AlertTriangle, Check, ShieldCheck, ShieldOff, X } from "lucide-react"

import { Badge } from "../../../components/ui/badge"
import { Button } from "../../../components/ui/button"
import { Textarea } from "../../../components/ui/textarea"
import { cn } from "../../../lib/utils"
import type { PendingScopeExpansionRequest } from "../atoms"

export type AgentGuardedRunCardProps = {
  enabled: boolean
  approved: boolean
  editableScopeText: string
  readOnlyEvidenceText: string
  successChecksText: string
  suggestedLabels: string[]
  hasDirtyBaseline: boolean
  pendingExpansion?: PendingScopeExpansionRequest
  provider: "claude-code" | "codex"
  onEnable: () => void
  onApprove: () => void
  onRunWithoutGuard: () => void
  onResetSuggestions: () => void
  onEditableScopeChange: (value: string) => void
  onReadOnlyEvidenceChange: (value: string) => void
  onSuccessChecksChange: (value: string) => void
  onApproveExpansion: (request: PendingScopeExpansionRequest) => void
  onRejectExpansion: (request: PendingScopeExpansionRequest) => void
}

export function AgentGuardedRunCard({
  enabled,
  approved,
  editableScopeText,
  readOnlyEvidenceText,
  successChecksText,
  suggestedLabels,
  hasDirtyBaseline,
  pendingExpansion,
  provider,
  onEnable,
  onApprove,
  onRunWithoutGuard,
  onResetSuggestions,
  onEditableScopeChange,
  onReadOnlyEvidenceChange,
  onSuccessChecksChange,
  onApproveExpansion,
  onRejectExpansion,
}: AgentGuardedRunCardProps) {
  if (!enabled && !pendingExpansion) {
    return (
      <div
        className="flex items-center gap-2 border-b border-border/70 px-2 py-1.5"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 rounded-sm px-2 text-xs"
          onClick={onEnable}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Guard</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 rounded-sm px-2 text-xs text-muted-foreground"
          onClick={onRunWithoutGuard}
        >
          <ShieldOff className="h-3.5 w-3.5" />
          <span>No guard</span>
        </Button>
      </div>
    )
  }

  return (
    <div
      className="border-b border-border/70 bg-muted/25 px-2 py-2"
      onClick={(event) => event.stopPropagation()}
    >
      {pendingExpansion ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-sm border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1 truncate">
            Scope request: {pendingExpansion.path || pendingExpansion.paths?.join(", ")}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 gap-1 rounded-sm px-2 text-xs"
            onClick={() => onApproveExpansion(pendingExpansion)}
          >
            <Check className="h-3.5 w-3.5" />
            <span>Approve</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 rounded-sm px-2 text-xs"
            onClick={() => onRejectExpansion(pendingExpansion)}
          >
            <X className="h-3.5 w-3.5" />
            <span>Reject</span>
          </Button>
        </div>
      ) : null}

      {enabled ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <ShieldCheck
                className={cn(
                  "h-4 w-4 shrink-0",
                  approved ? "text-emerald-600" : "text-muted-foreground",
                )}
              />
              <span className="truncate text-xs font-medium">
                Guarded Run
              </span>
              <Badge
                variant={approved ? "secondary" : "outline"}
                className="rounded-sm px-1.5 py-0 text-[10px]"
              >
                {approved ? "approved" : "draft"}
              </Badge>
              <Badge variant="outline" className="rounded-sm px-1.5 py-0 text-[10px]">
                {provider === "codex" ? "audit" : "hard"}
              </Badge>
            </div>
            {suggestedLabels.slice(0, 4).map((label) => (
              <Badge
                key={label}
                variant="outline"
                className="rounded-sm px-1.5 py-0 text-[10px] text-muted-foreground"
              >
                {label}
              </Badge>
            ))}
          </div>

          {hasDirtyBaseline ? (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Existing changed files will be marked pre-existing in audit.</span>
            </div>
          ) : null}

          <div className="grid gap-2 md:grid-cols-3">
            <label className="space-y-1 text-[11px] text-muted-foreground">
              <span>Editable scope</span>
              <Textarea
                value={editableScopeText}
                onChange={(event) => onEditableScopeChange(event.target.value)}
                className="min-h-[68px] resize-y rounded-sm px-2 py-1.5 text-xs"
                placeholder="src/file.ts"
              />
            </label>
            <label className="space-y-1 text-[11px] text-muted-foreground">
              <span>Read-only evidence</span>
              <Textarea
                value={readOnlyEvidenceText}
                onChange={(event) => onReadOnlyEvidenceChange(event.target.value)}
                className="min-h-[68px] resize-y rounded-sm px-2 py-1.5 text-xs"
                placeholder="docs/spec.md"
              />
            </label>
            <label className="space-y-1 text-[11px] text-muted-foreground">
              <span>Checks</span>
              <Textarea
                value={successChecksText}
                onChange={(event) => onSuccessChecksChange(event.target.value)}
                className="min-h-[68px] resize-y rounded-sm px-2 py-1.5 text-xs"
                placeholder="bun test tests/example.test.ts"
              />
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-sm px-2 text-xs"
              onClick={onResetSuggestions}
            >
              Reset
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 rounded-sm px-2 text-xs text-muted-foreground"
              onClick={onRunWithoutGuard}
            >
              <ShieldOff className="h-3.5 w-3.5" />
              <span>No guard</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 rounded-sm px-2 text-xs"
              onClick={onApprove}
            >
              <Check className="h-3.5 w-3.5" />
              <span>Approve</span>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
